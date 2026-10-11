# Low-load Reference inverter and physical-cooling domain review

Reviewed 2026-10-11. Accept the frozen two-line cooling correction and the scoped generic controller implementation below. No source blocker remains with the explicitly selected minimums. Full native robustness, frontend/worker integration and hosted release checks remain root-owned gates; their previous-release results do not qualify these new hashes.

The reviewer inspected source, independently isolated the cooling-bound error, proposed the exact correction applied by root, added the authorized permanent native regression, and ran independent checks. This is independent verification of the final implementation, rather than independence from designing that narrow correction. No other production files, builds, distribution files or Git state were changed by the reviewer.

## Accepted physical correction

The physical cooling formulation controls **common compressor-suction superheat**. Heat picked up along an outdoor-exposed suction line can make the common suction warmer than the indoor coil metal while the actual indoor evaporator outlet remains colder than that metal. The previous search ceiling incorrectly subtracted all common superheat from the indoor metal temperature. A second initialization error attempted a direct coil integral to the untransported common suction state, imposing the same incorrect pinch before actual pipe transport was evaluated.

`cycle.ts:153` now subtracts superheat only for heating when setting `lowMax`; `cycle.ts:202` seeds physical cooling flow from positive allocated displacement flow. Actual coupled transport, finite-UA integrals, local heat direction/pinch, valve pressure authority, common superheat, R32 domain, discharge/ratio limits, iteration limits and tolerance remain authoritative. The seed provides no accepted heat or mass. Either change alone still fails the retained single-head8rps cases; together they close under the original limits.

| Physical single-head case | Outside/coil metal | Suction/local outlet | Local outlet superheat | Residual |
|---|---|---|---|---|
| 8rps,6.5m line | 35/10°C | 10.2426/8.5723°C | 1.3173K, vapor | 0.04172W |
| 8rps,6.5m line | 39/10°C | 10.3344/8.4093°C | 1.0625K, vapor | 0.002942W |

Both retain3K common suction superheat. Independent terminal enthalpy differences reconstruct branch heat, condenser heat and compressor work; branch mass sum and native suction density reconstruct compressor mass flow. Line heat completes the energy balance. Inactive valve faces stay null. Invalid cold-domain, hard-ratio and excessively lossy-line cases still reject explicitly. The isolated correction has exact output parity for the checked idealized heating/cooling and physical-heating fixtures; physical cooling can converge to slightly different values within the original tolerance.

