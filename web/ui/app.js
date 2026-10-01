// Entry point loaded by index.html. Screens receive the App instance via
// their own constructor (e.g. DashboardScreen(app), ModeDeviceScreen(app,
// { onComplete })) rather than importing a shared singleton -- same
// dependency-injection shape as RockyRoad's own IScreen classes, which
// avoids a circular import between this file and every screen module.
import { App } from './shell.js';
import { DashboardScreen } from './screens/DashboardScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { MacTrayTipScreen } from './screens/MacTrayTipScreen.js';
import { OutputConnectScreen } from './screens/OutputConnectScreen.js';
import { EntertainmentZoneSelectScreen } from './screens/EntertainmentZoneSelectScreen.js';
import { ModeDeviceScreen } from './screens/ModeDeviceScreen.js';
import { ZoneMappingScreen } from './screens/ZoneMappingScreen.js';
import { ensureTooltips } from './Tooltips.js';

const app = new App();

// DEBUG -- press H to download the current screen's rendered HTML+CSS as one
// standalone file, for Figma reference (same idea as RockyRoad's own
// App.ts debug dump). Adapted, not copied verbatim: RockyRoad's CSS is one
// inline <style> block already in the DOM, so a synchronous
// querySelectorAll('style') was enough; index.html links seven separate
// stylesheets instead, so those need fetching (same-origin, no CORS issue)
// and inlining before the file is self-contained. Remove before shipping.
document.addEventListener('keydown', async (e) => {
  if (e.code !== 'KeyH' || e.repeat) return;
  const hrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href);
  const cssTexts = await Promise.all(hrefs.map((href) => fetch(href).then((r) => r.text())));
  const styles = cssTexts.map((css) => `<style>${css}</style>`).join('\n');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head>` +
    `<body><!-- DEBUG EXPORT: screen-container innerHTML -->${app.screenContainer.innerHTML}</body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = 'screen-debug.html';
  a.click();
});

// Localhost probes should answer in ms -- a hung daemon (e.g. a runaway
// runtime loop) must surface as "Could not reach the daemon" with Retry,
// never a blank page awaiting a response that never comes.
async function fetchJson(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await (await fetch(url, { signal: controller.signal })).json();
  } finally {
    clearTimeout(timer);
  }
}

function toDashboard() {
  // Idempotent -- fired from both "onboarding just finished" and "already
  // done, fast-pathed straight here" call sites, so it's fine if this is
  // already true. Fire-and-forget: nothing here needs to block navigation,
  // but a failure is logged rather than silently swallowed -- this exact
  // silent-failure shape already cost one debugging cycle.
  fetch('/api/config', { method: 'PUT', body: JSON.stringify({ nuxCompleted: true }) })
    .then((r) => r.json())
    .then((result) => { if (!result.succeeded) console.error('Failed to persist nuxCompleted:', result); })
    .catch((e) => console.error('Failed to persist nuxCompleted:', e));
  app.navigate(new DashboardScreen(app));
}

function renderUnreachable() {
  app.navigate({
    mount(container) {
      container.innerHTML = `
        <div class="top-bar-slot"></div>
        <p class="status-text status-text-error">⚠ Could not reach the daemon.</p>
        <button type="button" class="btn btn-primary" id="boot-retry">Retry</button>
      `;
      container.querySelector('#boot-retry').addEventListener('click', bootstrap);
    },
    unmount() {},
  });
}

