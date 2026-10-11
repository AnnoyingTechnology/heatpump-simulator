# Shared heating header and restart screening: independent science review

Reviewed 2026-10-11. **Accept the scoped generic Reference equations, controller policy, focused evidence and six complete retained replays at the exact frozen hashes below. Fresh broad regression and the new frontend/ventilation model remain release gates.** The owner subsequently chose average envelope U with automatically estimated exposed area and confirmed double-flow ventilation. That new frontend model is planned and requires a separate combined review; the present G-based frontend audit does not approve its replacement.

The reviewer read the original retained failures, current source, focused tests and receipts; reported policy limitations to the implementer; and independently operated the production guarded native EOS against exact saved checkpoints. The reviewer changed only review artifacts, made no production/test edits, and performed no git actions or private Home Assistant access. Native focused-test results below are attributed to the implementer; the independent scalar/checkpoint results are identified separately.

## Accepted shared-header formulation

The original eight-head enable/target edit at 360 s requires a shared liquid return, rather than condensation in every indoor branch. At shared pressure, a hot branch above saturation can desuperheat discharge vapor toward its metal temperature while colder branches condense and subcool. The branch finite-UA closure retains positive inlet-to-metal heat direction. The actual outlet enthalpies, positive allocated mass flows and common-pressure PH mixture close the original heat/mass equations. The lower SC-target search boundary can therefore use the coldest sink for idealized allocated heating. Physical field-line heating retains its per-branch subcooling formulation.

This is a declared idealized fixed-pressure allocation and equilibrium mixing model. It does not resolve individual valve hydraulics, refrigerant storage, oil, a real header's transient condensation or installed equipment control. The alternate 1 K minimum-lift heating regime remains an explicit controller choice; it is not a universal complementarity law or an OEM map.

