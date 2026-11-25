import { Button, Switch } from '@weblings_things/grille'

// Dashboard accordion contents (Aurora-4nqt.7). web/ui's SettingsPanel and PairedDevices keep
// their fetching and state, and push what to draw.

export type SettingsPanelProps = {
  gameMode: { isSelected: boolean; onChange: (isSelected: boolean) => void; error: boolean }
}

export function SettingsPanel({ gameMode }: SettingsPanelProps) {
  return (
    <>
      <div className="settings-game-mode">
        <Switch label="Launch Automatically in Game Mode" isSelected={gameMode.isSelected} onChange={gameMode.onChange} />
      </div>
      <p className="status-text settings-hint">Takes effect the next time Game Mode starts.</p>
      {gameMode.error && <p className="status-text settings-error">Could not save this setting.</p>}
    </>
  )
}

export type PairedDevicesProps = {
  // null until the first load answers
  devices: { id: string; name: string; meta: string }[] | null
  busyId: string | null
  error: string | null
  onRevoke: (id: string) => void
}

export function PairedDevices({ devices, busyId, error, onRevoke }: PairedDevicesProps) {
  if (devices === null) return <p className="status-text">Loading…</p>
  return (
    <>
      <p className="status-text">The computer running Aurora never needs pairing. Other approved devices are listed below.</p>
      {devices.length === 0 ? (
        <p className="status-text">No other devices are paired.</p>
      ) : (
        <ul className="paired-device-list">
          {devices.map((d) => (
            <li key={d.id} className="paired-device-row">
              <div className="paired-device-text">
                <p className="paired-device-name">{d.name}</p>
                <p className="paired-device-meta">{d.meta}</p>
              </div>
              <Button isDisabled={busyId === d.id} onPress={() => onRevoke(d.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="status-text status-text-error">
          <span className="warn-glyph" aria-hidden="true"></span> {error}
        </p>
      )}
    </>
  )
}