This is not a new local evaporator EEV law. Danfoss describes local outlet temperature/pressure feedback and adaptive evaporator superheat, rather than a universal fixed common-suction target. A later lower-flow multi-branch model would need its own explicit local control and mixing formulation, stability/domain evidence and regression review. [Danfoss electronic evaporator injection control](https://www.danfoss.com/en/service-and-support/case-stories/dcs/components-for-heat-pumps-part-6-electronic-injection-control-for-evaporators/)

## Declared supported scope and remaining limitation

The library `defaultEngineConfig` retains18rps. Interactive runtime mapping selects8rps for idealized Reference heating/cooling and physical-line Reference heating, and retains18rps for physical-line cooling and the gated inventory model. Fixed-speed and dedicated defrost commands remain separate. These are declared generic model settings, not measured Daikin compressor frequencies or a warranty of closure for arbitrary inputs.

The restriction is necessary: at35°C outdoor metal, indoor metals10/10/11°C, active branches0/2 and physical lines3.5/6.5m,18rps closes at the unchanged0.1W tolerance;8rps fails with best residual331.9W. The permanent test retains both results and verifies that an actual unqualified8rps engine attempt faults with zero compressor work and restores prior thermal/water stores, ledgers, PI, thermostat and drive history. It must not silently retry18 or turn the failure into a successful idle step.

Exploratory single-head4rps closure can leave the local coil outlet two-phase while the line produces dry common suction. That is a result of this common-suction formulation, not evidence of acceptable real local evaporator control. Neither4rps nor the reported200/130W owner observations is imposed as a generic minimum or electrical-power fit. Oil transport, compressor mechanics, actual drive limits and measured EEV maps remain outside this Reference model.

## Accepted controller and startup policy

Ordinary Reference inverter operation starts at its declared admitted minimum, then immediately follows a generic2rps/s upward and4rps/s downward limit. The former ten-second plateau is removed only from that path. This quasi-steady solver does not simulate a physical start ramp through every speed between zero and the admitted minimum. Each positive command still requires a fresh independently closed EOS cycle; energy uses the actual command's mass flow and enthalpy work. Explicit Off, restart dwell and envelope protection override normal slew. Inventory, fixed-speed and defrost paths retain their separate startup behavior.

Real compressor guidance separates standstill/start ramp, operating acceleration/deceleration, admissible minimum speed and oil-return constraints. These support declaring the model boundaries separately; the VZN guide concerns different equipment/refrigerants and supplies no validated domestic R32 minimum or2/4rps/s map. [Danfoss VZN application guide, sections on minimum speed, drive control and oil return](https://assets.danfoss.com/documents/latest/580994/AB478735922007en-010201.pdf)

The unclipped capacity-based speed request is published separately from bounded demand and accepted speed. Conditional PI integration compares actual versus raw request and recognizes upper/lower saturation independently for each room's error direction. It commits on each accepted ordinary running interval, including startup; protection, defrost/reversal, Off and faults freeze ordinary integration. The PI is a generic sensible-load controller; latent demand is not forecast, and capacity per speed is lagged feedback rather than a linear physical law.

Native independent checks cover heating and cooling with opposite room errors, both saturation directions, ramp refinement, explicit Off,40s energy/water conservation, and a deliberately injected publication failure **after** candidate integral and stores changed. The outer transaction restores the prior integral, all thermal/water stores, ledgers, drive, calls and cached cycle exactly. No stored energy is reset to accommodate startup or target crossing.

## Frozen evidence

Reviewer results: [permanent physical native5/5](physical-low-load-independent-results.json), [independent controller5/5](low-load-controller-independent-results.json), [isolated source experiment](low-load-cooling-source-results.json). Reproducible reviewer script: [low-load-controller-independent-check.mjs](low-load-controller-independent-check.mjs). The permanent test is [physical-low-load.test.mjs](../tests/engine/physical-low-load.test.mjs).

Implementer-attributed final guarded14/14 evidence is [inverter-supervisor-regression-results.json](inverter-supervisor-regression-results.json), including the exact published owner house1200s continuous service across target, admitted-speed cold/hot restart, actual ramp energy, below-minimum cycling, fixed-speed behavior and rollback. These focused results support the declared change; they do not establish an OEM fit or settled performance for every weather/room combination.

Exact checked SHA256:

| File | SHA256 |
|---|---|
| `src/engine/cycle.ts` | `bc2071f37492b2484cef9778ef924f48dabfa7a2b2be17bc835052c9d2ec6f1b` |
| `src/engine/engine.ts` | `075c4d973b00d54424286a39be42c05692c258520e31cb8c66d6d49e1c04f051` |
| `src/engine/drive.ts` | `2949522b6555d0c0a333df8c8a8d51b91b1f99dc0474d4555c3112937a7b8cc9` |
| `src/engine/demand.ts` | `8caaf0dfd771521ab38bea1005febb63b7d187be8f77e598b9e48b6810234abf` |
| `src/engine/defaults.ts` | `0ea966a23c72ce8b4173fc5a5e11e3b317a8a4819ef3ca23916e24f0f8dde7fb` |
| `src/engine/types.ts` | `3e6bf8635fc92e066f842f4651045feda443155c222899dd6768caff5ce60f34` |
| `src/runtime/config.ts` | `84f2044eb1cbae4512aea4fe0a42a63465379463e7d0491f8d1759185ff6e452` |
| `tests/engine/physical-low-load.test.mjs` | `7c281afe098feb63ab30c57dba906d8e1708491b72dbcf99af5b87e81eeb0dc2` |

Receipts additionally pin compiled source and guarded native artifacts. Existing properties, tolerance, pressure caps and thermodynamic protections stay unchanged. No outstanding source blocker remains at these hashes with the stated8/18 scope; broad release and actual-browser gates remain pending separately.
