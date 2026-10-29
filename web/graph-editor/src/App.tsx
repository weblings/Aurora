import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from '@xyflow/react'
import { fetchCatalog, fetchEffectGraph, fetchEffects } from './api'
import { EditorContext, type EditorActions } from './EditorContext'
import { GenericNode } from './GenericNode'
import { refuseConnection } from './graph/connection'
import { addEdge, joinEndpoint, moveNodes, removeEdge, removeNodes, setParam } from './graph/doc'
import { NODE_KIND, carryViewState, edgeId, toFlowEdges, toFlowNodes, type AuroraNodeData } from './graph/flow'
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
  // The whole graph, replaced by every edit.
  const [doc, setDoc] = useState<GraphDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  // What React Flow has told us (selection, measured sizes, a drag in progress).
  // The nodes it draws are derived from `doc` in the same render, so a param
  // edit never shows one frame of the old value.
  const [nodeView, setNodeView] = useState<Node<AuroraNodeData>[]>([])
  const [edgeView, setEdgeView] = useState<Edge[]>([])

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
    setDoc(null)
    setNodeView([])
    setEdgeView([])
    fetchEffectGraph(effectId)
      .then((graph) => {
        if (stale) return
        setDoc(graph)
        setError(null)
      })
      .catch((e: Error) => !stale && setError(`Cannot open '${effectId}': ${e.message}`))
    return () => {
      stale = true
    }
  }, [effectId])

  const nodes = useMemo(
    () => (doc && catalog ? carryViewState(nodeView, toFlowNodes(doc, catalog)) : []),
    [doc, catalog, nodeView],
  )
  const edges = useMemo(() => (doc ? carryViewState(edgeView, toFlowEdges(doc)) : []), [doc, edgeView])

  const actions = useMemo<EditorActions>(
    () => ({
      setParam: (nodeId: string, name: string, value: ParamValue) =>
        setDoc((d) => (d ? setParam(d, nodeId, name, value) : d)),
    }),
    [],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<AuroraNodeData>>[]) => {
      setNodeView(applyNodeChanges(changes, nodes))
      const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
      if (removed.size > 0) setDoc((d) => (d ? removeNodes(d, removed) : d))
    },
    [nodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdgeView(applyEdgeChanges(changes, edges))
      const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
      if (removed.size === 0) return
      setDoc((d) =>
        d ? d.edges.filter((e) => removed.has(edgeId(e))).reduce(removeEdge, d) : d,
      )
    },
    [edges],
  )

  // Position lands in the document once, when the drag ends.
  const onNodeDragStop = useCallback((_: unknown, __: Node, dragged: Node[]) => {
    setDoc((d) =>
      d ? moveNodes(d, Object.fromEntries(dragged.map((n) => [n.id, { x: n.position.x, y: n.position.y }]))) : d,
    )
  }, [])

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
      setDoc((d) =>
        d ? addEdge(d, [joinEndpoint(c.source, c.sourceHandle!), joinEndpoint(c.target, c.targetHandle!)]) : d,
      )
    },
    [wiring],
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
        <select aria-label="Effect" value={effectId} onChange={(e) => setEffectId(e.target.value)}>
          {effects.some((e) => e.id === effectId) ? null : <option value={effectId}>{effectId}</option>}
          {effects.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title || e.id}
            </option>
          ))}
        </select>
        {refusal ? <span className="editor-refusal">{refusal}</span> : null}
        {error ? <span className="editor-error">{error}</span> : null}
      </header>
      <div className="editor-canvas">
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
            key={effectId}
          >
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </EditorContext.Provider>
      </div>
    </div>
  )
}
