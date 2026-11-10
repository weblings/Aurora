import { useState } from 'react'
import { Button, Dialog, Modal, TextField } from '@weblings/grille'

// Names an effect (Aurora-daaa.19): a modal Dialog over a scrim. Used when a
// write creates a new effect (Save as new, or any save on a built-in) and for
// Rename. Cancel, Escape and a scrim click close it and write nothing.
// The caller mounts it only while open, so the field starts from `initial`.
export function NameDialog({
  title,
  confirm,
  initial,
  onConfirm,
  onCancel,
}: {
  title: string
  confirm: string
  initial: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const empty = name.trim() === ''
  const submit = () => {
    if (!empty) onConfirm(name.trim())
  }
  return (
    <Modal isOpen onOpenChange={(open) => !open && onCancel()}>
      <Dialog aria-label={title}>
        <form
          className="editor-name-dialog"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <h3 className="editor-name-dialog-title">{title}</h3>
          <TextField label="Name" value={name} onChange={setName} />
          {empty ? (
            <p className="editor-name-note" role="status">
              Name the new effect first
            </p>
          ) : null}
          <div className="editor-name-dialog-actions">
            <Button onPress={onCancel}>Cancel</Button>
            <Button variant="primary" type="submit" isDisabled={empty}>
              {confirm}
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  )
}
