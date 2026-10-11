import { CATALOGUE_INDOORS, CATALOGUE_OUTDOORS } from './equipment-data';
import { validateMultisplitInstallation, type MultisplitInstallation } from './equipment-topology';
import type { Config, IndoorClass, OutdoorKind } from './types';

export type EquipmentManufacturer = 'daikin' | 'mitsubishi-electric' | 'generic';
export function equipmentManufacturerLabel(manufacturer: EquipmentManufacturer): string {
  return manufacturer === 'daikin' ? 'Daikin' : manufacturer === 'mitsubishi-electric' ? 'Mitsubishi Electric' : 'Generic';
}

export interface OutdoorModelInfo {
  id: OutdoorKind;
  label: string;
  manufacturer: EquipmentManufacturer;
  /** Null means the generic group's user-declared port limit. */
  ports: number | null;
  compatibleIndoorClasses: readonly IndoorClass[];
  caseMm: { h: number; w: number; d: number };
  profileNote: string;
  /** Published cooling high-fan airflow; heating reuse is an explicit assumption. */
  coolingHighFanFlowM3h?: number;
  acceptance: 'owner-reference' | 'generic-assumption' | 'reviewed-fields';
  sourceStatus?: 'legacy' | 'availability-unknown';
  /** Region where the exact source applies, without claiming local retail availability. */
  marketScope?: string;
  publishedOperatingRangesC?: { cooling: { minimum: number | null; maximum: number | null; condition: string }; heating: { minimum: number | null; maximum: number | null; condition: string } };
  /** Necessary installation rules; exact full-SKU eligibility remains unknown. */
  installation?: MultisplitInstallation;
}

const baseIndoor: readonly IndoorClass[] = ['FTXA25', 'FTXA35', 'G25', 'G35', 'G50'];
const PROFILE_NOTE = 'Published matched split, casing and cooling high-fan airflow. Heating uses that airflow as an assumption; compressor, coil conductance and fan watts remain generic. This is not an OEM performance map.';

export const OUTDOOR_MODELS: readonly OutdoorModelInfo[] = [
  { id: 'owner', label: 'Daikin 3MXM52N8', manufacturer: 'daikin', ports: 3,
    compatibleIndoorClasses: ['FTXA25', 'FTXA35'], caseMm: { h: 734, w: 958, d: 340 },
    acceptance: 'owner-reference', profileNote: 'Owner-declared 3MXM52N8 with FTXA25/35 heads (indoor suffix unknown). Generic R32 performance assumptions; no OEM performance map.' },
  { id: 'generic', label: 'Generic editable outdoor', manufacturer: 'generic', ports: null,
    compatibleIndoorClasses: [...baseIndoor, ...CATALOGUE_INDOORS.map(m => m.id)], caseMm: { h: 734, w: 958, d: 340 },
    acceptance: 'generic-assumption', profileNote: 'User-defined port capacity and generic compatible equipment assumptions. Manufacturer pairing is not asserted.' },
  ...CATALOGUE_OUTDOORS.map(profile => ({
    id: profile.id, label: `${equipmentManufacturerLabel(profile.manufacturer)} ${profile.id}`, manufacturer: profile.manufacturer,
    ports: profile.ports, compatibleIndoorClasses: profile.compatibleIndoorClasses,
    caseMm: profile.caseMm, coolingHighFanFlowM3h: profile.coolingHighFanFlowM3h ?? undefined,
    installation: 'installation' in profile ? profile.installation : undefined,
    sourceStatus: 'sourceStatus' in profile ? profile.sourceStatus : undefined,
    marketScope: 'marketScope' in profile ? profile.marketScope : undefined,
    acceptance: profile.acceptance, profileNote: 'installation' in profile
      ? profile.installation.ports === null
      ? 'Published legacy reference, casing, R32 and maximum connected head count. Minimum count, named ports, class/reducer rules and exact indoor eligibility remain unknown. Outdoor high-fan airflow and the cycle use editable generic assumptions; no OEM charge or performance map is applied.'
      : 'Published casing, named ports and necessary connection-class/reducer constraints. Exact indoor full-reference combinations remain unverified. Outdoor airflow, compressor, coil conductance, fan watts and performance remain editable generic assumptions. Published total-charge limits are documentary and do not calibrate the generic circuit.'
      : profile.coolingHighFanFlowM3h === null
      ? 'Published matched split, casing and operating-range metadata. Outdoor airflow is unpublished in the reviewed table and uses the editable generic mass-flow setting; compressor, coil conductance and fan watts remain generic. This is not an OEM performance map.'
      : PROFILE_NOTE,
    publishedOperatingRangesC: profile.publishedOperatingRangesC,
  })),
];

export function outdoorModelInfo(input: OutdoorKind | Pick<Config, 'outdoorKind'>): OutdoorModelInfo {
  const id = typeof input === 'string' ? input : input.outdoorKind;
  const model = OUTDOOR_MODELS.find(m => m.id === id);
  if (!model) throw new Error(`Unknown outdoor equipment reference: ${id}`);
  return model;
}

export function indoorModelProfile(indoor: IndoorClass) {
  return CATALOGUE_INDOORS.find(model => model.id === indoor);
}

export function indoorOptionsForOutdoor(outdoor: OutdoorKind): { value: IndoorClass; text: string; manufacturer: EquipmentManufacturer }[] {
  const model = outdoorModelInfo(outdoor);
  const candidates: readonly IndoorClass[] = model.installation
    ? ['FTXA25', 'FTXA35', ...CATALOGUE_INDOORS.filter(m => m.manufacturer === 'daikin').map(m => m.id)]
    : model.compatibleIndoorClasses;
  return candidates.map(value => {
    const profile = indoorModelProfile(value);
    const ownerHead = value === 'FTXA25' || value === 'FTXA35';
    const manufacturer: EquipmentManufacturer = profile?.manufacturer ?? (ownerHead ? 'daikin' : 'generic');
    return { value, manufacturer,
      text: (profile ? `${equipmentManufacturerLabel(manufacturer)} ${value}${'marketScope' in profile ? ' (availability unverified)' : ''}${profile.coolingHighFanFlowM3h === null ? ' (airflow unpublished; generic/manual)' : ''}`
        : ownerHead ? `Daikin ${value} (suffix unknown)`
        : `Generic wall head ${value === 'G25' ? '2.5' : value === 'G35' ? '3.5' : '5.0'} kW class`) + (model.installation ? ' — combination unverified' : '') };
  });
}

export function currentInstallationValidation(cfg: Config) {
  const installation = outdoorModelInfo(cfg).installation;
  if (!installation) return undefined;
  return validateMultisplitInstallation(installation, cfg.rooms.slice(0, cfg.unitCount).map(room => ({
    id: room.id, enabled: room.enabled, installation: room.installation,
    manufacturer: indoorModelProfile(room.indoorClass)?.manufacturer ?? (room.indoorClass.startsWith('FTXA') ? 'daikin' : 'generic'),
  })));
}

/** Profile identity/pairing selects only published or explicitly assumed inputs. */
export function applyIndoorProfile(room: Config['rooms'][number], indoor: IndoorClass): void {
  room.indoorClass = indoor;
  const profile = indoorModelProfile(indoor);
  if (profile && profile.coolingHighFanFlowM3h !== null) room.volumetricAirFlowM3s = profile.coolingHighFanFlowM3h / 3600;
  else delete room.volumetricAirFlowM3s;
}
