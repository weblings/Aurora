import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import { applyGraph, fetchCatalog, fetchEffectGraph, fetchEffects, putDraft, saveGraph, type WriteResult } from './api'
import { EditorContext, type EditorActions } from './EditorContext'
import { GenericNode } from './GenericNode'
import { Inspector } from './Inspector'
import { PALETTE_DRAG_TYPE, Palette } from './Palette'
import { ProblemsContext } from './ProblemsContext'
import { ZoneThumbnail } from './ZoneThumbnail'
import { tabSession, useDraftLoop } from './useDraftLoop'
import { useLightTest } from './useLightTest'
import { restorable, clearUnsaved, syncUnsaved } from './graph/autosave'
import { refuseConnection } from './graph/connection'
import { addEdge, addNode, joinEndpoint, moveNodes, removeEdge, removeNodes, setParam } from './graph/doc'
import { editorReducer, emptyEditor, sameDoc } from './graph/history'
import { describeTest } from './graph/lightTest'
import { forWrite, freshEffectId, setTitle, titleOf } from './graph/save'
import { NODE_KIND, carryViewState, edgeId, toFlowEdges, toFlowNodes, type AuroraNodeData } from './graph/flow'
import { groupProblems, sameProblems, type Problems } from './graph/problems'
import { summarize } from './graph/loop'
import type { Catalog, EffectListEntry, GraphDoc, ParamValue } from './graph/types'

const nodeTypes = { [NODE_KIND]: GenericNode }
const DEFAULT_EFFECT = 'builtin.video'

