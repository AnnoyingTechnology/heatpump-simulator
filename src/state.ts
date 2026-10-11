import type { AppState, Config, Experience, ExampleState, IndoorClass, Mode, OutdoorKind, PipeConfig, RoomConfig, InterzoneLink, UiState } from './types';
import { applyIndoorProfile, indoorOptionsForOutdoor, outdoorModelInfo } from './equipment';
import { CONNECTION_CLASSES, type HeadInstallation } from './equipment-topology';
import { DEFAULT_GENERIC_PORT_CAPACITY, OWNER_PORTS, outdoorPortCapacity, roomVolumeM3, roomExposedEnvelopeAreaM2, roomEnvelopeConductanceWK, interzoneConductance, hasInterzoneGeometry, INTERZONE_GEOMETRY_DEFAULTS } from './types';
import type { Fixture } from './fixtures';
import { fixtureFor } from './fixtures';
import { defaultLiveParameters, CHARGE_MODEL_AVAILABLE } from './runtime/config';
import { readingsFor, simulation } from './runtime/view';
import type { Readings } from './runtime/view';
import type { RoomOutput } from './engine/types';
import { refrigerantDefinition, type RefrigerantId } from './engine/refrigerants';

/**
 * Owner preset: Daikin 3MXM52N8 + FTXA25 / FTXA35 / FTXA25. Stack order is top → bottom.
 * Branch lengths are the owner's historical blog values (7.5 ground / 6.5 first / 14 attic).
 * Winter targets/Off and observed temperatures are owner-reported. Envelope split, interzone conductance,
 * residual air exchange and gain allocation are provisional house assumptions, not measured properties.
 * See research/owner-house-calibration.md; refrigerant/OEM performance is never fitted to these observations.
 */
