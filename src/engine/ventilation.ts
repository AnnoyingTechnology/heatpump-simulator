import { DomainError, Properties } from './properties.ts';

/** Balanced dry-air exchange with prescribed sensible Cmin effectiveness.
 * Only actual inlet gas properties are queried. Exchanger condensation/frost,
 * moisture transfer, bypass and ventilation fan power are not resolved here. */
export function ventilationExchange(properties: Properties, dryAirFlowKgs: number,
  roomTemperatureC: number, roomHumidityRatio: number, outdoorTemperatureC: number,
  outdoorHumidityRatio: number, pressurePa: number, recoveryEfficiency = 0,
  outdoorEnthalpyJkg = properties.airH(outdoorTemperatureC, outdoorHumidityRatio, pressurePa), outdoorCpJkgDryK?: number) {
  const grossHeatW = dryAirFlowKgs * (outdoorEnthalpyJkg
    - properties.airH(roomTemperatureC, roomHumidityRatio, pressurePa));
  let recoveredSensibleW = 0;
  if (recoveryEfficiency > 0 && dryAirFlowKgs > 0) {
    const cpOutdoor = outdoorCpJkgDryK ?? properties.airCp(outdoorTemperatureC, outdoorHumidityRatio, pressurePa);
    const cpRoom = properties.airCp(roomTemperatureC, roomHumidityRatio, pressurePa);
    if (!(cpOutdoor > 0 && cpRoom > 0)) throw new DomainError('Ventilation inlet heat capacities must be positive');
    recoveredSensibleW = recoveryEfficiency * Math.min(dryAirFlowKgs * cpOutdoor, dryAirFlowKgs * cpRoom)
      * (roomTemperatureC - outdoorTemperatureC);
  }
  return { heatToRoomW: grossHeatW + recoveredSensibleW,
    waterToRoomKgs: dryAirFlowKgs * (outdoorHumidityRatio - roomHumidityRatio), recoveredSensibleW };
}
