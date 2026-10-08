// User-facing strings shared by more than one screen. The daemon-unreachable
// wording lives here so every screen says it the same way (Aurora-jm6s).
// Since Aurora-ewyz the constant doubles as the internal unreachable signal:
// shared components yield it, screen-level onError funnels translate it
// into a shell-beat checkNow() and never render it -- the shell takeover
// owns the message (see the shell's failure taxonomy).
export const DAEMON_UNREACHABLE = "Couldn't reach the daemon.";

// Linux's PipewireGrabber prefixes a dismissed portal dialog with this stable
// token; the raw portal reason after it is for logs, not users.
const SCREEN_SHARE_DECLINED = 'screen_share_declined: ';

export function friendlyReloadError(message) {
  return typeof message === 'string' && message.startsWith(SCREEN_SHARE_DECLINED)
    ? 'Screen sharing was declined'
    : message;
}
