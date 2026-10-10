import type { LiveParameters } from './runtime/config';

/** Shared types. Configuration (what the user edits) is kept apart from fixtures (illustrative readings). */

export type Mode = 'heating' | 'cooling';
/** Which reading source drives the whole interface: the real worker engine or the constructed example snapshots. */
export type Experience = 'live' | 'examples';
export type ExampleState = 'normal' | 'frost' | 'defrost' | 'idle';
export type SpeedFactor = 0.5 | 1 | 2 | 5 | 10;
export type OutdoorKind = 'owner' | 'generic';
export type IndoorClass = 'FTXA25' | 'FTXA35' | 'G25' | 'G35' | 'G50';
export type PressureConvention = 'abs' | 'gauge';
export type LengthSource = 'owner-reported' | 'default' | 'edited';
export type SidebarTab = 'rooms' | 'equipment' | 'pipes' | 'advanced';
export type DrawerTab = 'diagnostics' | 'fixtures' | 'provenance';
export type ZoomPreset = 'overview' | 'outdoor' | 'rooms';

export const MAX_UNITS = 5;
export const OWNER_PORTS = 3;

export interface RoomConfig {
  id: string;
  name: string;
  /** Requested indoor-unit operation. Room/envelope storage remains simulated when off. */
  enabled: boolean;
  /** Interior volume [m³]. */
  volumeM3: number;
  /** Envelope heat-loss coefficient [W/K]; configuration only. */
  heatLossWPerK: number;
  setpointC: number;
  /** Room air temperature INPUT [°C]; never fed by the fixture air readings. */
  airC: number;
  indoorClass: IndoorClass;
  /** Heat-exchanger clear-air-passage override [% clear, 10–100]; null inherits Config.live.cleanlinessPct. */
  cleanlinessOverridePct: number | null;
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

export interface Config {
  mode: Mode;
  /** Examples experience only; the live engine chooses its own operating state. */
  example: ExampleState;
  outdoorKind: OutdoorKind;
  unitCount: number;
  outdoorC: number;
  outdoorRh: number;
  /** Compressor isentropic efficiency [%]. */
  etaIsPct: number;
  rooms: RoomConfig[];
  pipes: PipeConfig[];
  /** Generic live-engine assumptions (not manufacturer-calibrated); ignored by the examples. */
  live: LiveParameters;
}

export interface UiState {
  experience: Experience;
  speed: SpeedFactor;
  paused: boolean;
  selected: string | null;
  tab: SidebarTab;
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  pressure: PressureConvention;
  zoom: ZoomPreset;
  showTaps: boolean;
  showLabels: boolean;
  notice: string | null;
}

export interface AppState {
  cfg: Config;
  ui: UiState;
}

export interface IndoorClassInfo {
  label: string;
  nominalKw: number;
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
};

/** Published case dimensions [mm] (Daikin Central Europe 2019–20 catalogue; family data, not tape measurements). */
export const OUTDOOR_CASE_MM = { h: 734, w: 958, d: 340 } as const;
export const INDOOR_CASE_MM = { h: 295, w: 798, d: 189 } as const;