function initialEffectId(): string {
  return new URLSearchParams(window.location.search).get('effect') ?? DEFAULT_EFFECT
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [effects, setEffects] = useState<EffectListEntry[]>([])
  const [effectId, setEffectId] = useState(initialEffectId)
  // The whole graph, replaced by every edit, with its undo history.
  const [{ doc, past, future }, dispatch] = useReducer(editorReducer, emptyEditor)
  // What the server last gave us or accepted; unsaved edits are measured from it.
  const [baseline, setBaseline] = useState<{ id: string; doc: GraphDoc } | null>(null)
  // A browser-stored copy of unsaved edits from an earlier visit, awaiting a choice.
  const [offer, setOffer] = useState<GraphDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The outcome of the last Save / Save and apply / Keep.
  const [notice, setNotice] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  // The document the running test was started from.
  const [tested, setTested] = useState<GraphDoc | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  // What React Flow has told us (selection, measured sizes, a drag in progress).
  // The nodes it draws are derived from `doc` in the same render, so a param
  // edit never shows one frame of the old value.
  const [nodeView, setNodeView] = useState<Node<AuroraNodeData>[]>([])
  const [edgeView, setEdgeView] = useState<Edge[]>([])
  const flow = useRef<ReactFlowInstance<Node<AuroraNodeData>, Edge> | null>(null)
  const canvas = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([fetchCatalog(), fetchEffects()])
      .then(([c, e]) => {
        setCatalog(c)
        setEffects(e)
      })
      .catch((e: Error) => setError(`Cannot reach Aurora: ${e.message}`))
  }, [])

  useEffect(() => {
    let stale = false
    dispatch({ type: 'open', doc: null })
    setBaseline(null)
    setOffer(null)
    setNodeView([])
    setEdgeView([])
    fetchEffectGraph(effectId)
      .then((graph) => {
        if (stale) return
        dispatch({ type: 'open', doc: graph })
        setBaseline({ id: effectId, doc: graph })
        setOffer(restorable(effectId, graph))
        setError(null)
      })
      .catch((e: Error) => !stale && setError(`Cannot open '${effectId}': ${e.message}`))
    return () => {
      stale = true
    }
  }, [effectId])

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
  const testNote = describeTest(lights.state)
  const changedSinceTest = testing && tested !== null && doc !== null && !sameDoc(tested, doc)
  const dirty = useMemo(() => (doc && baseline ? !sameDoc(baseline.doc, doc) : false), [doc, baseline])
  const isBuiltin = effects.find((e) => e.id === effectId)?.builtin ?? effectId.startsWith('builtin.')
  const needsName = isBuiltin && doc !== null && titleOf(doc).trim() === ''
  const picked = nodeView.filter((n) => n.selected)
  const selectedId = picked.length === 1 ? picked[0].id : null

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('effect') === effectId) return
    url.searchParams.set('effect', effectId)
    window.history.replaceState(null, '', url)
  }, [effectId])

  const startTest = () => {
    setNotice(null)
    setTested(docRef.current)
    void lights.start()
  }

  // Save, Save and apply and Keep write the document under an id: the open
  // custom effect's, or a fresh one named after the title when a built-in is
  // open (a built-in is never overwritten). Save as new forks a custom the
  // same way, leaving the original file as it was.
  const write = async (kind: 'save' | 'apply' | 'keep', asNew = false) => {
    if (!doc || !baseline || writing) return
    if (needsName) {
      setNotice('Name the new effect first')
      return
    }
    // A new effect that kept a taken title would show as a second row of the
    // same name in the picker, so it takes a distinct one.
    const sent = forWrite(doc, isBuiltin || asNew, kind === 'keep', effects.map((e) => e.title || e.id))
    const id = isBuiltin || asNew ? freshEffectId(titleOf(sent), effects.map((e) => e.id)) : baseline.id
    setWriting(true)
    setNotice(null)
    try {
      let result: WriteResult
      if (kind === 'keep') {
        result = await lights.keep(id)
      } else {
        const verdict = await putDraft(session, sent)
        if (!verdict.valid) {
          const n = verdict.errors.length
          setNotice(`Fix the ${n} ${n === 1 ? 'problem' : 'problems'} before saving`)
          return
        }
        result = kind === 'save' ? await saveGraph(session, id) : await applyGraph(session, id)
      }
      if (!result.ok) {
        setNotice(result.reason)
        return
      }
      const live = kind !== 'save'
      setNotice(
        `${live ? 'Saved and live' : 'Saved'} as ${titleOf(sent) || id}${result.reloadError ? `. Reload: ${result.reloadError}` : ''}`,
      )
      fetchEffects().then(setEffects).catch(() => {})
      if (id !== baseline.id) {
        // The built-in stays as it was; its edits now live in the new effect.
        clearUnsaved(baseline.id)
        setEffectId(id)
      } else {
        setBaseline({ id, doc: sent })
      }
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setWriting(false)
    }
  }
  const summary = summarize(loop.state)
  // Keep the previous object while the messages are unchanged, so a preview
  // event that repeats the same runtime error does not re-render every node.
  const lastProblems = useRef<Problems | null>(null)
  const problems = useMemo(() => {
    const next = groupProblems(loop.state.valid === false ? loop.state.issues : [], loop.state.runtime, new Set(doc?.nodes.map((n) => n.id)))
    if (lastProblems.current && sameProblems(lastProblems.current, next)) return lastProblems.current
    lastProblems.current = next
    return next
  }, [loop.state.valid, loop.state.issues, loop.state.runtime, doc])

  const edit = useCallback((change: (d: GraphDoc) => GraphDoc) => dispatch({ type: 'edit', change }), [])
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

  const nodes = useMemo(
    () => (doc && catalog ? carryViewState(nodeView, toFlowNodes(doc, catalog)) : []),
    [doc, catalog, nodeView],
  )
  const edges = useMemo(() => (doc ? carryViewState(edgeView, toFlowEdges(doc)) : []), [doc, edgeView])

  const actions = useMemo<EditorActions>(
    () => ({
      setParam: (nodeId: string, name: string, value: ParamValue) =>
        dispatch({ type: 'edit', change: (d) => setParam(d, nodeId, name, value), live: true }),
      commit: () => dispatch({ type: 'commit' }),
    }),
    [],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<AuroraNodeData>>[]) => {
      setNodeView(applyNodeChanges(changes, nodes))
      const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
      if (removed.size > 0) edit((d) => removeNodes(d, removed))
    },
    [nodes, edit],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdgeView(applyEdgeChanges(changes, edges))
      const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
      if (removed.size === 0) return
      edit((d) => d.edges.filter((e) => removed.has(edgeId(e))).reduce(removeEdge, d))
    },
    [edges, edit],
  )

  // Position lands in the document once, when the drag ends.
  const onNodeDragStop = useCallback((_: unknown, __: Node, dragged: Node[]) => {
    edit((d) => moveNodes(d, Object.fromEntries(dragged.map((n) => [n.id, { x: n.position.x, y: n.position.y }]))))
  }, [edit])

  // Adds a palette type at a screen point (a drop) or the canvas centre.
  const addFromPalette = useCallback(
    (type: string, screen?: { x: number; y: number }) => {
      const info = catalog?.get(type)
      const view = flow.current
      if (!info || !view) return
      const box = canvas.current?.getBoundingClientRect()
      const point = screen ?? { x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 }
      const at = view.screenToFlowPosition(point)
      edit((d) => addNode(d, info, at))
    },
    [catalog, edit],
  )

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

  const isValidConnection = useCallback((c: Connection | Edge) => wiring(c) === null, [wiring])

  const onConnect = useCallback(
    (c: Connection) => {
      const reason = wiring(c)
      setRefusal(reason)
      if (reason || !c.sourceHandle || !c.targetHandle) return
      edit((d) => addEdge(d, [joinEndpoint(c.source, c.sourceHandle!), joinEndpoint(c.target, c.targetHandle!)]))
    },
    [wiring, edit],
  )

  const onConnectEnd = useCallback(
    (_: unknown, state: { isValid: boolean | null; fromNode: Node | null; toHandle: { nodeId: string; id?: string | null } | null; fromHandle: { id?: string | null; type: string } | null }) => {
      // A drop on a handle that isValidConnection refused: say why.
      if (state.isValid === false && state.fromNode && state.toHandle && state.fromHandle) {
        const from = state.fromHandle.type === 'source'
        const reason = wiring({
          source: from ? state.fromNode.id : state.toHandle.nodeId,
          sourceHandle: from ? state.fromHandle.id ?? null : state.toHandle.id ?? null,
          target: from ? state.toHandle.nodeId : state.fromNode.id,
          targetHandle: from ? state.toHandle.id ?? null : state.fromHandle.id ?? null,
        })
        setRefusal(reason)
      } else {
        setRefusal(null)
      }
    },
    [wiring],
  )

  return (
    <div className="editor">
      <header className="editor-header">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width={20} height={20} alt="" />
        <strong>Aurora graph editor</strong>
        <select aria-label="Effect" value={effectId} onChange={(e) => {
            setNotice(null)
            setEffectId(e.target.value)
          }}>
          {effects.some((e) => e.id === effectId) ? null : <option value={effectId}>{effectId}</option>}
          {effects.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title || e.id}
            </option>
          ))}
        </select>
        <button type="button" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button type="button" onClick={redo} disabled={future.length === 0} title="Redo (Shift+Ctrl/Cmd+Z)">
          Redo
        </button>
        {offer && baseline ? (
          <span className="editor-restore">
            Unsaved changes from an earlier visit.
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'edit', change: () => offer })
                setOffer(null)
              }}
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => {
                clearUnsaved(baseline.id)
                setOffer(null)
              }}
            >
              Discard
            </button>
          </span>
        ) : null}
        <span className="editor-status" role="status" title={summary.detail ?? undefined}>
          {summary.label}
        </span>
        {loop.state.stream === 'replaced' ? (
          <button type="button" onClick={loop.reconnect}>
            Reconnect
          </button>
        ) : null}
        {refusal ? <span className="editor-refusal">{refusal}</span> : null}
        {error ? <span className="editor-error">{error}</span> : null}
      </header>
      <div className="editor-actions">
        <label className="editor-name">
          Name
          <input
            type="text"
            value={doc ? titleOf(doc) : ''}
            placeholder={isBuiltin ? 'Name the new effect' : 'Effect name'}
            disabled={!doc}
            onChange={(e) => edit((d) => setTitle(d, e.target.value))}
          />
        </label>
        {testing ? (
          <>
            <button type="button" onClick={() => void write('keep')} disabled={writing || changedSinceTest} title={changedSinceTest ? 'The graph changed since the test started. Test again, or use Save and apply' : 'Make the tested graph the live effect'}>
              Keep
            </button>
            <button type="button" onClick={() => void lights.revert()} disabled={writing}>
              Revert
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startTest}
            disabled={!doc || loop.state.valid !== true || lights.state.phase !== 'idle'}
            title={loop.state.valid === false ? 'Fix the problems before testing' : 'Show this graph on the real lights for a while, then put them back'}
          >
            {lights.state.other ? 'Take over the lights' : 'Test on lights'}
          </button>
        )}
        <button type="button" onClick={() => void write('save')} disabled={!doc || writing} title="Save as a custom effect without changing the live effect">
          Save
        </button>
        {isBuiltin ? null : (
          <button type="button" onClick={() => void write('save', true)} disabled={!doc || writing} title="Save a copy under a new name, leaving this effect as it was">
            Save as new
          </button>
        )}
        <button type="button" onClick={() => void write('apply')} disabled={!doc || writing} title="Save and make it the live effect">
          Save and apply
        </button>
        {dirty ? <span className="editor-dirty">Unsaved changes</span> : null}
        <span className="editor-test-note" role="status" aria-live="polite">
          {testNote}
        </span>
        {notice ? <span className="editor-notice">{notice}</span> : null}
      </div>
      <div className="editor-body">
      {/* The panels keep their width while loading: the canvas fits the graph once, and a late panel would shrink it under the nodes. */}
      {catalog ? <Palette catalog={catalog} onAdd={(type) => addFromPalette(type)} /> : <div className="palette" />}
      <div className="editor-canvas" ref={canvas}
        onDragOver={(e) => e.dataTransfer.types.includes(PALETTE_DRAG_TYPE) && e.preventDefault()}
        onDrop={(e) => {
          const type = e.dataTransfer.getData(PALETTE_DRAG_TYPE)
          if (!type) return
          e.preventDefault()
          addFromPalette(type, { x: e.clientX, y: e.clientY })
        }}
      >
        {problems.graph.length > 0 ? (
          <ul className="editor-graph-problems">
            {problems.graph.map((m) => (
              <li key={m}>⚠ {m}</li>
            ))}
          </ul>
        ) : null}
        <ZoneThumbnail frame={loop.frame} live={loop.state.stream === 'live'} />
        <ProblemsContext.Provider value={problems}>
        <EditorContext.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            colorMode="dark"
            fitView
            minZoom={0.2}
            onInit={(instance) => {
              flow.current = instance
            }}
            key={effectId}
          >
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </EditorContext.Provider>
        </ProblemsContext.Provider>
      </div>
      {doc && catalog ? <Inspector doc={doc} catalog={catalog} selected={selectedId} edit={edit} /> : <div className="inspector" />}
      </div>
    </div>
  )
}
