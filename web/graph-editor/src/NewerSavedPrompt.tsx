import { Button, Dialog, DialogActions, Modal } from '@weblings_things/grille'

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
  return (
    <Modal isOpen onOpenChange={(open) => !open && onKeepEdits()}>
      <Dialog title={`${effectTitle} has a newer saved version`}>
        <p className="editor-note" data-testid="newer-saved-prompt">
          Your unsaved edits are out of date.
        </p>
        <DialogActions>
          <Button size="action" onPress={onLoadSaved}>
            Load saved
          </Button>
          <Button size="action" variant="primary" autoFocus onPress={onKeepEdits}>
            Keep my edits
          </Button>
        </DialogActions>
      </Dialog>
    </Modal>
  )
}
