import { useRef, useState } from 'react'
import { Dialog, Icon, Menu, MenuItem, chevronDownIcon, playIcon, stopIcon } from '@weblings/grille'
import { Hint } from './Hint'
import { EditorPopup } from './EditorPopup'
import type { TestMode } from './graph/lightTest'

// The one Test control (Aurora-qjqy.3): [▷ Test ⌄]. The label is the state: Test
// at rest, Stop (with the Once countdown) while a test runs, Take over or
// Reconnect when those are the next move. The menu picks Once or Live and starts
// that test; the last pick is what the main part runs. No status text.
export function SplitTestButton({
  mode,
  running,
  stopText,
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
  const close = () => setOpen(false)
  const off = disabledReason !== null
  const main = (() => {
    if (running) return { label: stopText, icon: stopIcon, onPress: onStop, off: busy, title: 'Stop and put the lights back', name: 'Stop the test' }
    if (action === 'reconnect') return { label: 'Reconnect', icon: null, onPress: onReconnect, off: false, title: 'Another view of this session took over the preview', name: 'Reconnect' }
    const takeOver = action === 'take-over'
    return {
      label: takeOver ? 'Take over' : mode === 'once' ? 'Test (15s)' : 'Test (Live)',
      icon: playIcon,
      onPress: () => onStart(mode),
      off: off || busy,
      title: disabledReason ?? (takeOver ? takeOverHint : null) ?? (mode === 'once' ? 'Show this graph on the real lights for 15 seconds' : 'Show this graph on the real lights until you stop'),
      name: takeOver ? 'Take over the lights' : 'Test on lights',
    }
  })()
  // Reconnect is not a test: it has no mode menu.
  const menuOff = off || busy || running || action === 'reconnect'
  return (
    <Hint text={disabledReason} placement="bottom">
    <span className="editor-split" ref={group} data-off={off || undefined}>
      <Hint text={off ? null : main.title} placement="bottom">
      <button
        type="button"
        className="ui-button editor-split-main"
        onClick={main.onPress}
        disabled={main.off}
        aria-label={main.name}
      >
        {main.icon ? <Icon icon={main.icon} size="sm" /> : null}
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
