import { useEffect, useMemo, useReducer, useRef, type MutableRefObject } from 'react'
import { DraftRefused, previewUrl, putDraft } from './api'
import { parseFrame, type PreviewFrame } from './graph/frame'
import { initialLoop, loopReducer, reopenDelay, type LoopState } from './graph/loop'
import type { GraphDoc } from './graph/types'

const DEBOUNCE_MS = 250
// A draft that could not be sent because Aurora did not answer is sent again this often.
const NETWORK_RETRY_MS = 3000
const SESSION_KEY = 'aurora.graphEditor.session'

// One draft session per tab: it survives a reload (sessionStorage) so reloads
// do not pile up drafts on the server, and never matches another tab's.
export function tabSession(): string {
  try {
    const kept = window.sessionStorage.getItem(SESSION_KEY)
    if (kept) return kept
    const made = newSession()
    window.sessionStorage.setItem(SESSION_KEY, made)
    return made
  } catch {
    return newSession()
  }
}

function newSession(): string {
  return `editor-${Math.random().toString(36).slice(2, 10)}`
}

export type DraftLoop = {
  state: LoopState
  // The newest preview frame. Written on every event but never put in React
  // state: the thumbnail reads it from its own animation loop.
  frame: MutableRefObject<PreviewFrame | null>
  // Reopens a stream that was taken over.
  reconnect: () => void
}

// Sends `doc` as the session draft (debounced), then keeps the preview stream
// open for it. The stream hot-reloads on every changed draft, so edits need
// no further call. `lookNow` asks the host-state poll to check Aurora at once:
// a failed request is the earliest hint it is gone, and that poll owns the
// "Aurora has stopped" takeover, so a network failure sets no message here.
export function useDraftLoop(doc: GraphDoc | null, lookNow: () => void): DraftLoop {
  const [state, dispatch] = useReducer(loopReducer, initialLoop)
  const session = useMemo(tabSession, [])
  const frame = useRef<PreviewFrame | null>(null)
  const source = useRef<EventSource | null>(null)
  const retry = useRef<number | undefined>(undefined)
  const latest = useRef(state)
  latest.current = state
  const sent = useRef<GraphDoc | null>(null)
  const look = useRef(lookNow)
  look.current = lookNow

  const closeStream = () => {
    source.current?.close()
    source.current = null
    window.clearTimeout(retry.current)
  }

  const openStream = () => {
    closeStream()
    dispatch({ type: 'opening' })
    const es = new EventSource(previewUrl(session))
    source.current = es
    const stop = () => {
      if (source.current === es) closeStream()
      else es.close()
    }
    es.addEventListener('preview', (e) => {
      const parsed = parseFrame((e as MessageEvent<string>).data)
      if (!parsed) return
      frame.current = parsed
      dispatch({ type: 'frame', errors: parsed.errors })
    })
    es.addEventListener('ended', (e) => {
      stop()
      let reason = ''
      try {
        reason = JSON.parse((e as MessageEvent<string>).data).reason ?? ''
      } catch {
        // An ended without a reason still ends the stream.
      }
      if (reason !== 'replaced') frame.current = null
      dispatch({ type: 'ended', reason })
    })
    // `event: error` with data is the server refusing or flagging the draft;
    // a bare error event is the connection failing. Only the first carries data.
    es.addEventListener('error', (e) => {
      const data = (e as MessageEvent<string>).data
      if (typeof data !== 'string') {
        stop()
        dispatch({ type: 'lost' })
        look.current()
        return
      }
      let body: { error?: string; message?: string } = {}
      try {
        body = JSON.parse(data)
      } catch {
        // Treated as an unnamed refusal below.
      }
      if (body.error === 'draft_invalid') {
        dispatch({ type: 'draft-invalid', message: body.message ?? '' })
        return
      }
      stop()
      frame.current = null
      dispatch({ type: 'refused', error: body.error ?? 'error', message: body.message ?? '' })
    })
  }

  // Draft out.
  useEffect(() => {
    if (!doc) {
      closeStream()
      frame.current = null
      dispatch({ type: 'reset' })
      return
    }
    const abort = new AbortController()
    let timer: number | undefined
    const send = () => {
      putDraft(session, doc, abort.signal)
        .then((verdict) => {
          sent.current = doc
          dispatch({ type: 'put', valid: verdict.valid, issues: verdict.errors })
          // A valid draft with no stream starts one; an open stream reloads itself.
          if (verdict.valid && !source.current && latest.current.stream !== 'replaced') openStream()
        })
        .catch((e: Error) => {
          if (abort.signal.aborted) return
          if (e instanceof DraftRefused) {
            dispatch({ type: 'put-failed', reason: e.code })
            return
          }
          // Aurora did not answer: the takeover (or a blip) is the host poll's to say; send again soon.
          look.current()
          timer = window.setTimeout(send, NETWORK_RETRY_MS)
        })
    }
    timer = window.setTimeout(send, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      abort.abort()
    }
    // openStream/closeStream only touch refs and dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, session])

  // A stream that ended on its own comes back: soon when paused or lost (the
  // refusal while still paused keeps it here), at once when the server dropped
  // the draft, which needs sending again first.
  useEffect(() => {
    if (source.current) return
    const delay = reopenDelay(state)
    if (delay === null) return
    const timer = window.setTimeout(() => {
      const draft = sent.current
      if (state.stream === 'closed' && draft) {
        putDraft(session, draft)
          .then((verdict) => {
            dispatch({ type: 'put', valid: verdict.valid, issues: verdict.errors })
            if (verdict.valid) openStream()
          })
          .catch((e: Error) => {
            if (e instanceof DraftRefused) dispatch({ type: 'put-failed', reason: e.code })
            else look.current()
          })
      } else {
        openStream()
      }
    }, delay)
    retry.current = timer
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stream, state.valid, session])

  useEffect(() => closeStream, [])

  return { state, frame, reconnect: openStream }
}
