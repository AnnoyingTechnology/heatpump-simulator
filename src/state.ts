import type { AppState, Config, Experience, ExampleState, Mode, PipeConfig, RoomConfig, UiState } from './types';
import { MAX_UNITS, OWNER_PORTS } from './types';
import type { Fixture } from './fixtures';
import { fixtureFor } from './fixtures';
import { defaultLiveParameters } from './runtime/config';
import { readingsFor, simulation } from './runtime/view';
import type { Readings } from './runtime/view';

/**
 * Owner preset: Daikin 3MXM52N8 + FTXA25 / FTXA35 / FTXA25. Stack order is top → bottom.
 * Branch lengths are the owner's historical blog values (7.5 ground / 6.5 first / 14 attic).
 */
const ROOMS: Omit<RoomConfig, 'cleanlinessOverridePct'>[] = [
  { id: 'attic', name: 'Attic', volumeM3: 45, heatLossWPerK: 60, setpointC: 21, airC: 20, indoorClass: 'FTXA25' },
  { id: 'first', name: 'First floor', volumeM3: 75, heatLossWPerK: 85, setpointC: 21, airC: 20, indoorClass: 'FTXA35' },
  { id: 'ground', name: 'Ground floor', volumeM3: 50, heatLossWPerK: 70, setpointC: 21, airC: 20, indoorClass: 'FTXA25' },
  { id: 'zone4', name: 'Lower level 4', volumeM3: 40, heatLossWPerK: 55, setpointC: 21, airC: 20, indoorClass: 'G25' },
  { id: 'zone5', name: 'Lower level 5', volumeM3: 40, heatLossWPerK: 55, setpointC: 21, airC: 20, indoorClass: 'G25' },
];

const PIPES: PipeConfig[] = [
  { lengthM: 14, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'owner-reported' },
  { lengthM: 6.5, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'owner-reported' },
  { lengthM: 7.5, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'owner-reported' },
  { lengthM: 10, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'default' },
  { lengthM: 10, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'default' },
];

export function defaultConfig(): Config {
  const fx = fixtureFor('heating', 'normal');
  return {
    mode: 'heating',
    example: 'normal',
    outdoorKind: 'owner',
    unitCount: 3,
    outdoorC: fx.conditions.outdoorC,
    outdoorRh: fx.conditions.outdoorRh,
    etaIsPct: 70,
    rooms: ROOMS.map((r) => ({ ...r, airC: fx.conditions.roomC, setpointC: fx.conditions.setpointC, cleanlinessOverridePct: null })),
    pipes: PIPES.map((p) => ({ ...p })),
    live: defaultLiveParameters(),
  };
}

function defaultUi(): UiState {
  return {
    experience: 'live',
    speed: 1,
    paused: false,
    selected: null,
    tab: 'rooms',
    drawerOpen: false,
    drawerTab: 'diagnostics',
    pressure: 'abs',
    zoom: 'overview',
    showTaps: true,
    showLabels: true,
    notice: null,
  };
}

/**
 * Preview clock and the explicitly illustrative mass ledger (iceKg + retainedWaterKg) advance per frame and never
 * trigger the main subscribers. This is not a drainage, refreezing or heat-transfer solver.
 */
export interface Clock {
  previewTimeS: number;
  iceKg: number;
  retainedWaterKg: number;
  /** True when the current inventory began from the arbitrary ICE_START_KG example load (cleared only by Reset). */
  seeded: boolean;
  /** True only while ice is actually transferring to liquid this frame (false when paused or exhausted). */
  melting: boolean;
}

export const ICE_START_KG = 0.1;
/** Visual saturation of the ice graphic only; the mass itself is never capped. */
export const ICE_FULL_KG = 0.6;

/** Advances the ledger by `simS` preview seconds of the frozen fixture rates. Mass moves only ice → retained liquid. */
export function advanceLedger(clock: Clock, fx: Fixture, simS: number, paused: boolean): void {
  clock.melting = false;
  if (paused || simS <= 0) return;
  if (fx.frostRateKgH !== null) clock.iceKg += (fx.frostRateKgH / 3600) * simS;
  if (fx.meltRateKgH !== null && clock.iceKg > 0) {
    const moved = Math.min(clock.iceKg, (fx.meltRateKgH / 3600) * simS);
    clock.iceKg -= moved;
    clock.retainedWaterKg += moved;
    clock.melting = moved > 0;
  }
}

/** The 0.10 kg example start is loaded only when the scene holds neither ice nor retained liquid. */
export const hasInventory = (c: Clock): boolean => c.iceKg > 0 || c.retainedWaterKg > 0;

