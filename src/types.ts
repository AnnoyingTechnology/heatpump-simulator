import type { EngineInterzoneLink } from './engine/types';
import type { LiveParameters } from './runtime/config';
import { CATALOGUE_INDOORS, CATALOGUE_OUTDOORS } from './equipment-data';
import { outdoorModelInfo, equipmentManufacturerLabel } from './equipment';
import type { HeadInstallation } from './equipment-topology';

/** Shared types. Configuration (what the user edits) is kept apart from fixtures (illustrative readings). */

export type Mode = 'heating' | 'cooling';
/** Which reading source drives the whole interface: the real worker engine or the constructed example snapshots. */
export type Experience = 'live' | 'examples';
export type ExampleState = 'normal' | 'frost' | 'defrost' | 'idle';
export type SpeedFactor = 0.5 | 1 | 2 | 5 | 10 | 50;
export type OutdoorKind = 'owner' | 'generic' | typeof CATALOGUE_OUTDOORS[number]['id'];
export type CatalogueIndoorClass = typeof CATALOGUE_INDOORS[number]['id'];
export type IndoorClass = 'FTXA25' | 'FTXA35' | 'G25' | 'G35' | 'G50' | CatalogueIndoorClass;
export type PressureConvention = 'abs' | 'gauge';
export type LengthSource = 'owner-reported' | 'default' | 'edited';
export type SidebarTab = 'rooms' | 'equipment' | 'pipes' | 'advanced';
export type ZoomPreset = 'overview' | 'outdoor' | 'rooms' | `room:${string}`;

export const OWNER_PORTS = 3;
export const DEFAULT_GENERIC_PORT_CAPACITY = 5;

export interface RoomConfig {
  id: string;
  name: string;
  /** Requested indoor-unit operation. Room/envelope storage remains simulated when off. */
  enabled: boolean;
  /** Interior floor area [m²] and mean ceiling height [m]. Volume is derived. */
  surfaceM2: number;
  ceilingHeightM: number;
  /** Whole-room effective average U [W/(m² K)] applied to estimated exposed area. */
  averageUValueWm2K?: number;
  /** Explicit exposed-area estimate [m²]; null/absent uses automatic box/shared-face geometry. */
  envelopeAreaOverrideM2?: number | null;
  /** Legacy effective volumetric quality [W/(m³ K)]; synchronized from modern
   * U/area-derived H. Retained for compatibility, not the primary insulation input. */
  envelopeQualityWPerM3K?: number;
  /** Equivalent whole-room envelope conductance [W/K]; synchronized by the store. */
  heatLossWPerK: number;
  /** Sensible background heat source [W], separate from indoor-unit power. */
  internalGainW?: number;
  /** Prescribed solar heat admitted through windows [W], separate from occupants/appliances.
   * This is an effective sensible gain, not a glazing/solar-position model. */
  windowSolarGainW?: number;
  /** Optional room gross outdoor air-exchange override [1/h]; absent inherits global ventilation. */
  ventilationACH?: number;
  setpointC: number;
  /** Room air temperature INPUT [°C]; never fed by the fixture air readings. */
  airC: number;
  indoorClass: IndoorClass;
  /** Installed port/class/reducer declarations; an Off head remains connected. */
  installation?: HeadInstallation;
  /** Published cooling high-fan volume flow; its heating reuse is an explicit assumption. Absent uses editable generic air mass flow. */
  volumetricAirFlowM3s?: number;
  /** Deprecated input, ignored: all coils permanently use Config.live.cleanlinessPct. */
  cleanlinessOverridePct: number | null;
}

export function roomVolumeM3(room: Pick<RoomConfig,'surfaceM2'|'ceilingHeightM'>): number {
  return room.surfaceM2*room.ceilingHeightM;
}

export function roomEnvelopeQuality(room: Pick<RoomConfig, 'surfaceM2' | 'ceilingHeightM' | 'heatLossWPerK' | 'envelopeQualityWPerM3K'>): number {
  return room.envelopeQualityWPerM3K ?? room.heatLossWPerK / roomVolumeM3(room);
}

type EnvelopeRoom = Pick<RoomConfig, 'surfaceM2' | 'ceilingHeightM' | 'heatLossWPerK' | 'envelopeQualityWPerM3K' | 'averageUValueWm2K' | 'envelopeAreaOverrideM2'> & { id?: string };
type EnvelopeGeometry = Pick<Config, 'rooms' | 'unitCount' | 'interzoneLinks'>;

