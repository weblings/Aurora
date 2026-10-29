import type { GradientStop, ParamInfo, ParamValue } from './graph/types'

const MAX_STOPS = 16
const MIN_STOPS = 2

type Props = {
  info: ParamInfo
  // The node's own value, or undefined when the graph leaves it at the default.
  value: ParamValue | undefined
  onChange: (value: ParamValue) => void
}

// One widget per param kind. `nodrag nowheel` keep a drag or scroll on a
// widget from moving the node or zooming the canvas.
export function ParamWidget({ info, value, onChange }: Props) {
  const current = value === undefined ? info.default : value
  const label = info.label || info.name
  return (
    <div className="param nodrag nowheel" title={info.description}>
      <span className="param-label">
        {label}
        {info.unit ? <small> {info.unit}</small> : null}
      </span>
      {renderInput(info, current, onChange)}
    </div>
  )
}

function renderInput(info: ParamInfo, current: ParamValue, onChange: (v: ParamValue) => void) {
  switch (info.kind) {
    case 'Float':
      return <FloatInput info={info} value={current as number} onChange={onChange} />
    case 'OptionalFloat': {
      const unset = current === null
      return (
        <span className="param-optional">
          <input
            type="checkbox"
            aria-label={`${info.name} set`}
            checked={!unset}
            onChange={(e) => onChange(e.target.checked ? numberOr(info.default, info.min ?? 0) : null)}
          />
          {unset ? <em>unset</em> : <FloatInput info={info} value={current as number} onChange={onChange} />}
        </span>
      )
    }
    case 'Bool':
      return (
        <input
          type="checkbox"
          aria-label={info.name}
          checked={current === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      )
    case 'Enum': {
      const options = info.options ?? []
      // The output binding has no fixed options when no outputs are registered.
      if (options.length === 0) {
        return (
          <input
            type="text"
            aria-label={info.name}
            value={String(current ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      return (
        <select aria-label={info.name} value={String(current)} onChange={(e) => onChange(e.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }
    case 'Gradient':
      return <GradientInput stops={current as GradientStop[]} onChange={onChange} />
  }
}

function numberOr(value: ParamValue, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

function FloatInput({ info, value, onChange }: { info: ParamInfo; value: number; onChange: (v: number) => void }) {
  return (
    <span className="param-float">
      <input
        type="range"
        aria-label={info.name}
        min={info.min}
        max={info.max}
        step={info.step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <input
        type="number"
        aria-label={`${info.name} value`}
        min={info.min}
        max={info.max}
        step={info.step}
        value={value}
        onChange={(e) => {
          // An emptied box yields NaN; keep the last number instead.
          if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber)
        }}
      />
    </span>
  )
}

function GradientInput({ stops, onChange }: { stops: GradientStop[]; onChange: (v: ParamValue) => void }) {
  const replace = (index: number, patch: Partial<GradientStop>) =>
    onChange(stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)))
  return (
    <span className="param-gradient">
      <span
        className="gradient-bar"
        style={{ background: `linear-gradient(90deg, ${stops.map((s) => `${s.color} ${s.pos * 100}%`).join(', ')})` }}
      />
      {stops.map((stop, i) => (
        <span className="gradient-stop" key={i}>
          <input
            type="color"
            aria-label={`stop ${i + 1} color`}
            value={stop.color}
            onChange={(e) => replace(i, { color: e.target.value })}
          />
          <input
            type="number"
            aria-label={`stop ${i + 1} position`}
            min={0}
            max={1}
            step={0.05}
            value={stop.pos}
            onChange={(e) => {
              if (Number.isFinite(e.target.valueAsNumber)) replace(i, { pos: e.target.valueAsNumber })
            }}
          />
          <button
            type="button"
            aria-label={`remove stop ${i + 1}`}
            disabled={stops.length <= MIN_STOPS}
            onClick={() => onChange(stops.filter((_, j) => j !== i))}
          >
            −
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={stops.length >= MAX_STOPS}
        onClick={() => onChange(addStop(stops))}
      >
        + stop
      </button>
    </span>
  )
}

// New stop at the end of the widest gap, with the color of the stop before it.
export function addStop(stops: GradientStop[]): GradientStop[] {
  let at = 0
  let widest = -1
  for (let i = 0; i < stops.length - 1; i++) {
    const gap = stops[i + 1].pos - stops[i].pos
    if (gap > widest) {
      widest = gap
      at = i
    }
  }
  const mid = (stops[at].pos + stops[at + 1].pos) / 2
  return [...stops.slice(0, at + 1), { pos: mid, color: stops[at].color }, ...stops.slice(at + 1)]
}
