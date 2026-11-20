import { useEffect, useMemo, useRef, useState } from 'react'
import { applyNodeChanges, Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Node } from '@xyflow/react'
import { GenericNode } from '../GenericNode'
import { ReadOnlyContext, TuningMarksContext, tuningKey } from '../EditorContext'
import { layered } from '../graph/layout'
import { NODE_KIND, toFlowEdges, toFlowNodes, type AuroraNodeData } from '../graph/flow'
import { ViewMenu } from '../ViewMenu'
import { catalog, type Recipe } from './recipes'

// Unlike the editor, the whole recipe must be in view at the start, however small that makes it.
const RECIPE_FIT = { minZoom: 0.1, maxZoom: 1 }
const nodeTypes = { [NODE_KIND]: GenericNode }

type FlowNode = Node<AuroraNodeData>

// Once React Flow has measured the nodes, spaces them by their real sizes and fits the view again.
function Respace({ recipe, setNodes }: { recipe: Recipe; setNodes: (update: (nodes: FlowNode[]) => FlowNode[]) => void }) {
  const ready = useNodesInitialized()
  const { getNodes, fitView } = useReactFlow()
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const now = getNodes()
    const measured = Object.fromEntries(
      now.filter((n) => n.measured?.width && n.measured.height).map((n) => [n.id, { width: n.measured!.width!, height: n.measured!.height! }]),
    )
    const at = layered(recipe.doc, catalog, measured)
    setNodes((ns) => ns.map((n) => ({ ...n, position: at[n.id] ?? n.position })))
    requestAnimationFrame(() => void fitView(RECIPE_FIT))
  }, [ready, recipe, getNodes, setNodes, fitView])
  return null
}

function Canvas({ recipe }: { recipe: Recipe }) {
  // Layered layout from estimated sizes. Respace redoes it with measured sizes.
  const [nodes, setNodes] = useState<FlowNode[]>(() => {
    const at = layered(recipe.doc, catalog)
    return toFlowNodes(recipe.doc, catalog).map((n) => ({ ...n, position: at[n.id], draggable: false, connectable: false, selectable: false }))
  })
  const edges = useMemo(() => toFlowEdges(recipe.doc, catalog), [recipe])
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(changes) => setNodes((ns) => applyNodeChanges(changes, ns))}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      edgesFocusable={false}
      colorMode="dark"
      fitView
      fitViewOptions={RECIPE_FIT}
      minZoom={0.1}
      attributionPosition="bottom-center"
    >
      <Respace recipe={recipe} setNodes={setNodes} />
      <Background variant={BackgroundVariant.Dots} />
      <ViewMenu minimap={false} fitOptions={RECIPE_FIT} />
    </ReactFlow>
  )
}

// The editor's own nodes, wires, zoom, fit and View menu on a read-only canvas: nothing drags, connects,
// selects or edits. The wheel zooms, as in the editor.
export function RecipeViewer({ recipe, height }: { recipe: Recipe; height?: number }) {
  const marks = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of recipe.clip.controls) map.set(tuningKey(c.node, c.param), `In Tuning as "${c.label || c.param}", ${c.section || 'General'}.`)
    return map
  }, [recipe])
  return (
    <div className="recipe-viewer editor" style={height ? { height } : undefined} role="group" aria-label={`${recipe.name}, graph as the editor shows it. A text outline follows.`}>
      <ReadOnlyContext.Provider value>
        <TuningMarksContext.Provider value={marks}>
          <ReactFlowProvider key={recipe.slug}>
            <Canvas recipe={recipe} />
          </ReactFlowProvider>
        </TuningMarksContext.Provider>
      </ReadOnlyContext.Provider>
    </div>
  )
}