/** Square-box estimate with shared surface removed once per inferred face.
 * Connections on the same face are treated as overlapping footprints: max,
 * never a summed deduction. Each deduction is capped to that face's area. */
export function roomExposedEnvelopeAreaM2(room: EnvelopeRoom, cfg?: EnvelopeGeometry): number {
  if (room.envelopeAreaOverrideM2 !== undefined && room.envelopeAreaOverrideM2 !== null) return room.envelopeAreaOverrideM2;
  const floor = room.surfaceM2, wall = Math.sqrt(floor) * room.ceilingHeightM;
  const deductions = { floor: 0, ceiling: 0, left: 0, right: 0 };
  const rooms = cfg?.rooms.slice(0, cfg.unitCount) ?? [], at = rooms.findIndex(candidate => candidate.id === room.id);
  if (at >= 0) for (const link of cfg?.interzoneLinks ?? []) {
    const neighbour = link.roomA === room.id ? link.roomB : link.roomB === room.id ? link.roomA : null;
    const neighbourAt = rooms.findIndex(candidate => candidate.id === neighbour);
    if (neighbourAt < 0 || neighbourAt === at) continue;
    const area = hasInterzoneGeometry(link) ? (link.openingAreaM2 ?? 0) + (link.contactAreaM2 ?? 0) : link.areaM2 ?? 0;
    // Persisted floor elevation identity also determines shared envelope faces.
    // Legacy links and same-level left/right inference retain stack ordering.
    const lower = link.lowerRoomId === link.roomA || link.lowerRoomId === link.roomB ? link.lowerRoomId : null;
    const face = link.orientation === 'horizontal' ? (neighbourAt < at ? 'left' : 'right')
      : lower ? (room.id === lower ? 'ceiling' : 'floor') : (neighbourAt < at ? 'ceiling' : 'floor');
    deductions[face] = Math.max(deductions[face], Math.min(area, face === 'floor' || face === 'ceiling' ? floor : wall));
  }
  return 2 * floor + 4 * wall - deductions.floor - deductions.ceiling - deductions.left - deductions.right;
}

export function roomAverageUValue(room: EnvelopeRoom, cfg?: EnvelopeGeometry): number {
  return room.averageUValueWm2K ?? roomEnvelopeConductanceWK(room) / roomExposedEnvelopeAreaM2(room, cfg);
}

/** One lumped envelope conductance. With modern U inputs, pass cfg to derive
 * exposed area; without cfg, use the store's synchronized whole-room cache. */
export function roomEnvelopeConductanceWK(room: EnvelopeRoom, cfg?: EnvelopeGeometry): number {
  if (room.averageUValueWm2K !== undefined) return cfg ? room.averageUValueWm2K * roomExposedEnvelopeAreaM2(room, cfg) : room.heatLossWPerK;
  return room.envelopeQualityWPerM3K === undefined ? room.heatLossWPerK : room.envelopeQualityWPerM3K * roomVolumeM3(room);
}

export interface VentilationConfig { mode: 'single' | 'dual'; grossACH: number; sensibleEfficiencyPct: number }
export function roomVentilation(room: Pick<RoomConfig, 'ventilationACH'>, cfg: Pick<Config, 'ventilation'>): { grossACH: number; recoveryEfficiency: number } {
  return { grossACH: room.ventilationACH ?? cfg.ventilation?.grossACH ?? .25,
    recoveryEfficiency: cfg.ventilation?.mode === 'dual' ? cfg.ventilation.sensibleEfficiencyPct / 100 : 0 };
}

/** Whole-house reference estimate: includes every active room even if its head
 * is Off. Ventilation uses nominal air volumetric heat capacity .34 Wh/(m³ K),
 * and sensible recovery, not the worker's actual moist-air/latent heat flux or a statutory rating. */
export function houseEnvelopeSummary(cfg: Pick<Config, 'rooms' | 'unitCount' | 'interzoneLinks' | 'ventilation'>): { envelopeWK: number; ventilationWK: number; totalWK: number } {
  const rooms = cfg.rooms.slice(0, cfg.unitCount);
  const envelopeWK = rooms.reduce((total, room) => total + roomEnvelopeConductanceWK(room, cfg), 0);
  const ventilationWK = rooms.reduce((total, room) => { const ventilation = roomVentilation(room, cfg);
    return total + .34 * roomVolumeM3(room) * ventilation.grossACH * (1 - ventilation.recoveryEfficiency); }, 0);
  return { envelopeWK, ventilationWK, totalWK: envelopeWK + ventilationWK };
}

