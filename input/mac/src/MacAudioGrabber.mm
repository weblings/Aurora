#include <Aurora/Input/Mac/MacAudioGrabber.hpp>

#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/CATapDescription.h>
#import <CoreAudio/AudioHardwareTapping.h>

#include <mutex>
#include <stdexcept>
#include <vector>

namespace Aurora::Input::Mac
{
  struct MacAudioGrabber::Impl
  {
    AudioObjectID tapID = kAudioObjectUnknown;
    AudioObjectID aggregateID = kAudioObjectUnknown;
    AudioDeviceIOProcID ioProcID = nullptr;

    std::mutex mutex;
    std::vector<float> accumulated;
    unsigned sampleRate = 0;
    unsigned channelCount = 0;
    bool running = false;

    // Verified hands-on (docs/log/2026-09-28-mac-audio-tap-probe.md's
    // follow-up layout check): this tap+aggregate-device shape delivers a
    // single interleaved buffer (mNumberBuffers == 1, mNumberChannels ==
    // the negotiated channel count) on real hardware, not one mono buffer
    // per channel. The non-interleaved branch below is kept as a defensive
    // fallback for the shape AudioBufferList's own docs allow but wasn't
    // observed here -- cheap to handle, not exercised in practice.
    static OSStatus ioProc(AudioObjectID /*inDevice*/,
                           const AudioTimeStamp* /*inNow*/,
                           const AudioBufferList* inInputData,
                           const AudioTimeStamp* /*inInputTime*/,
                           AudioBufferList* /*outOutputData*/,
                           const AudioTimeStamp* /*inOutputTime*/,
                           void* inClientData)
    {
      auto* self = static_cast<Impl*>(inClientData);
      if(inInputData->mNumberBuffers == 0) return noErr;

      std::lock_guard<std::mutex> lock(self->mutex);

      if(inInputData->mNumberBuffers == 1){
        const AudioBuffer& buf = inInputData->mBuffers[0];
        const float* samples = static_cast<const float*>(buf.mData);
        size_t sampleCount = buf.mDataByteSize / sizeof(float);
        self->accumulated.insert(self->accumulated.end(), samples, samples + sampleCount);
        return noErr;
      }

      // Not observed on real hardware, but AudioBufferList permits it --
      // one mono buffer per channel, all the same frame count. Interleave
      // into Contracts::AudioBuffer's contract here rather than push the
      // ambiguity downstream.
      UInt32 channels = inInputData->mNumberBuffers;
      UInt32 frameCount = static_cast<UInt32>(inInputData->mBuffers[0].mDataByteSize / sizeof(float));
      size_t base = self->accumulated.size();
      self->accumulated.resize(base + static_cast<size_t>(frameCount) * channels);
      for(UInt32 ch = 0; ch < channels; ++ch){
        const float* samples = static_cast<const float*>(inInputData->mBuffers[ch].mData);
        for(UInt32 f = 0; f < frameCount; ++f){
          self->accumulated[base + static_cast<size_t>(f) * channels + ch] = samples[f];
        }
      }
      return noErr;
    }
  };


  namespace
  {
    NSString* CopyDefaultOutputDeviceUID()
    {
      AudioObjectID deviceID = kAudioObjectUnknown;
      AudioObjectPropertyAddress addr = {
        kAudioHardwarePropertyDefaultOutputDevice,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
      };
      UInt32 size = sizeof(deviceID);
      OSStatus err = AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, NULL, &size, &deviceID);
      if(err != noErr || deviceID == kAudioObjectUnknown) return nil;

