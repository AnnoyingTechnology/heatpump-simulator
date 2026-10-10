# Independent science-compliance review

Reviewer: dedicated science-compliance agent. Review date: 2026-10-10. Status: **accepted for the interface-preview and planned scientific-architecture milestone; no open material science-compliance finding**. Earlier-pass findings below retain their discovery context; final dispositions supersede pending notes. This is not solver validation.

The commissioned milestone is a runnable interface with explicit illustrative fixtures and a scientific architecture/specification. A complete validated physical solver is not a prerequisite for reviewing that milestone. No numerical fixture is accepted as a manufacturer operating prediction. This review does not certify an installation, refrigerant substitution, or safety compliance.

## Evidence and review coverage

Read the parent `AGENTS.md`, `project-brief.md`, `design/science-ui-contract.md`, and the source register. Independently opened the sources cited below. The 2019 Daikin piping diagram was also rendered and visually inspected. Reviewed the completed scientific reference, specification, validation plan, property probe and application source, independently recomputed key fixture values, and inspected the final interface screenshots and recorded browser QA. No actual hardware was inspected. The documents/source were absent at the early pass; the final assessment below supersedes that initial limitation.

The preliminary interface contract is scientifically appropriate: four-way reversing valve, separate service-valve concept, independent phase and temperature encodings, explicit absolute/gauge pressure, isentropic efficiency distinct from motor efficiency, stated heat-exchanger area convention, and pervasive illustrative-data labeling (`design/science-ui-contract.md:5–14`). Its generic-cycle caveat is necessary until equipment-specific evidence is attached.

## Early findings

### SC-01 — Medium: property-library safety metadata must not become authoritative refrigerant classification

Affected early snapshot: `research/primary-source-register.md:45`.

