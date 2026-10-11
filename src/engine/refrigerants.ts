/** Property coverage belongs to the generic compatible circuit, never to a retrofit or OEM performance claim. */
export type RefrigerantId = 'R22' | 'R407C' | 'R410A' | 'R32' | 'R290' | 'R134a' | 'R1234yf';
export interface RefrigerantDefinition {
  id: RefrigerantId;
  backendFluid: string;
  kind: 'pure' | 'pseudo-pure' | 'zeotropic';
  /** Original standard blend composition on a mass basis; the native state converts it. */
  massFractions?: Readonly<Record<string, number>>;
  source: string;
  qualification: { reference: boolean; physicalLines: boolean; physicalLineModes: readonly ('heating' | 'cooling')[]; inventory: boolean; limitation: string | null };
  /** Selected computational envelope, narrower than the EOS validity range; not an appliance pressure rating. */
  domain: { minPressurePa: number; maxPressurePa: number; minTemperatureC: number; maxTemperatureC: number; minEvaporatingC: number; maxEvaporatingC: number; minCondensingC: number; maxCondensingC: number };
}
const domain = { minPressurePa: 5e4, maxPressurePa: 5e6, minTemperatureC: -60, maxTemperatureC: 160,
  minEvaporatingC: -40, maxEvaporatingC: 45, minCondensingC: -5, maxCondensingC: 65 };
const pure = (id: RefrigerantId, backendFluid: string = id, maxPressurePa = 5e6, maxTemperatureC = 160): RefrigerantDefinition => ({ id, backendFluid, kind: 'pure',
  source: `https://coolprop.org/fluid_properties/fluids/${backendFluid}.html`, domain: { ...domain, maxPressurePa, maxTemperatureC },
  qualification: { reference: true, physicalLines: id === 'R32', physicalLineModes: id === 'R32' ? ['heating','cooling'] : [], inventory: id === 'R32',
    limitation: id === 'R32' ? null : 'Conserved inventory and the complete physical field-line circuit, including reverse-cycle defrost, are qualified for R32 only.' } });
const blend = (id: 'R407C' | 'R410A', massFractions: Record<string, number>): RefrigerantDefinition => ({
  id, backendFluid: `${id}-mix`, kind: 'zeotropic', massFractions,
  source: 'https://coolprop.org/fluid_properties/Mixtures.html', domain: { ...domain, maxPressurePa: id === 'R407C' ? 4e6 : 4.7e6 },
  qualification: { reference: false, physicalLines: false, physicalLineModes: [], inventory: false,
    limitation: 'Resolved blend property states are available; coupled glide-aware coil/control and phase-composition transport qualification is pending.' },
});
function frozen(definition: RefrigerantDefinition): RefrigerantDefinition {
  Object.freeze(definition.domain);
  Object.freeze(definition.qualification.physicalLineModes);
  Object.freeze(definition.qualification);
  if (definition.massFractions) Object.freeze(definition.massFractions);
  return Object.freeze(definition);
}
const definitions: Record<RefrigerantId, RefrigerantDefinition> = {
  R22: pure('R22', 'R22', 4.8e6), R407C: blend('R407C', { R32: .23, R125: .25, R134a: .52 }),
  R410A: { ...blend('R410A', { R32: .5, R125: .5 }), backendFluid: 'R410A', kind: 'pseudo-pure',
    source: 'https://coolprop.org/fluid_properties/fluids/R410A.html',
    qualification: { reference: true, physicalLines: false, physicalLineModes: [], inventory: false, limitation: 'Fixed-composition pseudo-pure EOS preserves small bubble/dew glide; phase compositions/fractionation and physical field lines are not qualified.' } }, R32: pure('R32'),
  R290: pure('R290', 'n-Propane', 4e6), R134a: pure('R134a', 'R134a', 3.8e6), R1234yf: pure('R1234yf', 'R1234yf', 3.2e6, 136.85),
};
Object.values(definitions).forEach(frozen);
export const REFRIGERANTS: Readonly<Record<RefrigerantId, RefrigerantDefinition>> = Object.freeze(definitions);
export function refrigerantDefinition(id: RefrigerantId): RefrigerantDefinition {
  const definition = REFRIGERANTS[id];
  if (!Object.hasOwn(REFRIGERANTS,id)) throw new Error(`Unknown refrigerant ${String(id)}`);
  return definition;
}
