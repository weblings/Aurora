import { Hint } from './Hint'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { ApiError, applyGraph, fetchCatalog, fetchEffectGraph, fetchEffects, fetchCapabilities, putDraft, saveGraph, type WriteResult } from './api'
import { EditorContext, type EditorActions } from './EditorContext'
import { GenericNode } from './GenericNode'
import { DetailsDrawer } from './DetailsDrawer'
import { clearShift } from './graph/clear'
import { ControlsDrawer } from './ControlsDrawer'
import { AddNodeMenu } from './AddNodeMenu'
import { ContextMenu, type MenuAction, type MenuTarget } from './ContextMenu'
import { ProblemsContext } from './ProblemsContext'
import { ProblemsChip, problemCount, type Refusal } from './ProblemsChip'
import { Toast, useToast } from './Toast'
import { Announcer, useAnnouncer } from './Announcer'
import { NameDialog } from './NameDialog'
import { Icon, addIcon, arrowLeftIcon, chevronDownIcon, dotIcon, redoIcon, undoIcon } from '@weblings/grille'
import { COMPACT_BAR, DOCK_BOTTOM, TIGHT_BAR, useMedia } from './useMedia'
import { TitleMenu, UNSAVED_TEXT, type TitleMenuAction } from './TitleMenu'
import { NEW_EFFECT_TITLE } from './graph/titleMenu'
import { FIT_OPTIONS, ViewMenu } from './ViewMenu'
import { ZonesIsland } from './ZonesIsland'
import { ErrorShell } from './ErrorShell'
import { useHostState } from './useHostState'
import { draftShellNote, failedSaveNote, openFailedNote, openFailureCause, otherTest, writeFailureReason, type OpenFailure } from './graph/hostState'
import { tabSession, useDraftLoop } from './useDraftLoop'
import { useLightTest } from './useLightTest'
import { clearUnsaved, fingerprint, isUnsaved, migrateLegacyBlank, openKept, saveUnsaved, syncUnsaved } from './graph/autosave'
import { NewerSavedPrompt } from './NewerSavedPrompt'
import { converterFor, insertConverter, refuseConnection } from './graph/connection'
import { controlsOf } from './graph/controls'
import { addEdge, addNode, joinEndpoint, moveNodes, removeEdge, removeNodes, setParam } from './graph/doc'
import { editorReducer, emptyEditor, sameDoc } from './graph/history'
import { changeIsEdit, lightsInUse, pickStatus, quietEndToast, stopAnnounced, stopLabel, testFailureToast, testOutcome } from './graph/status'
import { SplitTestButton } from './SplitTestButton'
import { initialTest, type TestMode } from './graph/lightTest'
import { BLANK_ID, blankDoc, forWrite, freshEffectId, isDraftId, newEffectId, setTitle, titleOf } from './graph/save'
import { portStyle } from './graph/portStyle'
import { NODE_KIND, carryViewState, edgeId, toFlowEdges, toFlowNodes, type AuroraNodeData } from './graph/flow'
import { draftIssues, groupProblems, sameProblems, type Problems } from './graph/problems'
import type { Catalog, EffectListEntry, GraphDoc, ParamValue } from './graph/types'

const nodeTypes = { [NODE_KIND]: GenericNode }
const DEFAULT_EFFECT = 'builtin.video'

