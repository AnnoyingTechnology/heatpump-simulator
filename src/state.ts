import type { AppState, Config, Experience, ExampleState, Mode, PipeConfig, RoomConfig, InterzoneLink, UiState } from './types';
import { DEFAULT_GENERIC_PORT_CAPACITY, OWNER_PORTS, outdoorPortCapacity } from './types';
import type { Fixture } from './fixtures';
import { fixtureFor } from './fixtures';
import { defaultLiveParameters, CHARGE_MODEL_AVAILABLE } from './runtime/config';
import { readingsFor, simulation } from './runtime/view';
import type { Readings } from './runtime/view';
import type { RoomOutput } from './engine/types';

/**
 * Owner preset: Daikin 3MXM52N8 + FTXA25 / FTXA35 / FTXA25. Stack order is top → bottom.
 * Branch lengths are the owner's historical blog values (7.5 ground / 6.5 first / 14 attic).
 * Winter targets/Off and observed temperatures are owner-reported. Envelope split, interzone conductance,
 * residual air exchange and gain allocation are provisional house assumptions, not measured properties.
 * See research/owner-house-calibration.md; refrigerant/OEM performance is never fitted to these observations.
 */
const ROOMS: Omit<RoomConfig, 'cleanlinessOverridePct'>[] = [
  { id: 'attic', name: 'Attic (L2)', surfaceM2: 26, ceilingHeightM: 84 / 26, heatLossWPerK: 15, setpointC: 21, airC: 18.3, enabled: false, internalGainW: 0, ventilationACH: .25, indoorClass: 'FTXA25' },
  { id: 'first', name: 'Upstairs (L1)', surfaceM2: 54.5, ceilingHeightM: 155 / 54.5, heatLossWPerK: 25, setpointC: 21.5, airC: 21.5, enabled: true, internalGainW: 0, ventilationACH: .25, indoorClass: 'FTXA35' },
  { id: 'ground', name: 'Ground (L0)', surfaceM2: 45.4, ceilingHeightM: 100 / 45.4, heatLossWPerK: 45, setpointC: 17, airC: 18, enabled: true, internalGainW: 200, ventilationACH: .25, indoorClass: 'FTXA25' },
  { id: 'zone4', name: 'Lower level 4', surfaceM2: 16, ceilingHeightM: 2.5, heatLossWPerK: 55, setpointC: 21, airC: 20, enabled: true, indoorClass: 'G25' },
  { id: 'zone5', name: 'Lower level 5', surfaceM2: 16, ceilingHeightM: 2.5, heatLossWPerK: 55, setpointC: 21, airC: 20, enabled: true, indoorClass: 'G25' },
];

const PIPES: PipeConfig[] = [
  { lengthM: 14, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'owner-reported' },
  { lengthM: 6.5, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'owner-reported' },
  { lengthM: 7.5, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'owner-reported' },
  { lengthM: 10, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'default' },
  { lengthM: 10, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'default' },
];