type Listener = (s: AppState) => void;

class Store {
  state: AppState = { cfg: defaultConfig(), ui: defaultUi() };
  clock: Clock = { previewTimeS: 0, iceKg: 0, retainedWaterKg: 0, seeded: false, melting: false };
  /** Incremented by every reset(); the runtime owner restarts the engine when it changes. */
  resetEpoch = 0;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }

  /** Mutates in place via `fn`, then notifies. Subscribers must diff and never rebuild focused inputs. */
  update(fn: (s: AppState) => void): void {
    fn(this.state);
    this.emit();
  }

  emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  reset(): void {
    const { speed, drawerOpen, pressure, experience } = this.state.ui;
    this.state = { cfg: defaultConfig(), ui: { ...defaultUi(), speed, drawerOpen, pressure, experience } };
    Object.assign(this.clock, { previewTimeS: 0, iceKg: 0, retainedWaterKg: 0, seeded: false, melting: false });
    this.resetEpoch += 1;
    this.emit();
  }

  /** Live Heating/Cooling edits the mode only: no fixture conditions, outdoor air or rooms are touched. */
  setMode(mode: Mode): void {
    this.update((s) => {
      s.cfg.mode = mode;
      if (mode === 'cooling' && (s.cfg.example === 'frost' || s.cfg.example === 'defrost')) s.cfg.example = 'normal';
      s.ui.notice = null;
    });
  }

  /** Switching experience never rewrites the configuration; examples show a mismatch notice instead. */
  setExperience(experience: Experience): void {
    this.update((s) => {
      s.ui.experience = experience;
      if (s.cfg.mode === 'cooling' && (s.cfg.example === 'frost' || s.cfg.example === 'defrost')) s.cfg.example = 'normal';
      s.ui.notice = null;
    });
  }

  /** Selecting an example deliberately switches to the Examples experience and loads that fixture's conditions, once. */
  loadExample(mode: Mode, example: ExampleState): void {
    this.update((s) => {
      s.ui.experience = 'examples';
      const prevMode = s.cfg.mode;
      s.cfg.mode = mode;
      s.cfg.example = mode === 'cooling' && (example === 'frost' || example === 'defrost') ? 'normal' : example;
      const fx = fixtureFor(s.cfg.mode, s.cfg.example);
      s.cfg.outdoorC = fx.conditions.outdoorC;
      s.cfg.outdoorRh = fx.conditions.outdoorRh;
      for (const r of s.cfg.rooms) {
        r.airC = fx.conditions.roomC;
        r.setpointC = fx.conditions.setpointC;
      }
      // Ice and retained liquid persist across idle and mode changes; only Reset clears them.
      let seedNote = '';
      if ((s.cfg.example === 'frost' || s.cfg.example === 'defrost') && !hasInventory(this.clock)) {
        this.clock.iceKg = ICE_START_KG;
        this.clock.seeded = true;
        seedNote = ` The scene held no ice or retained liquid, so the arbitrary ${ICE_START_KG.toFixed(2)} kg example initial ice was loaded.`;
      }
      if (prevMode !== mode || seedNote) s.ui.notice = `Loaded the ${fx.title.toLowerCase()} example conditions into the configuration.${seedNote}`;
      else s.ui.notice = null;
    });
  }

  /** Drops a selection that refers to a room, EEV or branch that no longer exists. */
  private pruneSelection(s: AppState): void {
    const m = /^(indoor|eev|pipe):(\d+)$/.exec(s.ui.selected ?? '');
    if (m && Number(m[2]) >= s.cfg.unitCount) s.ui.selected = null;
  }

  setUnitCount(n: number): void {
    this.update((s) => {
      const count = Math.max(1, Math.min(MAX_UNITS, n));
      s.cfg.unitCount = count;
      if (count > OWNER_PORTS && s.cfg.outdoorKind === 'owner') {
        s.cfg.outdoorKind = 'generic';
        s.ui.notice = `The 3MXM52N8 has ${OWNER_PORTS} ports. ${count} units switched the outdoor group to a generic compatible unit.`;
      } else if (s.ui.notice?.includes('ports')) {
        s.ui.notice = null;
      }
      this.pruneSelection(s);
    });
  }

  setOutdoorKind(kind: 'owner' | 'generic'): void {
    this.update((s) => {
      s.cfg.outdoorKind = kind;
      if (kind === 'owner' && s.cfg.unitCount > OWNER_PORTS) {
        s.cfg.unitCount = OWNER_PORTS;
        s.ui.notice = `Owner preset limited to its ${OWNER_PORTS} ports; unit count reduced.`;
      } else {
        s.ui.notice = null;
      }
      this.pruneSelection(s);
    });
  }
}