const ROOMS: Omit<RoomConfig, 'cleanlinessOverridePct'>[] = [
  { id: 'attic', name: 'Attic (L2)', surfaceM2: 26, ceilingHeightM: 84 / 26, heatLossWPerK: 15, setpointC: 21, airC: 18.3, enabled: false, internalGainW: 0, indoorClass: 'FTXA25' },
  { id: 'first', name: 'Upstairs (L1)', surfaceM2: 54.5, ceilingHeightM: 155 / 54.5, heatLossWPerK: 25, setpointC: 21.5, airC: 21.5, enabled: true, internalGainW: 0, indoorClass: 'FTXA35' },
  { id: 'ground', name: 'Ground (L0)', surfaceM2: 45.4, ceilingHeightM: 100 / 45.4, heatLossWPerK: 45, setpointC: 17, airC: 18, enabled: true, internalGainW: 200, indoorClass: 'FTXA25' },
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
  const cfg: Config = {
    mode: 'heating',
    example: 'normal',
    outdoorKind: 'owner',
    genericPortCapacity: DEFAULT_GENERIC_PORT_CAPACITY,
    unitCount: 3,
    outdoorC: 1,
    outdoorRh: 35, // Benchmark humidity is unknown; this remains an explicit scenario assumption.
    etaIsPct: 70,
    rooms: ROOMS.map((r) => ({ ...r, envelopeQualityWPerM3K: r.heatLossWPerK / roomVolumeM3(r), cleanlinessOverridePct: null })),
    pipes: PIPES.map((p) => ({ ...p })),
    interzoneLinks: [
      { roomA: 'ground', roomB: 'first', lowerRoomId: 'ground', ...INTERZONE_GEOMETRY_DEFAULTS, conductanceWK: interzoneConductance({ roomA: 'ground', roomB: 'first', conductanceWK: 0, ...INTERZONE_GEOMETRY_DEFAULTS }), orientation: 'vertical' },
      { roomA: 'first', roomB: 'attic', lowerRoomId: 'first', ...INTERZONE_GEOMETRY_DEFAULTS, conductanceWK: interzoneConductance({ roomA: 'first', roomB: 'attic', conductanceWK: 0, ...INTERZONE_GEOMETRY_DEFAULTS }), orientation: 'vertical' },
    ],
    ventilation: { mode: 'dual', grossACH: .5, sensibleEfficiencyPct: 75 },
    live: defaultLiveParameters(),
  };
  // Calibrate effective U only after the complete shared-face geometry exists.
  for (const room of cfg.rooms) {
    room.envelopeAreaOverrideM2 = null;
    room.averageUValueWm2K = room.heatLossWPerK / roomExposedEnvelopeAreaM2(room, cfg);
  }
  return cfg;
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
    const oldFluid = this.state.cfg.live.refrigerant;
    const oldTopology = this.state.cfg.rooms.slice(0,this.state.cfg.unitCount).map(room => room.id).join('|');
    const priorRooms = new Map(this.state.cfg.rooms.map(room => [room.id, { heatLossWPerK: room.heatLossWPerK, quality: room.envelopeQualityWPerM3K, uValue: room.averageUValueWm2K }]));
    const pairKey = (link: InterzoneLink) => JSON.stringify([link.roomA, link.roomB].sort());
    const priorLinks = new Map((this.state.cfg.interzoneLinks ?? []).map(link => [pairKey(link), { ...link }]));
    fn(this.state);
    // The sandbox exposes one permanently shared coil-cleanliness control.
    this.state.cfg.live.outdoorCleanlinessOverridePct = null;
    for (const room of this.state.cfg.rooms) room.cleanlinessOverridePct = null;
    // U is primary. Geometry/link/area edits retain U; legacy explicit H or G
    // edits rebase it against the newly estimated exposed area.
    for (const room of this.state.cfg.rooms) {
      const before = priorRooms.get(room.id), volume = roomVolumeM3(room), area = roomExposedEnvelopeAreaM2(room, this.state.cfg);
      if (room.averageUValueWm2K !== undefined && room.averageUValueWm2K !== before?.uValue) {
        room.heatLossWPerK = room.averageUValueWm2K * area;
      } else if (room.heatLossWPerK !== before?.heatLossWPerK) {
        room.averageUValueWm2K = room.heatLossWPerK / area;
      } else if (room.envelopeQualityWPerM3K !== undefined && room.envelopeQualityWPerM3K !== before?.quality) {
        room.heatLossWPerK = room.envelopeQualityWPerM3K * volume;
        room.averageUValueWm2K = room.heatLossWPerK / area;
      } else if (room.averageUValueWm2K === undefined) {
        room.heatLossWPerK = roomEnvelopeConductanceWK(room);
        room.averageUValueWm2K = room.heatLossWPerK / area;
      } else room.heatLossWPerK = room.averageUValueWm2K * area;
      room.envelopeQualityWPerM3K = room.heatLossWPerK / volume;
    }
    const thermalGeometry = ['openingAreaM2', 'contactAreaM2', 'insulationMm', 'openingTransferWm2K', 'openingModel', 'backgroundConductanceWK', 'openingHeightM', 'lowerRoomId', 'floorCoefficient', 'wallDischargeCoefficient', 'orientation', 'kind', 'areaM2', 'transferWm2K'] as const;
    for (const link of this.state.cfg.interzoneLinks ?? []) {
      if (hasInterzoneGeometry(link) && link.lowerRoomId === undefined) link.lowerRoomId = this.state.cfg.rooms.findIndex(r => r.id === link.roomA) > this.state.cfg.rooms.findIndex(r => r.id === link.roomB) ? link.roomA : link.roomB;
      const before = priorLinks.get(pairKey(link));
      const geometryChanged = before && thermalGeometry.some(key => link[key] !== before[key]);
      if (geometryChanged) delete link.conductanceOverrideWK;
      else if (before && link.conductanceWK !== before.conductanceWK && link.conductanceOverrideWK === before.conductanceOverrideWK) link.conductanceOverrideWK = link.conductanceWK;
      link.conductanceWK = interzoneConductance(link);
    }
    const newTopology = this.state.cfg.rooms.slice(0,this.state.cfg.unitCount).map(room => room.id).join('|');
    if (oldFluid !== this.state.cfg.live.refrigerant || oldModel !== this.state.cfg.live.circuitModel || (this.state.cfg.live.circuitModel === 'inventory' && oldTopology !== newTopology)) {
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

  /** A different working fluid starts a new scenario; never reinterpret stored energy with another EOS. */
  setRefrigerant(fluid: RefrigerantId): void {
    const cfg = this.state.cfg;
    const coverage = refrigerantDefinition(fluid).qualification;
    if (fluid === cfg.live.refrigerant || cfg.outdoorKind !== 'generic' || !coverage.reference ||
        (cfg.live.fieldLines === 'physical' && !coverage.physicalLines) ||
        (cfg.live.circuitModel === 'inventory' && !coverage.inventory)) return;
    this.update(s => { s.cfg.live.refrigerant = fluid; });
  }

  /** Live Heating/Cooling edits the mode only: no fixture conditions, outdoor air or rooms are touched. */
  setMode(mode: Mode): void {
    this.update((s) => {
      s.cfg.mode = mode;
      if (mode === 'cooling' && (s.cfg.example === 'frost' || s.cfg.example === 'defrost')) s.cfg.example = 'normal';
      s.ui.notice = null;
    });
  }

  /** Quick operating conditions on the current house. Geometry, equipment,
   * humidity, gains and all accepted physical stores remain intact. */
  applyOwnerSeason(season: 'winter' | 'summer'): void {
    this.update(s => {
      s.cfg.mode = season === 'winter' ? 'heating' : 'cooling';
      s.cfg.example = 'normal';
      s.cfg.outdoorC = season === 'winter' ? 1 : 39;
      for (const room of s.cfg.rooms.slice(0, s.cfg.unitCount)) {
        if (season === 'summer') {
          room.enabled = true;
          room.setpointC = 24;
        } else {
          room.enabled = room.id !== 'attic';
          room.setpointC = room.id === 'ground' ? 17 : room.id === 'first' ? 21.5 : 21;
        }
      }
      s.ui.notice = null;
    });
  }

  setRoomWindowSolarGain(roomId: string, watts: number): void {
    if (!(Number.isFinite(watts) && watts >= 0)) throw new RangeError('Window solar gain must be finite and nonnegative');
    const room = this.state.cfg.rooms.find(r => r.id === roomId);
    if (!room) throw new RangeError('Unknown room');
    this.update(() => { room.windowSolarGainW = watts; });
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
    const installation = outdoorModelInfo(this.state.cfg).installation;
    if (installation && installation.minimumConnectedHeads !== null && n < installation.minimumConnectedHeads) {
      this.state.ui.notice = 'This outdoor model requires at least two connected heads. Off heads may remain connected.';
      this.emit();
      return;
    }
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
        heatLossWPerK: 60, envelopeQualityWPerM3K: 1.2, setpointC: 21, airC: 20, indoorClass: 'G25', cleanlinessOverridePct: null });
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

  /** Legacy volumetric G input: rebases modern U against the current exposed-area estimate. */
  setRoomInsulation(roomId: string, qualityWPerM3K: number): void {
    const room = this.state.cfg.rooms.find(candidate => candidate.id === roomId);
    if (!room || !Number.isFinite(qualityWPerM3K) || qualityWPerM3K < 0 || !Number.isFinite(qualityWPerM3K * roomVolumeM3(room))) return;
    this.update(s => { s.cfg.rooms.find(candidate => candidate.id === roomId)!.envelopeQualityWPerM3K = qualityWPerM3K; });
  }

  /** Effective whole-room average U; no material/glazing decomposition. */
  setRoomAverageU(roomId: string, uValueWm2K: number): void {
    const room = this.state.cfg.rooms.find(candidate => candidate.id === roomId);
    if (!room || !Number.isFinite(uValueWm2K) || uValueWm2K < 0 || !Number.isFinite(uValueWm2K * roomExposedEnvelopeAreaM2(room, this.state.cfg))) return;
    this.update(() => { room.averageUValueWm2K = uValueWm2K; });
  }

  /** null restores the automatic square-box/shared-face estimate. */
  setRoomEnvelopeAreaOverride(roomId: string, areaM2: number | null): void {
    const room = this.state.cfg.rooms.find(candidate => candidate.id === roomId);
    if (!room || (areaM2 !== null && !(Number.isFinite(areaM2) && areaM2 > 0))) return;
    this.update(() => { room.envelopeAreaOverrideM2 = areaM2; });
  }

  setVentilation(patch: Partial<NonNullable<Config['ventilation']>>): void {
    const ventilation = { mode: 'single' as const, grossACH: .25, sensibleEfficiencyPct: 0, ...this.state.cfg.ventilation, ...patch };
    if (!['single', 'dual'].includes(ventilation.mode) || !(Number.isFinite(ventilation.grossACH) && ventilation.grossACH >= 0)
      || !(Number.isFinite(ventilation.sensibleEfficiencyPct) && ventilation.sensibleEfficiencyPct >= 0 && ventilation.sensibleEfficiencyPct <= 100)) return;
    this.update(s => { s.cfg.ventilation = ventilation; });
  }

  /** Advanced whole-room H input rebases effective U for future geometry edits. */
  setRoomEnvelopeConductance(roomId: string, conductanceWK: number): void {
    const room = this.state.cfg.rooms.find(candidate => candidate.id === roomId);
    if (!room || !Number.isFinite(conductanceWK) || conductanceWK < 0 || !(roomVolumeM3(room) > 0) || !Number.isFinite(conductanceWK / roomVolumeM3(room))) return;
    this.update(s => {
      const edited = s.cfg.rooms.find(candidate => candidate.id === roomId)!;
      edited.averageUValueWm2K = conductanceWK / roomExposedEnvelopeAreaM2(edited, s.cfg);
      edited.heatLossWPerK = conductanceWK;
    });
  }

  /** Explicit advanced H override; zero retains the editable connection. */
  setInterzoneConductance(roomA: string, roomB: string, conductanceWK: number): void {
    const ids = new Set(this.state.cfg.rooms.slice(0, this.state.cfg.unitCount).map(r => r.id));
    if (roomA === roomB || !ids.has(roomA) || !ids.has(roomB) || !Number.isFinite(conductanceWK) || conductanceWK < 0) return;
    this.update(s => {
      const links = s.cfg.interzoneLinks ??= [];
      const at = links.findIndex(l => (l.roomA === roomA && l.roomB === roomB) || (l.roomA === roomB && l.roomB === roomA));
      if (at >= 0) Object.assign(links[at], { conductanceWK, conductanceOverrideWK: conductanceWK });
      else links.push({ roomA, roomB, ...INTERZONE_GEOMETRY_DEFAULTS, orientation: 'vertical', conductanceWK, conductanceOverrideWK: conductanceWK });
    });
  }

  /** Opening and insulated solid contact are simultaneous parallel paths.
   * Old exclusive kind/area/coefficient patches remain supported for legacy QA. */
  setInterzoneLink(roomA: string, roomB: string, patch: Partial<Pick<InterzoneLink, 'openingAreaM2' | 'contactAreaM2' | 'insulationMm' | 'openingTransferWm2K' | 'openingModel' | 'backgroundConductanceWK' | 'openingHeightM' | 'lowerRoomId' | 'floorCoefficient' | 'wallDischargeCoefficient' | 'kind' | 'orientation' | 'areaM2' | 'transferWm2K'>> = {}): void {
    const ids = new Set(this.state.cfg.rooms.slice(0, this.state.cfg.unitCount).map(r => r.id));
    if (roomA === roomB || !ids.has(roomA) || !ids.has(roomB)) return;
    const existing = this.state.cfg.interzoneLinks?.find(l => (l.roomA === roomA && l.roomB === roomB) || (l.roomA === roomB && l.roomB === roomA));
    const orientation = patch.orientation ?? existing?.orientation ?? 'vertical';
    if (!['horizontal', 'vertical'].includes(orientation)) return;
    const modernKeys = ['openingAreaM2', 'contactAreaM2', 'insulationMm', 'openingTransferWm2K', 'openingModel', 'backgroundConductanceWK', 'openingHeightM', 'lowerRoomId', 'floorCoefficient', 'wallDischargeCoefficient', 'orientation'] as const;
    const modernEdit = modernKeys.some(key => patch[key] !== undefined);
    const modernShapeEdit = modernKeys.filter(key => key !== 'orientation').some(key => patch[key] !== undefined);
    const legacyEdit = patch.kind !== undefined || patch.areaM2 !== undefined || patch.transferWm2K !== undefined;
    let link: InterzoneLink;
    if (!modernShapeEdit && (legacyEdit || (existing && !hasInterzoneGeometry(existing)))) {
      const kind = patch.kind ?? existing?.kind ?? 'opening';
      const changedKind = patch.kind !== undefined && patch.kind !== existing?.kind;
      const transferWm2K = patch.transferWm2K ?? (changedKind ? undefined : existing?.transferWm2K) ?? (kind === 'opening' ? 40 : 1.5);
      const areaM2 = patch.areaM2 ?? existing?.areaM2 ?? (existing && transferWm2K > 0 ? existing.conductanceWK / transferWm2K : 2);
      if (!['opening', 'partition'].includes(kind) || !Number.isFinite(areaM2) || areaM2 < 0 || !Number.isFinite(transferWm2K) || transferWm2K < 0 || !Number.isFinite(areaM2 * transferWm2K)) return;
      link = { roomA, roomB, kind, orientation, areaM2, transferWm2K, conductanceWK: areaM2 * transferWm2K };
    } else {
      link = { roomA, roomB, orientation, conductanceWK: 0,
        openingModel: patch.openingModel ?? (patch.openingTransferWm2K !== undefined ? 'prescribed' : existing?.openingModel ?? 'buoyancy'),
        backgroundConductanceWK: patch.backgroundConductanceWK ?? existing?.backgroundConductanceWK ?? 0,
        openingHeightM: patch.openingHeightM ?? existing?.openingHeightM ?? 2,
        lowerRoomId: patch.lowerRoomId ?? existing?.lowerRoomId ?? (this.state.cfg.rooms.findIndex(r => r.id === roomA) > this.state.cfg.rooms.findIndex(r => r.id === roomB) ? roomA : roomB),
        floorCoefficient: patch.floorCoefficient ?? existing?.floorCoefficient ?? .055,
        wallDischargeCoefficient: patch.wallDischargeCoefficient ?? existing?.wallDischargeCoefficient ?? .6,
        openingAreaM2: patch.openingAreaM2 ?? existing?.openingAreaM2 ?? INTERZONE_GEOMETRY_DEFAULTS.openingAreaM2,
        contactAreaM2: patch.contactAreaM2 ?? existing?.contactAreaM2 ?? INTERZONE_GEOMETRY_DEFAULTS.contactAreaM2,
        insulationMm: patch.insulationMm ?? existing?.insulationMm ?? INTERZONE_GEOMETRY_DEFAULTS.insulationMm,
        openingTransferWm2K: patch.openingTransferWm2K ?? existing?.openingTransferWm2K ?? INTERZONE_GEOMETRY_DEFAULTS.openingTransferWm2K,
        ...(!modernEdit && existing?.conductanceOverrideWK !== undefined ? { conductanceOverrideWK: existing.conductanceOverrideWK } : {}) };
      if (![link.openingAreaM2!, link.contactAreaM2!, link.openingTransferWm2K!].every(value => Number.isFinite(value) && value >= 0)
        || !Number.isFinite(link.insulationMm!) || link.insulationMm! < 45 || link.insulationMm! > 180) return;
      if (!['buoyancy', 'prescribed'].includes(link.openingModel!) || ![roomA, roomB].includes(link.lowerRoomId!)
        || ![link.backgroundConductanceWK!, link.floorCoefficient!, link.wallDischargeCoefficient!].every(v => Number.isFinite(v) && v >= 0)
        || !Number.isFinite(link.openingHeightM!) || link.openingHeightM! <= 0) return;
      link.conductanceWK = interzoneConductance(link);
      if (!Number.isFinite(link.conductanceWK)) return;
    }
    this.update(s => {
      const links = s.cfg.interzoneLinks ??= [];
      const at = links.findIndex(l => (l.roomA === roomA && l.roomB === roomB) || (l.roomA === roomB && l.roomB === roomA));
      if (at >= 0) links[at] = link; else links.push(link);
    });
  }

  /** Geometry zeros do not erase a link; only this explicit action removes it. */
  removeInterzoneLink(roomA: string, roomB: string): void {
    const at = this.state.cfg.interzoneLinks?.findIndex(link => (link.roomA === roomA && link.roomB === roomB) || (link.roomA === roomB && link.roomB === roomA)) ?? -1;
    if (at < 0) return;
    this.update(s => { s.cfg.interzoneLinks!.splice(at, 1); });
  }

  addRoom(): void {
    const cfg = this.state.cfg;
    if (cfg.unitCount < outdoorPortCapacity(cfg)) this.setUnitCount(cfg.unitCount + 1);
  }

  /** Remove one active room and its matching lines. Keep its inputs in the inactive pool for reversible re-addition. */
  removeRoom(index: number): void {
    const cfg = this.state.cfg;
    if (!Number.isInteger(index) || index < 0 || index >= cfg.unitCount || cfg.unitCount <= 1) return;
    const installation = outdoorModelInfo(cfg).installation;
    if (installation && installation.minimumConnectedHeads !== null && cfg.unitCount <= installation.minimumConnectedHeads) {
      this.state.ui.notice = 'At least two heads must remain connected; switching a head Off is allowed.';
      this.emit();
      return;
    }
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

  setOutdoorKind(kind: OutdoorKind): void {
    if (kind === this.state.cfg.outdoorKind) return;
    const model = outdoorModelInfo(kind);
    if (model.installation && ((model.installation.minimumConnectedHeads !== null && this.state.cfg.unitCount < model.installation.minimumConnectedHeads) || this.state.cfg.unitCount > model.installation.maximumConnectedHeads)) {
      this.state.ui.notice = model.installation.minimumConnectedHeads === null
        ? `${model.id} publishes a maximum of ${model.installation.maximumConnectedHeads} connected heads; the minimum is unknown. Remove rooms explicitly before selecting it; existing rooms and history were preserved.`
        : `${model.id} requires ${model.installation.minimumConnectedHeads}–${model.installation.maximumConnectedHeads} connected heads. Add or remove rooms explicitly before selecting it; existing rooms and history were preserved.`;
      this.emit();
      return;
    }
    this.update((s) => {
      s.cfg.outdoorKind = kind;
      if (kind !== 'generic') s.cfg.live.refrigerant = 'R32';
      const oldCount = s.cfg.unitCount;
      if (!model.installation) s.cfg.unitCount = Math.min(oldCount, outdoorPortCapacity(s.cfg));
      if (model.coolingHighFanFlowM3h !== undefined) s.cfg.outdoorVolumetricAirFlowM3s = model.coolingHighFanFlowM3h / 3600;
      else delete s.cfg.outdoorVolumetricAirFlowM3s;
      for (const room of s.cfg.rooms.slice(0, s.cfg.unitCount)) {
        if (!model.installation && !model.compatibleIndoorClasses.includes(room.indoorClass)) {
          applyIndoorProfile(room, model.compatibleIndoorClasses[0]);
        }
      }
      s.ui.notice = oldCount > s.cfg.unitCount
        ? `${model.label} accepts ${outdoorPortCapacity(s.cfg)} indoor unit${outdoorPortCapacity(s.cfg) === 1 ? '' : 's'}. Other rooms and settings remain in the inactive room pool.`
        : model.installation ? 'Published multi-port constraints selected; exact indoor combinations are unverified. Room identities, declarations and generic cycle assumptions are retained.' : null;
      this.pruneSelection(s);
    });
  }

  setIndoorClass(index: number, indoor: IndoorClass): void {
    const room = this.state.cfg.rooms[index];
    if (!room || !indoorOptionsForOutdoor(this.state.cfg.outdoorKind).some(option => option.value === indoor)) return;
    this.update(s => {
      const target = s.cfg.rooms[index];
      if (target.indoorClass !== indoor && target.installation) delete target.installation.guideNamedIndoorClass;
      applyIndoorProfile(target, indoor);
    });
  }

  /** Installation declarations change metadata checks only, never the thermodynamic configuration. */
  setHeadInstallation(index: number, patch: Partial<HeadInstallation>): void {
    const cfg = this.state.cfg, room = cfg.rooms[index], profile = outdoorModelInfo(cfg).installation;
    if (!profile || !room || index < 0 || index >= cfg.unitCount) return;
    if (patch.capacityClass !== undefined && !CONNECTION_CLASSES.includes(patch.capacityClass)) return;
    if (patch.connectedCapacityKw !== undefined && (!Number.isFinite(patch.connectedCapacityKw) || patch.connectedCapacityKw <= 0)) return;
    if (patch.portId !== undefined && !profile.ports?.some(port => port.id === patch.portId)) return;
    this.update(s => {
      const target = s.cfg.rooms[index];
      target.installation = { ...target.installation, ...patch };
      for (const key of Object.keys(target.installation) as (keyof HeadInstallation)[]) if (target.installation[key] === undefined) delete target.installation[key];
    });
  }
}

export const store = new Store();

export function activeRooms(cfg: Config): RoomConfig[] {
  return cfg.rooms.slice(0, cfg.unitCount);
}

export interface EffectiveCleanliness { pct: number; source: 'global' | 'override' }

/** All coils permanently share the global clear-air-passage fraction. */
export function outdoorCleanliness(cfg: Config): EffectiveCleanliness {
  return { pct: cfg.live.cleanlinessPct, source: 'global' };
}

/** Room index is retained for API compatibility; it cannot unbind a coil. */
export function indoorCleanliness(cfg: Config, _i: number): EffectiveCleanliness {
  return { pct: cfg.live.cleanlinessPct, source: 'global' };
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
    retainedRooms: r.engine && (r.engine.state === 'fault' || live.kind === 'fault') ? r.engine.rooms : undefined,
    qCondKw: null, qEvapKw: null, pRefKw: null, driveLossKw: null, pElecKw: 0, roomKwTotal: null, cop: null,
    branchKw: null, branchOutC: null, branchFanKw: [], outdoorFanKw: 0, controlsKw: 0, outdoorOutletC: null,
    indoorFansOn: false, outdoorFanOn: false, frostRateKgH: null, meltRateKgH: null, ledger: [],
    summary: live.detail ?? r.summary, notes: [live.detail ?? 'Engine unavailable.'],
  };
}
