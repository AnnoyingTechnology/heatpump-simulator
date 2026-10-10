import { createDrawer, createHeader, createOverlay, createRibbon } from './chrome';
import { html } from './dom';
import { fixtureFor } from './fixtures';
import { createInspector } from './inspector';
import { createPopovers } from './popovers';
import { createScene } from './scene';
import type { SceneHooks } from './scene';
import { createLinesSettings, createOutdoorSettings, createOutdoorUnitCard, createRoomSettings } from './settings';
import { advanceLedger, store } from './state';
import type { Clock } from './state';
import { engineConfigFromUi } from './runtime/config';
import { simulation } from './runtime/view';
import type { ZoomPreset } from './types';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

// Selection and popovers. Both reference each other lazily: callbacks run only after construction.
const select = (id: string | null): void => store.update((s) => { s.ui.selected = id; });
const openOutdoor = (reveal?: string): void => pops.open('outdoor', 0, () => unitCard.root, reveal);

const unitCard = createOutdoorUnitCard(() => pops.toggle('outdoor', 0, () => unitCard.root));
const hooks: SceneHooks = {
  toggleRoom: (i, anchor) => { select(`indoor:${i}`); pops.toggle('room', i, () => anchor); },
  toggleLines: (i, anchor) => { select(`pipe:${i}`); pops.toggle('lines', i, () => anchor); },
};
const scene = createScene(hooks, unitCard);
const ribbon = createRibbon();
const header = createHeader(ribbon);
const overlay = createOverlay((z) => scene.zoomTo(z));
const drawer = createDrawer();
const pops = createPopovers({
  inspector: createInspector(() => openOutdoor()),
  room: createRoomSettings(() => openOutdoor('shared')),
  lines: createLinesSettings(),
  outdoor: createOutdoorSettings(),
}, () => store.state, () => { if (store.state.ui.selected !== null) select(null); });

// Scenes with more than five rooms are taller than the stage: the scene scrolls vertically inside its own region, while the header,
// the notice row, the view presets and the legend stay put. Popovers are positioned against the stage, not the scrolled scene.
const stage = html('main', { class: 'stage' }, html('div', { class: 'scene-scroll' }, scene.root), overlay.root, pops.root);
// Diagnostics, examples and provenance are a disclosure inside the Readings popover; there is no permanent footer row.
ribbon.root.append(drawer.root);
app.append(header.root, html('div', { class: 'workbench' }, stage));

const anchorFor = (id: string, el: Element | null): Element | null =>
  (el?.isConnected ? el : scene.root.querySelector(`[data-id="${id}"]`));

/** Rooms open their settings card, line sets their branch controls, every other component the contextual inspector. */
function selectFromDiagram(id: string | null, el: Element | null): void {
  select(id);
  if (id === null) { pops.close(); return; }
  const [kind, idx] = id.split(':');
  const i = Number(idx ?? 0);
  if (kind === 'indoor') pops.open('room', i, () => scene.roomAnchor(i) ?? anchorFor(id, el));
  else if (kind === 'pipe') pops.open('lines', i, () => anchorFor(id, el));
  else pops.open('inspector', 0, () => anchorFor(id, el));
}

scene.root.addEventListener('click', (e) => {
  const target = e.target as Element;
  if (target.closest('input, button, select, textarea, label, .ou')) return;
  const el = target.closest<SVGElement>('[data-id]');
  selectFromDiagram(el?.dataset.id ?? null, el);
});
scene.root.addEventListener('keydown', (e) => {
  const target = e.target as Element;
  if (target.closest('input, button, select, textarea')) return;
  if (e.key === 'Enter' || e.key === ' ') {
    const el = target.closest<SVGElement>('[data-id]');
    if (!el) return;
    e.preventDefault();
    selectFromDiagram(el.dataset.id ?? null, el);
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
  if (pops.isOpen()) { pops.dismiss(true); return; }
  if (store.state.ui.selected !== null) select(null);
});

let lastZoom: ZoomPreset = 'overview';

function render(): void {
  const s = store.state;
  header.sync(s);
  ribbon.sync(s);
  scene.sync(s);
  overlay.sync(s);
  pops.sync(s);
  drawer.sync(s);
  if (s.ui.zoom !== lastZoom) {
    lastZoom = s.ui.zoom;
    scene.zoomTo(lastZoom);
  }
}

let liveConfigSignature = '';
let liveResetEpoch = -1;
let liveStarted = false;
function synchronizeRuntime(): void {
  const s = store.state;
  if (s.ui.experience !== 'live') return;
  const config = engineConfigFromUi(s.cfg, s.cfg.live);
  const signature = JSON.stringify(config);
  if (!liveStarted || liveResetEpoch !== store.resetEpoch) {
    liveStarted = true;
    liveResetEpoch = store.resetEpoch;
    liveConfigSignature = signature;
    simulation.start(config);
  } else if (signature !== liveConfigSignature) {
    liveConfigSignature = signature;
    simulation.configure(config);
  }
}
store.subscribe(() => { synchronizeRuntime(); render(); });
simulation.subscribe(render);
synchronizeRuntime();
render();
scene.zoomTo('overview', true);

let last = performance.now();
let lastInspector = 0;
let nextPhysicalStepAt = 0;
const liveClock: Clock = { previewTimeS: 0, iceKg: 0, retainedWaterKg: 0, seeded: false, melting: false };
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const s = store.state;
  const sim = dt * s.ui.speed;
  if (s.ui.experience === 'live') {
    // Small fixed work chunks keep parameter changes and pause responsive at every requested speed.
    // A busy worker never builds a backlog; overloaded CPUs run slower in simulated time.
    if (!s.ui.paused && now >= nextPhysicalStepAt) {
      if (simulation.step(.25)) nextPhysicalStepAt = now + 250 / s.ui.speed;
    }
    const output = simulation.status.output;
    if (output) {
      Object.assign(liveClock, { previewTimeS: output.simulatedSeconds, iceKg: output.outdoor.iceKg,
        retainedWaterKg: output.outdoor.liquidKg, melting: !s.ui.paused && output.outdoor.meltPowerW > 0 });
    } else liveClock.melting = false;
    header.setTime(liveClock.previewTimeS);
    scene.tick(s, liveClock);
  } else {
    if (!s.ui.paused) store.clock.previewTimeS += sim;
    advanceLedger(store.clock, fixtureFor(s.cfg.mode, s.cfg.example), sim, s.ui.paused);
    header.setTime(store.clock.previewTimeS);
    scene.tick(s, store.clock);
  }
  overlay.tick();
  if (s.ui.selected === 'coil' && now - lastInspector > 500) {
    lastInspector = now;
    pops.sync(s);
  }
  pops.tick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
