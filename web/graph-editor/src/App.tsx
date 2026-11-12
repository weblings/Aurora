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
import { applyGraph, fetchCatalog, fetchEffectGraph, fetchEffects, fetchHasAudio, putDraft, saveGraph, type WriteResult } from './api'
import { EditorContext, type EditorActions } from './EditorContext'
import { GenericNode } from './GenericNode'
import { DetailsDrawer } from './DetailsDrawer'
import { clearShift } from './graph/clear'
import { ControlsDrawer } from './ControlsDrawer'
import { AddNodeMenu } from './AddNodeMenu'
import { ContextMenu, type MenuAction, type MenuTarget } from './ContextMenu'
import { ProblemsContext } from './ProblemsContext'
import { ProblemsChip } from './ProblemsChip'
import { Toast, useToast } from './Toast'
import { NameDialog } from './NameDialog'
import { Icon, addIcon, arrowLeftIcon, chevronDownIcon, redoIcon, undoIcon } from '@weblings/grille'
import { DesktopNote } from './DesktopNote'
import { COMPACT_BAR, DOCK_BOTTOM, TIGHT_BAR, useMedia } from './useMedia'
import { TitleMenu, type TitleMenuAction } from './TitleMenu'
import { FIT_OPTIONS, ViewMenu } from './ViewMenu'
import { ZonesIsland } from './ZonesIsland'
import { tabSession, useDraftLoop } from './useDraftLoop'
import { useLightTest } from './useLightTest'
import { restorable, clearUnsaved, syncUnsaved } from './graph/autosave'
import { converterFor, insertConverter, refuseConnection } from './graph/connection'
import { controlsOf } from './graph/controls'
import { addEdge, addNode, joinEndpoint, moveNodes, removeEdge, removeNodes, setParam } from './graph/doc'
import { editorReducer, emptyEditor, sameDoc } from './graph/history'
import { changeIsEdit, pickBanner, pickStatus, quietEndToast, stopLabel } from './graph/status'
import { SplitTestButton } from './SplitTestButton'
import { initialTest, type TestMode } from './graph/lightTest'
import { BLANK_ID, blankDoc, forWrite, freshEffectId, setTitle, titleOf } from './graph/save'
import { portStyle } from './graph/portStyle'
import { NODE_KIND, carryViewState, edgeId, toFlowEdges, toFlowNodes, type AuroraNodeData } from './graph/flow'
import { groupProblems, sameProblems, type Problems } from './graph/problems'
import type { Catalog, EffectListEntry, GraphDoc, ParamValue } from './graph/types'

const nodeTypes = { [NODE_KIND]: GenericNode }
const DEFAULT_EFFECT = 'builtin.video'