The near-saturation quadrature change is acceptable. Enthalpy knots distinguish sensible liquid, latent and sensible vapor intervals. Known-phase `T|liquid`/`T|gas` queries select the actual single phase near saturation, without moving temperature or changing the EOS. The latent interval remains integrated explicitly. CoolProp documents phase-imposed queries, warns against imposing an unknown/wrong phase, and defines single-phase cp as the constant-pressure enthalpy derivative. [CoolProp high-level API](https://coolprop.org/coolprop/HighLevelAPI.html#imposing-the-phase-optional)

The opposite one-sided finite-difference fallback changes derivative construction when the preferred probe crosses a controller boundary. Every probe still passes the original domain evaluator; accepted cycles still pass the original residual, suction, work and envelope checks. Numerical trial rejection is not turned into an idle or protection result. The 65°C saturation cap, property service and 0.1 W pressure tolerance remain unchanged.

## Accepted restart policy and its limits

Start/restart screening now applies the same declared current-boundary estimate used during an existing hold. An unavailable estimate produces a visible, separately persistent `thermal boundary` latch. Unknown stopped information, Off and a changed mode label alone do not demonstrate recovery. Discharge, pressure, condensing and antifreeze recovery requirements remain separate. Actual cooling antifreeze is cancelled on exit from cooling; a current-mode boundary can release the thermal-boundary latch while another cause still requires a stop.

When the maximum source-side Te plus 1 K cannot place a liquid header above the coldest sink, the floating regime is unavailable under its declared bounds. The SC-target screen then uses current branch allocation weights and the weighted limiting metal-equilibrium enthalpies. This represents the contribution of a hot vapor-limited branch that a coldest-sink-only estimate misses. At exact metal/saturation equality, the liquid endpoint is a conservative enthalpy lower bound; it is not a reachable finite-UA desuperheating outlet at zero latent driving temperature. Bisection supplies a scalar pressure-floor estimate and the source-side Te supplies a discharge/ratio estimate.

These estimates remain a controller heuristic. Neither the scalar trend nor discharge monotonicity is proved globally over the real-fluid domain. The policy can hold a physically feasible arrangement: the weighted bracket returns unavailable if `max(active metal)+SC>65°C`, and a source-side estimate above its selected Te boundary is held without solving at a lower Te. Such a hold means conservative controller/domain unavailability, not thermodynamic impossibility. [Declared implementation assumptions](../research/reference-shared-header-restart.md)

The estimate supplies no heat, work or sensor state. During a stop, the actual configured fans, air exchange, thermal stores and moisture ledger continue evolving. A successful recovery requires a freshly closed cycle; previous-cycle heat/work are not reused and solver failures still propagate visibly.

## Independent native evidence

[Reviewer receipt](eight-head-science-independent-results.json) uses the immutable `/tmp/heatpump-six-counterexamples-in-domain-FD-replay/snapshot` and independently matches its production source/native fingerprints. [Reproducible quadrature check](eight-head-science-independent-check.mjs) uses raw guarded `PropsSI`, composite Simpson integration with 1024/2048 panels per sensible phase in log-temperature and exact latent enthalpy integration. It does not call production `conductanceIntegral`. It shares the native EOS and therefore tests numerical implementation consistency, not independent experimental accuracy.

Both exact saved eight-head checkpoints freshly close:

| Checkpoint | Shared Tc | Closure residual | Hot branch | Mixed header |
|---|---:|---:|---|---|
| Original edit at 360 s | 37.581255743°C | 0.039079799 W | Vapor | Liquid |
| Subsequent near-saturation state at 374 s | 37.805390392°C | 0.000546814 W | Two-phase | Liquid |

The reviewer independently reconstructed branch heat, total mass, mixed-header and expansion enthalpies, and the cycle energy identity. Energy differences were approximately 2–5×10⁻¹³ W. Simpson refinement passed the recorded checks. Near equilibrium, implied UA is poorly conditioned by the PH inverse; the receipt separately records the outlet-to-metal limiting heat gap, at most 0.000103441 W in these samples. This is a limiting heat difference, not a claim that every outlet has that numerical error.

The reviewer also independently restored the exact preceding accepted transactions for sequences 16, 22 and 28, preserving their original initial-scenario ledger origins. Sequence 16's first held interval runs 75 W of indoor fans and the 85 W outdoor fan with zero compressor work and no cycle, reducing source metal from 57.643815 to 57.496496°C. It freshly restarts at 180.25 s after the preceding 150 s checkpoint, with source metal 41.932963°C and closure residual 0.066028458 W. Energy <0.01 J, water <10⁻¹⁰ kg and original scaled mass checks pass. The hold/recovery includes the existing minimum-off dwell. Sequences 22 and 28 explicitly hold discharge before attempting an unsolved cycle; their held compressor work is zero and their conservation checks pass. Those one-step checks do not certify their complete schedules.

[Implementer focused receipt](shared-header-restart-focused-results.json): 10/10 native warm/header/inverse/reference tests and 4/4 restart tests pass at the listed source. New tests cover branch/header entropy production, separate inverse bisection, both saved warm crossover states, actual fan/store recovery, independent latch persistence and cold start screening. The inverse bisection shares production EOS quadrature and is not an independent integration method. All 11 listed source/test/fixture fingerprints were independently matched.

[Implementer complete replay receipt](shared-header-restart-six-replay-results.json): all six exact saved schedules pass on the final opposite-FD source: sequences 7, 16, 22, 28 and 11 each complete 840 simulated seconds, and the 45°C heating grid completes 120 seconds. Maximum recorded energy residual is 1.251698×10⁻⁶ J and maximum water residual is 9.414692×10⁻¹⁴ kg. The reviewer independently matched the receipt's current source/native/tool files; the full simulations themselves were operated by the implementer. These six passes replace the earlier pending retained-replay gate for this scoped review.

## Frontend mapping checked before the later owner decision

The audited frontend maps effective G in W/(m³ K) to the engine's whole-room H in W/K through `H=G×volume`; its defaults preserve 45+25+15=85 W/K. The reference ventilation estimate is 0.34×volume×ACH, giving 28.815 W/K at the assumed 0.25 ACH and total 113.815 W/K. It is separate from the native instantaneous moist-air flux. At this stage that residual-flow assumption was unmeasured and did not resolve mechanical heat recovery. The owner's subsequent double-flow confirmation requires a separately reviewed ventilation model.

The RT/RE ruler is explicitly a whole-house illustration from user-supplied examples. It is neither a room grade nor a regulatory requirement/certification. RT2012 uses building energy/design criteria, not that ruler's single conductance number. [Ministry RT2012 explanation](https://www.ecologie.gouv.fr/politiques-publiques/reglementation-thermique-rt2012)

Opening and nonoverlapping solid contact areas act in parallel. Their default conductance is `4×40 + 45/(0.26+0.120/0.040) = 173.803680982 W/K` per floor pair. The solid path has surface-film resistance in series with the glass-wool layer; the two paths' conductances add. This is consistent with basic conduction/resistance accounting. [DOE heat-transfer handbook](https://www.energy.gov/documents/doe-hdbk-1012-92vol2) The declared λ=0.040 W/(m K), combined film resistance 0.26 m² K/W and opening coefficient 40 W/(m² K) are representative effective assumptions. No orientation-specific film, buoyancy, thermal bridge or moisture transport is resolved.

Per-room admitted window-solar watts add once to prescribed sensible gains. The engine adds them to room energy and external boundary energy, while HVAC heat, useful-service accounting and COP exclude those prescribed gains. Default solar remains zero. This is a manually supplied effective gain, not a glazing/solar-position solution. No OEM performance fit or forced match to the owner's electrical observations is part of this acceptance.

## Exact checked source fingerprints and release boundary

| File | SHA256 |
|---|---|
| `src/engine/cycle.ts` | `294d647a26f60d319641c9b7fe4645378472dd5c70a8e6c0ef6075168aaf29e4` |
| `src/engine/engine.ts` | `d19581635f7086e8e9d041bd7e1b3dc69fd1d7fe4b94a397cae7a54fb826d963` |
| `src/engine/envelope.ts` | `eaab1d96df755b322050854fa8b7108e1f4918fbeb4dd1206d815ba9c74dc4e3` |
| `src/engine/drive.ts` | `d94247f20b359a61980e0d5af121d5299133f3b65a49358c4c40540a6655d0dd` |
| `src/engine/types.ts` | `2d37d59af8e071ac4ea8fb6edc85605f0ee63d3ce3900f8af8d6f62340470c24` |
| `src/engine/properties.ts` | `7f4bb2f372a77f30e76844dd7ef9d7afa6d25f72079a09ce66586cdc134404d1` |
| `src/types.ts` | `eb51ba7eb259838ce770cd43fca6ebff035cc700191d18cda71fc77e413632f8` |
| `src/state.ts` | `72d038d89cfd71b665368bc1b7ffd049610e1bfb9841fee3c5c7f991a2d8358e` |
| `src/runtime/config.ts` | `3feefb75d8ae3b5b26bbb8cc9290b347f70e88dd50108ee9368eb4c3c79d5424` |
| `src/settings.ts` | `078b26dcdc66548d8e7f9150fd2fa47468d8138714586e756db685b60a5d17a1` |

Native JS/WASM and exact fixture hashes are recorded in the independent receipt. Acceptance is limited to these fingerprints and the stated focused/native checks and complete six-schedule receipt. Intermediate c652-source four-schedule results do not certify the later opposite-FD source. Fresh broad regression and combined review of the requested new U/area/ventilation frontend remain release gates. No unresolved scientific source blocker was identified within this scoped change; manufacturer calibration, complete icing physics, the unreproduced worker-fatal screenshot and public charge release remain outside it.