The source register accurately says the CoolProp R32 page reports A2, but this requires an adjacent discrepancy warning before reuse. The independently opened [CoolProp R32 page](https://coolprop.org/fluid_properties/fluids/R32.html) does contain A2 metadata. The [ASHRAE 2025 Handbook refrigerant table](https://handbook.ashrae.org/Handbooks/F25/SI/F25_Ch29/F25_Ch29_si.aspx), Table 1, lists R32 as **A2L** and attributes classifications to Standard 34-2022. It also lists R1234yf as A2L and R290 as A3. EOS validity and safety-class metadata have different authorities.

Recommended fix: retain the CoolProp discrepancy as an observed metadata issue; use the standards-body source for any displayed safety class. Do not derive safety classification directly from `get_fluid_param_string(..., 'ASHRAE34')`.

Outcome: **resolved in source register** during the early pass: it now warns of the metadata discrepancy and adds an authoritative classification source. Recheck UI/scientific-document use in final pass.

### SC-02 — Medium: exact-model source hyperlink and revision must remain traceable

Affected early snapshot: `research/primary-source-register.md:9–17`.

The initial `my.daikin.eu` link for 4PEN600463-1C returned HTTP 404 in this review. This prevents independent verification of that linked N8/N9 edition; it does not disprove the extracted claims. The source author supplied a resolving [official 2019 guide, 4PEN600463-1](https://www.daikin.eu/content/dam/document-library/Installer-reference-guide/ac/split/3MXM-N%2C%203AMXM-M%2C%203AMXF-A%2C%203MXF-A%2C%204MXM-N%2C%205MXM-N_4PEN600463-1_2019_10_Installer%20reference%20guide_English.pdf). Its cover names **3MXM52N2V1B**, rather than N8. Printed p.29 shows the four-way valve, three outdoor branch EEVs, gas/liquid stop valves before shared headers, and field-pipe connections. Sections 6.4.7–6.4.8 describe the gas-stop-valve service port.

Recommended fix: use a resolving citation and match the claimed model/revision to its cover. Keep family schematic evidence separate from an exact N8 claim. Preserve the uncertainty about unverified controller logic and suffix-specific facts.

Outcome: **resolved in source register** during the early pass: the link now resolves to the independently inspected N2 guide and explicitly disclaims proof of identical N8 revisions/controls. Exact N8 internal details remain unknown.

## Checks required when scientific documents and fixtures arrive

These are acceptance checks, not findings against files that do not yet exist.

| Topic | Material requirement |
| --- | --- |
| Pressure and taps | Property calls use Pa absolute. Display bar(a) explicitly, or `bar(g) = bar(a) − ambient pressure in bar` with declared ambient assumption. Compressor suction/discharge taps stay physically fixed. A gas-field service point becomes high-side in heating and low-side in cooling/reverse-cycle defrost. Do not move its node merely to preserve a gauge label. |
| Reversal and expansion | Route D→I and O→S in heating; D→O and I→S in cooling/defrost. EEVs occupy fixed nodes while flow reverses. Where EEVs are outdoors, a connection named “liquid” can carry two-phase refrigerant in cooling. Avoid equating pipe names with phases. |
| Multi-zone closure | Sum branch refrigerant mass flows at each header; mix returning enthalpy by mass flow. Give every active branch inlet/outlet state and allocated heat rate. Total useful room transfer must equal its branch sum for 1–5 units. Distinguish idle branches and mass/storage approximations. |
| Phase/temperature | Independent channels must survive heating, cooling and defrost. Superheated vapor can be hot or relatively cold; subcooled liquid can be warm. Blends need bubble/dew references and a stated quality convention; “liquid/vapor” colors cannot substitute for temperature. |
| COP and boundaries | Heating numerator is useful heat delivered to rooms; cooling numerator is useful total heat removed from rooms, with sensible/latent split. Denominator includes compressor, fans and auxiliaries. Steady-cycle heating COP = cooling COP + 1 applies only to the same refrigerant boundary and work denominator, not indiscriminately to two whole-system modes. Defrost must show room heating interruption or signed room loss and a stated COP convention, rather than label outdoor melt heat as useful heating. |
| Motor/fan heat | Separate refrigerant coil heat, useful room heat and total electric input. Allocate fan and compressor-motor loss heat to explicit destinations and avoid counting it twice. |
| Frost/room moisture | Frost requires cold coil surface and available moisture, not simply ambient dry bulb below zero. Accumulation, melt, runoff and any retained-water simplification must close mass/energy. Room humidity must derive from moisture balance, not an independent fixed-RH temperature change; cooling latent removal and condensate must agree. |
| Geometry/area | Drawn tubing length is independent of physical one-way branch length. Hydraulic calculations require inside diameter; manufacturer connections commonly specify outside diameter. Surface in m² must say primary/air-side-finned/etc., with source or explicit estimate; UA and frontal area are distinct. |
| Fixtures/honesty | All changing output retains illustrative-data status. Inputs cannot silently produce new “simulated” COP through arbitrary scaling. Pressure, temperature, phase, refrigerant, geometry and stated fixture assumptions must be mutually plausible. Derived COP must agree with displayed Q/P, even where catalogue independently rounded ratings differ. |
| Equipment provenance | Owner-blog facts remain dated owner evidence; published family dimensions/rating points remain manufacturer facts; inferred geometry and generic controls remain assumptions; exact suffixes/maps stay unknown. Changing simulated fluid is not a manufacturer-approved retrofit claim. |

The reversal check follows the independently inspected Daikin family schematic and [Danfoss four-way-valve construction description](https://www.danfoss.com/en-gb/service-and-support/case-stories/dcs/components-for-heat-pumps-part-5-four-way-reversing-valves/): suction and discharge connections are fixed, while the two exchanger connections exchange roles. Reverse-cycle defrost is a documented use of that arrangement.

The fan-loss check is supported by the [EnergyPlus fan-model engineering reference](https://bigladdersoftware.com/epx/docs/24-2/engineering-reference/air-system-fans.html): shaft work raises air temperature, and motor/belt waste heat contributes according to its location and assigned air fraction. Counting electric power in the denominator alone does not settle its heat destination.

The frost check follows [Ma and Thorade’s primary frost/defrost model paper](https://arxiv.org/html/2412.00017v1), equations 1–12 and 22–26: frost/water storage has both mass and enthalpy, melting consumes fusion energy, and drainage/export must be represented. The paper concerns an automotive flat-tube system; its model principles do not establish Daikin sensor thresholds or calibration. The room latent-load distinction is supported by the [EnergyPlus zone-design engineering reference](https://energyplus.readthedocs.io/en/latest/guides/engineering-reference/10.3-zone-design-loads-and-air-flow-rates.html).

## Property architecture evidence

The [official CoolProp JavaScript wrapper documentation](https://coolprop.org/coolprop/wrappers/Javascript/index.html) documents local JS/WASM binaries, browser loading, Emscripten compilation and the `application/wasm` MIME requirement. This establishes a feasible static deployment route, not a tested project bundle, size, speed, complete API exposure or operating-domain reliability.

The [CoolProp high-level interface](https://coolprop.org/coolprop/HighLevelAPI.html) documents phase-aware state calls, saturation quality inputs and relative enthalpy references. Its warning against incorrectly imposed phases is relevant: fixture colors must not force a thermodynamic phase inconsistent with the state pair. The [current mixture documentation](https://coolprop.org/fluid_properties/Mixtures.html) documents newer PT mixture-flash algorithms. Claims about absent mixture flashes must identify the actual pinned version/backend rather than repeat limitations from older releases.

For a proposed WASM-first or pre-generated property-table design, require an explicit offline static-host proof, fluid/input-pair coverage, phase-boundary behavior, failed/out-of-range-call policy, table provenance and interpolation error budget. Tables must split phase regions and retain blend bubble/dew behavior; silently extrapolating or smoothing across saturation is unacceptable. Compare the actual chosen backend and table queries over the operating envelope before calling either architecture validated. This evidence can remain a documented implementation gate for the mockup milestone.

## Early disposition

The early contract is suitable to guide the illustrative UI. Final acceptance remains pending the scientific reference, model specification, validation plan, fixture data and implemented circuit. No full-engine requirement or performance certification is implied by this early disposition.

## Scientific-draft and property-probe pass

Second pass read `heatpump-science-reference.md`, `model-specification.md`, `research/coolprop-browser-feasibility.md`, the probe source, and both raw result files. The model validation plan and UI remain pending at this pass. Line references below identify the reviewed draft and can shift during correction.

### SC-03 — Medium: reference/specification architecture and manufacturer-source drift

Affected draft: `heatpump-science-reference.md:40`, `:53–57`, `:65`; compare `model-specification.md:10` and `:48`.

The reference still recommends table-first architecture while the specification and measured feasibility report prefer direct released WASM. It also retains the unavailable N8-guide hyperlinks and describes branch stop valves where the independently inspected N2 schematic shows common valves. These conflicting defaults make later implementation ambiguous.

Recommended fix: align both documents with the observed released-WASM-first decision, keep custom tables conditional on demonstrated solver need, replace stale manufacturer citations, and use common service/stop-valve wording with the N2-versus-N8 caveat. Do not extend the smoke probe to a full operating-envelope claim.

Outcome: **resolved** in final scientific draft. Reference §4 and specification §1 both prefer direct released WASM with conditional tables; reference §5 uses the resolving N2 guide and common stop/service-valve topology with explicit N8 uncertainty.

### SC-04 — Medium: film reference prose admits a double evaporation-energy subtraction

Affected draft: `heatpump-science-reference.md:191`; correct explicit counterpart in `model-specification.md:129–137`.

The reference first defines the full air enthalpy difference as including vapor transport, then says drainage/evaporation remove outgoing enthalpy. A literal implementation can subtract evaporation enthalpy twice. The specification avoids that ambiguity: full air enthalpy difference already accounts for outgoing vapor, and only liquid drainage is a separate exported enthalpy term. Its ice/liquid enthalpy plateau also correctly handles cold-ice sensible warming, fusion, retained-water refreezing, and persistent mass through mode changes.

Recommended fix: reproduce the specification's single convention in the reference, explicitly distinguishing liquid drainage from vapor already represented in air inlet/outlet enthalpy. Preserve the requirement for all water/air/film enthalpies to share a reference.

Outcome: **resolved** in final reference §9: deposited/evaporated vapor energy is counted in the air enthalpy difference, liquid drainage is separate, and a second evaporation-energy subtraction is explicitly prohibited. No defect found in the specification equation.

### SC-05 — Medium: raw blend quality requires a basis, and mass quality is available directly

Affected draft: `research/coolprop-probe/probe-common.mjs:21`, `:42`, `:85`; `heatpump-science-reference.md:47`; `model-specification.md:40–44`.

The probe's `quality` field and “mid-quality” queries use CoolProp `Q`, which is **molar**, while product quality is **mass-based**. The [official high-level input/output table](https://coolprop.org/coolprop/HighLevelAPI.html#table-of-string-inputs-to-propssi-function) distinguishes `Q` [mol/mol] from `Qmass` [kg/kg]. This is material for true mixtures rather than pure-fluid fixtures.

Independent read-only Node calls against the same release artifacts confirmed direct `Qmass` output works. For explicit R407C (`R32[0.381109]&R125[0.179559]&R134a[0.439332]`) at 800000 Pa and input `Q=0.5`, h was 316391.970271 J/kg; its PH flash returned molar Q≈0.5 and **Qmass=0.481705357262**. For pure R32, both were 0.5. A feed-average molecular mass cannot convert molar quality correctly; manual conversion needs each equilibrium phase's composition-specific molar mass.

Recommended fix: name raw probe quality `molarQuality` or attach `qualityBasis`; use tested `Qmass` for the property service's displayed mass quality, and verify two-phase-only validity. If a future backend lacks it, use `x=β M_v/[β M_v+(1−β)M_l]` with phase-specific masses and test the conversion. An endpoint or single-phase sentinel must not become 0%/100% displayed quality.

Outcome: **resolved** in final reference §3, specification §3, validation-plan §1, and probe schema. Raw quality has its molar basis; guarded `massQuality` uses `Qmass` only for a valid two-phase state and returns null for single-phase states.

### Verified boundaries and evidence limits

- Compressor equations and efficiency meanings in the reference/specification agree with [NIST TN 1895 §3.2](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1895.pdf), which distinguishes refrigerant enthalpy-rise work from measured shaft work and defines isentropic/volumetric efficiencies. [NIST CYCLE_D documentation](https://www.nist.gov/system/files/documents/2018/12/19/cycle_d_ver._6.0_users_guide.pdf) separately treats motor efficiency, fan correction and motor-heat destinations. Assigning drive loss outdoors is explicitly a model assumption, which is appropriate.
- Raw R32 pressure, enthalpy, discharge-temperature and expansion states are coherent with their stated synthetic input pairs. Heating: pL=6.90576 bar(a), pH=24.78313 bar(a), discharge≈100.252°C, refrigerant-only heating COP≈4.24846. Cooling and defrost samples likewise use absolute pressure and ηis=0.70. Their compressor-work/evaporator/condenser arithmetic closes; that identity is partly constructed by the formulas and is not an independent validation test. Defrost's refrigerant-only COP≈12.688 is not a useful room-heating COP and must not be displayed as one.
- `model-specification.md:108–121` uses coupled room H,w storage, supply/ventilation moist-air enthalpy, and explicit vapor-source enthalpy. It clearly declares a constant-pressure psychrometric approximation, includes fan heat through supply enthalpy, and rejects unmodeled supersaturation. This resolves the main moisture/caloric concern. The reference's simpler sensible two-node illustration should point explicitly to that coupled implementation; it cannot stand alone for wet cooling.
- Independently checked asset SHA-256 values match the report. The measured release, runtime and bounded samples support static-browser property feasibility. Sixty timing batches per named fluid cycle cover only twenty temperatures repeated at one suction pressure, not an operating-envelope benchmark. Explicit-mixture timings, full 1–5-branch solves, critical-domain behavior and static repository-subpath/worker loading remain future gates.
- Independent Node export checks confirmed `HAPropsSI` works (20°C, 101325 Pa, RH=0.5 produced h≈38622.839 J/kg dry air); `PhaseSI` is absent, but `PropsSI('Phase',...)` works for the tested two-phase state. The service must use actual wrapper exports and an established numeric-phase mapping rather than assume a string `PhaseSI` API.

Second-pass disposition: the planned model's principal energy/mass boundaries are sound. SC-03–05 were subsequently resolved as recorded above.

## Final research-document verdict

The final scientific reference, model specification, validation plan and fixture ledgers are **accepted as a planned architecture and constructed illustrative evidence for this milestone**. No open material scientific defect was found in those documents. This verdict does not claim an implemented solver, a validated operating envelope, a calibrated Daikin model or a completed UI review.

| Document | Verdict and substantive checks |
| --- | --- |
| `heatpump-science-reference.md` | Accepted. Correct absolute pressure, real-state/phase definitions, bubble/dew and mass-quality handling, four-way/EEV topology, COP boundaries, fan/motor heat allocation, geometry distinctions, moisture and retained-water energy. Manufacturer facts and generic assumptions remain separated. |
| `model-specification.md` | Accepted for subsequent implementation. Explicit shared-branch degrees of freedom and mixing; dry/wet coil and room H,w closure; conservative film/metal ledger; bounded failed-state behavior; realistic off/reversal exclusions. Actual nonlinear solvability and numerical accuracy remain implementation gates. |
| `research/model-validation-plan.md` | Accepted. Meaningful analytic, conservation, domain, entropy/pinch, time-convergence, static-host and calibration gates. Carnot/Kelvin comparison is confined to a matching fixed-reservoir steady boundary. Proposed tolerances are explicitly unachieved engineering targets. |

Independent arithmetic/psychrometric recomputation used the pinned release and its `HAPropsSI`, taking raw refrigerant enthalpy differences as inputs rather than copying fixture output tables. Values below agree with document precision:

| Fixture | Independently recovered result |
| --- | --- |
| Heating | Net room heat 5.980782783 kW, electric input 1.674732428 kW, COP 3.571187064; branch sum, fan heat and stated outlet air temperatures close. Outdoor inlet dew point ≈−6.58°C permits the declared nonfrost −3°C surface. |
| Frosting | Net room heat 4.976485652 kW, input 1.375610357 kW, COP 3.617656430. Deposition 1.569603796 kg/h, film storage −148.153158 W, outdoor-air removal 3614.914862 W and refrigerant evaporation 3763.068021 W close exactly under the liquid-zero convention. The text correctly prevents interpreting its freely selected COP as a frost-efficiency improvement. |
| Wet cooling | Net room-air removal 4.821268620 kW, input 1.466478835 kW, COP 3.287649644. Condensate 2.815395266 kg/h exports 32.689867 W; branch flows, post-fan temperatures and moisture/enthalpy mixing agree. |
| Defrost | Indoor evaporation 900.043627 W plus refrigerant work 77.005629 W equals outdoor condensation 977.049257 W. Indoor source partitions into room extraction 600.043627 W and metal depletion 300 W. Condensation partitions into melt 750 W, metal warming 127.049257 W and ambient loss 100 W. Melt rate 0.002248876 kg/s agrees with the declared fusion constant; useful heating COP is suppressed. |
| Idle | Zero active refrigerant/forced-air readings are unavailable, prior film does not vanish, controls still consume power, and the fixture is explicitly distinct from a freshly stopped warm coil. Passive room envelope/fabric exchange belongs to its declared room model. |

The [direct NIST ice/water table](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=926353) was independently opened: fusion enthalpy 333.4 J/g and ice cp 2.10 J/(g·K) at 0°C support the reference's explicitly rounded modeling constants and stated temperature limitation.

The rerun-property reporting synchronization is **resolved**: the three scientific/feasibility documents now match the latest raw browser capture (08:29:56 UTC), with initialization 90.2 ms, total approximately 5.40 s and named-fluid p95 up to approximately 0.7 ms. Earlier initialization is explicitly identified as an earlier run. This did not change the feasible-WASM conclusion or any thermodynamic fixture value.

All SC-01–05 material findings are resolved. Final UI acceptance still requires inspection of actual implemented topology, output assumptions and fixture presentation; sound research documents are not blocked on that separate work.

## Early UI-source pass

Read available `src/types.ts`, `state.ts`, `fixtures.ts`, `circuit.ts`, `geometry.ts`, `pipes.ts` and `scene.ts` before the final application shell/style/controller was ready. This is source review only; rendered behavior and the final timestep loop remain pending.

Routing in `geometry.ts` and mode mapping in `circuit.ts` agree: compressor D/S stay fixed, four-way pairs switch correctly, EEVs sit outdoors, field smaller pipes become two-phase in cooling/defrost, indoor/outdoor exchanger paths reverse, and each of 1–5 branches has a complete pipe pair. Scene pressure labels explicitly use bar(a)/bar(g), with 1.01325 bar atmosphere, and the common service point changes high/low role correctly. Extra high/low taps are labeled virtual. Pipe phase and a thin temperature core are independent. Both casing dimensions use the same scale with routing explicitly schematic. Fixture global values match the reviewed scientific ledger; generic branch allocation conserves the total and is explicitly a chosen weighted share.

### SC-06 — Medium: preview melting has no retained-water state and fixture selection can masquerade as mass loss

Affected source: `src/state.ts:57–60`, `:94–109`; `src/scene.ts:334–339`, `:554–563`; `src/fixtures.ts:142`.

The clock stores only `iceKg`; selecting cooling deletes it and the scene also hides any ice when mode is cooling. SVG drips/puddle exist, but there is no liquid/retained-water amount. Defrost can inherit an arbitrary accumulated ice mass while its fixture summary asserts 0.10 kg. This creates a misleading physical transition if the owner follows frost→defrost→idle/cooling, although independent fixture loading may legitimately reset state when clearly stated.

Recommended fix for this **preview**: a small illustrative water ledger is sufficient—decrease ice by the bounded melt transfer and increase retained liquid by the same amount; show the current ice/liquid amounts and preserve them in idle. Stop the melt/drip animation at ice exhaustion; keep frozen diagnostic readings explicitly snapshot values. Either preserve mass through mode changes or explicitly treat named fixture loading as a reset with a visible notice/reset preview clock. Summary text must agree with the loaded/current initial mass. No thermodynamic solver or full drainage/refreezing dynamics is demanded here.

Outcome: **resolved** after refinement and final QA. `state.ts:76–85` transfers at most the available ice into `retainedWaterKg`; mass is not capped at the graphic saturation level. `loadExample` preserves ice/liquid through idle and mode changes and only supplies the disclosed arbitrary initial ice when both inventories are empty. `main.ts` calls this ledger; scene drips follow actual melting and stop when paused/exhausted; the puddle follows retained liquid. Overlay and inspector display both masses and explicitly distinguish fixed snapshot readings from synthetic retained-mass transitions. Independent extracted-function checks passed conservation, exhaustion, uncapped deposition and pause behavior. The final frost/five-room screenshots show the ledger and arbitrary-initial-load qualification; the coordinator's browser QA records actual exhaustion, conserved liquid and idle/cooling persistence.

### SC-07 — Medium: gas/liquid service stop valves are omitted from the explanatory diagram

Affected source: `src/geometry.ts:67–90`; `src/scene.ts:422–449`.

The service fitting is currently a stub on a bare common gas node, with no distinct common gas or liquid stop-valve symbol. Outdoor EEVs and four-way reversal are shown correctly, but the diagram does not yet fulfill the scientific contract's separate service-isolation devices (`heatpump-science-reference.md` §11). The inspected N2-family manufacturer schematic explicitly distinguishes those valves from EEVs and the reversing valve; exact N8 internal layout remains unknown.

Recommended fix: add separate labeled schematic gas and liquid stop valves to the common routing, put the service fitting on the gas-stop-valve node, and retain the generic/N2-family-layout qualification. Static fully open symbols are enough; do not invent active stop-valve modulation or manufacturer controls.

Outcome: **resolved** after refinement and final rendered review. Static labeled gas/liquid stop symbols, selectable inspectors, and an explicit N2-family/exact-N8-unknown qualification were added; the gas service fitting is on the gas-stop node. The intermediate five-branch bypass was corrected: `scene.ts:461–463` now puts the liquid stop at local (190,222), on the common horizontal feeder before every branch. The final outdoor screenshot clearly distinguishes GAS STOP, LIQ STOP, numbered EEVs and the four-way valve; the five-room drawing retains the complete common/branch connections.

Early UI disposition: core connectivity and fixture boundaries are sound. SC-06–07 require preview presentation fixes before final UI acceptance. Application-shell banners, mismatch notices, fixture controls and rendered clarity still need the complete app.

## Complete first-pass application-shell review

Reviewed `src/fixtures.ts`, `chrome.ts`, `sidebar.ts`, `inspector.ts` and `main.ts` after the application became buildable. SC-06–07 were being refined concurrently; their final disposition remains pending rather than inferred from partially changed files.

Heating COP uses net room heat including indoor-fan heat and total electrical input. Cooling COP uses net room-air enthalpy removal after indoor-fan heat and the same electrical boundary. Defrost reports signed room extraction separately from outdoor melt energy and suppresses useful heating COP. Idle reports controls-only electrical input, no active-cycle pressures/quality, and unavailable forced-air outlet temperatures. The numerical readings agree with the independently reviewed fixture precision. Arithmetic closure in the drawer is expressly labeled fixture arithmetic, rather than presented as validation of a solver.

The frosting COP of 3.62 versus normal heating 3.57 is not a thermodynamic defect: these are unrelated constructed points with independently chosen refrigerant flows and fan powers. `fixtures.ts:135–137` explicitly rejects an inference that frost improves performance. A concise visible frosting notice near the readings would make that qualification easier to see when the diagnostics drawer is closed; no change to the sound fixture numbers is needed.

Room/piping sidebars distinguish editable configuration from fixed readings, physical line length from SVG routing, tube outside diameter from unknown as-built diameter, and family guide limits from an exact N8 installation check. Refrigerants other than R32 are research-only choices rather than implied working simulations. Component inspectors distinguish actual service fitting and virtual taps, local fixture phase/temperature and unavailable quantities, unknown coil area/UA, and chosen compressor efficiencies.

### SC-08 — Medium: incomplete comparison produces an unqualified configuration-match claim

Affected source: `src/chrome.ts:143–148`; editable inputs in `src/sidebar.ts:83–118`, `:143–146`, `:166–175`; illustrative branch allocation in `src/fixtures.ts:230–255`.

The global notice checks outdoor conditions, isentropic efficiency, room temperatures/setpoints and unit count only. Changing room volume or heat-loss coefficient, physical pipe length/diameter, outdoor kind, or indoor class can leave **“Configuration matches the fixture.”** visible. Some edits have no matching fixture assumption at all; changing indoor nominal classes also reallocates branch readings without a notice when the count remains three. This overstates the relationship between edited inputs and fixed numerical outputs, despite useful qualifications elsewhere in the sidebar.

Recommended fix: always retain a concise statement that readings are fixed illustrative values. Restrict the affirmative match text to the conditions actually checked (for example, “Displayed fixture conditions match the temperature/efficiency inputs”), or compare an explicit fixture configuration snapshot. Mark changed class/count allocation as illustrative redistribution; do not imply that pipe/room geometry has been evaluated. A full solver is unnecessary.

Outcome: **resolved** after the final labeling pass and rendered review. The overlay always begins “Fixed illustrative snapshot readings,” identifies only the checked fixture conditions, qualifies other inputs as configuration-only, and flags nominal-class/count redistribution and generic outdoor selection. Those qualifications are visible in the final overview and five-room screenshots. A visible frosting notice prevents interpreting the independently chosen COPs as frost performance evidence; its single-instance behavior across repeated renders is covered by the coordinator's browser QA.

### SC-09 — Low: persistent numeric banner omits the agreed validation status

Affected source: `src/fixtures.ts:9`, reused by `src/chrome.ts:83`, `:188` and `src/inspector.ts:194`; requirement `design/science-ui-contract.md:15`.

The shared banner says “Interface preview · illustrative readings,” but the agreed contract requires an explicit **model not validated** qualification. The app otherwise explains that fixtures are not a solver, so this is a narrow labeling correction rather than evidence of a false solver claim.

Recommended fix: add “model not validated” to the shared persistent banner, retaining the preview/illustrative wording. Ensure the complete text remains visible or accessible at supported widths.

Outcome: **resolved**. The shared banner now says “Interface preview · illustrative readings · model not validated.” Its complete text is visible in the final screenshots, including the numeric ribbon and inspector footer. The coordinator's recorded desktop checks cover 1440/1600 px layout fit.

## Final milestone disposition

**Accepted for the requested interface-preview and planned scientific-architecture milestone. All SC-01–09 findings are resolved; no open material science-compliance defect remains.**

Final evidence inspected: `design/interface-preview.png`, `interface-outdoor.png`, `interface-frost.png` and `interface-five-rooms.png`; the corresponding source refinements; and `reviews/interface-browser-results.json`, timestamp 2026-10-10 09:04:54 UTC. The coordinator's 13 recorded browser checks pass. Their scope includes mode/phase/gauge conventions, distinct stop valves, fixed-output feedback, frost-caution stability, owner-port restrictions, branch closure, actual mass exhaustion/conservation and persistence, idle/defrost unavailable outputs, vector-only rendering without runtime exceptions, control interactions, and the production interface build under `/heatpump-simulator/`. Source inspection confirms the common liquid feeder now serves all five branches through its stop symbol. Independent research/property and fixture arithmetic checks are recorded above.

The final preview is explicit about illustrative fixed snapshots, arbitrary initial ice and synthetic state transitions. It does not imply a validated manufacturer performance map or a coupled dynamic solver. Exact N8 internal layout/control details, installed suffix/nameplate, as-built pipe sizes/elevations and coil geometry remain unknown or qualified family evidence. The planned property's worker/static-loading, full operating-envelope/domain/mixture validation, nonlinear multizone solution, timestep convergence and physical calibration remain future implementation gates in the accepted validation plan. Successful interface hosting and fixture arithmetic do not satisfy those solver gates.
