import { Button, Icon, arrowLeftIcon } from '@weblings_things/grille'

export type NavFooterProps = {
  showBack?: boolean
  onBack?: () => void
  backLabel?: string
  backIcon?: boolean
  continueLabel?: string
  continueDisabled?: boolean
  onContinue?: () => void
}

// Onboarding footer: Back (optional) and Continue, centered as a pair. Same options as
// web/ui/NavFooter.js's renderNavFooter, which mounts this island when the bundle is loaded.
export function NavFooter({
  showBack = true,
  onBack,
  backLabel = 'Back',
  backIcon = true,
  continueLabel = 'Continue',
  continueDisabled = false,
  onContinue,
}: NavFooterProps) {
  return (
    <div className="nav-footer">
      {showBack && (
        <Button size="action" onPress={onBack}>
          {backIcon && <Icon icon={arrowLeftIcon} size="sm" />}
          {backLabel}
        </Button>
      )}
      <Button size="action" variant="primary" isDisabled={continueDisabled} onPress={onContinue}>
        {continueLabel}
      </Button>
    </div>
  )
}
