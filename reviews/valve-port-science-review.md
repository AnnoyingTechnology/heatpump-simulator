# EEV valve-face diagnostics: independent science review

Reviewed 2026-10-11. **Accept the corrected frozen engine valve-face diagnostics and final frontend mapping in their declared diagnostic/display scope. No unresolved scoped scientific blocker remains.** New complete regression/robustness and release gates remain root-owned. This acceptance makes no OEM performance/controller/topology claim.

Reviewer read the corrected frozen cycle/type changes, guarded native property service, physical pipe endpoint equations, focused tests, frontend mapping/geometry/inspector/component explanations and implementer receipts. Independent reviewer-only `valve-port-independent-check.mjs` passes against immutable `/tmp/heatpump-valve-science-snapshot-osvyohga`; its JSON receipt pins source, compiled files and exact native artifacts. Current cycle/type/test files independently match that snapshot. `valve-renderer-independent-check.mjs` also passes four isolated-browser groups at final frontend hashes. No implementation, test, build, dist or git changes were made by the reviewer.

## Physical diagnostic scope

An ideal adiabatic throttle without shaft work preserves stream enthalpy across its pressure drop. This does not prescribe one outlet temperature or phase. The added face coordinates satisfy this idealization while retaining the existing circuit assumptions. [DOE Fundamentals Handbook, Thermodynamics, Volume1, throttling processes, printed page29](https://www.energy.gov/documents/doe-hdbk-1012-92vol1)

Pressure and enthalpy determine the pure-fluid state. CoolProp's native PH flash supplies temperature, density, entropy and phase/quality; the new diagnostics impose no phase. Forcing every valve outlet liquid or two-phase would contradict valid accepted states. [CoolProp high-level property and phase documentation](https://coolprop.org/coolprop/HighLevelAPI.html)

Heating with physical field lines uses the transported returning small-line endpoint as EEV inlet, rather than the indoor coil outlet. The EEV outlet uses low-side pressure and the same enthalpy. Physical cooling uses common condenser output as EEV inlet and the solved small-line start pressure as EEV outlet, before the field line changes pressure/enthalpy. Idealized heating retains individual branch outlets and mixes their mass-weighted enthalpies downstream; a mixed liquid header does not require every upstream branch to be liquid. Cooling and reverse-cycle defrost retain their actual solved inlet/outlet phases. Inactive branches retain null array positions.

The valve faces are stream diagnostics, not a new valve flow law, resolved valve geometry, OEM controller calibration or manufacturer-specific plumbing validation. Existing native property domain, hard iteration cap, pressure/mass residual tolerances and physical heat/mass/energy equations remain unchanged. Trial metadata stores the existing face coordinates without new PH flashes during residual/pressure trials; already solved states are reused. Additional PH flashes occur only when publishing the selected accepted output.

## Independent final checks and corrected blocker

Against final immutable `/tmp/heatpump-valve-science-snapshot-osvyohga`, ten direct cycles pass: idealized/physical heating and cooling, each with inactive branches, idealized defrost and heterogeneous warm heating. Raw guarded native PropsSI independently matches every face's PH temperature, density, entropy, phase and quality; wet-state quality also agrees with the saturation-enthalpy lever rule. Every active EEV has decreasing pressure, identical inlet/outlet enthalpy and nondecreasing entropy. Physical field-line endpoint reconstruction and line heat match; this is consistency evidence using the existing transport correlation, not independent experimental validation of that correlation.

Deleting only `branchValveInlets` and `branchValveOutlets` leaves all ten physical outputs exactly equal to the immutable pre-diagnostic opening baseline. Maximum checked closure residual is0.09204099 W, within unchanged tolerance. The defrost fixture validly remains liquid downstream; the heterogeneous heating fixture retains a two-phase individual branch distinct from its mixed liquid header, while two other valve outlets remain liquid. Implementer separately reports25/25 focused/adjacent passes and11 direct-cycle plus162 engine-output exact comparisons at the corrected hashes; these are attributed evidence, separate from the reviewer's checks.

Reviewer initially found a genuine blocker at historical candidate cycle hash`bb917edb2c1dfee6d57280519b7e9baf33030f2d5124f577e96b8449b3cc7008`. An injected unique accepted outlet PH failure produced:

```
Neither heating SC-target nor minimum-lift controller closes:
independent accepted diagnostic PH failure; alternate:
No feasible shared-pressure operating point (best residual 2011.2 W ...)
```

This demonstrated that an already closed cycle's diagnostic failure entered an alternate physical-regime solve. The old fixture ultimately faulted rather than returning an alternate cycle. The implementer corrected the publication boundary: private physical selection returns the accepted output and face metadata; public solveCycle flashes the faces only after every physical-regime fallback catch has finished. The original physical closure fallback remains intact. Diagnostic failure cannot select a new pressure regime, synthesize a state or become ordinary idle.

Final independent failure checks pass: exactly one accepted outlet PH failure propagates its original message directly, with zero subsequent PT or saturation-pressure queries. A separate publication-specific failure in a fresh HeatPumpEngine step yields one explicit fault, null cycle, zero compressor/fans and simulated time0. Room/outdoor thermal and water stores, demand integrals, thermostat calls, active history, drive/state timers, retained fluid and energy/water ledgers equal the pre-step checkpoint exactly. The implementer's regression additionally preserves the original error object and counts zero later property queries; it demonstrably fails against the previous immutable candidate. The historical blocker receipt remains as evidence of the correction, not current blocked status.

## Checked final engine fingerprints

These final fingerprints are independently matched to immutable source/native execution. The independent JSON also pins compiled cycle/types, Properties, transport and native adapter/JS/WASM.

| File | SHA256 |
|---|---|
| `src/engine/cycle.ts` | `8d47208fd11a57d3cd1ea57d2e843237a767ce05a840bda955b454195dd63c40` |
| `src/engine/types.ts` | `04eb849dfb52d4cfef49205961b04d68647d00bc5b384eb60500201ed4083392` |
| `src/engine/engine.ts` | `92174a5beb3fbbefd9c9bfba64a3f0155261a11782c9420f4bdfe3d6ae887903` |
| `src/engine/properties.ts` | `6fb2812381e471623e449a5b593cd4e1d9874f32e559b33bd05c2eac7b6ad36e` |
| `src/engine/transport.ts` | `928ab51cd8ca1193e68ba0821ee88ae2966521314ad9b1fd1b9894f253e2ed31` |
| `tests/engine/valve-ports.test.mjs` | `f9938a0009d09039afcc353a8c1753ce7e67ea6f8524da952fab96882d0e84f8` |

## Final renderer interpretation and independent browser evidence

In heating, the field stub and full small field-line drawing use the individual upstream outdoor valve face; the header stub uses the downstream face. Cooling and reverse-cycle defrost reverse those physical side assignments. Their common header uses the actual mixed expansion state in heating and common condenser state in cooling/defrost. Closed branches show idle with no arrows. Phase marks derive from actual solved phase; the continuous color derives from temperature, not phase.

The **whole physical field-line drawing has one representative outdoor valve-face color**, not a spatially resolved pressure/enthalpy/temperature profile. Its indoor coil end and probe independently retain the actual modeled indoor endpoint, which can differ due to field-line heat/pressure effects. This remaining schematic simplification is accepted and must not be described as a solved spatial PH map. The field stub joins the full field line at the casing seam with exactly the same representative state, so the casing creates no fabricated fluid-state jump.

Reviewer identified a second boundary issue in the initial renderer: missing optional valve arrays fell back to fixed-example phase/temperature assumptions. Root corrected it before final checks. Active live faces with missing/null diagnostics now use an explicit unknown state, hatched fill, no temperature, phase marks or arrows. A known closed branch remains idle. The EEV inspector withholds missing inlet/outlet temperature, pressure, phase and quality rather than manufacturing a common state; known stream direction/flow can remain reported independently.

The isolated-browser receipt uses seven accepted **native direct-cycle fixtures as synthetic display inputs**: mixed ideal heating, physical heating/cooling, ideal cooling, liquid defrost and inactive heating/physical cooling. It is not a claim that the enclosing worker generated those engine snapshots. Within that explicit display-test scope, all four groups pass:

- Selector maps each individual valve face, mixed common header and indoor endpoint with the correct orientation and actual phase/temperature.
- Materialized tube phase, exact temperature-derived stroke, direction/arrows and coil-end probes match those states. EEV inspector correctly names upstream/downstream physical sides and phase, and reports no flow for the closed branch.
- Geometry checks24 branch rows across1/3/8/12-room layouts. Materialized three-branch EEV centers are scene x420 with header/field faces x411/x429 at identical row y; they overlap the20-unit valve body by1 unit per side. Shared local center280/faces271/289/header260 are inside the casing, and each field stub's casing endpoint equals the field line's start. Role labels and203×14-unit generic side-view fan agree with the rendered geometry. This is schematic consistency, not OEM internals or exact fan design.
- Missing and null arrays in both heating and defrost withhold state. Actual rendered fill is `url(#pTempNone)`; marks and arrows have opacity0 and the inspector shows unavailable endpoints/quality.

Component explanations accurately distinguish compressor work, pressure throttling, reversed coil roles, air-moving fans, suction liquid separation and fully open service isolation valves. The source qualifies family-informed stop-valve symbols and unknown exact N8 internals. No phase/color is forced to make the diagram appear conventional. Root's actual-worker startup and whole-engine campaign receipts are separate evidence; these display checks do not replace them.

## Checked final frontend fingerprints

The browser QA snapshots source before execution, compares copied/current fingerprints and verifies no reviewed source drift at completion. `valve-renderer-independent-results.json` retains all exact source pins and per-case/materialized geometry evidence.

| File | SHA256 |
|---|---|
| `src/runtime/view.ts` | `ffb6f27ac117229f08fe0dc36369234e8c935d655e2a4b6613a84b4dbb48ed04` |
| `src/geometry.ts` | `87a2d3e7ce568a0e7e9948413213ed8165734491fac5ee56b12f45aa695ff786` |
| `src/scene.ts` | `db9fe1ebf8571adc70912f40d949f0159207c57359316e6e45a7038940cce0aa` |
| `src/inspector.ts` | `9baef35d3d32864ad129c34a9659329ca9e5dc15acc9f557b25965444a9ce1bf` |
| `src/settings.ts` | `089bbd528f0b84522dc86fc1e4f60fd43df575c8e5fc1501c002144d1d0be9ed` |
| `src/circuit.ts` | `7cd30eba752813694404d48474002b3ee0e556b90fe70965c7f706841dc4c94c` |
| `src/pipes.ts` | `01603d1f53797b730150fe55e467b3b08a6456ffc3eae9ae7f6d8e04df31c4a6` |
| `src/style.css` | `8e778ec8f88715ff8e8058db514bfc27eb3211edb01466a178c723e454a3bda9` |

Scoped engine and renderer acceptance is complete. No OEM fit, measured owner performance, spatial field-line PH resolution or complete release approval is implied. Root-owned whole-engine/endurance/publication gates remain separate.