// Per-output onboarding: `probe()` says which of the output's own steps are
// still missing, `stages` navigates them. Everything after (Mode+Device, Zone
// Mapping, Dashboard) is shared. A new output adds one entry here.
//   probe()  -> { needsConnect, needsSelect }
//   stages.connect({ platform, next }) -- `next(previousStep)` continues the flow
//   stages.select({ previousStep, next }) -- `next(thisStep)` continues the flow
const OUTPUTS = {
  hue: {
    async probe() {
      let configured = false;
      let entertainmentConfigurationId = '';
      try {
        const connection = await fetchJson('/api/hue/connection');
        configured = connection.configured === true;
        entertainmentConfigurationId = connection.entertainmentConfigurationId ?? '';
      } catch {
        // Unreachable connection endpoint reads as not paired.
      }
      return {
        needsConnect: !configured,
        needsSelect: configured && !entertainmentConfigurationId,
      };
    },
    stages: {
      connect({ platform, next }) {
        // Welcome only ever appears here -- the one branch where nothing is
        // configured yet -- never from Dashboard's "Change bridge" or any other
        // OutputConnectScreen re-entry, which construct it directly with no
        // discoveryPromise and keep behaving exactly as before.
        //
        // Mac only: a menu-bar tip screen sits between Welcome and Output
        // Connect. It just carries the discovery promise through (discovery
        // keeps running while the tip is read); Back from Output Connect
        // returns to it, reusing the same already-started promise.
        const isMac = platform === 'mac';
        const showWelcome = () => app.navigate(new WelcomeScreen(app, {
          onComplete: (discoveryPromise) => (isMac ? showMacTip(discoveryPromise) : showOutputConnect(discoveryPromise, showWelcome)),
        }));
        const showMacTip = (discoveryPromise) => app.navigate(new MacTrayTipScreen(app, {
          discoveryPromise,
          onBack: showWelcome,
          onComplete: () => showOutputConnect(discoveryPromise, () => showMacTip(discoveryPromise)),
        }));
        const showOutputConnect = (discoveryPromise, previousStep) => app.navigate(new OutputConnectScreen(app, {
          showBack: true,
          onBack: previousStep,
          discoveryPromise,
          onComplete: () => next(() => showOutputConnect(undefined, previousStep)),
        }));
        showWelcome();
      },
      select({ previousStep, next }) {
        const thisStep = () => app.navigate(new EntertainmentZoneSelectScreen(app, {
          showBack: previousStep !== null,
          onBack: previousStep ?? undefined,
          onComplete: () => next(thisStep),
        }));
        thisStep();
      },
    },
  },
};

// What the Navigation model (docs/WebUI/WebUI_Design_1stPass.md) calls "any
// missing/invalid" vs. "all valid" -- evaluated fresh every time a stage
// transition needs it, since an earlier onboarding step (e.g. Mode+Device)
// can change what a later one (Zone Mapping) needs. Deliberately re-fetches
// capabilities/connection/config every call rather than threading partial
// state through the chain -- onboarding is rare and this is a handful of
// small requests, and staleness bugs from a half-updated cache are a worse
// trade than a few redundant fetches (same call already made in
// DashboardScreen's own _loadStatus after a mutation).
async function probeState() {
  const capabilities = await fetchJson('/api/capabilities'); // lets a real failure here propagate to bootstrap's own try/catch
  const inputs = capabilities.inputs ?? [];
  const audioInputs = capabilities.audioInputs ?? [];

  // First output the daemon offers that the table knows how to onboard; none
  // means no output stages at all.
  const outputName = (capabilities.outputs ?? []).find((name) => Object.hasOwn(OUTPUTS, name));
  const output = outputName === undefined ? null : OUTPUTS[outputName];
  const outputState = output ? await output.probe() : { needsConnect: false, needsSelect: false };

  let config = {};
  try {
    config = await fetchJson('/api/config');
  } catch {
    // No config yet -- falls through as an invalid video config below, same as a genuinely unset one.
  }
  const mode = (!config.activeInputName && config.activeAudioInputName) ? 'audio' : 'video';
  const modeConfigValid = mode === 'video'
    ? inputs.includes(config.activeInputName)
    : audioInputs.includes(config.activeAudioInputName);

  // Zones only need onboarding when no live zone has ever actually been
  // written (everConfigured) -- unlike the old `active` check, this stays a
  // true "never touched" signal now that active's own default is true (see
  // decision 1, core/Runtime/include/Aurora/Runtime/ZoneMap.hpp). Orchestrator::init()
  // reconciles a sane ZoneMap automatically on every boot regardless (see
  // core/Runtime/src/ZoneReconciler.cpp), so this can't rely on shape/count.
  let needsZoneMapping = false;
  if (modeConfigValid && mode === 'video') {
    try {
      const zonesResult = await fetchJson('/api/zones');
      needsZoneMapping = Boolean(zonesResult.outputName)
        && zonesResult.zones.length > 0
        && !zonesResult.zones.some((z) => z.everConfigured);
    } catch {
      // Couldn't reach zones -- leave needsZoneMapping false rather than force a screen likely to fail the same way.
    }
  }

  return {
    platform: capabilities.platform,
    output,
    needsOutputConnect: outputState.needsConnect,
    needsOutputSelect: outputState.needsSelect,
    needsModeDevice: !modeConfigValid,
    needsZoneMapping,
  };
}

