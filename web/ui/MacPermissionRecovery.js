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
// `retryId` (the shell banner, Aurora-cj11) switches to the one-line
// Retry-only row below. A fresh grant applies to the running app via a retry
// (d3ec Mac check, macOS 27, open-launched). Callers with no Retry action
// leave it unset and keep the Settings link and quit+relaunch copy.
export function renderReloadError(message, platform, { retryId } = {}) {
  if (!message) return '';

  const parsed = platform === 'mac' ? parseMacPermissionError(message) : null;
  if (!parsed) {
    return `<p class="status-text status-text-error">⚠ ${escapeHtml(message)}</p>`;
  }

  const retryButton = retryId
    ? `<button type="button" class="btn btn-secondary" id="${escapeHtml(retryId)}" style="margin-top: var(--aurora-space-3);">Retry</button>`
    : '';

  // Banner row (Aurora-cj11): one line. Pending: the macOS prompt is the fix
  // (the Settings link never adds Aurora to the Screen Recording list, only
  // the prompt does), so Retry only. Denied (Aurora-98pr): the daemon cannot
  // tell "never asked" from "Don't Allow" -- both are an answer with zero
  // displays -- so one row covers both: Retry first (it raises the prompt
  // when macOS has not recorded a decision), the Settings link second (the
  // only way forward after a Don't Allow, since macOS never prompts again).
  if (retryId) {
    if (parsed.kind === 'pending') {
      return `
    <p class="status-text status-text-error">⚠ <strong>Screen Recording is off.</strong> Allow it in the macOS prompt or System Settings, then Retry.</p>
    ${retryButton}
  `;
    }
    return `
    <p class="status-text status-text-error">⚠ <strong>Screen Recording is off.</strong> Allow it in the macOS prompt if one appears, or turn it on in System Settings, then Retry.</p>
    <div class="shell-banner-actions">
      ${retryButton}
      <a class="btn btn-secondary" style="text-decoration: none;" href="${SCREEN_RECORDING_SETTINGS_URL}">Open Settings</a>
    </div>
  `;
  }

  const heading = parsed.kind === 'denied'
    ? "Screen Recording permission is off"
    : "Waiting on macOS's Screen Recording prompt";
  const body = parsed.kind === 'denied'
    ? "Aurora can't capture your screen until this is turned on. After enabling it, fully quit Aurora (⌘Q) and reopen it -- macOS won't ask again on its own."
    : "Answer the Screen Recording prompt macOS just showed (it may be behind another window), then try again.";

  return `
    <p class="status-text status-text-error">⚠ ${heading}</p>
    <p class="status-text">${body}</p>
    <a class="btn btn-secondary" style="text-decoration: none; margin-top: var(--aurora-space-3);"
       href="${SCREEN_RECORDING_SETTINGS_URL}">Open Screen Recording settings</a>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Aurora-9z4.4/.7, Aurora-h457: a live, ongoing signal, not a reload failure
// -- Core Audio's process-tap permission has no explicit denied signal to
// throw at Pipeline::build() time the way ScreenCaptureKitGrabber's
// PermissionError does (see docs/MacSupport.md's audio section), so the
// backend infers it from a sustained run of silent buffers instead. The Mac
// main loop publishes it as the host's "audio_permission" error entry on the
// flag's transitions and removes it when the flag clears; the shell banner
// renders this block for that source. Worded as a heuristic ("doesn't seem
// to be") rather than the sticky, confirmed "permission is off" language
// renderReloadError uses for Screen Recording -- this can't rule out genuine
// prolonged silence, even with the 10s grace window keeping that unlikely in
// practice.
//
// Aurora-tjoq: a System Audio Recording grant applies live (verified on
// macOS 27, open-launched ad-hoc app: the flag flipped false in the same
// process once audio played), but a grabber created BEFORE the grant never
// hears audio afterwards (Aurora-h457 live check: fresh grabber after the
// grant cleared, the running one stayed silent with audio playing). So the
// row carries Retry: /api/reload rebuilds the grabber, which clears the row
// if the grant took and restarts the 10s grace window if not.
//
// Privacy_AudioCapture opens the "Screen & System Audio Recording" pane
// (checked on macOS 27, Aurora-h457), the pane holding the "System Audio
// Recording Only" list; no anchor reaches that list's row itself.
const SECURITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture';

export function renderAudioPermissionBanner({ retryId } = {}) {
  return `
    <p class="status-text status-text-error">⚠ <strong>Aurora can't hear your audio.</strong> Allow "System Audio Recording Only" in Settings, then Retry.</p>
    <div class="shell-banner-actions">
      <button type="button" class="btn btn-secondary" id="${escapeHtml(retryId ?? 'audio-permission-retry')}">Retry</button>
      <a class="btn btn-secondary" style="text-decoration: none;" href="${SECURITY_SETTINGS_URL}">Open Settings</a>
    </div>
  `;
}
