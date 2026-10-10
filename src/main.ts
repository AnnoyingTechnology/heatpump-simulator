import { createDrawer, createHeader, createOverlay, createRibbon } from './chrome';
import { html } from './dom';
import { fixtureFor } from './fixtures';
import { createInspector } from './inspector';
import { createScene } from './scene';
import { createSidebar } from './sidebar';
import { advanceLedger, store } from './state';
import type { Clock } from './state';
import { engineConfigFromUi } from './runtime/config';
import { simulation } from './runtime/view';
import type { ZoomPreset } from './types';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const scene = createScene();
const header = createHeader();
const ribbon = createRibbon();
const sidebar = createSidebar();
const overlay = createOverlay((z) => scene.zoomTo(z));
const drawer = createDrawer();
const inspector = createInspector(
  (t) => sidebar.setTab(t),
  () => undefined,
);

const stage = html('main', { class: 'stage' }, scene.root, overlay.root);
app.append(header.root, ribbon.root, html('div', { class: 'workbench' }, sidebar.root, stage, inspector.root), drawer.root);

scene.root.addEventListener('click', (e) => {
  if ((e.target as Element).closest('input, button, select, textarea')) return;
  const el = (e.target as Element).closest<SVGElement>('[data-id]');
  selectFromDiagram(el?.dataset.id ?? null);
});
scene.root.addEventListener('keydown', (e) => {
  const target = e.target as Element;
  if (target.closest('input, button, select, textarea')) return;
  if (e.key === 'Enter' || e.key === ' ') {
    const el = target.closest<SVGElement>('[data-id]');
    if (!el) return;
    e.preventDefault();
    selectFromDiagram(el.dataset.id ?? null);
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
  store.update((s) => { s.ui.selected = null; });
});

let lastZoom: ZoomPreset = 'overview';

/** Selecting a room (click or keyboard) opens its inputs: switch the sidebar to Rooms in the same update. */
function selectFromDiagram(id: string | null): void {
  store.update((s) => {
    s.ui.selected = id;
    if (id?.startsWith('indoor:')) s.ui.tab = 'rooms';
  });
}

function render(): void {
  const s = store.state;
  header.sync(s);
  ribbon.sync(s);
  sidebar.sync();
  scene.sync(s);
  overlay.sync(s);
  inspector.sync(s);
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
    inspector.sync(s);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
