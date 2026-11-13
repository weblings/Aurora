import { Hint } from './Hint'
import type { CSSProperties } from 'react'
import { Button, Icon, minusIcon, warningIcon } from '@weblings/grille'
import type { GradientStop, ParamInfo, ParamValue } from './graph/types'

const MAX_STOPS = 16
const MIN_STOPS = 2

type Props = {
  info: ParamInfo
  // The node's own value, or undefined when the graph leaves it at the default.
  value: ParamValue | undefined
  // Every change; `onCommit` marks the end of a gesture (one undo step).
  onChange: (value: ParamValue) => void
  onCommit: () => void
  // What the server said about this param, shown under it.
  problems?: readonly string[]
}

// One widget per param kind. `nodrag nowheel` keep a drag or scroll on a
// widget from moving the node or zooming the canvas.
export function ParamWidget({ info, value, onChange, onCommit, problems }: Props) {
  const current = effectiveValue(info, value)
  const label = info.label || info.name
  return (
    <div
      className={`param nodrag nowheel${problems ? ' param-problem' : ''}`}
      onPointerUp={onCommit}
      // A typed value is one gesture until the box loses focus; a slider
      // moved by arrow keys has no pointer-up, so key-up ends its step.
      onKeyUp={(e) => {
        const t = e.target
        if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'text')) return
        onCommit()
      }}
      onBlur={onCommit}
    >
      <Hint text={info.description}>
        <span className="param-label">
          {label}
          {info.unit ? <small> {info.unit}</small> : null}
        </span>
      </Hint>
      {renderInput(info, current, onChange, () => onCommit())}
      {problems?.map((m) => (
        <span className="problem-text" key={m}>
          <Icon icon={warningIcon} size="sm" /> {m}
        </span>
      ))}
    </div>
  )
}

// What the loader would use. An omitted optional-float is unset (null), not the
// catalog default, which is only the value shown once the user sets it.
export function effectiveValue(info: ParamInfo, value: ParamValue | undefined): ParamValue {
  if (value !== undefined) return value
  return info.kind === 'optional-float' ? null : info.default
}

// `onChange` is for continuous inputs; a click, toggle or pick is a whole
// gesture, so `onDiscrete` also commits it.
function renderInput(info: ParamInfo, current: ParamValue, onChange: (v: ParamValue) => void, commit: () => void) {
  const onDiscrete = (v: ParamValue) => {
    onChange(v)
    commit()
  }
  switch (info.kind) {
    case 'float':
      return <FloatInput info={info} value={current as number} onChange={onChange} />
    case 'optional-float': {
      const unset = current === null
      return (
        <span className="param-optional">
          <input
            type="checkbox"
            aria-label={`${info.name} set`}
            checked={!unset}
            onChange={(e) => onDiscrete(e.target.checked ? Math.max(numberOr(info.default, 0), info.min ?? 0) : null)}
          />
          {unset ? <em>unset</em> : <FloatInput info={info} value={current as number} onChange={onChange} />}
        </span>
      )
    }
    case 'bool':
      return (
        <input
          type="checkbox"
          aria-label={info.name}
          checked={current === true}
          onChange={(e) => onDiscrete(e.target.checked)}
        />
      )
    case 'enum': {
      const options = info.options ?? []
      // The output binding has no fixed options when no outputs are registered.
      if (options.length === 0) {
        return (
          <input
            type="text"
            className="text-input"
            aria-label={info.name}
            value={String(current ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      return (
        <select aria-label={info.name} value={String(current)} onChange={(e) => onDiscrete(e.target.value)}>
          {options.includes(String(current)) ? null : (
            <option value={String(current)} disabled>
              choose...
            </option>
          )}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }
    case 'gradient':
      return <GradientInput stops={current as GradientStop[]} onChange={onChange} onDiscrete={onDiscrete} />
  }
}

function numberOr(value: ParamValue, fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

// forms.css paints a slider's filled part from --slider-percent.
function sliderFill(info: ParamInfo, value: number): CSSProperties | undefined {
  if (info.min === undefined || info.max === undefined || info.max <= info.min) return undefined
  const percent = Math.min(100, Math.max(0, ((value - info.min) / (info.max - info.min)) * 100))
  return { '--slider-percent': `${percent}%` } as CSSProperties
}

// The server holds params as 32-bit floats, so a value comes back as 0.0500000007451 and the slider's
// step arithmetic leaves 0.28499999999999998. The box shows 7 significant digits (all a float32 has), which
// drops that noise. The stored value is still the exact number the slider or box produced.
export function displayNumber(v: number): number {
  return Number.isFinite(v) ? Number(v.toPrecision(7)) : v
}

function FloatInput({ info, value, onChange }: { info: ParamInfo; value: number; onChange: (v: number) => void }) {
  return (
    <span className="param-float">
      <input
        type="range"
        className="slider-input"
        style={sliderFill(info, value)}
        aria-label={info.name}
        min={info.min}
        max={info.max}
        step={info.step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <input
        type="number"
        className="text-input"
        aria-label={`${info.name} value`}
        min={info.min}
        max={info.max}
        step={info.step}
        value={displayNumber(value)}
        onChange={(e) => {
          // An emptied box yields NaN; keep the last number instead.
          if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber)
        }}
      />
    </span>
  )
}

function GradientInput({
  stops,
  onChange,
  onDiscrete,
}: {
  stops: GradientStop[]
  onChange: (v: ParamValue) => void
  onDiscrete: (v: ParamValue) => void
}) {
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
            className="text-input"
            aria-label={`stop ${i + 1} position`}
            min={0}
            max={1}
            step={0.05}
            value={stop.pos}
            onChange={(e) => {
              if (Number.isFinite(e.target.valueAsNumber)) replace(i, { pos: clampStopPos(stops, i, e.target.valueAsNumber) })
            }}
          />
          <Button
            icon
            aria-label={`remove stop ${i + 1}`}
            isDisabled={stops.length <= MIN_STOPS}
            onPress={() => onDiscrete(stops.filter((_, j) => j !== i))}
          >
            <Icon icon={minusIcon} size="sm" />
          </Button>
        </span>
      ))}
      <Button isDisabled={stops.length >= MAX_STOPS} onPress={() => onDiscrete(addStop(stops))}>
        + stop
      </Button>
    </span>
  )
}

// The loader wants stops in ascending pos within 0..1, so a stop cannot be
// dragged past its neighbours.
export function clampStopPos(stops: GradientStop[], index: number, pos: number): number {
  const low = index > 0 ? stops[index - 1].pos : 0
  const high = index < stops.length - 1 ? stops[index + 1].pos : 1
  return Math.min(high, Math.max(low, pos))
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