function initialEffectId(): string {
  const params = new URLSearchParams(window.location.search)
  if (params.get('new') === 'empty') return BLANK_ID
  return params.get('effect') ?? DEFAULT_EFFECT
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
  // A browser-stored copy of unsaved edits from an earlier visit, awaiting a choice.
  const [offer, setOffer] = useState<GraphDoc | null>(null)
  // Cannot reach Aurora, or cannot open the effect: a banner with Retry.
  const [openError, setOpenError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // A Save or Save and apply that failed; cleared by the next edit or write.
  const [writeTrouble, setWriteTrouble] = useState<string | null>(null)
  const { text: toastText, show: showToast } = useToast()
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
    fetchHasAudio().then(setHasAudio)
    Promise.all([fetchCatalog(), fetchEffects()])
      .then(([c, e]) => {
        setCatalog(c)
        setEffects(e)
      })
      .catch((e: Error) => setOpenError(`Cannot reach Aurora: ${e.message}`))
  }, [attempt])

  useEffect(() => {
    let stale = false
    dispatch({ type: 'open', doc: null })
    setBaseline(null)
    setOffer(null)
    setNodeView([])
    setEdgeView([])
    const opening = effectId === BLANK_ID ? Promise.resolve(blankDoc()) : fetchEffectGraph(effectId)
    opening
      .then((graph) => {
        if (stale) return
        dispatch({ type: 'open', doc: graph })
        setBaseline({ id: effectId, doc: graph })
        setOffer(restorable(effectId, graph))
        setOpenError(null)
      })
      .catch((e: Error) => !stale && setOpenError(`Cannot open '${effectId}': ${e.message}`))
    return () => {
      stale = true
    }
  }, [effectId, attempt])

  // Back up unsaved edits per effect. Held back while a stored copy awaits
  // its Restore/Discard answer, or it would be overwritten unseen.
  useEffect(() => {
    if (doc && baseline && !offer) syncUnsaved(baseline.id, baseline.doc, doc)
  }, [doc, baseline, offer])

  const loop = useDraftLoop(doc)
  const session = useMemo(tabSession, [])
  const docRef = useRef(doc)
  docRef.current = doc
  const lights = useLightTest(session, () => putDraft(session, docRef.current!))
  const testing = lights.state.phase === 'running'
  const [testMode, setTestMode] = useState<TestMode>('once')
  const dirty = useMemo(() => (doc && baseline ? !sameDoc(baseline.doc, doc) : false), [doc, baseline])
  const isBuiltin = effects.find((e) => e.id === effectId)?.builtin ?? (effectId === BLANK_ID || effectId.startsWith('builtin.'))
  const picked = nodeView.filter((n) => n.selected)
  const selectedId = picked.length === 1 ? picked[0].id : null

  useEffect(() => {
    if (effectId === BLANK_ID) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('effect') === effectId && !url.searchParams.has('new')) return
    url.searchParams.delete('new')
    url.searchParams.set('effect', effectId)
    window.history.replaceState(null, '', url)
  }, [effectId])

  const startTest = (mode: TestMode) => {
    setTestMode(mode)
    setWriteTrouble(null)
    setTestedDoc(docRef.current)
    void lights.start(mode)
  }

  // Save, Save and apply and Save as new write the document under an id: the open
  // custom effect's, or a fresh one named after the title when a built-in is
  // open (a built-in is never overwritten). Save as new forks a custom the
  // same way, leaving the original file as it was.
  // A write that creates a new effect asks for its name first; `named` is the answer.
  const write = async (kind: 'save' | 'apply', asNew = false, named?: string) => {
    if (!doc || !baseline || writing) return
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
        const n = verdict.errors.length
        setWriteTrouble(`Fix the ${n} ${n === 1 ? 'problem' : 'problems'} before saving`)
        return
      }
      const result: WriteResult = kind === 'save' ? await saveGraph(session, id) : await applyGraph(session, id)
      if (!result.ok) {
        setWriteTrouble(result.reason)
        return
      }
      // Apply does not end a running test. The lights then go back to the
      // live effect, which is now this one, read from the file just written.
      if (kind === 'apply' && testing) await lights.finishAfterApply()
      const live = kind !== 'save'
      dismissTest()
      // A reload error needs a look, so it stays in the status spot.
      if (result.reloadError) setWriteTrouble(`Reload: ${result.reloadError}`)
      showToast(`${live ? 'Saved and live' : 'Saved'} as ${titleOf(sent) || id}`)
      fetchEffects().then(setEffects).catch(() => {})
      if (id !== baseline.id) {
        // The built-in stays as it was; its edits now live in the new effect.
        clearUnsaved(baseline.id)
        setEffectId(id)
      } else {
        setBaseline({ id, doc: sent })
      }
    } catch (e) {
      setWriteTrouble((e as Error).message)
    } finally {
      setWriting(false)
    }
  }
  // Keep the previous object while the messages are unchanged, so a preview
  // event that repeats the same runtime error does not re-render every node.
  const lastProblems = useRef<Problems | null>(null)
  const problems = useMemo(() => {
    const next = groupProblems(loop.state.valid === false ? loop.state.issues : [], loop.state.runtime, new Set(doc?.nodes.map((n) => n.id)))
    if (lastProblems.current && sameProblems(lastProblems.current, next)) return lastProblems.current
    lastProblems.current = next
    return next
  }, [loop.state.valid, loop.state.issues, loop.state.runtime, doc])

  // A test outcome shows until the next test, Save or edit.
  const [clearedTest, setClearedTest] = useState<{ ended: unknown; failure: string | null } | null>(null)
  const testOutcomeCleared = clearedTest !== null && clearedTest.ended === lights.state.ended && clearedTest.failure === lights.state.failure
  const dismissTest = () => setClearedTest({ ended: lights.state.ended, failure: lights.state.failure })
  const prevDoc = useRef<GraphDoc | null>(null)
  useEffect(() => {
    const before = prevDoc.current
    prevDoc.current = doc
    // Opening an effect (null then the graph) is not an edit; every later
    // change is, including an undo back to the saved graph.
    if (!changeIsEdit(before, doc)) return
    setWriteTrouble(null)
    dismissTest()
    // Only a change of the document counts as an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])
  const ended = lights.state.ended
  useEffect(() => {
    const text = quietEndToast({ ...initialTest, ended })
    if (text) showToast(text)
  }, [ended, showToast])
  const editedSinceTest = testing && testedDoc !== null && doc !== null && !sameDoc(testedDoc, doc)
  const status = pickStatus({ openError, loop: loop.state, test: lights.state, writeTrouble, testOutcomeCleared })
  const banner = pickBanner(openError, offer !== null && baseline !== null, status)
  // Without Aurora nothing can be tested or saved.
  const blocked = status.rank === 1

  const edit = useCallback((change: (d: GraphDoc) => GraphDoc) => dispatch({ type: 'edit', change }), [])

  // One path for key Delete, Backspace and the menu: deleting a node drops its
  // Dashboard controls, so say so (global undo brings them back).
  const deleteNodes = useCallback(
    (ids: ReadonlySet<string>) => {
      const current = docRef.current
      const dropped = current ? controlsOf(current).filter((c) => ids.has(c.node)) : []
      edit((d) => removeNodes(d, ids))
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
        showToast(`Removed ${n} Dashboard control${n === 1 ? '' : 's'} with ${list}`)
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
      showToast(`Added ${info.type}`)
    },
    [catalog, edit, showToast],
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
  // New and Open both come through here. `where` is the seam for opening in a new tab if the editor gets tabs.
  const openEffect = (id: string, where: 'here') => {
    if (where === 'here') setEffectId(id)
  }

  return (
    <div className="editor">
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
          aria-label={dirty && compactBar ? 'Effect menu, unsaved changes' : 'Effect menu'}
          aria-haspopup="dialog"
          aria-expanded={titleMenuOpen}
          data-effect={effectId}
          disabled={!doc}
          onClick={() => setTitleMenuOpen((open) => !open)}
        >
          {dirty && compactBar ? <span className="editor-dirty-mark" aria-hidden="true" /> : null}
          <span className="editor-title-label">{shownTitle || (effectId === BLANK_ID ? 'New empty effect' : effectId)}</span>
          <Icon icon={chevronDownIcon} size="sm" />
        </button>
        {dirty && !compactBar ? <span className="editor-dirty">Unsaved</span> : null}
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
          editedSinceTest={editedSinceTest}
          effects={effects}
          currentId={effectId}
          hasAudio={hasAudio}
          onAction={(action: TitleMenuAction) => {
            if (action === 'save') void write('save')
            else if (action === 'save-as-new') void write('save', true)
            else if (action === 'save-and-apply') void write('apply')
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
          action={status.action ?? (lights.state.other && lights.state.phase === 'idle' ? 'take-over' : null)}
          disabledReason={
            blocked ? 'Cannot reach Aurora' : loop.state.valid === false ? 'Fix the problems before testing' : null
          }
          busy={!doc || writing || (lights.state.phase !== 'idle' && lights.state.phase !== 'running')}
          onStart={startTest}
          onStop={() => void lights.revert()}
          onReconnect={loop.reconnect}
        />
      </header>
      <DesktopNote />
      {banner?.kind === 'unreachable' ? (
        <div className="editor-banner" role="alert">
          <span>{banner.message}</span>
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}
      {banner?.kind === 'notice' ? (
        <div className="editor-banner" role="alert" data-rank={status.rank}>
          <span>
            {banner.message}
            {banner.detail ? `: ${banner.detail}` : ''}
          </span>
        </div>
      ) : null}
      {banner?.kind === 'restore' && baseline && offer ? (
        <div className="editor-banner" role="group" aria-label="Unsaved changes from an earlier visit">
          <span>Unsaved changes from an earlier visit.</span>
          <button
            type="button" className="btn btn-secondary"
            onClick={() => {
              dispatch({ type: 'edit', change: () => offer })
              setOffer(null)
              showToast('Restored')
            }}
          >
            Restore
          </button>
          <button
            type="button" className="btn btn-secondary"
            onClick={() => {
              clearUnsaved(baseline.id)
              setOffer(null)
              showToast('Discarded')
            }}
          >
            Discard
          </button>
        </div>
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
      <Toast text={toastText} />
    </div>
  )
}
