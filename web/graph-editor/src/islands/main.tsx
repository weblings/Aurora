import { mountIsland } from '@weblings_things/grille'
import tokensCss from '@weblings_things/grille/tokens.css?url'
import uiCss from '@weblings_things/grille/ui.css?url'
import { ErrorShell, type ErrorShellProps } from '../ErrorShell'
import { NavFooter, type NavFooterProps } from './NavFooter'
import { mountLive, type Live } from './live'
import { SegmentedField, SelectField, SliderField, SwitchField, type SegmentedProps, type SelectFieldProps, type SliderFieldProps, type SwitchFieldProps } from './Controls'
import { PairedDevices, SettingsPanel, type PairedDevicesProps, type SettingsPanelProps } from './Panels'

// Entry for the main page (web/ui) and the demo. Aurora's own tokens.css is already on those
// pages. Vanilla code reads window.auroraIslands, which exists before app.js runs because
// module scripts execute in document order.
export type ErrorShellHandle = Live<ErrorShellProps>
export type AuroraIslands = {
  mountNavFooter: (el: HTMLElement, props: NavFooterProps) => () => void
  mountErrorShell: (el: HTMLElement, props: ErrorShellProps) => ErrorShellHandle
  mountSelect: (el: HTMLElement, props: SelectFieldProps) => Live<SelectFieldProps>
  mountSwitch: (el: HTMLElement, props: SwitchFieldProps) => Live<SwitchFieldProps>
  mountSlider: (el: HTMLElement, props: SliderFieldProps) => Live<SliderFieldProps>
  mountSegmented: (el: HTMLElement, props: SegmentedProps) => Live<SegmentedProps>
  mountSettingsPanel: (el: HTMLElement, props: SettingsPanelProps) => Live<SettingsPanelProps>
  mountPairedDevices: (el: HTMLElement, props: PairedDevicesProps) => Live<PairedDevicesProps>
}

// The entry has no HTML page to link stylesheets, so it adds its own.
for (const href of [tokensCss, uiCss]) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.append(link)
}

const islands: AuroraIslands = {
  mountNavFooter: (el, props) => mountIsland(el, <NavFooter {...props} />),
  // The shell keeps its collapse and pulse state, so it and the controls are mounted once and fed props.
  mountErrorShell: (el, props) => mountLive(el, ErrorShell, props),
  mountSelect: (el, props) => mountLive(el, SelectField, props),
  mountSwitch: (el, props) => mountLive(el, SwitchField, props),
  mountSlider: (el, props) => mountLive(el, SliderField, props),
  mountSegmented: (el, props) => mountLive(el, SegmentedField, props),
  mountSettingsPanel: (el, props) => mountLive(el, SettingsPanel, props),
  mountPairedDevices: (el, props) => mountLive(el, PairedDevices, props),
}

;(window as unknown as { auroraIslands?: AuroraIslands }).auroraIslands = islands
