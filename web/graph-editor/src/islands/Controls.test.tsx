import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PairedDevices, SettingsPanel } from './Panels'
import { SegmentedField, SelectField, SliderField, SwitchField } from './Controls'

const options = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]

describe('control islands', () => {
  it('Select shows the selected option label and a disabled one', () => {
    const html = renderToStaticMarkup(<SelectField label="Mode" options={options} value="b" onChange={() => {}} isDisabled />)
    expect(html).toContain('Mode')
    expect(html).toContain('Beta')
    expect(html).toMatch(/disabled/)
  })

  it('Switch carries its label and state', () => {
    const html = renderToStaticMarkup(<SwitchField label="Active" isSelected onChange={() => {}} />)
    expect(html).toContain('Active')
    expect(html).toContain('checked')
  })

  it('Slider is inert and dimmed only when disabled', () => {
    const props = { label: 'Floor', value: 0.5, min: 0, max: 1, step: 0.1, onChange: () => {} }
    expect(renderToStaticMarkup(<SliderField {...props} isDisabled />)).toContain('inert')
    expect(renderToStaticMarkup(<SliderField {...props} />)).not.toContain('inert')
  })

  it('Segmented marks the chosen option pressed and primary', () => {
    const html = renderToStaticMarkup(<SegmentedField label="Black handling" options={options} value="a" onChange={() => {}} />)
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Black handling"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/data-variant="primary"/g)).toHaveLength(1)
  })
})

describe('panel islands', () => {
  it('Settings shows the hint, and the error only when set', () => {
    const gameMode = { isSelected: true, onChange: () => {}, error: false }
    const html = renderToStaticMarkup(<SettingsPanel gameMode={gameMode} />)
    expect(html).toContain('Launch Automatically in Game Mode')
    expect(html).toContain('Takes effect the next time Game Mode starts.')
    expect(html).not.toContain('Could not save')
    expect(renderToStaticMarkup(<SettingsPanel gameMode={{ ...gameMode, error: true }} />)).toContain('Could not save this setting.')
  })

  it('Paired devices: loading, empty, rows with a busy Revoke, and an error', () => {
    const none = { busyId: null, error: null, onRevoke: () => {} }
    expect(renderToStaticMarkup(<PairedDevices {...none} devices={null} />)).toContain('Loading')
    expect(renderToStaticMarkup(<PairedDevices {...none} devices={[]} />)).toContain('No other devices are paired.')
    const devices = [{ id: 'a1', name: '<Phone>', meta: 'Paired Nov 1, 2026' }, { id: 'b2', name: 'Tablet', meta: 'Paired Nov 2, 2026' }]
    const html = renderToStaticMarkup(<PairedDevices {...none} devices={devices} busyId="a1" error="Nope" />)
    expect(html).toContain('&lt;Phone&gt;')
    expect(html.match(/Revoke/g)).toHaveLength(2)
    expect(html.match(/data-disabled="true"/g)).toHaveLength(1)
    expect(html).toContain('Nope')
  })
})
