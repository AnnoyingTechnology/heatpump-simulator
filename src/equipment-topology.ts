/** Installation constraints are separate from the generic thermodynamic model.
 * A connection-class rule is necessary, never sufficient, OEM compatibility evidence. */
export type InstallationStatus = 'valid' | 'invalid' | 'unknown';
export type CapacityClass = 15 | 20 | 25 | 35 | 42 | 50 | 60 | 71;
export const CONNECTION_CLASSES: readonly CapacityClass[] = [15, 20, 25, 35, 42, 50, 60, 71];
export interface PortAlternative {
  readonly capacityClasses: readonly number[];
  /** Drawing identifiers belong to the named guide, not global part numbers. */
  readonly reducer: string;
  readonly onlyGuideNamedIndoorClasses?: readonly string[];
}
export interface EquipmentPort {
  readonly id: string;
  readonly gasConnectionOuterDiameterMm: number;
  readonly alternatives: readonly PortAlternative[];
}
export interface MultisplitInstallation {
  readonly topology: 'multisplit';
  /** Null is unpublished, never zero or an inherited two-head rule. */
  readonly minimumConnectedHeads: number | null;
  readonly maximumConnectedHeads: number;
  readonly connectedCapacityClassSumLimitKw: number | null;
  /** Null leaves per-port identity/class/reducer constraints unknown. */
  readonly ports: readonly EquipmentPort[] | null;
  readonly guide: string;
  /** No full-reference combination is certified by port rules alone. */
  readonly exactEligibility: 'unknown';
  /** Documentary only. Generic refrigerant inventory is not OEM-calibrated. */
  readonly publishedMaximumTotalChargeKg: number | null;
}
export interface HeadInstallation {
  portId?: string;
  capacityClass?: CapacityClass;
  /** Explicit connection contribution; never copied from nominalCoolingKw. */
  connectedCapacityKw?: number;
  /** User declaration of a guide's short class identity; does not certify full SKU eligibility. */
  guideNamedIndoorClass?: string;
  reducer?: string;
}
export interface InstalledHead {
  id: string;
  manufacturer: string;
  installation?: HeadInstallation;
  /** Deliberately ignored by installation checks: Off still means connected. */
  enabled?: boolean;
}
export interface InstallationFinding {
  status: Exclude<InstallationStatus, 'valid'>;
  code: string;
  message: string;
  headId?: string;
}
export interface InstallationValidation {
  status: InstallationStatus;
  topologyStatus: InstallationStatus;
  eligibilityStatus: InstallationStatus;
  findings: readonly InstallationFinding[];
}

/** Evaluate declared connections without inferring classes, reducers or OEM approval.
 * Supplied heads must be the installed pool slice, not merely enabled/demanding heads. */