export function defaultConfig(): Config {
  return {
    mode: 'heating',
    example: 'normal',
    outdoorKind: 'owner',
    genericPortCapacity: DEFAULT_GENERIC_PORT_CAPACITY,
    unitCount: 3,
    outdoorC: 1,
    outdoorRh: 35, // Benchmark humidity is unknown; this remains an explicit scenario assumption.
    etaIsPct: 70,
    rooms: ROOMS.map((r) => ({ ...r, cleanlinessOverridePct: null })),
    pipes: PIPES.map((p) => ({ ...p })),
    interzoneLinks: [
      { roomA: 'ground', roomB: 'first', conductanceWK: 200, kind: 'opening', orientation: 'vertical', areaM2: 5, transferWm2K: 40 },
      { roomA: 'first', roomB: 'attic', conductanceWK: 120, kind: 'opening', orientation: 'vertical', areaM2: 3, transferWm2K: 40 },
    ],
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
    const oldModel = this.state.cfg.live.circuitModel;
    const oldTopology = this.state.cfg.rooms.slice(0,this.state.cfg.unitCount).map(room => room.id).join('|');
    fn(this.state);
    const newTopology = this.state.cfg.rooms.slice(0,this.state.cfg.unitCount).map(room => room.id).join('|');
    if (oldModel !== this.state.cfg.live.circuitModel || (this.state.cfg.live.circuitModel === 'inventory' && oldTopology !== newTopology)) {
      this.resetEpoch += 1;
      this.state.ui.notice = 'Started a new refrigerant circuit from the current initialization inputs.';
    }
    this.emit();
  }

  emit(): void {
    const zoom = this.state.ui.zoom;
    if (zoom.startsWith('room:') && !activeRooms(this.state.cfg).some(room => `room:${room.id}` === zoom)) {
      this.state.ui.zoom = 'overview';
    }
    for (const l of this.listeners) l(this.state);
  }

  reset(): void {
    const { speed, pressure, experience } = this.state.ui;
    this.state = { cfg: defaultConfig(), ui: { ...defaultUi(), speed, pressure, experience } };
    Object.assign(this.clock, { previewTimeS: 0, iceKg: 0, retainedWaterKg: 0, seeded: false, melting: false });
    this.resetEpoch += 1;
    this.emit();
  }

  /** Start a fresh physical scenario from the edited inputs, without restoring factory defaults. */
  restartSimulation(): void {
    Object.assign(this.clock, { previewTimeS: 0, iceKg: 0, retainedWaterKg: 0, seeded: false, melting: false });
    this.state.ui.selected = null;
    this.state.ui.notice = null;
    this.resetEpoch += 1;
    this.emit();
  }

  setCircuitModel(model: 'reference' | 'inventory'): void {
    if (model === 'inventory' && !CHARGE_MODEL_AVAILABLE) return;
    this.update(s => {
      s.cfg.live.circuitModel = model;
      if (model === 'inventory') s.cfg.live.fieldLines = 'idealized';
    });
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
    if (!Number.isSafeInteger(n) || n < 1) return;
    this.update((s) => {
      if (n > OWNER_PORTS && s.cfg.outdoorKind === 'owner') {
        s.cfg.outdoorKind = 'generic';
        s.ui.notice = `The 3MXM52N8 has ${OWNER_PORTS} ports. More units require the generic group's declared connection capacity.`;
      } else if (s.ui.notice?.includes('ports')) {
        s.ui.notice = null;
      }
      const count = Math.min(outdoorPortCapacity(s.cfg), n);
      this.ensureRoomSlots(s.cfg, count);
      s.cfg.unitCount = count;
      this.pruneSelection(s);
    });
  }

  /** Allocate only active rooms; increasing a capacity alone never creates a huge hidden array. */
  private ensureRoomSlots(cfg: Config, count: number): void {
    while (cfg.rooms.length < count) {
      let ordinal = cfg.rooms.length + 1;
      while (cfg.rooms.some(r => r.id === `room-${ordinal}`)) ordinal += 1;
      cfg.rooms.push({ id: `room-${ordinal}`, name: `Room ${ordinal}`, enabled: true, surfaceM2: 20, ceilingHeightM: 2.5,
        heatLossWPerK: 60, setpointC: 21, airC: 20, indoorClass: 'G25', cleanlinessOverridePct: null });
      cfg.pipes.push({ lengthM: 10, liquidOdMm: 6.35, gasOdMm: 9.52, lengthSource: 'default' });
    }
  }

  setGenericPortCapacity(capacity: number): void {
    if (!Number.isSafeInteger(capacity) || capacity < 1) return;
    this.update(s => {
      s.cfg.genericPortCapacity = capacity;
      if (s.cfg.outdoorKind === 'generic') s.cfg.unitCount = Math.min(s.cfg.unitCount, capacity);
      this.pruneSelection(s);
    });
  }

  /** General sensible connection; zero disconnects. Configuration uses stable room IDs, never indices. */
  setInterzoneConductance(roomA: string, roomB: string, conductanceWK: number): void {
    const ids = new Set(this.state.cfg.rooms.slice(0, this.state.cfg.unitCount).map(r => r.id));
    if (roomA === roomB || !ids.has(roomA) || !ids.has(roomB) || !Number.isFinite(conductanceWK) || conductanceWK < 0) return;
    this.update(s => {
      const links = s.cfg.interzoneLinks ??= [];
      const at = links.findIndex(l => (l.roomA === roomA && l.roomB === roomB) || (l.roomA === roomB && l.roomB === roomA));
      if (conductanceWK === 0) { if (at >= 0) links.splice(at, 1); }
      else if (at >= 0) {
        links[at].conductanceWK = conductanceWK;
        if (links[at].areaM2 !== undefined && links[at].transferWm2K !== undefined) links[at].transferWm2K = conductanceWK / links[at].areaM2!;
      }
      else links.push({ roomA, roomB, conductanceWK });
    });
  }

  /** Create or characterize a visual connection; H = area × effective coefficient. */
  setInterzoneLink(roomA: string, roomB: string, patch: Partial<Pick<InterzoneLink, 'kind' | 'orientation' | 'areaM2' | 'transferWm2K'>> = {}): void {
    const ids = new Set(this.state.cfg.rooms.slice(0, this.state.cfg.unitCount).map(r => r.id));
    if (roomA === roomB || !ids.has(roomA) || !ids.has(roomB)) return;
    const existing = this.state.cfg.interzoneLinks?.find(l => (l.roomA === roomA && l.roomB === roomB) || (l.roomA === roomB && l.roomB === roomA));
    const kind = patch.kind ?? existing?.kind ?? 'opening';
    const orientation = patch.orientation ?? existing?.orientation ?? 'vertical';
    const changedKind = patch.kind !== undefined && patch.kind !== existing?.kind;
    const transferWm2K = patch.transferWm2K ?? (changedKind ? undefined : existing?.transferWm2K) ?? (kind === 'opening' ? 40 : 1.5);
    const areaM2 = patch.areaM2 ?? existing?.areaM2 ?? (existing ? existing.conductanceWK / transferWm2K : 2);
    if (!['opening', 'partition'].includes(kind) || !['horizontal', 'vertical'].includes(orientation) ||
      !Number.isFinite(areaM2) || areaM2 <= 0 || !Number.isFinite(transferWm2K) || transferWm2K < 0 || !Number.isFinite(areaM2 * transferWm2K)) return;
    const link: InterzoneLink = { roomA, roomB, kind, orientation, areaM2, transferWm2K, conductanceWK: areaM2 * transferWm2K };
    this.update(s => {
      const links = s.cfg.interzoneLinks ??= [];
      const at = links.findIndex(l => (l.roomA === roomA && l.roomB === roomB) || (l.roomA === roomB && l.roomB === roomA));
      if (at >= 0) links[at] = link; else links.push(link);
    });
  }

  addRoom(): void {
    const cfg = this.state.cfg;
    if (cfg.unitCount < outdoorPortCapacity(cfg)) this.setUnitCount(cfg.unitCount + 1);
  }

  /** Remove one active room and its matching lines. Keep its inputs in the inactive pool for reversible re-addition. */
  removeRoom(index: number): void {
    const cfg = this.state.cfg;
    if (!Number.isInteger(index) || index < 0 || index >= cfg.unitCount || cfg.unitCount <= 1) return;
    this.update(s => {
      const lastActive = s.cfg.unitCount - 1;
      const [room] = s.cfg.rooms.splice(index, 1);
      const [pipe] = s.cfg.pipes.splice(index, 1);
      s.cfg.rooms.splice(lastActive, 0, room);
      s.cfg.pipes.splice(lastActive, 0, pipe);
      s.cfg.unitCount -= 1;
      const selected = /^(indoor|eev|pipe):(\d+)$/.exec(s.ui.selected ?? '');
      if (selected) {
        const previous = Number(selected[2]);
        if (previous === index) s.ui.selected = null;
        else if (previous > index) s.ui.selected = `${selected[1]}:${previous - 1}`;
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
export type LiveKind = 'loading' | 'updating' | 'fault' | 'running' | 'idle' | 'reversing' | 'defrost' | 'draining';

export interface LiveStatus {
  kind: LiveKind;
  label: string;
  /** Fault text, or the reason readings are withheld. */
  detail: string | null;
  warnings: string[];
  /** Completed engine values may be displayed, including explicitly labelled pre-edit snapshots for soft inputs. */
  usable: boolean;
  calculationMs: number | null;
}

const KIND_LABEL: Record<LiveKind, string> = {
  loading: 'Loading', updating: 'Inputs changed', fault: 'Fault', running: 'Running', idle: 'Idle', reversing: 'Reversing valve', defrost: 'Defrost', draining: 'Draining',
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
  if (st.state === 'updating') return { kind: 'updating', label: KIND_LABEL.updating,
    detail: 'Readings from the last calculated step; new inputs appear after the next simulation step. If paused, resume to recalculate.',
    warnings, usable: true, calculationMs: st.calculationMs };
  if (out.diagnostics.demandSpeedRps > 0 && out.diagnostics.speedRps === 0) {
    const protection = out.diagnostics.envelopeProtection;
    const delay = out.diagnostics.restartDelaySeconds;
    if (protection || delay > 0) return { kind: out.state,
      label: protection ? 'Protection hold' : 'Restart wait',
      detail: protection ? `Compressor paused for ${protection}; thermal state continues evolving.`
        : `Compressor restart dwell: ${Math.ceil(delay)} seconds remaining.`,
      warnings, usable: true, calculationMs: st.calculationMs };
  }
  return { kind: out.state, label: KIND_LABEL[out.state], detail: null, warnings, usable: true, calculationMs: st.calculationMs };
}

export interface Current extends Readings {
  /** False when operating values are withheld; the scene shows no stale flow. */
  usable: boolean;
  /** Accepted stored room temperatures survive a failed step; no active flux readings are retained. */
  retainedRooms?: RoomOutput[];
  /** The adapter defaults electrical input to 0 when unavailable; this stays null instead. */
  electricalKw: number | null;
  live: LiveStatus | null;
}

/**
 * The single reading source for the header, scene and equipment settings. Examples pass through unchanged. Live readings are
 * withheld for faults, errors and incompatible pending changes. Compatible target/weather edits keep the completed
 * physical snapshot explicitly labelled until the next physical step solves the new inputs.
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
    retainedRooms: r.engine?.state === 'fault' ? r.engine.rooms : undefined,
    qCondKw: null, qEvapKw: null, pRefKw: null, driveLossKw: null, pElecKw: 0, roomKwTotal: null, cop: null,
    branchKw: null, branchOutC: null, branchFanKw: [], outdoorFanKw: 0, controlsKw: 0, outdoorOutletC: null,
    indoorFansOn: false, outdoorFanOn: false, frostRateKgH: null, meltRateKgH: null, ledger: [],
    summary: live.detail ?? r.summary, notes: [live.detail ?? 'Engine unavailable.'],
  };
}
