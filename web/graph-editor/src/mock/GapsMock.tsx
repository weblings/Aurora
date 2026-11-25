import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Disclosure, Icon, Select, Slider, Switch, arrowLeftIcon, powerIcon } from '@weblings_things/grille'
// Vanilla web/ui pieces drawn live as the "today" side, so Grille's components are compared to the real thing.
import { Dropdown } from '../../../ui/Dropdown.js'
import { AccordionSection } from '../../../ui/AccordionSection.js'
import { bindSliderFill } from '../../../ui/SliderFill.js'
import powerUrl from '../../../ui/icons/power-svgrepo-com.svg'
import backArrowUrl from '../../../ui/icons/back-arrow.svg'

// Grille gaps mock (Aurora-4nqt.5), now on the real Grille v0.2.2-dev.5 components (Grille-0u5.1 to .5).
// The left column is today's web/ui, the right column is Grille, so differences show side by side.

function useLog() {
  const [lines, setLines] = useState<string[]>([])
  return [lines, (s: string) => setLines((l) => [...l.slice(-11), s])] as const
}

function Log({ lines, label }: { lines: string[]; label: string }) {
  return (
    <ol className="gm-log" aria-label={label}>
      {lines.length === 0 ? <li className="gm-log-empty">nothing yet</li> : lines.map((l, i) => <li key={i}>{l}</li>)}
    </ol>
  )
}

function Frame({ id, title, grille, today, children }: { id: string; title: string; grille: string; today: string; children: ReactNode }) {
  return (
    <section className="gm-frame" id={id}>
      <h2>{title}</h2>
      <p className="gm-gap"><b>Grille:</b> {grille}</p>
      <p className="gm-today"><b>Today:</b> {today}</p>
      {children}
    </section>
  )
}

function Pair({ today, grille }: { today: ReactNode; grille: ReactNode }) {
  return (
    <div className="gm-pair">
      <div className="gm-col"><h3>Today (web/ui, vanilla)</h3>{today}</div>
      <div className="gm-col"><h3>Grille v0.2.2-dev.5</h3>{grille}</div>
    </div>
  )
}

// 1. Switch ---------------------------------------------------------------------------------------------

function VanillaSwitch({ label, checked, disabled }: { label: string; checked: boolean; disabled?: boolean }) {
  // Markup copied from TuningFields._renderSlider and SettingsPanel, so forms.css styles it unchanged.
  return (
    <label className="toggle-row">
      <span className="toggle-row-label">{label}</span>
      <span className="toggle-switch">
        <input type="checkbox" defaultChecked={checked} disabled={disabled} />
        <span className="toggle-knob" />
      </span>
    </label>
  )
}

function SwitchFrame() {
  const [fixed, setFixed] = useState(true)
  const [auto, setAuto] = useState(false)
  return (
    <Frame
      id="switch"
      title="1. Switch (Grille-0u5.1)"
      grille="Switch. All seven real checkboxes in web/ui are this one switch, so no Checkbox was requested."
      today="forms.css .toggle-row / .toggle-switch / .toggle-knob (35x20, ported from RockyRoad's .pre-toggle-switch). Used by SettingsPanel, TuningFields, ZoneActiveToggle, ZoneCanvas."
    >
      <Pair
        today={
          <div className="gm-stack">
            <VanillaSwitch label="Use fixed hue" checked />
            <VanillaSwitch label="Launch Automatically in Game Mode" checked={false} />
            <VanillaSwitch label="Disabled (not writable)" checked disabled />
          </div>
        }
        grille={
          <div className="gm-stack">
            <Switch label="Use fixed hue" isSelected={fixed} onChange={setFixed} />
            <Switch label="Launch Automatically in Game Mode" isSelected={auto} onChange={setAuto} />
            <Switch label="Disabled (not writable)" isSelected isDisabled onChange={() => {}} />
          </div>
        }
      />
      <p className="gm-note">Disabled is dimmed in Grille. Today's disabled switch has no style.</p>
    </Frame>
  )
}

// 2. Slider ---------------------------------------------------------------------------------------------

