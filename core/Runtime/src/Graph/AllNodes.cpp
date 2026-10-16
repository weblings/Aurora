#include <Aurora/Runtime/Graph/AllNodes.hpp>

#include <Aurora/Runtime/Graph/AudioNodes.hpp>
#include <Aurora/Runtime/Graph/BlendNodes.hpp>
#include <Aurora/Runtime/Graph/ColorNodes.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/MathNodes.hpp>
#include <Aurora/Runtime/Graph/SpatialNodes.hpp>
#include <Aurora/Runtime/Graph/TimeNodes.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>

namespace Aurora::Runtime::Graph
{
  void registerAllNodes(NodeRegistry& registry, bool includeAudio)
  {
    registerVideoNodes(registry);
    registerFrameNodes(registry);
    registerMathNodes(registry);
    registerTimeNodes(registry);
    registerColorNodes(registry);
    registerBlendNodes(registry);
    registerSpatialNodes(registry);
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    if(includeAudio){
      registerAudioNodes(registry);
    }
#else
    (void)includeAudio;
#endif
  }
}
