import { memo, useContext, useRef } from 'react'
import { Icon, menuHorizontalIcon } from '@weblings/grille'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Hint } from './Hint'
import { ReadOnlyContext, TuningMarksContext, tuningKey, useEditorActions, useShowNodeIds } from './EditorContext'
import { TapHint } from './TapHint'
import type { AuroraNodeData } from './graph/flow'
import { ParamWidget } from './ParamWidget'
import { useNodeProblems } from './ProblemsContext'
import { nodeTitle } from './graph/nodeTitle'
import { portMeaning, portStyle } from './graph/portStyle'

function handleLook(type: string) {
  const { color } = portStyle(type)
  return { className: `aurora-handle`, 'data-port-type': type, style: { '--port-color': color } as React.CSSProperties }
}

// One component draws every node type from its /api/nodes entry: ports become
// handles, params become widgets.
function GenericNodeView({ id, data }: NodeProps<Node<AuroraNodeData>>) {
  const { setParam, commit, openNodeMenu, openParamMenu } = useEditorActions()
  const { info, params, connectedInputs } = data
  const problems = useNodeProblems(id)
  const showIds = useShowNodeIds()
  const marks = useContext(TuningMarksContext)
  const readOnly = useContext(ReadOnlyContext)
  const pointer = useRef('')

  if (!info) {
    return (
      <div className="aurora-node aurora-node-unknown">
        <div className="aurora-node-header">
          <strong>{nodeTitle(info, data.type)}</strong>
          {showIds ? <small>{id}</small> : null}
        </div>
        <p className="aurora-node-note">Unknown node type: this build cannot edit it.</p>
      </div>
    )
  }

  const title = nodeTitle(info, data.type)
  return (
    <div className={`aurora-node${problems ? ' aurora-node-problem' : ''}`}>
      <div className="aurora-node-header">
        <Hint text={showIds ? (info.tip ? [info.tip, `${title} (${id})`] : `${title} (${id})`) : info.tip}><strong>{title}</strong></Hint>
        {readOnly ? null : <button
          type="button"
          className="aurora-node-more nodrag"
          aria-label={`Actions for ${title}`}
          aria-haspopup="menu"
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            // A keyboard press has no pointer (detail 0).
            openNodeMenu(id, { x: box.left, y: box.bottom }, pointer.current === 'touch' && e.detail !== 0)
            pointer.current = ''
          }}
        >
          <Icon icon={menuHorizontalIcon} size="sm" />
        </button>}
      </div>
      <div className="aurora-ports">
        <div className="aurora-ports-in">
          {info.inputs.map((port) => (
            <div
              className={`aurora-port${port.required && !connectedInputs.has(port.name) ? ' aurora-port-open' : ''}`}
              key={port.name}
            >
              <Handle type="target" position={Position.Left} id={port.name} {...handleLook(port.type)} />
              <TapHint text={port.description} label={`About ${port.name}`}><span className="aurora-port-name">{port.name}</span></TapHint>
              <Hint text={portMeaning(port.type)}><small>{port.type}</small></Hint>
            </div>
          ))}
        </div>
        <div className="aurora-ports-out">
          {info.outputs.map((port) => (
            <div className="aurora-port aurora-port-out" key={port.name}>
              <Hint text={portMeaning(port.type)}><small>{port.type}</small></Hint>
              <TapHint text={port.description} label={`About ${port.name}`}><span className="aurora-port-name">{port.name}</span></TapHint>
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
          tuning={marks.get(tuningKey(id, param.name))}
          onMenu={(at) => openParamMenu(id, param.name, param.label || param.name, at)}
        />
      ))}
    </div>
  )
}

export const GenericNode = memo(GenericNodeView)