export const store = new Store();

export function activeRooms(cfg: Config): RoomConfig[] {
  return cfg.rooms.slice(0, cfg.unitCount);
}

export interface EffectiveCleanliness { pct: number; source: 'global' | 'override' }

/** Outdoor coil: override when set, else the global value. */
export function outdoorCleanliness(cfg: Config): EffectiveCleanliness {
  const o = cfg.live.outdoorCleanlinessOverridePct;
  return o === null ? { pct: cfg.live.cleanlinessPct, source: 'global' } : { pct: o, source: 'override' };
}

/** Indoor coil of room `i`: its override when set, else the global value. */
export function indoorCleanliness(cfg: Config, i: number): EffectiveCleanliness {
  const o = cfg.rooms[i]?.cleanlinessOverridePct ?? null;
  return o === null ? { pct: cfg.live.cleanlinessPct, source: 'global' } : { pct: o, source: 'override' };
}

// ---------- reading source ----------
export type LiveKind = 'loading' | 'fault' | 'running' | 'idle' | 'reversing' | 'defrost' | 'draining';

export interface LiveStatus {
  kind: LiveKind;
  label: string;
  /** Fault text, or the reason readings are withheld. */
  detail: string | null;
  warnings: string[];
  /** True only when engine values may be displayed. Faults, errors, loading and a pending mode change withhold them. */
  usable: boolean;
  calculationMs: number | null;
}

const KIND_LABEL: Record<LiveKind, string> = {
  loading: 'Loading', fault: 'Fault', running: 'Running', idle: 'Idle', reversing: 'Reversing valve', defrost: 'Defrost', draining: 'Draining',
};

export function liveStatus(cfg: Config): LiveStatus {
  const st = simulation.status;
  const out = st.output;
  const none = { warnings: [] as string[], usable: false, calculationMs: null };
  if (st.state === 'error') return { kind: 'fault', label: KIND_LABEL.fault, detail: st.error ?? 'Engine worker error.', ...none };
  if (st.state === 'loading' || !out) return { kind: 'loading', label: KIND_LABEL.loading, detail: 'Waiting for the engine to produce its first state.', ...none };
  const warnings = out.diagnostics.warnings;
  if (out.diagnostics.fault || out.state === 'fault') {
    return { kind: 'fault', label: KIND_LABEL.fault, detail: out.diagnostics.fault ?? 'Engine fault.', warnings, usable: false, calculationMs: st.calculationMs };
  }
  if (out.requestedMode !== cfg.mode) {
    return { kind: 'loading', label: 'Applying mode', detail: 'The engine has not yet applied the requested mode.', warnings, usable: false, calculationMs: st.calculationMs };
  }
  return { kind: out.state, label: KIND_LABEL[out.state], detail: null, warnings, usable: true, calculationMs: st.calculationMs };
}

export interface Current extends Readings {
  /** False when live values are withheld; every numeric field is then null and the scene shows no stale flow. */
  usable: boolean;
  /** The adapter defaults electrical input to 0 when unavailable; this stays null instead. */
  electricalKw: number | null;
  live: LiveStatus | null;
}

/**
 * The single reading source for ribbon, scene, inspector and drawer. Examples pass through unchanged. Live readings are
 * blanked whenever the engine is loading, faulted, errored or still applying the requested mode: no stale snapshot.
 */
export function currentReadings(s: AppState): Current {
  if (s.ui.experience === 'examples') {
    const r = readingsFor(s, 'examples');
    return { ...r, usable: true, electricalKw: r.pElecKw, live: null };
  }
  const live = liveStatus(s.cfg);
  const r = readingsFor(s, 'live');
  if (live.usable) {
    const defrost = r.engine?.state === 'defrost';
    return { ...r, cop: defrost ? null : r.cop, usable: true, electricalKw: r.engine ? r.engine.electrical.totalW / 1000 : null, live };
  }
  return {
    ...r, engine: null, usable: false, electricalKw: null, live, cycle: null, example: 'idle', mDotKgS: null,
    qCondKw: null, qEvapKw: null, pRefKw: null, driveLossKw: null, pElecKw: 0, roomKwTotal: null, cop: null,
    branchKw: null, branchOutC: null, branchFanKw: [], outdoorFanKw: 0, controlsKw: 0, outdoorOutletC: null,
    indoorFansOn: false, outdoorFanOn: false, frostRateKgH: null, meltRateKgH: null, ledger: [],
    summary: live.detail ?? r.summary, notes: [live.detail ?? 'Engine unavailable.'],
  };
}
