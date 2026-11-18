// Synchronous wrapper over the WASM graph engine (Aurora-51nv.6). No Worker code: the
// Node test and the demo's Worker both call it. Every method returns the parsed JSON the
// engine made, unchanged. A failed call returns {error, message?} and never throws.
//
//   import createAuroraEngine from './aurora-engine.mjs'
//   const engine = wrapEngine(await createAuroraEngine())

const encoder = new TextEncoder()

export function wrapEngine(module) {
  // One scratch buffer per kind of bulk data, grown on demand and reused every call.
  const scratch = { video: { ptr: 0, size: 0 }, audio: { ptr: 0, size: 0 } }

  function reserve(slot, bytes) {
    if (slot.size < bytes) {
      if (slot.ptr) module._aurora_free(slot.ptr)
      slot.ptr = module._aurora_alloc(bytes)
      slot.size = bytes
    }
    return slot.ptr
  }

  // Runs fn with each string copied into module memory, then frees the copies.
  function withStrings(strings, fn) {
    const ptrs = strings.map((text) => {
      const size = encoder.encode(text).length + 1
      const ptr = module._aurora_alloc(size)
      module.stringToUTF8(text, ptr, size)
      return ptr
    })
    try {
      return fn(...ptrs)
    } finally {
      ptrs.forEach((ptr) => module._aurora_free(ptr))
    }
  }

  function parse(ptr) {
    return JSON.parse(module.UTF8ToString(ptr))
  }

  const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value))

  return {
    // {outputs: [{name, zones: [ZoneMapStore zone JSON]}]}. Resets live graph and previews.
    init: (config) => withStrings([text(config)], (p) => parse(module._aurora_init(p))),
    // Replaces one output's zones. Applies on the next step.
    setZones: (output, zones) =>
      withStrings([text({ output, zones })], (p) => parse(module._aurora_set_zones(p))),
    // The GET /api/nodes body.
    nodes: () => parse(module._aurora_nodes()),
    // The draft validation body: {valid, errors: [...]}.
    validate: (doc) => withStrings([text(doc)], (p) => parse(module._aurora_validate(p))),
    loadLive: (doc) => withStrings([text(doc)], (p) => parse(module._aurora_load_live(p))),
    // layout: 'lights' (default), 'room' or 'basic'. Replaces an open session of that name.
    openPreview: (session, doc, layout = 'lights') =>
      withStrings([session, text(doc), layout], (s, d, l) => parse(module._aurora_open_preview(s, d, l))),
    reloadPreview: (session, doc) =>
      withStrings([session, text(doc)], (s, d) => parse(module._aurora_reload_preview(s, d))),
    closePreview: (session) => withStrings([session], (s) => parse(module._aurora_close_preview(s))),

    // rgba: Uint8Array or Uint8ClampedArray of width*height*4 bytes, copied.
    feedVideo(rgba, width, height) {
      if (rgba.length !== width * height * 4) {
        return { error: 'invalid_frame', message: 'expected width*height*4 bytes' }
      }
      const ptr = reserve(scratch.video, rgba.length)
      module.HEAPU8.set(rgba, ptr)
      return parse(module._aurora_feed_video(ptr, width, height))
    },
    // samples: Float32Array, interleaved when channels > 1. Read by the next step only.
    feedAudio(samples, sampleRate, channels = 1) {
      const ptr = reserve(scratch.audio, samples.length * 4)
      module.HEAPF32.set(samples, ptr >> 2)
      return parse(module._aurora_feed_audio(ptr, samples.length, sampleRate, channels))
    },

    // Ticks the live graph and every preview by dt seconds.
    step: (dt) => parse(module._aurora_step(dt)),
    // The live graph's zone colors, in the preview stream's event shape.
    liveColors: () => parse(module._aurora_live_colors()),
    previewSnapshot: (session) => withStrings([session], (s) => parse(module._aurora_preview_snapshot(s))),
  }
}