      CFStringRef uid = NULL;
      AudioObjectPropertyAddress uidAddr = {
        kAudioDevicePropertyDeviceUID,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
      };
      size = sizeof(uid);
      err = AudioObjectGetPropertyData(deviceID, &uidAddr, 0, NULL, &size, &uid);
      if(err != noErr || uid == NULL) return nil;
      return (NSString*)CFBridgingRelease(uid);
    }
  }


  MacAudioGrabber::MacAudioGrabber():
  m_impl(std::make_unique<Impl>())
  {
    @autoreleasepool {
      NSString* outputUID = CopyDefaultOutputDeviceUID();
      if(outputUID == nil){
        throw std::runtime_error("MacAudioGrabber: could not resolve default output device");
      }

      // Empty exclude list -> whole-system mixdown, matching the
      // "react to whatever's playing" model Windows/Linux already ship
      // (docs/AudioAnalysis.md's "Live-capture library research"). Verified
      // this call sequence end to end in Aurora-9z4.1's probe before
      // writing this real implementation.
      CATapDescription* tapDesc = [[CATapDescription alloc] initStereoGlobalTapButExcludeProcesses:@[]];
      tapDesc.UUID = [NSUUID UUID];
      tapDesc.muteBehavior = CATapUnmuted;
      NSString* tapUUIDString = [tapDesc.UUID UUIDString];

      OSStatus err = AudioHardwareCreateProcessTap(tapDesc, &m_impl->tapID);
      if(err != noErr){
        throw std::runtime_error("MacAudioGrabber: AudioHardwareCreateProcessTap failed");
      }

      // Dictionary shape verified hands-on in Aurora-9z4.1 -- a tap alone,
      // with no real sub-device, silently delivers all-zero buffers
      // forever (docs/MacSupport.md's "aggregate-device step is a
      // silent-failure trap" finding). The real output device must be both
      // the sub-device list's one entry and the main sub-device key.
      NSDictionary* aggregateDesc = @{
        @(kAudioAggregateDeviceNameKey): @"AuroraAudioTapAggregate",
        @(kAudioAggregateDeviceUIDKey): [NSString stringWithFormat:@"com.aurora.app.audiotap.%@", tapUUIDString],
        @(kAudioAggregateDeviceMainSubDeviceKey): outputUID,
        @(kAudioAggregateDeviceIsPrivateKey): @YES,
        @(kAudioAggregateDeviceSubDeviceListKey): @[
          @{ @(kAudioSubDeviceUIDKey): outputUID }
        ],
        @(kAudioAggregateDeviceTapListKey): @[
          @{
            @(kAudioSubTapUIDKey): tapUUIDString,
            @(kAudioSubTapDriftCompensationKey): @YES
          }
        ],
        @(kAudioAggregateDeviceTapAutoStartKey): @YES,
      };

      err = AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)aggregateDesc, &m_impl->aggregateID);
      if(err != noErr){
        AudioHardwareDestroyProcessTap(m_impl->tapID);
        throw std::runtime_error("MacAudioGrabber: AudioHardwareCreateAggregateDevice failed");
      }

      // Read back the aggregate's actual negotiated input format rather
      // than assume one -- Windows' AudioGrabber does the same after
      // ma_device_init negotiates its own rate/channel count. Verified
      // hands-on this query succeeds (48kHz/2ch on this dev machine) and
      // matches what the IOProc callback actually delivers.
      AudioStreamBasicDescription asbd{};
      UInt32 asbdSize = sizeof(asbd);
      AudioObjectPropertyAddress formatAddr = {
        kAudioDevicePropertyStreamFormat,
        kAudioObjectPropertyScopeInput,
        kAudioObjectPropertyElementMain
      };
      err = AudioObjectGetPropertyData(m_impl->aggregateID, &formatAddr, 0, NULL, &asbdSize, &asbd);
      if(err != noErr || asbd.mSampleRate <= 0 || asbd.mChannelsPerFrame == 0){
        AudioHardwareDestroyAggregateDevice(m_impl->aggregateID);
        AudioHardwareDestroyProcessTap(m_impl->tapID);
        throw std::runtime_error("MacAudioGrabber: could not read the aggregate device's stream format");
      }
      m_impl->sampleRate = static_cast<unsigned>(asbd.mSampleRate);
      m_impl->channelCount = asbd.mChannelsPerFrame;

      err = AudioDeviceCreateIOProcID(m_impl->aggregateID, &Impl::ioProc, m_impl.get(), &m_impl->ioProcID);
      if(err != noErr || m_impl->ioProcID == nullptr){
        AudioHardwareDestroyAggregateDevice(m_impl->aggregateID);
        AudioHardwareDestroyProcessTap(m_impl->tapID);
        throw std::runtime_error("MacAudioGrabber: AudioDeviceCreateIOProcID failed");
      }

      // This is the call that triggers the "System Audio Recording Only"
      // consent prompt on a never-before-seen identity's first-ever use --
      // it returns noErr regardless of grant state (docs/MacSupport.md's
      // "TCC enforcement for this permission is completely silent"
      // finding). Denial isn't detectable here; Aurora-9z4.4 designs the
      // recovery flow around inferring it from sustained all-zero output
      // instead.
      err = AudioDeviceStart(m_impl->aggregateID, m_impl->ioProcID);
      if(err != noErr){
        AudioDeviceDestroyIOProcID(m_impl->aggregateID, m_impl->ioProcID);
        AudioHardwareDestroyAggregateDevice(m_impl->aggregateID);
        AudioHardwareDestroyProcessTap(m_impl->tapID);
        throw std::runtime_error("MacAudioGrabber: AudioDeviceStart failed");
      }

      m_impl->running = true;
    }
  }


  MacAudioGrabber::~MacAudioGrabber()
  {
    if(m_impl && m_impl->running){
      AudioDeviceStop(m_impl->aggregateID, m_impl->ioProcID);
      AudioDeviceDestroyIOProcID(m_impl->aggregateID, m_impl->ioProcID);
      AudioHardwareDestroyAggregateDevice(m_impl->aggregateID);
      AudioHardwareDestroyProcessTap(m_impl->tapID);
    }
  }


  const std::string& MacAudioGrabber::name() const
  {
    static const std::string s_name = "MacAudioGrabber";
    return s_name;
  }


  void MacAudioGrabber::readNextBuffer(Contracts::AudioBuffer& buffer)
  {
    std::lock_guard<std::mutex> lock(m_impl->mutex);

    buffer.sampleRate = m_impl->sampleRate;
    buffer.channelCount = m_impl->channelCount;
    buffer.samples = std::move(m_impl->accumulated);
    m_impl->accumulated.clear();
  }
}
