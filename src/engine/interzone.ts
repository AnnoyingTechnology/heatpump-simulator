import { DomainError } from './properties.ts';
import type { EngineConfig, EngineInterzoneLink, InterzoneTransfer } from './types.ts';

/** Declared representative air constants for sensible opening equivalence only.
 * Thermal storage still uses the native moist-air enthalpy/phase model. */
export const OPENING_AIR_DENSITY_KGM3 = 1.2;
export const OPENING_AIR_CP_JKGK = 1006;
const GRAVITY_MS2 = 9.81;

/** Optional geometry is validated before accepting a configuration, never clipped. */
export function validateOpeningExchange(link: EngineInterzoneLink): void {
  const opening = link.openingExchange;
  if (opening === undefined) return;
  if (!opening || !['vertical', 'horizontal'].includes(opening.orientation)) throw new DomainError('Opening exchange requires vertical or horizontal orientation');
  for (const value of [opening.areaM2, opening.backgroundConductanceWK ?? 0, opening.floorCoefficient ?? .055, opening.wallDischargeCoefficient ?? .6]) {
    if (!(Number.isFinite(value) && value >= 0)) throw new DomainError('Opening areas, coefficients and background conductance must be finite and nonnegative');
  }
  // Null is not an omitted coefficient and cannot silently select the default.
  for (const key of ['backgroundConductanceWK', 'floorCoefficient', 'wallDischargeCoefficient'] as const) {
    if (opening[key] !== undefined && !(typeof opening[key] === 'number' && Number.isFinite(opening[key]) && opening[key]! >= 0)) throw new DomainError('Opening coefficients must be finite and nonnegative');
  }
  if (opening.orientation === 'vertical' && opening.lowerRoomId !== link.roomA && opening.lowerRoomId !== link.roomB) throw new DomainError('Vertical opening lowerRoomId must be one of its endpoints');
  if (opening.orientation === 'horizontal' && !(Number.isFinite(opening.heightM) && opening.heightM! > 0)) throw new DomainError('Horizontal opening height must be finite and positive');
  if (opening.heightM !== undefined && !(typeof opening.heightM === 'number' && Number.isFinite(opening.heightM) && opening.heightM > 0)) throw new DomainError('Opening height must be finite and positive');
  const scale = opening.orientation === 'vertical'
    ? (opening.floorCoefficient ?? .055) * opening.areaM2 ** 1.25
    : (opening.wallDischargeCoefficient ?? .6) / 3 * opening.areaM2 * Math.sqrt(opening.heightM!);
  if (!Number.isFinite(scale * OPENING_AIR_DENSITY_KGM3 * OPENING_AIR_CP_JKGK)
    || !Number.isFinite(link.conductanceWK + (opening.backgroundConductanceWK ?? 0))) throw new DomainError('Opening exchange rate exceeds finite numerical domain');
}

/** One common edge law for physical powers, diagnostics and target feedforward.
 * Positive Q always means A supplies B. Legacy arithmetic/output are preserved. */
export function interzoneEdgeTransfer(link: EngineInterzoneLink, temperatureA: number, temperatureB: number): InterzoneTransfer {
  const difference = temperatureA - temperatureB;
  const legacy = { roomA: link.roomA, roomB: link.roomB, heatFromAToBW: link.conductanceWK * difference };
  const opening = link.openingExchange;
  if (!opening) return legacy;
  const meanK = 273.15 + (temperatureA + temperatureB) / 2;
  if (!(Number.isFinite(temperatureA) && Number.isFinite(temperatureB) && temperatureA > -273.15 && temperatureB > -273.15)) throw new DomainError('Opening temperatures must be finite above absolute zero');
  const verticalDifference = opening.lowerRoomId === link.roomA ? difference : -difference;
  const driveK = opening.orientation === 'vertical' ? Math.max(0, verticalDifference) : Math.abs(difference);
  const reducedGravity = GRAVITY_MS2 * driveK / meanK;
  const flow = opening.orientation === 'vertical'
    ? (opening.floorCoefficient ?? .055) * opening.areaM2 ** 1.25 * Math.sqrt(reducedGravity)
    : (opening.wallDischargeCoefficient ?? .6) / 3 * opening.areaM2 * Math.sqrt(reducedGravity * opening.heightM!);
  const buoyancyH = OPENING_AIR_DENSITY_KGM3 * OPENING_AIR_CP_JKGK * flow;
  const backgroundH = opening.backgroundConductanceWK ?? 0;
  const effectiveH = link.conductanceWK + backgroundH + buoyancyH;
  const heat = effectiveH * difference;
  if (![flow, buoyancyH, effectiveH, heat].every(Number.isFinite)) throw new DomainError('Opening exchange power exceeds finite numerical domain');
  return { ...legacy, heatFromAToBW: heat, solidHeatFromAToBW: legacy.heatFromAToBW,
    backgroundHeatFromAToBW: backgroundH * difference, buoyancyHeatFromAToBW: buoyancyH * difference,
    effectiveConductanceWK: effectiveH, equivalentExchangeM3s: flow,
    buoyancyState: difference === 0 ? 'neutral' : opening.orientation === 'horizontal' ? 'wall-exchange' : verticalDifference > 0 ? 'unstable' : 'stable' };
}

