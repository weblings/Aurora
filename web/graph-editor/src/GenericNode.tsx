import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useEditorActions } from './EditorContext'
import type { AuroraNodeData } from './graph/flow'
import { ParamWidget } from './ParamWidget'

// One component draws every node type from its /api/nodes entry: ports become
// handles, params become widgets.
function GenericNodeView({ id, data }: NodeProps<Node<AuroraNodeData>>) {
  const { setParam } = useEditorActions()
  const { info, params, connectedInputs } = data

  if (!info) {
    return (
      <div className="aurora-node aurora-node-unknown">
        <div className="aurora-node-header">
          <strong>{data.type}</strong>
          <small>{id}</small>
        </div>
        <p className="aurora-node-note">Unknown node type: this build cannot edit it.</p>
      </div>
    )
  }

  return (
    <div className="aurora-node" title={info.purpose}>
      <div className="aurora-node-header">
        <strong>{info.title || data.type}</strong>
        <small>{id}</small>
      </div>
      <div className="aurora-ports">
        <div className="aurora-ports-in">
          {info.inputs.map((port) => (
            <div
              className={`aurora-port${port.required && !connectedInputs.has(port.name) ? ' aurora-port-open' : ''}`}
              key={port.name}
              title={port.description}
            >
              <Handle type="target" position={Position.Left} id={port.name} />
              {port.name}
              <small>{port.type}</small>
            </div>
          ))}
        </div>
        <div className="aurora-ports-out">
          {info.outputs.map((port) => (
            <div className="aurora-port aurora-port-out" key={port.name} title={port.description}>
              <small>{port.type}</small>
              {port.name}
              <Handle type="source" position={Position.Right} id={port.name} />
            </div>
          ))}
        </div>
      </div>
      {info.params.map((param) => (
        <ParamWidget
          key={param.name}
          info={param}
          value={params[param.name]}
          onChange={(value) => setParam(id, param.name, value)}
        />
      ))}
    </div>
  )
}

export const GenericNode = memo(GenericNodeView)
