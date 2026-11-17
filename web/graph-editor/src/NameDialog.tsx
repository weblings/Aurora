import { useState } from 'react'
import { Button, Dialog, DialogActions, MessageRow, Modal, TextField } from '@weblings/grille'
import { clipName, controlLabelCheck, nameBlocked, type NameMsg, type NameSpec } from './graph/naming'

// The one naming dialog (Aurora-daaa.19, Aurora-e4bi.13): Save as new, Rename effect and section names take a
// NameSpec, and `control` is the Edit control state (Label and Tooltip). The caller mounts it only while open.
export type NameDialogProps =
  | { spec: NameSpec; onConfirm: (name: string) => void; onCancel: () => void; control?: undefined }
  | {
      control: { paramLabel: string; label: string; tooltip: string; others: string[] }
      onSave: (label: string, tooltip: string) => void
      onCancel: () => void
      spec?: undefined
    }

const MSG_ID = 'name-dialog-message'

// The live region stays mounted so a screen reader hears each new message; MessageRow mounts only with text.
function Message({ msg }: { msg: NameMsg }) {
  return <div role="status">{msg ? <MessageRow id={MSG_ID} tone={msg.tone} message={msg.text} /> : null}</div>
}

export function NameDialog(props: NameDialogProps) {
  const control = props.control ?? null
  const spec = props.spec ?? null
  const [name, setName] = useState(spec ? spec.initial : (control?.label ?? ''))
  const [tooltip, setTooltip] = useState(control?.tooltip ?? '')
  const msg = control ? controlLabelCheck(name, control.paramLabel, control.others) : spec ? spec.check(name.trim()) : null
  const blocked = nameBlocked({ allowEmpty: !spec || spec.allowEmpty }, name, msg)
  const describedBy = msg ? MSG_ID : undefined
  const submit = () => {
    if (blocked) return
    if (props.control) props.onSave(name.trim(), tooltip.trim())
    else props.onConfirm(name.trim())
  }
  return (
    <Modal isOpen onOpenChange={(open) => !open && props.onCancel()}>
      <Dialog title={spec ? spec.title : 'Edit control'}>
        <form
          className="editor-dialog-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {control ? (
            <>
              <TextField label="Label" value={name} onChange={setName} autoFocus placeholder={control.paramLabel} aria-describedby={describedBy} />
              <Message msg={msg} />
              <TextField label="Tooltip" value={tooltip} onChange={setTooltip} multiline rows={3} placeholder="None" />
            </>
          ) : spec ? (
            <>
              {/* One field, so no visible label: the title names it. */}
              <TextField
                aria-label={spec.label}
                value={name}
                onChange={(v) => setName(clipName(v, spec.max))}
                autoFocus
                isInvalid={msg?.tone === 'error'}
                aria-describedby={describedBy}
              />
              <Message msg={msg} />
            </>
          ) : null}
          <DialogActions>
            <Button size="action" onPress={props.onCancel}>
              Cancel
            </Button>
            <Button size="action" variant="primary" type="submit" isDisabled={blocked}>
              {spec ? spec.confirm : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Modal>
  )
}