function SliderFrame() {
  const todayRef = useRef<HTMLInputElement>(null)
  // Today's fill is painted by bindSliderFill, so the mock calls it too.
  useEffect(() => { bindSliderFill(todayRef.current) }, [])
  const [v, setV] = useState(40)
  const [log, push] = useLog()
  const [vlog, vpush] = useLog()
  return (
    <Frame
      id="slider"
      title="2. Slider (Grille-0u5.2)"
      grille="Slider fullWidth with onChange for the live value and onChangeEnd once per gesture."
      today="TuningSliderGroup.js: native range input, saves on pointer release, and on keyup for arrow keys (key repeat must not save per step)."
    >
      <Pair
        today={
          <>
            <div className="field">
              <div className="slider-field-header">
                <label className="field-label" htmlFor="gm-today-slider">Brightness smooth time</label>
                <span className="slider-value" id="gm-today-val">40</span>
              </div>
              <input ref={todayRef} type="range" className="slider-input" id="gm-today-slider" min={0} max={100} defaultValue={40}
                onInput={(e) => { const x = (e.target as HTMLInputElement).value; document.getElementById('gm-today-val')!.textContent = x; vpush(`input ${x} (live)`) }}
                onChange={(e) => vpush(`change ${e.target.value} (save)`)} />
            </div>
            <Log lines={vlog} label="Today's events" />
          </>
        }
        grille={
          <>
            <Slider fullWidth label="Brightness smooth time" value={v} min={0} max={100}
              onChange={(x) => { setV(x); push(`onChange ${x} (live)`) }} onChangeEnd={(x) => push(`onChangeEnd ${x} (save)`)} />
            <Log lines={log} label="Grille events" />
          </>
        }
      />
      <table className="gm-keys">
        <thead><tr><th>Input</th><th>Live value</th><th>Saves</th></tr></thead>
        <tbody>
          <tr><td>Pointer drag</td><td>every move</td><td>once, on release</td></tr>
          <tr><td>Arrow key held</td><td>every step</td><td>once, on key up</td></tr>
          <tr><td>Click on track</td><td>jumps</td><td>once, on release</td></tr>
        </tbody>
      </table>
    </Frame>
  )
}

// 3. Select ---------------------------------------------------------------------------------------------

interface Opt { id: string; label: string }
const REFRESH: Opt[] = [24, 30, 60, 120, 144].map((hz) => ({ id: String(hz), label: `${hz} Hz` }))
const SUBSAMPLE: Opt[] = [{ id: '0', label: 'Auto' }, { id: '640', label: '640px' }, { id: '960', label: '960px' }]

function VanillaDropdown({ label, options, value }: { label: string; options: Opt[]; value: string }) {
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = slot.current!
    el.replaceChildren()
    // @ts-expect-error the JS class infers null defaults for its option bag
    const d = new Dropdown(el, value, () => {}, { labelId: `gm-${label}`, fill: true })
    d.setOptions(options.map((o) => ({ label: o.label, value: o.id, selected: o.id === value })))
    return () => { d.destroy?.(); el.replaceChildren() }
  }, [label, options, value])
  return (
    <div className="field">
      <label className="field-label" id={`gm-${label}`}>{label}</label>
      <div ref={slot} />
    </div>
  )
}

function SelectFrame() {
  const [hz, setHz] = useState('60')
  const [sub, setSub] = useState('0')
  const [log, push] = useLog()
  return (
    <Frame
      id="select"
      title="3. Select (Grille-0u5.3)"
      grille="Select with {id, label} options, fullWidth and isDisabled."
      today="Dropdown.js, 6 uses (DeviceField, EntertainmentConfigSelect, TuningFields, ZoneCanvas). Options are {label, value}. Arrow keys move the cursor without committing."
    >
      <Pair
        today={
          <div className="gm-stack">
            <VanillaDropdown label="Refresh rate" options={REFRESH} value="60" />
            <VanillaDropdown label="Subsample width" options={SUBSAMPLE} value="0" />
          </div>
        }
        grille={
          <div className="gm-stack">
            <Select fullWidth label="Refresh rate" options={REFRESH} value={hz} onChange={(id) => { setHz(id); push(`refreshRate = ${Number(id)}`) }} />
            <Select fullWidth label="Subsample width" options={SUBSAMPLE} value={sub} onChange={(id) => { setSub(id); push(`subsampleWidth = ${Number(id)}`) }} />
            <Select fullWidth isDisabled label="Disabled (not writable)" options={SUBSAMPLE} value="0" onChange={() => {}} />
            <Log lines={log} label="Grille events" />
          </div>
        }
      />
      <p className="gm-note">Today's trigger starts with the raw value ('60', '0') per TuningFields, Grille shows the label. Check the running Dashboard before treating that as a change.</p>
    </Frame>
  )
}

