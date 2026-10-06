// Aurora-8mk.8: macOS's Screen Recording denial is sticky -- no re-ask like
// the Wayland portal dialog. The user has to open System Settings, flip
// Aurora on, then fully quit (Cmd+Q) and relaunch before the grant takes
// effect (docs/MacSupport.md, "Recovery flow: denial is sticky"). A reload
// failure caused by that needs this distinct, actionable state instead of
// the generic "couldn't apply it live: <message>" every other reload
// failure gets.
//
// app/mac's PipelineHost::reload() prefixes the message with a stable
// "permission_denied: "/"permission_pending: " token for exactly this case
// (ScreenCaptureKitGrabber's PermissionError) -- deliberately not a separate
// JSON field, since the reload-error contract (core/Runtime/
// SettingsRoutes.hpp's onConfigChanged) is shared with linux/windows, which
// have nothing analogous to put there.
const PREFIXES = {
  'permission_denied: ': 'denied',
  'permission_pending: ': 'pending',
};

export function parseMacPermissionError(message) {
  if (!message) return null;
  for (const [prefix, kind] of Object.entries(PREFIXES)) {
    if (message.startsWith(prefix)) {
      return { kind, detail: message.slice(prefix.length) };
    }
  }
  return null;
}

// Ventura/Sonoma-era deep link straight to the Screen Recording pane,
// documented as still working through Tahoe's rename to "Screen & System
// Audio Recording" -- see docs/MacSupport.md's "Recovery flow" section.
// Browsers may show their own "open System Settings?" confirmation for a
// custom URL scheme like this; that's expected, not a bug here.
const SCREEN_RECORDING_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

// Renders either the plain generic error line every other reload failure
// gets, or -- only when running on Mac and the message carries one of the
// prefixes above -- a distinct block with the actual fix (System Settings
// link, quit+relaunch instructions) instead of a raw exception sentence.
// `platform` comes from GET /api/capabilities.
// `retryId` (the shell banner, Aurora-cj11) switches to a Retry-only block: a
// Retry button with that id, no Open Settings link (it never adds Aurora to
// the Screen Recording list; only macOS's own prompt does), and copy that
// says answer the prompt, then Retry. A fresh grant applies to the running
// app via a retry (d3ec Mac check, macOS 27, open-launched), so quit+relaunch
// is only the fallback. Callers with no Retry action leave it unset and keep
// the Settings link and quit+relaunch copy.
export function renderReloadError(message, platform, { retryId } = {}) {
  if (!message) return '';

  const parsed = platform === 'mac' ? parseMacPermissionError(message) : null;
  if (!parsed) {
    return `<p class="status-text status-text-error">⚠ ${escapeHtml(message)}</p>`;
  }

  const heading = parsed.kind === 'denied'
    ? "Screen Recording permission is off"
    : "Waiting on macOS's Screen Recording prompt";
  const deniedCopy = retryId
    ? "Aurora can't capture your screen until this is turned on. Answer the macOS prompt (or turn Aurora on under System Settings → Privacy & Security → Screen Recording), then press Retry. If it still fails, fully quit Aurora (⌘Q) and reopen it."
    : "Aurora can't capture your screen until this is turned on. After enabling it, fully quit Aurora (⌘Q) and reopen it -- macOS won't ask again on its own.";
  const body = parsed.kind === 'denied'
    ? deniedCopy
    : "Answer the Screen Recording prompt macOS just showed (it may be behind another window), then try again.";
  const retryButton = retryId
    ? `<button type="button" class="btn btn-secondary" id="${escapeHtml(retryId)}" style="margin-top: var(--aurora-space-3);">Retry</button>`
    : '';

  const settingsLink = retryId
    ? ''
    : `<a class="btn btn-secondary" style="text-decoration: none; margin-top: var(--aurora-space-3);"
       href="${SCREEN_RECORDING_SETTINGS_URL}">Open Screen Recording settings</a>`;

  return `
    <p class="status-text status-text-error">⚠ ${heading}</p>
    <p class="status-text">${body}</p>
    ${settingsLink}
    ${retryButton}
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Aurora-9z4.4/.7: a live, ongoing signal from GET /api/mac/audio-status,
// not a reload failure -- Core Audio's process-tap permission has no
// explicit denied signal to throw at Pipeline::build() time the way
// ScreenCaptureKitGrabber's PermissionError does (see docs/MacSupport.md's
// audio section), so the backend infers it from a sustained run of silent
// buffers instead. Worded as a heuristic ("doesn't seem to be") rather than
// the sticky, confirmed "permission is off" language renderReloadError uses
// for Screen Recording -- this can't rule out genuine prolonged silence,
// even with the 10s grace window keeping that unlikely in practice.
//
// No verified deep link straight to the "System Audio Recording Only" row
// exists (unlike Screen Recording's Privacy_ScreenCapture anchor) -- this
// links to the general Privacy & Security pane rather than guess one.
const SECURITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security';

export function renderAudioPermissionBanner(permissionLikelyDenied) {
  if (!permissionLikelyDenied) return '';

  return `
    <p class="status-text status-text-error">⚠ Aurora doesn't seem to be capturing real audio</p>
    <p class="status-text">This usually means "System Audio Recording Only" isn't granted yet in Privacy &amp; Security -- a separate permission from Screen Recording. After enabling it, fully quit Aurora (⌘Q) and reopen it.</p>
    <a class="btn btn-secondary" style="text-decoration: none; margin-top: var(--aurora-space-3);"
       href="${SECURITY_SETTINGS_URL}">Open Privacy &amp; Security settings</a>
  `;
}