// Walks whichever onboarding steps are actually still needed, in the doc's
// fixed order (output connect -> output select -> Mode+Device -> Zone
// Mapping -> Dashboard; the first two come from the active output's table
// entry) -- no forced Tuning step at the end anymore,
// unlike Pass 1 (there's no "already tuned" signal to skip it on, so
// forcing it every time it was reachable was the actual bug).
// `previousStep`, when set, is a zero-arg function that re-navigates to the
// step shown right before this one -- Back re-mounts it fresh rather than
// replaying "done," which is safe here since every screen already reloads
// its own state on mount().
async function goToOutputSelectStage(previousStep) {
  let state;
  try {
    state = await probeState();
  } catch {
    renderUnreachable();
    return;
  }

  if (!state.needsOutputSelect) {
    await goToModeDeviceStage(previousStep);
    return;
  }

  state.output.stages.select({ previousStep, next: goToModeDeviceStage });
}

async function goToModeDeviceStage(previousStep) {
  let state;
  try {
    state = await probeState();
  } catch {
    renderUnreachable();
    return;
  }

  if (!state.needsModeDevice) {
    await goToZoneMappingStage(previousStep);
    return;
  }

  const thisStep = () => app.navigate(new ModeDeviceScreen(app, {
    showBack: previousStep !== null,
    onBack: previousStep ?? undefined,
    onComplete: () => goToZoneMappingStage(thisStep),
  }));
  thisStep();
}

async function goToZoneMappingStage(previousStep) {
  let state;
  try {
    state = await probeState();
  } catch {
    renderUnreachable();
    return;
  }

  if (!state.needsZoneMapping) {
    toDashboard();
    return;
  }

  app.navigate(new ZoneMappingScreen(app, {
    showBack: previousStep !== null,
    onBack: previousStep ?? undefined,
    onComplete: toDashboard,
    onboarding: true,
  }));
}

async function bootstrap() {
  // Tooltip descriptors load in parallel with everything below -- never
  // awaited, never gating any screen; controls apply whatever has arrived
  // at render time and pick up the rest on the next render.
  ensureTooltips();
  // Once onboarding has ever reached the Dashboard, skip re-deriving
  // "what's still missing" from several live signals (bridge pairing,
  // entertainment config, mode/device, zone mapping) on every single boot --
  // the Dashboard itself already has a real fix-it path for each of those
  // (Bridge row's "Change bridge", live mode/device controls, zone
  // toggles), so a later gap in any one of them doesn't strand anyone.
  // See docs/WebUI/WebUI_Fixes.md's Pass 2 section.
  try {
    const config = await fetchJson('/api/config');
    if (config.nuxCompleted) {
      toDashboard();
      return;
    }
  } catch {
    // No config yet (fresh install) -- falls through to the normal probe below.
  }

  let state;
  try {
    state = await probeState();
  } catch {
    renderUnreachable();
    return;
  }

  if (!state.needsOutputConnect && !state.needsOutputSelect && !state.needsModeDevice && !state.needsZoneMapping) {
    toDashboard();
    return;
  }

  if (state.needsOutputConnect) {
    state.output.stages.connect({ platform: state.platform, next: goToOutputSelectStage });
    return;
  }

  await goToOutputSelectStage(null);
}

bootstrap();