// 4. Disclosure -----------------------------------------------------------------------------------------

function VanillaAccordion() {
  const host = useRef<HTMLDivElement>(null)
  const bridge = useRef<AccordionSection | null>(null)
  useEffect(() => {
    const el = host.current!
    el.replaceChildren()
    const slot = document.createElement('div')
    el.append(slot)
    const s = new AccordionSection(slot, { title: 'Bridge', expanded: false })
    s.content.innerHTML = '<span class="status-text">Zone list, pairing, entertainment config.</span>'
    bridge.current = s
    return () => { el.replaceChildren() }
  }, [])
  return (
    <>
      <button type="button" className="gm-link" onClick={() => bridge.current?.expand()}>See all zones</button>
      <div ref={host} />
    </>
  )
}

function DisclosureFrame() {
  const [open, setOpen] = useState(false)
  return (
    <Frame
      id="disclosure"
      title="4. Disclosure (Grille-0u5.4)"
      grille='Disclosure variant="accordion", driven by isExpanded and onExpandedChange.'
      today="AccordionSection.js: expand() and collapse() commanded by DashboardScreen. Collapsed content stays mounted (hidden attribute)."
    >
      <Pair
        today={<VanillaAccordion />}
        grille={
          <>
            <button type="button" className="gm-link" onClick={() => setOpen(true)}>See all zones</button>
            <div>
              <Disclosure variant="accordion" title="Bridge" isExpanded={open} onExpandedChange={setOpen}>
                <span className="status-text">Zone list, pairing, entertainment config.</span>
              </Disclosure>
            </div>
            <p className="gm-note">State: {open ? 'expanded' : 'collapsed'}</p>
          </>
        }
      />
    </Frame>
  )
}

// 5. Power icon and back arrow --------------------------------------------------------------------------

function IconFrame() {
  return (
    <Frame
      id="icons"
      title="5. Power icon (Grille-0u5.5), and back arrow"
      grille="powerIcon (OpenMoji 23FB). arrowLeft is the same Vidstack path as web/ui's back-arrow.svg."
      today="topBar.js: btn btn-secondary btn-icon with a 16px img. Stop is DashboardScreen's btn btn-icon top-bar-power-btn, one step lighter (--aurora-button-dark-hover)."
    >
      <Pair
        today={
          <div className="gm-row">
            <button type="button" className="btn btn-icon top-bar-power-btn" aria-label="Stop"><img src={powerUrl} alt="" className="top-bar-trailing-icon" /></button>
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Back"><img src={backArrowUrl} alt="" className="top-bar-trailing-icon" /></button>
          </div>
        }
        grille={
          <div className="gm-row">
            <Button icon aria-label="Stop"><span className="gm-stop"><Icon icon={powerIcon} size="sm" /></span></Button>
            <Button icon aria-label="Back"><Icon icon={arrowLeftIcon} size="sm" /></Button>
          </div>
        }
      />
      <p className="gm-note">Stop is Grille's default Button with a local background of <code>--ui-color-control-bg-hover</code>, today's lighter step. That is a local style, not a Grille request.</p>
    </Frame>
  )
}

export function GapsMock() {
  return (
    <main className="gm-page">
      <h1>Grille components for the Dashboard and NUX</h1>
      <p className="gm-lede">Aurora-4nqt.5. Left is the live web/ui component, right is the real Grille v0.2.2-dev.5 component asked for in Grille-0u5.</p>
      <SwitchFrame />
      <SliderFrame />
      <SelectFrame />
      <DisclosureFrame />
      <IconFrame />
    </main>
  )
}
