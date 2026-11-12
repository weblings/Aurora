import { memo } from 'react'
import { Icon, menuHorizontalIcon, warningIcon } from '@weblings/grille'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Hint } from './Hint'
import { useEditorActions } from './EditorContext'
import type { AuroraNodeData } from './graph/flow'
import { ParamWidget } from './ParamWidget'
import { useNodeProblems } from './ProblemsContext'
import { unattributed } from './graph/problems'
import { portMeaning, portStyle } from './graph/portStyle'

function handleLook(type: string) {
  const { color } = portStyle(type)
  return { className: `aurora-handle`, 'data-port-type': type, style: { '--port-color': color } as React.CSSProperties }
}

// One component draws every node type from its /api/nodes entry: ports become
// handles, params become widgets.
function GenericNodeView({ id, data }: NodeProps<Node<AuroraNodeData>>) {
  const { setParam, commit, openNodeMenu } = useEditorActions()
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
    <div className={`aurora-node${problems ? ' aurora-node-problem' : ''}`}>
      <div className="aurora-node-header">
        <Hint text={info.tip}><strong>{info.title || data.type}</strong></Hint>
        {problems ? (
          <Hint text={problems.messages}>
            <span className="problem-badge" role="img" aria-label={`${problems.messages.length} problems`}>
              <Icon icon={warningIcon} size="sm" /> {problems.messages.length}
            </span>
          </Hint>
        ) : null}
        <small>{id}</small>
        <button
          type="button"
          className="aurora-node-more nodrag"
          aria-label={`Actions for ${info.title || data.type}`}
          aria-haspopup="menu"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            openNodeMenu(id, { x: box.left, y: box.bottom })
          }}
        >
          <Icon icon={menuHorizontalIcon} size="sm" />
        </button>
      </div>
      {loose.length > 0 ? (
        <ul className="problem-list">
          {loose.map((m) => (
            <li key={m}><Icon icon={warningIcon} size="sm" /> {m}</li>
          ))}
        </ul>
      ) : null}
      <div className="aurora-ports">
        <div className="aurora-ports-in">
          {info.inputs.map((port) => (
            <div
              className={`aurora-port${port.required && !connectedInputs.has(port.name) ? ' aurora-port-open' : ''}`}
              key={port.name}
            >
              <Handle type="target" position={Position.Left} id={port.name} {...handleLook(port.type)} />
              <Hint text={problems?.ports.get(port.name) ?? port.description}><span className="aurora-port-name">{port.name}</span></Hint>
              <Hint text={portMeaning(port.type)}><small>{port.type}</small></Hint>
              {problems?.ports.has(port.name) ? <span className="problem-mark"><Icon icon={warningIcon} size="sm" /></span> : null}
            </div>
          ))}
        </div>
        <div className="aurora-ports-out">
          {info.outputs.map((port) => (
            <div className="aurora-port aurora-port-out" key={port.name}>
              <Hint text={portMeaning(port.type)}><small>{port.type}</small></Hint>
              <Hint text={port.description}><span className="aurora-port-name">{port.name}</span></Hint>
              <Handle type="source" position={Position.Right} id={port.name} {...handleLook(port.type)} />
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
