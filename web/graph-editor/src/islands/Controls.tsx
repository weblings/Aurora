import { Button, Select, Slider, Switch } from '@weblings_things/grille'

// Leaf controls for web/ui (Aurora-4nqt.7). Each is fed props by a vanilla wrapper that keeps the
// old class API, so the wrapper owns the state and these only draw it.

export type SelectFieldProps = {
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  // Grille's Select has no open event, so the press that opens it is reported instead.
  onOpen?: () => void
  isDisabled?: boolean
}

export function SelectField({ label, options, value, onChange, onOpen, isDisabled }: SelectFieldProps) {
  const open = (e: { target: EventTarget }) => {
    if (onOpen && (e.target as HTMLElement).closest('.ui-select-trigger')) onOpen()
  }
  const key = (e: React.KeyboardEvent) => {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) open(e)
  }
  return (
    <div className="ui-island-fill" onPointerDownCapture={open} onKeyDownCapture={key}>
      <Select fullWidth label={label} options={options} value={value} onChange={onChange} isDisabled={isDisabled} />
    </div>
  )
}

export type SwitchFieldProps = {
  label: string
  isSelected: boolean
  onChange: (isSelected: boolean) => void
  isDisabled?: boolean
}

export function SwitchField(props: SwitchFieldProps) {
  return <Switch {...props} />
}

export type SliderFieldProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  onChangeEnd?: (value: number) => void
  isDisabled?: boolean
}

// Grille's Slider has no disabled state, so a disabled one is inert and dimmed like Grille's own.
export function SliderField({ isDisabled, ...props }: SliderFieldProps) {
  return (
    <div className="ui-island-fill" inert={isDisabled || undefined} style={isDisabled ? { opacity: 0.4 } : undefined}>
      <Slider fullWidth {...props} />
    </div>
  )
}

export type SegmentedProps = {
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}

// Grille has no segmented control, so this is a labelled group of its buttons, the chosen one primary.
export function SegmentedField({ label, options, value, onChange }: SegmentedProps) {
  return (
    <div role="group" aria-label={label} className="ui-island-segmented">
      {options.map((o) => (
        <Button key={o.id} variant={o.id === value ? 'primary' : undefined} aria-pressed={o.id === value} onPress={() => onChange(o.id)}>
          {o.label}
        </Button>
      ))}
    </div>
  )
}
