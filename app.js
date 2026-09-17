// Entry point loaded by index.html. Screens receive the App instance via
// their own constructor (e.g. DashboardScreen(app), ModeDeviceScreen(app,
// { onComplete })) rather than importing a shared singleton -- same
// dependency-injection shape as RockyRoad's own IScreen classes, which
// avoids a circular import between this file and every screen module.
import { App } from './shell.js';
import { DashboardScreen } from './screens/DashboardScreen.js';
import { OutputConnectScreen } from './screens/OutputConnectScreen.js';
import { EntertainmentZoneSelectScreen } from './screens/EntertainmentZoneSelectScreen.js';
import { ModeDeviceScreen } from './screens/ModeDeviceScreen.js';
import { ZoneMappingScreen } from './screens/ZoneMappingScreen.js';

const app = new App();

async function fetchJson(url) {
  return (await fetch(url)).json();
}

function toDashboard() {
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

// What the Navigation model (Analysis/WebUI/WebUI_Design_1stPass.md) calls "any
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
  const hasHue = capabilities.outputs?.includes('hue') ?? false;
  const inputs = capabilities.inputs ?? [];
  const audioInputs = capabilities.audioInputs ?? [];

  let connectionConfigured = true;
  let entertainmentConfigurationId = '';
  if (hasHue) {
    try {
      const connection = await fetchJson('/api/hue/connection');
      connectionConfigured = connection.configured === true;
      entertainmentConfigurationId = connection.entertainmentConfigurationId ?? '';
    } catch {
      connectionConfigured = false;
    }
  }

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
    needsOutputConnect: hasHue && !connectionConfigured,
    needsEntertainmentZoneSelect: hasHue && connectionConfigured && !entertainmentConfigurationId,
    needsModeDevice: !modeConfigValid,
    needsZoneMapping,
  };
}

// Walks whichever onboarding steps are actually still needed, in the doc's
// fixed order (Output Connect -> Entertainment zone select -> Mode+Device ->
// Zone Mapping -> Dashboard) -- no forced Tuning step at the end anymore,
// unlike Pass 1 (there's no "already tuned" signal to skip it on, so
// forcing it every time it was reachable was the actual bug).
// `previousStep`, when set, is a zero-arg function that re-navigates to the
// step shown right before this one -- Back re-mounts it fresh rather than
// replaying "done," which is safe here since every screen already reloads
// its own state on mount().
async function goToEntertainmentZoneSelectStage(previousStep) {
  let state;
  try {
    state = await probeState();
  } catch {
    renderUnreachable();
    return;
  }

  if (!state.needsEntertainmentZoneSelect) {
    await goToModeDeviceStage(previousStep);
    return;
  }

  const thisStep = () => app.navigate(new EntertainmentZoneSelectScreen(app, {
    showBack: previousStep !== null,
    onBack: previousStep ?? undefined,
    onComplete: () => goToModeDeviceStage(thisStep),
  }));
  thisStep();
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
  let state;
  try {
    state = await probeState();
  } catch {
    renderUnreachable();
    return;
  }

  if (!state.needsOutputConnect && !state.needsEntertainmentZoneSelect && !state.needsModeDevice && !state.needsZoneMapping) {
    toDashboard();
    return;
  }

  if (state.needsOutputConnect) {
    const thisStep = () => app.navigate(new OutputConnectScreen(app, {
      showBack: false,
      onComplete: () => goToEntertainmentZoneSelectStage(thisStep),
    }));
    thisStep();
    return;
  }

  await goToEntertainmentZoneSelectStage(null);
}

bootstrap();