export function validateMultisplitInstallation(profile: MultisplitInstallation, heads: readonly InstalledHead[]): InstallationValidation {
  const findings: InstallationFinding[] = [];
  const add = (status: 'invalid' | 'unknown', code: string, message: string, headId?: string) => findings.push({ status, code, message, headId });
  if (profile.minimumConnectedHeads === null) add('unknown', 'minimum-count-unpublished', 'Minimum connected head count is unpublished in the reviewed legacy source.');
  if (profile.connectedCapacityClassSumLimitKw === null) add('unknown', 'class-sum-unpublished', 'Connected class-sum ceiling is unpublished in the reviewed legacy source.');
  if (profile.ports === null) add('unknown', 'port-constraints-unpublished', 'Named port/class/reducer constraints are unresolved in the reviewed legacy source.');
  if ((profile.minimumConnectedHeads !== null && heads.length < profile.minimumConnectedHeads) || heads.length > profile.maximumConnectedHeads)
    add('invalid', 'connected-count', `Connected head limit: minimum ${profile.minimumConnectedHeads ?? 'unknown'}, maximum ${profile.maximumConnectedHeads}; ${heads.length} installed.`);
  const occupied = new Set<string>();
  let sum = 0, sumKnown = true;
  for (const head of heads) {
    const assignment = head.installation ?? {};
    if (head.manufacturer !== 'daikin') add('unknown', 'manufacturer', 'Exact compatibility of another manufacturer or a generic head is not established by these sources.', head.id);
    const kw = assignment.connectedCapacityKw;
    if (kw === undefined) { sumKnown = false; add('unknown', 'capacity-contribution', 'Connected capacity-class contribution is undeclared; nominal cooling output is not substituted.', head.id); }
    else if (!Number.isFinite(kw) || kw <= 0) { sumKnown = false; add('invalid', 'capacity-contribution', 'Declared connection-capacity contribution must be a positive finite value.', head.id); }
    else sum += kw;
    if (profile.ports === null) continue;
    if (!assignment.portId) { add('unknown', 'port-unassigned', 'Assign a physical port to this installed head.', head.id); continue; }
    const port = profile.ports.find(p => p.id === assignment.portId);
    if (!port) { add('invalid', 'port-absent', `Port ${assignment.portId} does not exist on this outdoor model.`, head.id); continue; }
    if (occupied.has(port.id)) add('invalid', 'port-duplicate', `Port ${port.id} is assigned to more than one head.`, head.id);
    occupied.add(port.id);
    if (assignment.capacityClass === undefined) { add('unknown', 'class-undeclared', 'Declare the installation connection class; model digits and nominal cooling output are not inferred.', head.id); continue; }
    if (!CONNECTION_CLASSES.includes(assignment.capacityClass)) { add('invalid', 'class-invalid', 'Unsupported connection-class declaration.', head.id); continue; }
    const candidates = port.alternatives.filter(p => p.capacityClasses.includes(assignment.capacityClass!));
    if (!candidates.length) { add('invalid', 'port-class', `Class ${assignment.capacityClass} is not supported on port ${port.id}.`, head.id); continue; }
    const qualified = candidates.filter(p => !p.onlyGuideNamedIndoorClasses || p.onlyGuideNamedIndoorClasses.includes(assignment.guideNamedIndoorClass ?? ''));
    // A missing named-class declaration may leave a conditional alternative possible.
    const possible = assignment.guideNamedIndoorClass === undefined ? candidates : qualified;
    if (assignment.reducer === undefined) { add('unknown', 'reducer-undeclared', 'Declare the installed reducer or explicitly choose none.', head.id); continue; }
    const matching = qualified.filter(p => p.reducer === assignment.reducer);
    if (!matching.length) {
      if (possible.some(p => p.reducer === assignment.reducer)) add('unknown', 'named-class-undeclared', 'This reducer alternative requires a guide-named indoor class that has not been declared.', head.id);
      else add('invalid', 'reducer-or-class', `Reducer ${assignment.reducer} does not satisfy class ${assignment.capacityClass} on port ${port.id}.`, head.id);
    }
    else if (matching.some(p => p.reducer.startsWith('optional accessory'))) add('unknown', 'accessory-identity', 'The guide permits an optional accessory here but does not identify the accessory part.', head.id);
  }
  // A known partial sum already exceeding the ceiling cannot be rescued by undeclared positive heads.
  if (profile.connectedCapacityClassSumLimitKw !== null && sum > profile.connectedCapacityClassSumLimitKw + 1e-9) add('invalid', 'class-sum', `Declared connected class sum ${sum} kW exceeds ${profile.connectedCapacityClassSumLimitKw} kW; this is not delivered output.`);
  const topologyStatus: InstallationStatus = findings.some(f => f.status === 'invalid') ? 'invalid' : !sumKnown || findings.length ? 'unknown' : 'valid';
  const eligibilityStatus: InstallationStatus = 'unknown';
  add(eligibilityStatus, 'exact-eligibility', 'Exact full-reference indoor combination eligibility is not established by these port/class rules.');
  return { status: topologyStatus === 'invalid' ? 'invalid' : 'unknown', topologyStatus, eligibilityStatus, findings };
}
