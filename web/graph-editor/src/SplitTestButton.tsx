import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Dialog, Icon, Menu, MenuItem, chevronDownIcon, playIcon, stopIcon } from '@weblings/grille'
import { Hint } from './Hint'
import { EditorPopup } from './EditorPopup'
import type { TestMode } from './graph/lightTest'

// Icon form (Aurora-u8jx.9.1): Test drops its label when the measured title would be under TITLE_MIN px.
// Returning needs TITLE_MIN after giving the label back, so it cannot flip-flop (docs/log/2026-11-15-u8jx91-narrow-top-bar.md).
const TITLE_MIN = 100
function useIconForm(group: HTMLElement | null): boolean {
  const [icon, setIcon] = useState(false)
  useLayoutEffect(() => {
    const bar = group?.closest<HTMLElement>('.editor-header')
    const title = bar?.querySelector<HTMLElement>('.editor-title-menu')
    const main = group?.querySelector<HTMLElement>('.editor-split-main')
    if (!group || !bar || !title || !main) return
    let now = group.hasAttribute('data-icon-form')
    let labelW = 0
    let iconW = 0
    const decide = () => {
      const spare = bar.querySelector<HTMLElement>('.editor-bar-end')?.getBoundingClientRect().width ?? 0
      const text = title.querySelector<HTMLElement>('.editor-title-label')
      const cap = parseFloat(getComputedStyle(title).maxWidth)
      const actual = title.getBoundingClientRect().width
      // What the title wants: its width plus what the text is clipped by, up to its own max-width.
      const want = Math.min(actual + (text ? Math.max(0, text.scrollWidth - text.clientWidth) : 0), Number.isFinite(cap) ? cap : Infinity)
      const need = Math.min(TITLE_MIN, want)
      const w = main.getBoundingClientRect().width
      if (now) iconW = w
      else labelW = w
      const give = labelW > iconW && iconW > 0 ? labelW - iconW : 52
      const stay = now ? Math.min(want, actual + spare - give) < need : actual < need
      if (stay !== now) {
        now = stay
        setIcon(stay)
      }
    }
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(decide)
    })
    ro.observe(bar)
    ro.observe(title)
    decide()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [group])
  return icon
}

// The one Test control (Aurora-qjqy.3): [▷ Test ⌄]. The label is the state: Test
// at rest, Stop (with the Once countdown) while a test runs, Take over or
// Reconnect when those are the next move. The menu picks Once or Live and starts
// that test; the last pick is what the main part runs. No status text.
export function SplitTestButton({
  mode,
  running,
  stopText,
  stopName,
  action,
  disabledReason,
  takeOverHint,
  busy,
  onStart,
  onStop,
  onReconnect,
}: {
  mode: TestMode
  running: boolean
  stopText: string
  // Stop's name in the icon form, with the time left (stopName in graph/status.ts).
  stopName: string
  action: 'reconnect' | 'take-over' | null
  // Why the button cannot be used (Problems, Cannot reach Aurora), else null.
  disabledReason: string | null
  // Who holds the lights, as the Take over button's tooltip (lightsInUse in graph/status.ts), else null.
  takeOverHint: string | null
  // A start, stop or write is in flight.
  busy: boolean
  onStart: (mode: TestMode) => void
  onStop: () => void
  onReconnect: () => void
}) {
  const [open, setOpen] = useState(false)
  const group = useRef<HTMLSpanElement>(null)
  const [groupEl, setGroupEl] = useState<HTMLSpanElement | null>(null)
  const iconForm = useIconForm(groupEl)
  const groupRef = useCallback((el: HTMLSpanElement | null) => {
    group.current = el
    setGroupEl(el)
  }, [])
  const close = () => setOpen(false)
  const off = disabledReason !== null
  const main = (() => {
    if (running) return { label: stopText, icon: stopIcon, onPress: onStop, off: busy, title: 'Stop and put the lights back', name: iconForm ? stopName : 'Stop the test' }
    if (action === 'reconnect') return { label: 'Reconnect', icon: playIcon, extra: true, onPress: onReconnect, off: false, title: 'Another view of this session took over the preview', name: 'Reconnect' }
    const takeOver = action === 'take-over'
    const label = takeOver ? 'Take over' : mode === 'once' ? 'Test (15s)' : 'Test (Live)'
    const title = disabledReason ?? (takeOver ? takeOverHint : null) ?? (mode === 'once' ? 'Show this graph on the real lights for 15 seconds' : 'Show this graph on the real lights until you stop')
    return {
      label,
      icon: playIcon,
      onPress: () => onStart(mode),
      off: off || busy,
      title,
      name: iconForm ? (takeOver ? 'Take over the test' : label) : takeOver ? 'Take over the lights' : 'Test on lights',
    }
  })()
  // Reconnect is not a test: it has no mode menu.
  const menuOff = off || busy || running || action === 'reconnect'
  return (
    <Hint text={disabledReason} placement="bottom">
    <span
      className="editor-split"
      ref={groupRef}
      data-off={off || undefined}
      data-icon-form={iconForm || undefined}
    >
      <Hint text={off ? null : iconForm ? `${main.name}. ${main.title}` : main.title} placement="bottom">
      <button
        type="button"
        className="ui-button editor-split-main"
        onClick={main.onPress}
        disabled={main.off}
        aria-label={main.name}
      >
        {'extra' in main ? <span className="editor-split-icon-extra"><Icon icon={main.icon} size="sm" /></span> : <Icon icon={main.icon} size="sm" />}
        <span className="editor-split-label">{main.label}</span>
      </button>
      </Hint>
      {action === 'reconnect' ? null : (
        <button
          type="button"
          className="ui-button editor-split-caret"
          aria-label="Test mode"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={menuOff}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon icon={chevronDownIcon} size="sm" />
        </button>
      )}
      <EditorPopup isOpen={open} onClose={close} label="Test mode" triggerRef={group} placement="bottom end" className="editor-test-popup">
        <Dialog aria-label="Test mode">
          <Menu
            aria-label="Test mode"
            selectionMode="single"
            selectedKey={mode}
            onClose={close}
            onAction={(id) => {
              close()
              onStart(id === 'live' ? 'live' : 'once')
            }}
          >
            <MenuItem id="once">Once (15 s)</MenuItem>
            <MenuItem id="live">Live (until stopped)</MenuItem>
          </Menu>
        </Dialog>
      </EditorPopup>
    </span>
    </Hint>
  )
}