/** Instantaneous sensible link powers; positive values mean room A supplies B. */
export function interzoneTransfers(config: EngineConfig, temperatures: number[]): InterzoneTransfer[] {
  const indices = new Map(config.rooms.map((room, i) => [room.id, i]));
  return (config.interzoneLinks ?? []).map(link => interzoneEdgeTransfer(link, temperatures[indices.get(link.roomA)!], temperatures[indices.get(link.roomB)!]));
}

/** All edges use a common pre-step state and equal/opposite sensible powers. */
export function interzoneHeatPowers(config: EngineConfig, temperatures: number[]): number[] {
  const powers = config.rooms.map(() => 0);
  const indices = new Map(config.rooms.map((room, i) => [room.id, i]));
  for (const link of interzoneTransfers(config, temperatures)) {
    const a = indices.get(link.roomA)!, b = indices.get(link.roomB)!;
    powers[a] -= link.heatFromAToBW; powers[b] += link.heatFromAToBW;
  }
  return powers;
}

/** Opening-only adaptive bound. H is evaluated at the shared pre-step state;
 * dt*sum(H)/C <= 1/4 keeps the isolated network update a convex relaxation.
 * Capacities use a conservative dry-air bound supplied by the engine; latent
 * storage increases apparent capacity. No exchange power/area is clipped.
 * Legacy-only configurations retain their original timestep exactly. */
export function openingExchangeMaxStepSeconds(config: EngineConfig, temperatures: number[], capacitiesJK: number[]): number {
  if (!config.interzoneLinks?.some(link => link.openingExchange !== undefined)) return Infinity;
  const indices = new Map(config.rooms.map((room, i) => [room.id, i])), incidentH = config.rooms.map(() => 0);
  const transfers = interzoneTransfers(config, temperatures);
  for (const [edgeIndex, transfer] of transfers.entries()) {
    const a = indices.get(transfer.roomA)!, b = indices.get(transfer.roomB)!;
    const link = config.interzoneLinks![edgeIndex];
    const h = transfer.effectiveConductanceWK ?? link.conductanceWK;
    incidentH[a] += h; incidentH[b] += h;
  }
  let step = Infinity;
  for (let i = 0; i < incidentH.length; i++) if (incidentH[i] > 0) step = Math.min(step, .25 * capacitiesJK[i] / incidentH[i]);
  if (!(step > 1e-9)) throw new DomainError('Opening exchange requires a substep below the supported numerical time resolution');
  return step;
}

/** Substitute only the assessed room target; neighbours retain actual T and
 * physical lower/upper identities remain fixed. Off-neighbour targets are unused. */
export function interzoneTargetLosses(config: EngineConfig, temperatures: number[]): number[] {
  const losses = config.rooms.map(() => 0);
  const indices = new Map(config.rooms.map((room, i) => [room.id, i]));
  for (const link of config.interzoneLinks ?? []) {
    const a = indices.get(link.roomA)!, b = indices.get(link.roomB)!;
    // Disabled heads have no prospective service target. Preserve the original
    // legacy arithmetic, but never evaluate an unused Off target in opening mode.
    if (!link.openingExchange || config.rooms[a].enabled) losses[a] += interzoneEdgeTransfer(link, config.rooms[a].setpointC, temperatures[b]).heatFromAToBW;
    if (!link.openingExchange || config.rooms[b].enabled) losses[b] -= interzoneEdgeTransfer(link, temperatures[a], config.rooms[b].setpointC).heatFromAToBW;
  }
  return losses;
}
