// Audio source (gj0.5 slice 3): the demo track through an AnalyserNode. Colors come
// from the engine now (engine-room.js): this module only plays the track and hands
// over the newest samples.
const audioTrack = new Audio('assets/Electro Cabello.mp3');
audioTrack.loop = true;

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024;
// createMediaElementSource silently reroutes the element's own audio output through this graph --
// connecting to destination is required for audioTrack to actually be audible at all.
audioContext.createMediaElementSource(audioTrack).connect(analyser).connect(audioContext.destination);

const timeData = new Float32Array(analyser.fftSize);

export function setPlaying(playing, isAudioMode) {
  if (!playing) return audioTrack.pause();
  // AudioContext needs the same user-gesture unlock video/audio elements do -- resume() is a
  // no-op once already running, so calling it every time this fires is harmless.
  audioContext.resume();
  audioTrack.play().catch(() => {
    document.body.addEventListener('click', () => { if (isAudioMode()) audioTrack.play(); }, { once: true });
  });
}

// The samples that played over the last dt seconds (at most one analyser window), copied
// because the engine client transfers the buffer.
export function readAudioBlock(dt) {
  analyser.getFloatTimeDomainData(timeData);
  const count = Math.max(1, Math.min(timeData.length, Math.round(dt * audioContext.sampleRate)));
  return { samples: timeData.slice(timeData.length - count), sampleRate: audioContext.sampleRate, channels: 1 };
}
