/** Symmetric comfort hysteresis: error = target − air in heating, air − target
 * in cooling. The stored call survives the band; explicit Off always wins. */
export function thermostatDemand(enabled: boolean, errorK: number, active: boolean, marginK: number): boolean {
  return enabled && (active ? errorK > -marginK : errorK >= marginK && errorK > 0);
}

/** A new/explicitly enabled unit has no prior thermostat history: choose the
 * calling side at or beyond target. Subsequent restart uses the full margin. */
export function initialThermostatDemand(enabled: boolean, errorK: number): boolean {
  return enabled && errorK >= 0;
}

/** Generic inverter fan command, not an OEM fan map. Calling units retain a
 * 25% airflow minimum and modulate continuously to full flow across the band. */
export function thermostatFanFraction(calling: boolean, errorK: number, marginK: number): number {
  if (!calling) return 0;
  if (marginK === 0) return 1;
  return .25 + .75 * Math.max(0, Math.min(1, (errorK + marginK) / (2 * marginK)));
}
