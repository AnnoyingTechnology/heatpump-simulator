import type { EngineConfig, InterzoneTransfer } from './types.ts';

/** Instantaneous sensible link powers; positive values mean room A supplies B. */
export function interzoneTransfers(config: EngineConfig, temperatures: number[]): InterzoneTransfer[] {
  const indices = new Map(config.rooms.map((room, i) => [room.id, i]));
  return (config.interzoneLinks ?? []).map(link => ({ roomA: link.roomA, roomB: link.roomB,
    heatFromAToBW: link.conductanceWK * (temperatures[indices.get(link.roomA)!] - temperatures[indices.get(link.roomB)!]) }));
}

/** Prescribed sensible exchange between room air nodes, evaluated from one
 * common pre-step state. Each edge contributes equal/opposite heat powers;
 * it cannot add energy or transport water to the whole-house boundary. */
export function interzoneHeatPowers(config: EngineConfig, temperatures: number[]): number[] {
  const powers = config.rooms.map(() => 0);
  const indices = new Map(config.rooms.map((room, i) => [room.id, i]));
  for (const link of interzoneTransfers(config, temperatures)) {
    const a = indices.get(link.roomA)!, b = indices.get(link.roomB)!;
    powers[a] -= link.heatFromAToBW; powers[b] += link.heatFromAToBW;
  }
  return powers;
}

/** Controller feedforward: each room's loss if that room reached its target,
 * with its neighbours at their actual measured temperatures. A disabled room
 * remains a physical thermal node, whose unused target is never a boundary. */
export function interzoneTargetLosses(config: EngineConfig, temperatures: number[]): number[] {
  const losses = config.rooms.map(() => 0);
  const indices = new Map(config.rooms.map((room, i) => [room.id, i]));
  for (const link of config.interzoneLinks ?? []) {
    const a = indices.get(link.roomA)!, b = indices.get(link.roomB)!;
    losses[a] += link.conductanceWK * (config.rooms[a].setpointC - temperatures[b]);
    losses[b] += link.conductanceWK * (config.rooms[b].setpointC - temperatures[a]);
  }
  return losses;
}
