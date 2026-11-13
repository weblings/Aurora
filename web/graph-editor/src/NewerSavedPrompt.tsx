import { Button, Dialog, Modal } from '@weblings/grille'

// Shown when an effect opens whose kept copy was made from an older saved
// version (an MCP apply, a Save in another tab): nothing loads until the
// person picks (Aurora-u68h.2). Keep my edits is the safe answer, so it has the
// default focus and Escape and a scrim click give it.
export function NewerSavedPrompt({
  effectTitle,
  onLoadSaved,
  onKeepEdits,
}: {
  effectTitle: string
  onLoadSaved: () => void
  onKeepEdits: () => void
}) {
  const title = `${effectTitle} has a newer saved version`
  return (
    <Modal isOpen onOpenChange={(open) => !open && onKeepEdits()}>
      <Dialog aria-label={title}>
        <div className="editor-name-dialog" data-testid="newer-saved-prompt">
          <h3 className="editor-name-dialog-title">{title}</h3>
          <p className="editor-name-note">Your unsaved edits are out of date.</p>
          <div className="editor-name-dialog-actions">
            <Button onPress={onLoadSaved}>Load saved</Button>
            <Button variant="primary" autoFocus onPress={onKeepEdits}>
              Keep my edits
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}
