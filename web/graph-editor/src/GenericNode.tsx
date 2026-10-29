import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useEditorActions } from './EditorContext'
import type { AuroraNodeData } from './graph/flow'
import { ParamWidget } from './ParamWidget'
import { useNodeProblems } from './ProblemsContext'
import { unattributed } from './graph/problems'

// One component draws every node type from its /api/nodes entry: ports become
// handles, params become widgets.
function GenericNodeView({ id, data }: NodeProps<Node<AuroraNodeData>>) {
  const { setParam, commit } = useEditorActions()
  const { info, params, connectedInputs } = data
  const problems = useNodeProblems(id)
  // Messages that named no port or param show under the header.
  const loose = problems ? unattributed(problems) : []

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
    <div className={`aurora-node${problems ? ' aurora-node-problem' : ''}`} title={info.purpose}>
      <div className="aurora-node-header">
        <strong>{info.title || data.type}</strong>
        {problems ? (
          <span className="problem-badge" title={problems.messages.join('\n')} role="img" aria-label={`${problems.messages.length} problems`}>
            ⚠ {problems.messages.length}
          </span>
        ) : null}
        <small>{id}</small>
      </div>
      {loose.length > 0 ? (
        <ul className="problem-list">
          {loose.map((m) => (
            <li key={m}>⚠ {m}</li>
          ))}
        </ul>
      ) : null}
      <div className="aurora-ports">
        <div className="aurora-ports-in">
          {info.inputs.map((port) => (
            <div
              className={`aurora-port${port.required && !connectedInputs.has(port.name) ? ' aurora-port-open' : ''}`}
              key={port.name}
              title={problems?.ports.get(port.name)?.join('\n') ?? port.description}
            >
              <Handle type="target" position={Position.Left} id={port.name} />
              {port.name}
              <small>{port.type}</small>
              {problems?.ports.has(port.name) ? <span className="problem-mark">⚠</span> : null}
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
          onCommit={commit}
          problems={problems?.params.get(param.name)}
        />
      ))}
    </div>
  )
}

export const GenericNode = memo(GenericNodeView)