// Read once per page load (a state initializer may run twice, and the legacy
// '@empty' copy moves to its new id only the first time).
let startId: string | null = null
function initialEffectId(): string {
  if (startId !== null) return startId
  const params = new URLSearchParams(window.location.search)
  // A kept copy from before each new effect had its own id comes along under a fresh id.
  const migrated = migrateLegacyBlank(newEffectId)
  const asked = params.get('effect')
  if (asked === BLANK_ID) startId = migrated ?? newEffectId()
  else if (params.get('new') === 'empty') startId = newEffectId()
  else startId = asked ?? DEFAULT_EFFECT
  return startId
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [effects, setEffects] = useState<EffectListEntry[]>([])
  // Whether an audio input exists; New offers Music pulse only then, as the dashboard's Start from does.
  const [hasAudio, setHasAudio] = useState(false)
  const [effectId, setEffectId] = useState(initialEffectId)
  // The whole graph, replaced by every edit, with its undo history.
  const [{ doc, past, future }, dispatch] = useReducer(editorReducer, emptyEditor)
  // What the server last gave us or accepted; unsaved edits are measured from it.
  const [baseline, setBaseline] = useState<{ id: string; doc: GraphDoc } | null>(null)
  // The kept copy of an earlier visit's edits when the saved effect has changed since: awaiting a choice.
  const [outdated, setOutdated] = useState<GraphDoc | null>(null)
  // The effect or the catalog would not load although Aurora answered: a row in the error shell,
  // worded by cause, with no Retry (Aurora-u68h.9). When Aurora does not answer, the shell's takeover
  // says so and nothing is set here. `id` is the effect that failed; null for the catalog.
  const [openError, setOpenError] = useState<{ cause: OpenFailure; id: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // A Save or Save and apply that failed; cleared by the next edit or write.
  // A failed write's shell row (graph/hostState.ts failedSaveNote), cleared by the next Save or edit.
  const [writeTrouble, setWriteTrouble] = useState<string | null>(null)
  const { text: toastText, undo: toastUndo, show: showToast, dismiss: dismissToast, hold: holdToast } = useToast()
  const { text: announced, announce } = useAnnouncer()
  // GET /api/state: the error shell's rows, and the one verdict on whether Aurora is reachable.
  const host = useHostState()
  const [platform, setPlatform] = useState('')
  // A load that failed for want of Aurora runs again once it answers.
  const retryOnRecovery = useRef(false)
  const loadFailed = (e: Error, id: string | null) => {
    retryOnRecovery.current = true
    const cause = e instanceof ApiError ? openFailureCause(e.status, e.code) : 'other'
    void host.checkNow().then((answered) => answered && setOpenError({ cause, id }))
  }
  const [writing, setWriting] = useState(false)
  const [titleMenuOpen, setTitleMenuOpen] = useState(false)
  const compactBar = useMedia(COMPACT_BAR)
  const tightBar = useMedia(TIGHT_BAR)
  const drawerSide = useMedia(DOCK_BOTTOM) ? 'bottom' : 'right'
  // The naming dialog (Aurora-daaa.19): a write that creates a new effect, or Rename.
  const [naming, setNaming] = useState<
    { kind: 'save' | 'apply'; asNew: boolean; initial: string } | { kind: 'rename'; initial: string } | null
  >(null)
  const titleMenuTrigger = useRef<HTMLButtonElement>(null)
  // A write refused for problems points at the problems chip (Aurora-u68h.4); `focusAfter` tells the popup that
  // just closed where focus goes (the chip, or a problem's node) instead of back to where it was.
  const problemsChip = useRef<HTMLButtonElement>(null)
  const focusAfter = useRef<(() => HTMLElement | null) | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const refusals = useRef(0)
  const [minimap, setMinimap] = useState(false)
  // One drawer at a time, non-modal: canvas clicks leave it open (Aurora-daaa.27.3).
  const [drawer, setDrawer] = useState<'details' | 'controls' | null>(null)
  const [focusChecks, setFocusChecks] = useState(0)
  // Focus inside a drawer: Delete and Backspace there must not delete nodes.
  const [inDrawer, setInDrawer] = useState(false)
  // The graph as the running test was started with it.
  const [testedDoc, setTestedDoc] = useState<GraphDoc | null>(null)
  // What React Flow has told us (selection, measured sizes, a drag in progress).
  // The nodes it draws are derived from `doc` in the same render, so a param
  // edit never shows one frame of the old value.
  const [nodeView, setNodeView] = useState<Node<AuroraNodeData>[]>([])
  const [edgeView, setEdgeView] = useState<Edge[]>([])
  const flow = useRef<ReactFlowInstance<Node<AuroraNodeData>, Edge> | null>(null)
  const canvas = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchCapabilities().then(({ hasAudio: audio, platform: p }) => {
      setHasAudio(audio)
      setPlatform(p)
    })
    Promise.all([fetchCatalog(), fetchEffects()])
      .then(([c, e]) => {
        setCatalog(c)
        setEffects(e)
        setOpenError((current) => (current?.id === null ? null : current))
      })
      .catch((e: Error) => loadFailed(e, null))
  }, [attempt])

  useEffect(() => {
    let stale = false
    dispatch({ type: 'open', doc: null })
    setBaseline(null)
    setOutdated(null)
    setNodeView([])
    setEdgeView([])
    const opening = isDraftId(effectId) ? Promise.resolve(blankDoc()) : fetchEffectGraph(effectId)
    opening
      .then((graph) => {
        if (stale) return
        dispatch({ type: 'open', doc: graph })
        setBaseline({ id: effectId, doc: graph })
        // A kept copy comes back without asking, as an edit on the saved graph (one Undo
        // reaches the saved version). If the saved effect moved on since the copy was
        // made, the graph stays as saved until the prompt is answered.
        const kept = openKept(effectId, graph)
        if (kept.kind === 'restore') dispatch({ type: 'edit', change: () => kept.doc })
        setOutdated(kept.kind === 'newer' ? kept.doc : null)
        setOpenError(null)
      })
      .catch((e: Error) => !stale && loadFailed(e, effectId))
    return () => {
      stale = true
    }
  }, [effectId, attempt])

  // Back up unsaved edits per effect. Held back while a stored copy awaits
  // its answer to the newer-saved-version prompt, or it would be overwritten unseen.
  useEffect(() => {
    if (doc && baseline && !outdated) syncUnsaved(baseline.id, baseline.doc, doc)
  }, [doc, baseline, outdated])

  // Aurora came back after the takeover: load again what could not load.
  useEffect(() => {
    if (host.recoveries === 0 || !retryOnRecovery.current) return
    retryOnRecovery.current = false
    setAttempt((n) => n + 1)
  }, [host.recoveries])

  const loop = useDraftLoop(doc, () => void host.checkNow())
  const session = useMemo(tabSession, [])
  const docRef = useRef(doc)
  docRef.current = doc
  const lights = useLightTest(session, () => putDraft(session, docRef.current!))
  const testing = lights.state.phase === 'running'
  const [testMode, setTestMode] = useState<TestMode>('once')
  const dirty = useMemo(() => isUnsaved(baseline?.doc ?? null, doc), [doc, baseline])
  const isBuiltin = effects.find((e) => e.id === effectId)?.builtin ?? (isDraftId(effectId) || effectId.startsWith('builtin.'))
  const picked = nodeView.filter((n) => n.selected)
  const selectedId = picked.length === 1 ? picked[0].id : null

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('effect') === effectId && !url.searchParams.has('new')) return
    url.searchParams.delete('new')
    url.searchParams.set('effect', effectId)
    window.history.replaceState(null, '', url)
  }, [effectId])

  const startTest = (mode: TestMode) => {
    setTestMode(mode)
    setTestedDoc(docRef.current)
    void lights.start(mode)
  }

  // Save, Save and apply and Save as new write the document under an id: the open
  // custom effect's, or a fresh one named after the title when a built-in is
  // open (a built-in is never overwritten). Save as new forks a custom the
  // same way, leaving the original file as it was.
  // A write that creates a new effect asks for its name first; `named` is the answer.
  const refuseWrite = (n: number, plain: boolean) => {
    focusAfter.current = () => problemsChip.current
    const text = `Couldn't save. Fix ${n} ${n === 1 ? 'problem' : 'problems'} first.${plain ? ' Your changes are kept in this browser.' : ''}`
    setRefusal({ id: ++refusals.current, text })
  }
  const write = async (kind: 'save' | 'apply', asNew = false, named?: string) => {
    if (!doc || !baseline || writing) return
    // A saved effect is always runnable: with problems nothing is written (and nothing is asked first).
    // The draft's own problems count: a graph the server cannot build is in the chip too.
    if (problemCount(problems) > 0) {
      refuseWrite(problemCount(problems), kind === 'save' && !asNew)
      return
    }
    if ((isBuiltin || asNew) && named === undefined) {
      setNaming({ kind, asNew, initial: titleOf(doc) })
      return
    }
    const source = named === undefined ? doc : setTitle(doc, named)
    if (named !== undefined) dispatch({ type: 'edit', change: (d) => setTitle(d, named) })
    // A new effect that kept a taken title would show as a second row of the
    // same name in the picker, so it takes a distinct one.
    const sent = forWrite(source, isBuiltin || asNew, effects.map((e) => e.title || e.id))
    const id = isBuiltin || asNew ? freshEffectId(titleOf(sent), effects.map((e) => e.id)) : baseline.id
    setWriting(true)
    setWriteTrouble(null)
    try {
      const verdict = await putDraft(session, sent)
      if (!verdict.valid) {
        // The server found problems the editor had not shown yet: the same refusal.
        refuseWrite(verdict.errors.length, kind === 'save' && !asNew)
        return
      }
      const result: WriteResult = kind === 'save' ? await saveGraph(session, id) : await applyGraph(session, id)
      if (!result.ok) {
        setWriteTrouble(failedSaveNote(titleOf(sent) || barTitle(), result.reason))
        return
      }
      // Apply does not end a running test. The lights then go back to the
      // live effect, which is now this one, read from the file just written.
      if (kind === 'apply' && testing) await lights.finishAfterApply()
      const live = kind !== 'save'
      // A failed reload is in /api/state errors, which the error shell shows (Aurora-s1t7.9).
      showToast(`${live ? 'Saved and live' : 'Saved'} as ${titleOf(sent) || id}`)
      fetchEffects().then(setEffects).catch(() => {})
      if (id !== baseline.id) {
        // The built-in stays as it was; its edits now live in the new effect.
        // Edits made while the write ran (the saved copy has the rest) ride along as the
        // new id's kept copy, based on what was just saved.
        clearUnsaved(baseline.id)
        const latest = docRef.current
        if (latest && !sameDoc(latest, source)) saveUnsaved(id, latest, fingerprint(sent))
        setEffectId(id)
      } else {
        setBaseline({ id, doc: sent })
      }
    } catch (e) {
      // A network failure sets no row: the takeover says it.
      const reason = writeFailureReason(e)
      setWriteTrouble(reason === null ? null : failedSaveNote(titleOf(sent) || barTitle(), reason))
    } finally {
      setWriting(false)
    }
  }
  // Keep the previous object while the messages are unchanged, so a preview
  // event that repeats the same runtime error does not re-render every node.
  const lastProblems = useRef<Problems | null>(null)
  const problems = useMemo(() => {
    const next = groupProblems(draftIssues(loop.state), loop.state.runtime, new Set(doc?.nodes.map((n) => n.id)))
    if (lastProblems.current && sameProblems(lastProblems.current, next)) return lastProblems.current
    lastProblems.current = next
    return next
  }, [loop.state.valid, loop.state.issues, loop.state.reloadError, loop.state.runtime, doc])

  const prevDoc = useRef<GraphDoc | null>(null)
  useEffect(() => {
    const before = prevDoc.current
    prevDoc.current = doc
    // Opening an effect (null then the graph) is not an edit; every later
    // change is, including an undo back to the saved graph.
    if (!changeIsEdit(before, doc)) return
    setWriteTrouble(null)
    // Only a change of the document counts as an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])
  const ended = lights.state.ended
  useEffect(() => {
    const text = quietEndToast({ ...initialTest, ended })
    if (!text) return
    // Stop's own "Reverted" is announced, not drawn: the lights and the button already show it. The end
    // of a Once test is still a toast.
    if (stopAnnounced(ended)) announce(text)
    else showToast(text)
  }, [ended, showToast, announce])
  // A test that ended for a reason the user did not cause is announced, and nothing is drawn on the
  // button. A lost heartbeat is a toast, and the toast's own live region speaks it, so it is not announced twice.
  useEffect(() => {
    if (quietEndToast({ ...initialTest, ended })) return
    const text = testOutcome({ ...initialTest, ended })
    if (text) announce(text)
  }, [ended, announce])
  // The user pressed Test and the server refused: a toast with the server's own words.
  const failure = lights.state.failure
  useEffect(() => {
    const text = testFailureToast({ ...initialTest, failure })
    if (text) showToast(text)
  }, [failure, showToast])
  // The shell row and the Test button's Take over both read the host poll; look at once when this
  // tab's own test starts or ends so neither lags.
  const testPhase = lights.state.phase
  const { checkNow } = host
  useEffect(() => {
    void checkNow()
  }, [testPhase, checkNow])
  const editedSinceTest = testing && testedDoc !== null && doc !== null && !sameDoc(testedDoc, doc)
  // The shell's light-test row is another session's test: this tab's own shows as Stop on the Test button.
  const otherHeld = otherTest(host.host.test, session)
  const otherLightTest = otherHeld ? { holder: otherHeld.holder, endsAtMs: host.testEndsAtMs } : null
  const status = pickStatus({ openError: openError !== null, unreachable: !host.reachable, loop: loop.state, test: lights.state, otherHolder: otherHeld?.holder ?? null })
  // Without Aurora nothing can be tested or saved.
  const blocked = status.rank === 1
  // The error shell's editor-supplied rows: a refused draft PUT, and an effect or catalog that would not open.
  // <title> is the effects-list title for the id when known, else the id (as the title label).
  const failedTitle = openError?.id ? effects.find((e) => e.id === openError.id)?.title || openError.id : ''
  const shellNotes = [draftShellNote(loop.state.putError), openError ? openFailedNote(openError.cause, failedTitle) : null, writeTrouble].filter(
    (n): n is string => n !== null,
  )

  // An Undo toast is spent by any change of the document other than the one it offered (another edit, an
  // undo, Ctrl+Z, another effect), so Undo never acts on a graph the user has moved on from.
  useEffect(() => {
    if (toastUndo && doc !== toastUndo.doc) dismissToast()
  }, [doc, toastUndo, dismissToast])

  const edit = useCallback((change: (d: GraphDoc) => GraphDoc) => dispatch({ type: 'edit', change }), [])

  // One path for key Delete, Backspace and the menu: deleting a node drops its
  // Dashboard controls, so say so (global undo brings them back).
  const deleteNodes = useCallback(
    (ids: ReadonlySet<string>) => {
      const current = docRef.current
      const dropped = current ? controlsOf(current).filter((c) => ids.has(c.node)) : []
      const next = current ? removeNodes(current, ids) : null
      edit((d) => (next && d === current ? next : removeNodes(d, ids)))
      if (dropped.length > 0) {
        const n = dropped.length
        // A control without a label reads as '<node title> <param>'.
        const nameOf = (c: (typeof dropped)[number]) => {
          if (c.label) return c.label
          const type = current?.nodes.find((x) => x.id === c.node)?.type
          const title = type ? catalog?.get(type)?.title : undefined
          return title ? `${title} ${c.param}` : c.param
        }
        const names = [...new Set(dropped.map(nameOf))]
        const shown = names.length > 3 ? [...names.slice(0, 3), `${names.length - 3} more`] : names
        const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0]
        // The delete is one history entry, so Undo is the history's own.
        showToast(`Removed ${n} Dashboard control${n === 1 ? '' : 's'} with ${list}`, {
          doc: next,
          run: () => dispatch({ type: 'undo' }),
        })
      }
    },
    [edit, showToast, catalog],
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z') return
      // Text boxes keep their own undo.
      const target = e.target as HTMLElement | null
      if (target?.isContentEditable || target?.tagName === 'TEXTAREA') return
      if (target instanceof HTMLInputElement && ['text', 'number'].includes(target.type)) return
      e.preventDefault()
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep the selected node clear of the Details drawer: pan, never zoom, and
  // only when it sits under the drawer. Runs when Details opens, follows a new
  // selection, or the canvas (so the drawer width) changes size.
  const clearNode = useRef<() => void>(() => {})
  clearNode.current = () => {
    const inst = flow.current
    const pane = canvas.current
    if (drawer !== 'details' || !selectedId || !inst || !pane) return
    const node = inst.getInternalNode(selectedId)
    const drawerEl = document.querySelector<HTMLElement>('.ui-drawer')
    if (!node || !drawerEl || !node.measured.width) return
    const box = pane.getBoundingClientRect()
    const vp = inst.getViewport()
    const pos = node.internals.positionAbsolute
    const bottom = drawerEl.dataset.side === 'bottom'
    // A full-height sheet covers the whole canvas: nothing to clear, so leave the view alone.
    if (bottom && drawerEl.hasAttribute('data-expanded')) return
    const start = (bottom ? pos.y : pos.x) * vp.zoom + (bottom ? vp.y : vp.x)
    const size = (bottom ? (node.measured.height ?? 0) : node.measured.width) * vp.zoom
    const end = start + size
    const limit = bottom ? drawerEl.getBoundingClientRect().top - box.top : window.innerWidth - drawerEl.offsetWidth - box.left
    const dx = clearShift(start, end, limit)
    if (dx !== 0) void inst.setViewport(bottom ? { ...vp, y: vp.y + dx } : { ...vp, x: vp.x + dx }, { duration: 150 })
  }
  useEffect(() => {
    clearNode.current()
  }, [drawer, selectedId])
  useEffect(() => {
    const pane = canvas.current
    if (!pane || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => clearNode.current())
    watch.observe(pane)
    return () => watch.disconnect()
  }, [])
  // The dock's half/full toggle resizes the drawer, not the canvas.
  useEffect(() => {
    const el = drawer ? document.querySelector('.ui-drawer') : null
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => clearNode.current())
    watch.observe(el)
    return () => watch.disconnect()
  }, [drawer, drawerSide])

  // Ctrl/Cmd+S saves, wherever focus is (the browser would save the page).
  const saveKey = useRef<() => void>(() => {})
  saveKey.current = () => void write('save')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      saveKey.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Shift+A opens the Add node menu while the canvas has focus (not in a text box).
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuTrigger = useRef<HTMLButtonElement>(null)
  const canAdd = doc !== null && catalog !== null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canAdd || e.key !== 'A' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      // A click on the pane leaves focus on <body>, which counts as the canvas.
      if (!target || (target !== document.body && !target.closest('.editor-canvas'))) return
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      e.preventDefault()
      setAddMenuOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAdd])

  const nodes = useMemo(
    () => (doc && catalog ? carryViewState(nodeView, toFlowNodes(doc, catalog)) : []),
    [doc, catalog, nodeView],
  )
  const edges = useMemo(() => (doc ? carryViewState(edgeView, toFlowEdges(doc, catalog ?? undefined)) : []), [doc, catalog, edgeView])

  // A problems row points at its node: select it and bring it into view.
  const selectNode = useCallback(
    (id: string) => {
      setNodeView(nodes.map((n) => ({ ...n, selected: n.id === id })))
      // After the popup closes its own way: keyboard focus goes to the node (Delete and its keys act on it).
      focusAfter.current = () => canvas.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`) ?? null
      void flow.current?.fitView({ nodes: [{ id }], maxZoom: 1, duration: 200 })
    },
    [nodes],
  )

  // Right-click and node-button menus (Aurora-daaa.27.1).
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  // A node menu on an unselected node selects it alone first, so Delete and the
  // count act on what the menu was opened on.
  const openMenu = useCallback(
    (target: MenuTarget) => {
      if (target.kind === 'node') {
        setNodeView((view) => {
          const base = view.length > 0 ? view : nodes
          if (base.find((n) => n.id === target.id)?.selected) return view
          return base.map((n) => ({ ...n, selected: n.id === target.id }))
        })
      }
      setMenu(target)
    },
    [nodes],
  )
  const openMenuRef = useRef(openMenu)
  openMenuRef.current = openMenu

  // Shift+F10 (or the Menu key) on a focused node opens its menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu')) return
      const node = (e.target as HTMLElement | null)?.closest<HTMLElement>('.react-flow__node')
      const id = node?.dataset.id
      if (!node || !id) return
      e.preventDefault()
      const box = node.getBoundingClientRect()
      openMenuRef.current({ kind: 'node', id, x: box.left, y: box.top + 24 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const actions = useMemo<EditorActions>(
    () => ({
      setParam: (nodeId: string, name: string, value: ParamValue) =>
        dispatch({ type: 'edit', change: (d) => setParam(d, nodeId, name, value), live: true }),
      commit: () => dispatch({ type: 'commit' }),
      openNodeMenu: (nodeId: string, at: { x: number; y: number }) => openMenuRef.current({ kind: 'node', id: nodeId, ...at }),
    }),
    [],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<AuroraNodeData>>[]) => {
      setNodeView(applyNodeChanges(changes, nodes))
    },
    [nodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdgeView(applyEdgeChanges(changes, edges))
    },
    [edges],
  )

  // A key delete reports its nodes and their wires together: one edit, so one
  // undo brings all of it back (the per-change handlers made two history steps).
  const onDelete = useCallback(
    ({ nodes: gone, edges: wires }: { nodes: Node[]; edges: Edge[] }) => {
      const ids = new Set(gone.map((n) => n.id))
      // Wires on a deleted node leave with it; only the others need their own edit.
      const wireIds = new Set(wires.filter((w) => !ids.has(w.source) && !ids.has(w.target)).map((w) => w.id))
      if (ids.size > 0) deleteNodes(ids)
      else if (wireIds.size > 0) edit((d) => d.edges.filter((e) => wireIds.has(edgeId(e))).reduce(removeEdge, d))
    },
    [deleteNodes, edit],
  )

  // Position lands in the document once, when the drag ends.
  const onNodeDragStop = useCallback((_: unknown, __: Node, dragged: Node[]) => {
    edit((d) => moveNodes(d, Object.fromEntries(dragged.map((n) => [n.id, { x: n.position.x, y: n.position.y }]))))
  }, [edit])

  // Adds a node of a catalog type at the pointer, else the canvas centre.
  const addFromMenu = useCallback(
    (type: string, pointer?: { x: number; y: number }) => {
      const info = catalog?.get(type)
      const view = flow.current
      if (!info || !view) return
      const box = canvas.current?.getBoundingClientRect()
      const point = pointer ?? { x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 }
      const at = view.screenToFlowPosition(point)
      edit((d) => addNode(d, info, at))
      announce(`Added ${info.type}`)
    },
    [catalog, edit, announce],
  )

  const onMenuAction = (a: MenuAction) => {
    const at = menu
    if (a.type === 'add') addFromMenu(a.nodeType, at ? { x: at.x, y: at.y } : undefined)
    else if (a.type === 'undo') undo()
    else if (a.type === 'redo') redo()
    else if (a.type === 'fit') void flow.current?.fitView({ ...FIT_OPTIONS, duration: 200 })
    else if (a.type === 'delete-nodes') deleteNodes(new Set(picked.map((n) => n.id)))
    else if (a.type === 'delete-edge' && at?.kind === 'edge') edit((d) => d.edges.filter((e) => edgeId(e) === at.id).reduce(removeEdge, d))
    else if (a.type === 'details' || a.type === 'dashboard') {
      // The node menu already selected this node alone, which Details follows.
      setDrawer('details')
      if (a.type === 'dashboard') setFocusChecks((n) => n + 1)
    }
  }

  const wiring = useCallback(
    (c: Connection | Edge) => {
      if (!doc || !catalog || !c.sourceHandle || !c.targetHandle) return 'incomplete connection'
      return refuseConnection(doc, catalog, {
        source: c.source,
        sourceHandle: c.sourceHandle,
        target: c.target,
        targetHandle: c.targetHandle,
      })
    },
    [doc, catalog],
  )

  // Float <-> Angle is accepted by the canvas and gets a converter node.
  const convertible = useCallback(
    (c: Connection | Edge) =>
      !!doc && !!catalog && !!c.sourceHandle && !!c.targetHandle &&
      converterFor(doc, catalog, { source: c.source, sourceHandle: c.sourceHandle, target: c.target, targetHandle: c.targetHandle }) !== null,
    [doc, catalog],
  )

  const isValidConnection = useCallback((c: Connection | Edge) => wiring(c) === null || convertible(c), [wiring, convertible])

  const onConnect = useCallback(
    (c: Connection) => {
      if (doc && catalog && c.sourceHandle && c.targetHandle && convertible(c)) {
        const conn = { source: c.source, sourceHandle: c.sourceHandle, target: c.target, targetHandle: c.targetHandle }
        const result = insertConverter(doc, catalog, conn)
        if ('reason' in result) showToast(result.reason)
        else {
          edit((d) => {
            const r = insertConverter(d, catalog, conn)
            return 'doc' in r ? r.doc : d
          })
          showToast(`Inserted ${result.id} to convert ${catalog.get(doc.nodes.find((n) => n.id === c.source)!.type)?.outputs.find((p) => p.name === c.sourceHandle)?.type} to ${catalog.get(doc.nodes.find((n) => n.id === c.target)!.type)?.inputs.find((p) => p.name === c.targetHandle)?.type}`)
        }
        return
      }
      const reason = wiring(c)
      if (reason) showToast(reason)
      if (reason || !c.sourceHandle || !c.targetHandle) return
      edit((d) => addEdge(d, [joinEndpoint(c.source, c.sourceHandle!), joinEndpoint(c.target, c.targetHandle!)]))
    },
    [doc, catalog, convertible, wiring, edit, showToast],
  )

  // Type of the port a connection drag started from: its colour tints the drag
  // line and handles of other types dim.
  const [dragType, setDragType] = useState<string | null>(null)
  const onConnectStart = useCallback(
    (_: unknown, p: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
      const node = doc?.nodes.find((n) => n.id === p.nodeId)
      const info = node && catalog?.get(node.type)
      const ports = p.handleType === 'source' ? info?.outputs : info?.inputs
      setDragType(ports?.find((x) => x.name === p.handleId)?.type ?? null)
    },
    [doc, catalog],
  )

  const onConnectEnd = useCallback(
    (_: unknown, state: { isValid: boolean | null; fromNode: Node | null; toHandle: { nodeId: string; id?: string | null } | null; fromHandle: { id?: string | null; type: string } | null }) => {
      setDragType(null)
      // A drop on a handle that isValidConnection refused: say why.
      if (state.isValid === false && state.fromNode && state.toHandle && state.fromHandle) {
        const from = state.fromHandle.type === 'source'
        const reason = wiring({
          source: from ? state.fromNode.id : state.toHandle.nodeId,
          sourceHandle: from ? state.fromHandle.id ?? null : state.toHandle.id ?? null,
          target: from ? state.toHandle.nodeId : state.fromNode.id,
          targetHandle: from ? state.toHandle.id ?? null : state.fromHandle.id ?? null,
        })
        if (reason) showToast(reason)
      }
    },
    [wiring, showToast],
  )

  const title = doc ? titleOf(doc) : ''
  // The dialog's own focus restore lands on whatever had focus; the title
  // button is where the action began, so it takes focus after the dialog goes.
  const focusTitleButton = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => titleMenuTrigger.current?.focus()))
  }
  // A built-in has no title of its own in the graph; the effect list names it.
  const shownTitle = title || effects.find((e) => e.id === effectId)?.title || ''
  // What the title button shows (also the <title> of a failed-save row).
  const barTitle = () => shownTitle || (isDraftId(effectId) ? NEW_EFFECT_TITLE : effectId)
  // New and Open both come through here. `where` is the seam for opening in a new tab if the editor gets tabs.
  // A New ▸ Empty gets its own id, so two new effects never share one kept copy.
  const openEffect = (id: string, where: 'here') => {
    if (where === 'here') setEffectId(id === BLANK_ID ? newEffectId() : id)
  }

  // Revert to saved: the saved graph goes back in as one edit (Undo reaches the edits),
  // the kept copy goes with it.
  const revertToSaved = () => {
    if (!baseline || !doc || !dirty) return
    clearUnsaved(baseline.id)
    dispatch({ type: 'edit', change: () => baseline.doc })
    // One history entry, so Undo is the history's own; the sync effect writes the kept copy again
    // once the edits are back, so the copy this dropped returns with them.
    showToast('Reverted to the saved version', {
      doc: baseline.doc,
      run: () => {
        dispatch({ type: 'undo' })
      },
    })
  }
  const loadSaved = () => {
    if (!baseline || !outdated) return
    clearUnsaved(baseline.id)
    setOutdated(null)
    // Not a history entry (the graph on screen did not change), so Undo puts the kept edits back as
    // an edit, as Keep my edits does; the sync effect then writes the kept copy again.
    const lost = outdated
    showToast('Loaded the saved version', {
      doc,
      run: () => {
        dispatch({ type: 'edit', change: () => lost })
      },
    })
  }
  const keepMyEdits = () => {
    if (!outdated) return
    dispatch({ type: 'edit', change: () => outdated })
    setOutdated(null)
  }

  return (
    <div className="editor">
      <ErrorShell
        unreachable={!host.reachable}
        hostState={host.host.state}
        platform={platform}
        conditions={host.host.conditions}
        errors={host.host.errors}
        notes={shellNotes}
        lightTest={otherLightTest}
        onRetry={(source) => void host.retry(source)}
        onDismiss={(error) => void host.dismiss(error)}
        onStopTest={() => void host.stopTest()}
      />
      <header className="editor-header" data-preview={status.label} data-status-rank={status.rank}>
        <a className="ui-button editor-back" data-size="sm" href="/" aria-label={tightBar ? 'Dashboard' : undefined}>
          <Icon icon={arrowLeftIcon} size="sm" />
          {tightBar ? null : 'Dashboard'}
        </a>
        <span className="editor-sep" aria-hidden="true" />
        <button
          ref={titleMenuTrigger}
          type="button"
          className="ui-button editor-title-menu" data-size="sm"
          aria-label={dirty ? `Effect menu, ${UNSAVED_TEXT}` : 'Effect menu'}
          aria-haspopup="dialog"
          aria-expanded={titleMenuOpen}
          data-effect={effectId}
          data-unsaved={dirty ? 'true' : 'false'}
          // Open stays reachable when the effect would not load, so the user can leave through it.
          disabled={!doc && !openError}
          onClick={() => setTitleMenuOpen((open) => !open)}
        >
          <span className="editor-title-label">{barTitle()}</span>
          {dirty ? <Icon icon={dotIcon} size="sm" /> : null}
          <Icon icon={chevronDownIcon} size="sm" />
        </button>
        {catalog ? (
          <AddNodeMenu
            isOpen={addMenuOpen}
            onClose={() => setAddMenuOpen(false)}
            triggerRef={addMenuTrigger}
            catalog={catalog}
            onAdd={(type) => addFromMenu(type)}
          />
        ) : null}
        <TitleMenu
          isOpen={titleMenuOpen}
          onClose={() => setTitleMenuOpen(false)}
          triggerRef={titleMenuTrigger}
          isBuiltin={isBuiltin}
          busy={writing}
          blocked={blocked}
          nothingOpen={!doc}
          editedSinceTest={editedSinceTest}
          effects={effects}
          currentId={effectId}
          hasAudio={hasAudio}
          unsaved={dirty}
          focusAfter={focusAfter}
          onAction={(action: TitleMenuAction) => {
            if (action === 'save') void write('save')
            else if (action === 'save-as-new') void write('save', true)
            else if (action === 'save-and-apply') void write('apply')
            else if (action === 'revert') revertToSaved()
            else setNaming({ kind: 'rename', initial: title })
          }}
          onOpenEffect={(id) => openEffect(id, 'here')}
        />
        {naming ? (
          <NameDialog
            title={naming.kind === 'rename' ? 'Rename effect' : 'Name the new effect'}
            confirm={naming.kind === 'rename' ? 'Rename' : naming.kind === 'apply' ? 'Save and apply' : 'Save'}
            initial={naming.initial}
            onCancel={() => {
              setNaming(null)
              focusTitleButton()
            }}
            onConfirm={(name) => {
              setNaming(null)
              focusTitleButton()
              if (naming.kind === 'rename') edit((d) => setTitle(d, name))
              else void write(naming.kind, naming.asNew, name)
            }}
          />
        ) : null}
        <span className="editor-bar-end" />
        <ProblemsChip
          problems={problems}
          chipRef={problemsChip}
          refusal={refusal}
          focusAfter={focusAfter}
          onSelectNode={selectNode}
          onAddNode={() => setAddMenuOpen(true)}
        />
        <Hint text="Undo (Ctrl/Cmd+Z)" placement="bottom">
          <button
            type="button" className="ui-button" data-size="sm"
            onClick={undo}
            disabled={past.length === 0}
            aria-label="Undo"
          >
            <Icon icon={undoIcon} size="sm" />
          </button>
        </Hint>
        <Hint text="Redo (Shift+Ctrl/Cmd+Z)" placement="bottom">
          <button
            type="button" className="ui-button" data-size="sm"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
          >
            <Icon icon={redoIcon} size="sm" />
          </button>
        </Hint>
        {editedSinceTest ? <span className="editor-edited">Edited since the test</span> : null}
        <span className="editor-sep" aria-hidden="true" />
        <SplitTestButton
          mode={testMode}
          running={testing}
          stopText={stopLabel(lights.state)}
          action={status.action}
          disabledReason={
            blocked ? status.label : loop.state.valid === false || draftIssues(loop.state).length > 0 ? 'Fix the problems before testing' : null
          }
          takeOverHint={lightsInUse(lights.state, otherHeld?.holder ?? null)}
          busy={!doc || writing || (lights.state.phase !== 'idle' && lights.state.phase !== 'running')}
          onStart={startTest}
          onStop={() => void lights.revert()}
          onReconnect={loop.reconnect}
        />
      </header>
      {outdated && baseline ? (
        <NewerSavedPrompt effectTitle={shownTitle || baseline.id} onLoadSaved={loadSaved} onKeepEdits={keepMyEdits} />
      ) : null}
      <div className="editor-body">
            <div className="editor-canvas" ref={canvas}>
        <ZonesIsland frame={loop.frame} live={loop.state.stream === 'live'} />
        <ProblemsContext.Provider value={problems}>
        <EditorContext.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onDelete={onDelete}
            deleteKeyCode={inDrawer ? null : ['Backspace', 'Delete']}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onPaneContextMenu={(e) => {
              e.preventDefault()
              openMenu({ kind: 'canvas', x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY })
            }}
            onNodeContextMenu={(e, node) => {
              e.preventDefault()
              openMenu({ kind: 'node', id: node.id, x: e.clientX, y: e.clientY })
            }}
            onEdgeContextMenu={(e, edge) => {
              e.preventDefault()
              openMenu({ kind: 'edge', id: edge.id, x: e.clientX, y: e.clientY })
            }}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            connectionLineStyle={dragType ? { stroke: portStyle(dragType).color, strokeWidth: 2 } : undefined}
            className={dragType ? 'is-connecting' : undefined}
            data-drag-type={dragType ?? undefined}
            isValidConnection={isValidConnection}
            colorMode="dark"
            fitView
            attributionPosition="bottom-center"
            fitViewOptions={FIT_OPTIONS}
            minZoom={0.2}
            onInit={(instance) => {
              flow.current = instance
            }}
            key={effectId}
          >
            <Background variant={BackgroundVariant.Dots} />
            <Panel position="top-left">
              <Hint text="Add node (Shift+A)" placement="bottom">
                <button
                  ref={addMenuTrigger}
                  type="button"
                  className="ui-button editor-add-node" data-size="sm"
                  aria-label="Add node"
                  aria-haspopup="dialog"
                  aria-expanded={addMenuOpen}
                  disabled={!doc || !catalog}
                  onClick={() => setAddMenuOpen((open) => !open)}
                >
                  <Icon icon={addIcon} size="sm" /> Add node
                </button>
              </Hint>
            </Panel>
            <Panel position="bottom-right">
              <button
                type="button"
                className="ui-button" data-size="sm"
                aria-haspopup="dialog"
                aria-expanded={drawer === 'controls'}
                disabled={!doc}
                onClick={() => setDrawer((d) => (d === 'controls' ? null : 'controls'))}
              >
                Dashboard controls <span className="editor-count">{doc ? controlsOf(doc).length : 0}</span>
              </button>
            </Panel>
            <ViewMenu minimap={minimap} onMinimap={setMinimap} />
          </ReactFlow>
        </EditorContext.Provider>
        </ProblemsContext.Provider>
      </div>
      </div>
      {doc && catalog ? (
        <div onFocus={() => setInDrawer(true)} onBlur={() => setInDrawer(false)}>
          <DetailsDrawer
            isOpen={drawer === 'details'}
            onClose={() => setDrawer(null)}
            top={canvas.current?.getBoundingClientRect().top ?? 0}
            side={drawerSide}
            doc={doc}
            catalog={catalog}
            selected={selectedId}
            focusChecks={focusChecks}
            edit={edit}
          />
          <ControlsDrawer
            isOpen={drawer === 'controls'}
            onClose={() => setDrawer(null)}
            top={canvas.current?.getBoundingClientRect().top ?? 0}
            side={drawerSide}
            doc={doc}
            catalog={catalog}
            edit={edit}
          />
        </div>
      ) : null}
      {catalog ? (
        <ContextMenu
          target={menu}
          catalog={catalog}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          selectedCount={picked.length}
          onClose={() => setMenu(null)}
          onAction={onMenuAction}
        />
      ) : null}
      <Toast
        text={toastText}
        undo={toastUndo}
        onUndo={() => {
          const offer = toastUndo
          dismissToast()
          if (offer && docRef.current === offer.doc) offer.run()
        }}
        onHold={holdToast}
      />
      <Announcer text={announced} />
    </div>
  )
}