/** Heat-exchanger cleanliness bounds [% clear air passage]: 100 clean, 10 means 90 % obstructed. */
export const CLEANLINESS_MIN_PCT = 10;
export const CLEANLINESS_MAX_PCT = 100;

export interface PipeConfig {
  /** One-way physical line length [m]; independent of drawn route. */
  lengthM: number;
  liquidOdMm: number;
  gasOdMm: number;
  lengthSource: LengthSource;
}

/** A general sensible connection. Area/coefficient are effective assumptions; direction describes the connection, not surface normal. */
export interface InterzoneLink {
  roomA: string;
  roomB: string;
  conductanceWK: number;
  /** Simultaneous, nonoverlapping air opening and insulated solid contact areas [m²]. */
  openingAreaM2?: number;
  contactAreaM2?: number;
  insulationMm?: number;
  /** Generic effective sensible coefficient for the opening, not an airflow/buoyancy solution. */
  openingTransferWm2K?: number;
  /** Geometry opening law; prescribed keeps legacy constant-H scenarios explicit. */
  openingModel?: 'buoyancy' | 'prescribed';
  backgroundConductanceWK?: number;
  openingHeightM?: number;
  lowerRoomId?: string;
  floorCoefficient?: number;
  wallDischargeCoefficient?: number;
  /** Explicit advanced whole-link H override; any thermal-geometry edit clears it. */
  conductanceOverrideWK?: number;
  /** Legacy exclusive-path inputs; modern links use both geometry paths above. */
  kind?: 'opening' | 'partition';
  orientation?: 'horizontal' | 'vertical';
  areaM2?: number;
  transferWm2K?: number;
}

export const INTERZONE_GEOMETRY_DEFAULTS = { openingAreaM2: 4, contactAreaM2: 45, insulationMm: 120, openingTransferWm2K: 40, openingModel: 'buoyancy', backgroundConductanceWK: 0, openingHeightM: 2, floorCoefficient: .055, wallDischargeCoefficient: .6 } as const;
/** Declared representative glass-wool conductivity and combined surface-film resistance, not measured layers. */
export const INTERZONE_GLASS_WOOL_LAMBDA_WMK = .040;
export const INTERZONE_FILM_RESISTANCE_M2KW = .26;

export function hasInterzoneGeometry(link: InterzoneLink): boolean {
  return link.openingAreaM2 !== undefined || link.contactAreaM2 !== undefined || link.insulationMm !== undefined || link.openingTransferWm2K !== undefined;
}

/** Solid conduction remains bidirectional regardless of gravitational stability. */
export function interzoneSolidConductance(link: InterzoneLink): number {
  return (link.contactAreaM2 ?? 0) / (INTERZONE_FILM_RESISTANCE_M2KW + (link.insulationMm ?? INTERZONE_GEOMETRY_DEFAULTS.insulationMm) / 1000 / INTERZONE_GLASS_WOOL_LAMBDA_WMK);
}

export function usesBuoyancyOpening(link: InterzoneLink): boolean {
  return hasInterzoneGeometry(link) && link.openingModel !== 'prescribed' && link.conductanceOverrideWK === undefined;
}

/** Prescribed total H, or base H before temperature-dependent buoyancy. Never a frozen buoyancy estimate. */
export function interzoneConductance(link: InterzoneLink): number {
  if (link.conductanceOverrideWK !== undefined) return link.conductanceOverrideWK;
  if (hasInterzoneGeometry(link)) return interzoneSolidConductance(link) + (link.openingModel === 'prescribed'
    ? (link.openingAreaM2 ?? 0) * (link.openingTransferWm2K ?? INTERZONE_GEOMETRY_DEFAULTS.openingTransferWm2K)
    : (link.openingAreaM2 ?? 0) > 0 ? link.backgroundConductanceWK ?? 0 : 0);
  return link.areaM2 !== undefined && link.transferWm2K !== undefined
    ? link.areaM2 * link.transferWm2K : link.conductanceWK;
}

