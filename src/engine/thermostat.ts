/** error = target − air in heating, air − target in cooling. Explicit Off always wins. */
export function thermostatDemand(enabled: boolean, errorK: number, active: boolean, restartMarginK: number): boolean {
  return enabled && (active ? errorK > 0 : errorK > 0 && errorK >= restartMarginK);
}
