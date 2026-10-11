/** Read-only URL inputs for a new session. Unspecified values keep the selected default house. */
export interface RoomPreconfiguration { id: string; setpointC?: number; airC?: number; enabled?: boolean }
export interface Preconfiguration {
  outdoorC?: number; outdoorRh?: number; mode?: 'heating' | 'cooling';
  rooms: RoomPreconfiguration[]; applied: string[]; issues: string[];
}

/** Query parameters apply first; an explicit fragment parameter overrides that key.
 * Duplicate keys within either source are rejected rather than guessed. */
export function readPreconfiguration(url: URL, roomIds: readonly string[]): Preconfiguration {
  const result: Preconfiguration = { rooms: [], applied: [], issues: [] };
  const values = new Map<string, string>();
  const keys = new Set(['outdoor', 'humidity', 'mode', ...roomIds.flatMap(id => [`room.${id}.target`, `room.${id}.temperature`, `room.${id}.enabled`])]);
  const all = [url.searchParams, new URLSearchParams(url.hash.replace(/^#\??/, ''))];
  for (const params of all) for (const key of new Set(params.keys())) {
    if (!keys.has(key)) continue;
    const entries = params.getAll(key);
    if (entries.length !== 1) { values.delete(key); result.issues.push(`Duplicate ${key}`); }
    else values.set(key, entries[0]);
  }
  // Unknown room keys are usually an integration typo, unlike unrelated page parameters.
  for (const params of all) for (const key of params.keys()) if (key.startsWith('room.') && !keys.has(key)) result.issues.push(`Unknown room parameter ${key}`);
  const number = (key: string, min: number, max: number): number | undefined => {
    const raw = values.get(key); if (raw === undefined) return undefined;
    const n = raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) { result.issues.push(`${key} must be ${min}…${max}`); return undefined; }
    result.applied.push(key); return n;
  };
  result.outdoorC = number('outdoor', -25, 45);
  result.outdoorRh = number('humidity', 0, 100);
  const mode = values.get('mode');
  if (mode !== undefined) {
    if (mode === 'heating' || mode === 'cooling') { result.mode = mode; result.applied.push('mode'); }
    else result.issues.push('mode must be heating or cooling');
  }
  for (const id of roomIds) {
    const r: RoomPreconfiguration = { id, setpointC: number(`room.${id}.target`, 16, 30), airC: number(`room.${id}.temperature`, 5, 35) };
    const key = `room.${id}.enabled`, raw = values.get(key);
    if (raw !== undefined) {
      if (['1', 'true', 'on', '0', 'false', 'off'].includes(raw)) { r.enabled = ['1', 'true', 'on'].includes(raw); result.applied.push(key); }
      else result.issues.push(`${key} must be on or off`);
    }
    if (r.setpointC !== undefined || r.airC !== undefined || r.enabled !== undefined) result.rooms.push(r);
  }
  return result;
}