/** Frontend geometry maps to solid H plus an optional physical opening law. */
export function engineInterzoneLink(link: InterzoneLink, roomOrder: readonly string[]): EngineInterzoneLink {
  if (!usesBuoyancyOpening(link)) return { roomA: link.roomA, roomB: link.roomB, conductanceWK: interzoneConductance(link) };
  return { roomA: link.roomA, roomB: link.roomB, conductanceWK: interzoneSolidConductance(link), openingExchange: {
    orientation: link.orientation ?? 'vertical', areaM2: link.openingAreaM2 ?? 0,
    lowerRoomId: link.lowerRoomId ?? (roomOrder.indexOf(link.roomA) > roomOrder.indexOf(link.roomB) ? link.roomA : link.roomB),
    heightM: link.openingHeightM ?? INTERZONE_GEOMETRY_DEFAULTS.openingHeightM,
    backgroundConductanceWK: (link.openingAreaM2 ?? 0) > 0 ? link.backgroundConductanceWK ?? 0 : 0,
    floorCoefficient: link.floorCoefficient ?? INTERZONE_GEOMETRY_DEFAULTS.floorCoefficient,
    wallDischargeCoefficient: link.wallDischargeCoefficient ?? INTERZONE_GEOMETRY_DEFAULTS.wallDischargeCoefficient,
  } };
}

export interface Config {
  mode: Mode;
  /** Examples experience only; the live engine chooses its own operating state. */
  example: ExampleState;
  outdoorKind: OutdoorKind;
  /** Selected published cooling high-fan volume flow. Absent uses editable generic air mass flow. */
  outdoorVolumetricAirFlowM3s?: number;
  /** Declared connection capacity of the generic group; a scenario assumption, not manufacturer data. */
  genericPortCapacity: number;
  unitCount: number;
  outdoorC: number;
  outdoorRh: number;
  /** Compressor isentropic efficiency [%]. */
  etaIsPct: number;
  rooms: RoomConfig[];
  pipes: PipeConfig[];
  /** Symmetric effective sensible interzone conductance; room identities survive reorder/removal. */
  interzoneLinks?: InterzoneLink[];
  /** Global gross air exchange and sensible-only recovery; no humidity recovery. */
  ventilation?: VentilationConfig;
  /** Generic live-engine assumptions (not manufacturer-calibrated); ignored by the examples. */
  live: LiveParameters;
}

export interface UiState {
  experience: Experience;
  speed: SpeedFactor;
  paused: boolean;
  selected: string | null;
  tab: SidebarTab;
  pressure: PressureConvention;
  zoom: ZoomPreset;
  showTaps: boolean;
  showLabels: boolean;
  notice: string | null;
}

/** A manufacturer's connection limit or the generic group's explicit capacity assumption. */
export function outdoorPortCapacity(cfg: Pick<Config, 'outdoorKind' | 'genericPortCapacity'>): number {
  return outdoorModelInfo(cfg).ports ?? cfg.genericPortCapacity;
}

export interface AppState {
  cfg: Config;
  ui: UiState;
}

export interface IndoorClassInfo {
  label: string;
  nominalKw: number | null;
  generic: boolean;
  /** Relative weight for illustrative branch allocation (fixture uses 0.30/0.40/0.30 for 25/35/25). */
  weight: number;
}

export const INDOOR_CLASSES: Record<IndoorClass, IndoorClassInfo> = {
  FTXA25: { label: 'Daikin FTXA25 (suffix unknown)', nominalKw: 2.5, generic: false, weight: 0.3 },
  FTXA35: { label: 'Daikin FTXA35 (suffix unknown)', nominalKw: 3.5, generic: false, weight: 0.4 },
  G25: { label: 'Generic wall head 2.5 kW class', nominalKw: 2.5, generic: true, weight: 0.3 },
  G35: { label: 'Generic wall head 3.5 kW class', nominalKw: 3.5, generic: true, weight: 0.4 },
  G50: { label: 'Generic wall head 5.0 kW class', nominalKw: 5.0, generic: true, weight: 0.5 },
  ...Object.fromEntries(CATALOGUE_INDOORS.map(model => [model.id, {
    label: `${equipmentManufacturerLabel(model.manufacturer)} ${model.id}${'nominalCoolingKw' in model ? '' : ' (capacity depends on pairing)'}`,
    nominalKw: 'nominalCoolingKw' in model ? model.nominalCoolingKw : null,
    generic: false, weight: 'nominalCoolingKw' in model ? model.nominalCoolingKw / 10 : 1,
  }])) as Record<CatalogueIndoorClass, IndoorClassInfo>,
};

/** Published case dimensions [mm] (Daikin Central Europe 2019–20 catalogue; family data, not tape measurements). */
export const OUTDOOR_CASE_MM = { h: 734, w: 958, d: 340 } as const;
export const INDOOR_CASE_MM = { h: 295, w: 798, d: 189 } as const;
