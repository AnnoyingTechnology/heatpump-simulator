# Model validation plan and illustrative UI fixtures

Status: planned acceptance work, updated 2026-10-10. [Model specification](../model-specification.md) is authoritative for equations; [scientific reference](../heatpump-science-reference.md) defines terms. **Only the bounded property feasibility probe has been executed.** No coupled heat-pump, room or frost engine has passed these gates. Interface sample states below are constructed examples, not machine telemetry.

## 1. Evidence already observed

The project downloaded official CoolProp **8.0.0** release JS/WASM, checked identity/hashes and ran locally hosted Node and Chromium probes without a native toolchain. Seven named pure/pseudo-pure cycles, selected explicit R410A/R407C mixture PT/PS/PH and interior-quality states returned finite values. The final recorded run initialized in 90.2 ms in the browser; named-fluid four-call p95 was 0.4–0.7 ms, with maximum sampled PT→PH temperature residual 1.36×10⁻⁷ K. Timings vary by run; the earlier run initialized in 126.6 ms. Explicit-mixture work was appreciably more expensive. [Artifact and bounded results](coolprop-browser-feasibility.md), [raw browser results](coolprop-probe/browser-results.json), [raw Node states](coolprop-probe/node-results.json)

This justifies **direct self-hosted WASM as first implementation route**, in a worker with reused states/continuation. It does not establish EOS accuracy, whole-domain robustness, table errors, full solver frame cost, a manufacturer fit or transient realism. If coupled timing later requires tables, implement and validate them as a separate approximation; do not add their maintenance cost before evidence justifies it.

The release exposes `HAPropsSI` and `PropsSI('Phase',...)`, while `PhaseSI` is unavailable. Explicit-mixture raw `Q` is molar fraction; `Qmass` is the mass fraction needed by the UI. At explicit R407C 800 kPa, raw Q=0.5 gives Qmass≈0.4817053573, a useful nontrivial regression. Pure R32 does not distinguish those fractions. [Probe record](coolprop-browser-feasibility.md)

## 2. Independent property and domain gate

For each enabled fluid, document EOS/transport reference, actual backend identifier, composition basis, operation/phase coverage, critical/triple bounds and selected compressor domain. Test single-phase liquid/vapor, saturation endpoints, interior two-phase states, SH/SC near zero, all supported evaporating/condensing temperatures, pressure drops and mixture pinch regions. Include randomly sampled off-grid points and deliberately invalid states.

Check forward/inverse round trips, density positive, sensible cp positive in stable single phases, dew≥bubble for selected subcritical blends, pure saturation temperature independent of quality, enthalpy/reference consistency and correct Qmass. Test pseudo-pure and true-mixture models separately: near-matching predictions do not make their definitions identical. Molar fractions reconstructed from the documented mass composition must recover that composition to tolerance.

Internal backend round trips show numerical consistency. For external property comparison use independent primary tabulations/measurements or reference calculations with disclosed shared EOS pedigree; CoolProp versus REFPROP implementing the same EOS is not independent experimental proof. Compare refrigerant pressure/enthalpy **differences** at identical reference states. Cite fluid-specific uncertainty and avoid universal “reference accurate” claims for every transport property.

If tables are introduced, proposed acceptance targets are max 0.1 K temperature error, 0.2% pressure error where independently reconstructed, 0.3% relevant enthalpy-difference error and 1% resulting steady cycle Q/P error across covered domain. These are **project engineering targets**, not standards or currently achieved bounds. Near phase boundaries/critical conditioning may require finer meshes or excluded domains. A table with a failing corner is not accepted simply because mean error is small.

## 3. Invariants and analytic tests

Use meaningful analytic/integrated assertions rather than tests mirroring implementation. Proposed steady solve residual target: each mass residual ≤max(10⁻⁹ kg/s,10⁻⁶ of total flow) and component energy residual ≤max(0.1 W,10⁻⁵ of component throughput). Proposed integrated dynamic ledger error ≤0.1% of absolute exchanged energy with an absolute near-zero floor, checked together with timestep convergence. Choose final tolerances using solver conditioning and property errors; do not claim these already pass.

| Test | Required invariant or comparison |
| --- | --- |
| Elementary pure-fluid steady cycle | Qcond−Qevap−Pref=0; expansion h unchanged; compressor ηis definition recovered |
| Ideal compression | ηis=1 → s_out=s_in; ηis<1 gives s_out≥s_in for adiabatic model |
| Throttle/header | Pressure drop with nondecreasing entropy; ideal EEV h_out=h_in; header mass and enthalpy flux close |
| Parallel branch permutation | Reordering identical branches changes labels only; no summed mass/heat difference |
| Closed/off branch | No active refrigeration flow/Q; other branches recomputed under shared compressor constraint |
| Scaling dry fixture | Fixed thermodynamic states and proportional ṁ yield proportional refrigerant Q/Pref; fan power retains its own map |
| Finite UA limits | UA→0 means exchanger heat→0; larger dry UA approaches finite air-side capacity/pinch limit |
| Dry air heating | w conserved through coil; RH falls with rising T; outlet is air-side energy result |
| Wet cooling | Condensate equals dry-air w drop; enthalpy balance includes liquid drain; no supersaturated outlet without explicit water reservoir |
| Room no-HVAC RC | Known one-node exponential or two-node matrix exponential; requested steady H recovered; internal node exchanges cancel |
| Room latent-only experiment | H,w evolve together; no duplicate total-cooling sensible drop; recovered T matches analytic psychrometric energy solution |
| Adiabatic room | Zero envelope/ventilation/gains: air+fabric change matches supplied net energy |
| Film dry air | Zero vapor supply prevents deposition; frost can occur above 0°C outdoor dry bulb if surface is subzero and wet enough |
| Film isolated melt | Starting 1 kg ice at −5°C requires ~344 kJ to reach 0°C liquid; latent plateau maintained |
| Film refreeze | Retained liquid at 0°C freezes only as L_f/kg exits; mass remains until drained or vaporized |
| Full defrost | Compressor+indoor source+stored energy supplies outdoor condenser; melt uses remaining heat after metal/losses; normal heating interrupted |
| Time speed/pause | Equal physical timestamp gives same state at 0.25×…10×; pause advances no state/energy/timers |
| Mode reversal | Reverser connection/arrow direction changes; fixed service node changes HP/LP role; no invented equalization states |

For a simple steady cycle between **two fixed-temperature thermal reservoirs**, compare heating COP to `T_hot/(T_hot−T_cold)` and cooling COP to `T_cold/(T_hot−T_cold)` using Kelvin and the matching ideal boundary. Include nonnegative total entropy generation. A naive bound based on averaged dew/bubble temperatures is not valid for an arbitrary gliding, moist-air or storage transient cycle; use segment pinch and entropy/energy balances with the actual reservoirs instead. Fans/auxiliaries reduce full-system COP versus the narrower ideal compressor boundary in the usual fixed-reservoir test.

## 4. Dynamic and numerical matrix

Run one, three and five branch cases; unequal rooms/UA/airflow/lines; branches switched off/on; saturation and target limits; dry versus humid air; cold-dry and mild-humid frosting; repeated defrost with retained liquid; inability to complete defrost; thermostat cycling below minimum speed. Verify failure messages for impossible operating points and all property bounds.

At representative cases halve time step repeatedly; compare room T, accumulated electric/room heat, total deposited/drained water, defrost onset and duration, minimum suction superheat and discharge temperature. Suggested goal: room T within 0.05 K and integrated energy/water within 0.2% between two finest steps, with event-time comparison scaled to the physical step. These are planned criteria, not measured results. Event clipping must handle melt completion and mass exhaustion inside a step without hidden negative-mass correction.

Benchmark coupled solver **after implementation**, not only property calls: initialization/download, one-to-five branches, frost/wet coil, explicit mixtures, parameter-change convergence, cold-start root finding, and 10× physics stepping while preserving UI responsiveness. Record computer/browser and p50/p95/worst cost. No declared universal hardware speed target follows from a powerful local machine. Include a representative ordinary laptop before claiming CPU-only practicality broadly.

Static hosting checks: all runtime assets local, no property HTTP API, correct WASM MIME and repository-subpath resolution, offline behavior after assets available, worker load/errors and no need for custom cross-origin headers. Actual GitHub Pages publish/deployment is deferred; local static hosting is already observed, not a Pages deployment claim.

## 5. Equipment validation and uncertainty

Use exact full model/indoor combination and explicitly matched manufacturer temperature/humidity/airflow/fan-power conditions. The historical Daikin family catalogue identifies 3MXM52N2V1B combination 2.5+2.5+3.5; it is useful family evidence but not exact N8 revision calibration or an arbitrary-weather map. Its nominal branch split does not define load allocation control. [Primary-source register](primary-source-register.md)

Fit selected parameters to one training subset of operating points and reserve others as holdouts. Compare Q, complete electrical P, outlet air and pressures where available. Report parameter identifiability and uncertainty. Do not use a manufacturer's COP to fit ηis and then call the same COP an independent validation. Inputs sharing a generic UA/fan estimate remain explicitly uncertain.

Measured owner checks, if later authorized, need timestamped mode, outdoor dry bulb/RH, room and entering/leaving air, fan levels, active branches, total electrical meter boundary and installation geometry. Defrost/warm-up and steady windows must be separated. Pressure/flow measurements entail physical servicing and are not authorized by this document. No assumption that existing Home Assistant signals measure refrigerant conditions.

## 6. Constructed mockup fixture: shared conventions

**Required visible banner:** “Illustrative data — model not validated.” These are **schematic, approximate constructed states**. R32 refrigerant p,h,T came from the pinned EOS probe, but mass flows, fans, room/outdoor air flows, metal rates and chosen capacity allocation are freely selected examples, not a solved installed-system operating point. There is no manufacturer map. All pipes are adiabatic/no-loss in these fixtures. Numerical precision below is for reproducible arithmetic; UI should round to sensible precision.

All three active branches use fractions A/B/C = 0.30/0.40/0.30. Room volumes can be illustrative 50/75/45 m³; each has 20°C/50% RH in heating/frost/defrost, setpoint 21°C and separately marked generic envelope/fabric values. Cooling has 27°C/55% RH, setpoint 24°C. Ambient p=101325 Pa; ηis=0.70, ηdrive=0.93. A/B/C refer to displayed 25/35/25 nominal classes, **not** manufacturer-calculated branch allocations.

### R32 thermodynamic states

All pressures absolute; enthalpies kJ/kg; temperatures °C. Quality only exists at expansion state. Intermediate condenser/evaporator paths traverse two-phase zones, not single-phase pipes throughout.

| Constructed cycle | p_low [bar(a)] | p_high [bar(a)] | Suction T/h | Discharge T/h | Condenser outlet T/h | Expansion outlet T/xmass |
| --- | ---: | ---: | --- | --- | --- | --- |
| Heating and frost | 6.905764 | 24.783132 | 0.000 / 520.100745 | 100.251684 / 597.328587 | 37.000 / 269.229544 | −5.000 / 0.241235 |
| Cooling | 10.115038 | 27.947810 | 12.000 / 522.787125 | 92.141853 / 582.608391 | 42.000 / 279.608188 | 7.000 / 0.221213 |
| Defrost | 8.131013 | 12.808129 | 5.000 / 521.366589 | 38.865074 / 547.035132 | 12.000 / 221.352046 | 0.000 / 0.067720 |

Heating: gas branch is discharge vapor heading indoors; returning smaller line is high-pressure subcooled liquid; EEV downstream outdoor mixture is low-pressure. Cooling/defrost: compressor discharge vapor heads outdoor; outdoor condenser outlet is high-pressure liquid **before** outdoor EEV; smaller field line **after** EEV is low-pressure mixture heading indoors; gas return is low-pressure vapor. Common physical gas service tap reads high side in heating/frost, low side cooling/defrost. Virtual high/low diagnostic taps remain labeled virtual.

### Normal heating example

Outdoor **7°C/35% RH**, selected cold surface −3°C: low dew point permits a dry/nonfrost illustrative point. Total ṁ=0.018 kg/s, branches `(0.0054,0.0072,0.0054)`. Indoor fans `(0.020,0.035,0.020)` kW, outdoor fan 0.090, controls 0.015. No storage/condensate/frost change.

| Quantity | Constructed value |
| --- | --- |
| Refrigerant Qcond / Qevap / Pref | 5.905783 / 4.515682 / 1.390101 kW |
| Compressor electric / drive loss | 1.494732 / 0.104631 kW |
| Total electrical | **1.674732 kW** |
| Net room heating A/B/C | 1.791735 / 2.397313 / 1.791735 kW |
| Net room heating total / heating COP | **5.980783 kW / 3.571187** |
| Indoor dry-air flows A/B/C | 0.130 / 0.160 / 0.130 kg/s |
| Post-fan indoor outlet A/B/C | **33.511 / 34.688 / 33.511°C** |
| Outdoor dry-air flow / coil outlet / post-fan outlet | 0.900 kg/s / 2.031 / **2.130°C** |

Energy closure: Qcond−Qevap=Pref; useful rooms add 0.075 kW indoor fans; total electricity also includes 0.104631 kW outdoor drive loss, 0.090 outdoor fan and 0.015 outdoor controls. Outdoor air outlet incorporates its fan only; drive/controls heat are separate outdoor environment fluxes. Do not replace Qevap with a full outdoor-air/environment net flux without changing the label.

### Frosting example

Outdoor **3°C/85% RH**, film surface −3°C, same refrigerant endpoint cycle but chosen total ṁ=0.015 kg/s and branches `(0.0045,0.0060,0.0045)`. This is a synthetic snapshot, not a demonstrated UA/speed response. Fans `(0.015,0.025,0.015)` kW indoors and 0.060 outdoors; controls 0.015.

| Quantity | Constructed value |
| --- | --- |
| Qcond / Qevap / Pref | 4.921486 / 3.763068 / 1.158418 kW |
| Total electrical / drive loss | **1.375610 / 0.087193 kW** |
| Net room heating A/B/C | 1.491446 / 1.993594 / 1.491446 kW |
| Total net heating / COP | **4.976486 kW / 3.617656** |
| Indoor post-fan outlet A/B/C at same dry flows as normal | **31.247 / 32.215 / 31.247°C** |
| Outdoor dry-air flow | 0.900 kg/s |
| Contact effectiveness / ice deposition | 0.461984 / **0.000436001 kg/s = 1.569604 kg/h** |
| Film enthalpy storage rate | **−0.148153 kW** (new ice at −3°C, liquid-zero reference) |
| Outdoor-air enthalpy removal to film | 3.614915 kW |
| Outdoor coil outlet / post-fan outlet | 0.231 / **0.297°C** |
| Outdoor coil outlet RH | ≈91.17% on backend saturation convention |

This example uses backend humid-air saturation at the −3°C contact surface (ice convention), warm inlet humidity ratio 0.003996865 and contact saturation ratio 0.002948246 kg/kg dry air. The conservation construction is `Qevap = ṁ_da contact[(h_in−h_sat)−(w_in−w_sat)h_ice]`, with h_ice≈−339800 J/kg. Consequently `Qair−Qevap=Ėfilm`, not zero: deposition increases ice mass and makes the liquid-zero film energy more negative. The chosen COP is **not evidence that frost improves performance**; ṁ/fan selections differ freely. A later coupled solver must determine any degradation from physical UA/blockage/control changes rather than these unrelated chosen snapshots.

For UI frost accumulation, show an explicitly arbitrary initial ice mass, e.g. 0.10 kg, and mass growth at the listed instantaneous illustrative rate; do not infer a calibrated defrost interval. Metal storage is zero only for this constructed snapshot.

### Wet cooling example

Outdoor **32°C/50% RH**, rooms **27°C/55% RH**. Total ṁ=0.020 kg/s, branches `(0.0060,0.0080,0.0060)`. Same fans as normal heating. Indoor wet ADP=10°C, contact bypass factor=0.15, liquid drain=10°C. These selected air-side values are physically coherent with the chosen Q, not manufacturer fan/coil parameters.

| Quantity | Constructed value |
| --- | --- |
| Qevap / Qcond / Pref | 4.863579 / 6.060004 / 1.196425 kW |
| Total electrical / drive loss | **1.466479 / 0.090054 kW** |
| Total drain mass / liquid drain energy | **2.815395 kg/h / 0.032690 kW** |
| Room air enthalpy removal before fans | 4.896269 kW = Qevap + drain energy |
| Net cooling A/B/C after fans | **1.448881 / 1.923507 / 1.448881 kW** |
| Total net room cooling / cooling COP | **4.821269 kW / ≈3.287650** |
| Indoor dry-air flows A/B/C | 0.059046 / 0.078728 / 0.059046 kg/s |
| Coil outlet / post-fan A/B/C | 12.569 / **12.901 / 13.004 / 12.901°C** |
| Outlet humidity ratio / coil outlet RH | 0.008363849 kg/kg dry air / ≈91.95% |
| Outdoor dry-air flow / post-fan outlet | 0.900 kg/s / **38.602°C** |

The Qevap differs slightly from room enthalpy removal because condensed liquid carries energy out; including that term is intentional. Qcond−Qevap=Pref still closes. Net room cooling excludes fan heat. If UI instead defines a refrigeration-coil capacity excluding drainage enthalpy, use its separate label; do not mix the two COP numerators.

### Reverse-cycle defrost snapshot

Outdoor **3°C/85% RH**, room air 20°C/50% RH, initially 0.10 kg ice **already warmed to 0°C**. Reverser uses cooling connections. Chosen total ṁ=0.003 kg/s, branches `(0.0009,0.0012,0.0009)`. Both forced fans off; natural convection plus stored indoor metal supply energy. This snapshot **does not** solve the full defrost duration, natural-convection geometry or a Daikin controller.

| Quantity | Constructed value |
| --- | --- |
| Indoor refrigerant evaporation / outdoor condensation / Pref | 0.900044 / 0.977049 / 0.077006 kW |
| Total electrical / outdoor drive loss | **0.097802 / 0.005796 kW**, including 0.015 controls |
| Signed useful indoor heating A/B/C | **−0.180013 / −0.240017 / −0.180013 kW** |
| Signed useful indoor heating total | **−0.600044 kW** |
| Indoor metal storage rate | −0.300000 kW (additional source to evaporator) |
| Outdoor condenser split | **0.750000 kW melt + 0.127049 kW metal warming + 0.100000 kW ambient loss** |
| Ice melt rate at plateau | **0.002248876 kg/s = 8.095952 kg/h**, Lf=333500 J/kg |
| Forced air outlet temperatures | **— (forced fans off)**; natural-convection state not presented as fan outlet |
| Heating COP | **— (Defrost)** |

Ice mass transfers to retained liquid; total film water does not vanish. If no drainage, film energy increases 0.750 kW, ice decreases and liquid increases by the same melt mass. With 0.10 kg plateau ice, melt alone would take ~44.47 s at constant 0.750 kW; preceding ice/metal warming, losses and rate changes alter a real event. Do not turn that construction into a manufacturer cycle timer. Source energy is 0.600044 kW from room air plus 0.300000 from indoor metal plus 0.077006 refrigerant compressor work. The 0.100000 ambient loss is exclusive of drive/control heat; retain all in the global ledger.

### Idle/equilibrated snapshot

No compressor or fans, controls 0.015 kW, no ice/water transfer; coils initialized at their respective local air temperatures so HVAC coil heat exchange is zero for this fixture. Room envelope/ventilation/fabric still exchange heat according to configuration; “idle” does not imply room temperature is constant. Useful room HVAC heating/cooling=0; COP=“—”; p_high,p_low,T_refrigerant,quality=“— (off-state inventory not modeled)”; arrows hidden. Indoor/outdoor air outlet=“— (no forced airflow).” Retained prior ice would remain if an idle variant includes it. Standby power still accumulates electric energy and explicit outdoor controls heat. A freshly stopped warm coil requires the dynamic metal model and cannot reuse this locally equilibrated zero-HVAC-Q fixture.

## 7. UI acceptance tied to these fixtures

Check displayed pressure conversion, arithmetic COP and total electric power; clear coil-side versus useful room capacity; branch sum/mass closure; phase palette independent of temperature; four actual reverser ports/pairings; EEV outdoor branch location; fixed common gas service location and virtual extra taps. In cooling, field smaller pipes downstream of EEV are two-phase. In defrost, normal heating is interrupted and both film melting and signed room extraction are visible. Heating changes RH with w conserved; wet cooling yields condensate; idle hides unmodeled pressures.

Changing temperatures/RH/geometry in the **mockup** must either keep readings explicitly synthetic, select a named constructed fixture, or mark affected readings unavailable. Do not interpolate these five examples into an engine. Once a real solver replaces them, retain fixture data only as test/illustration evidence and replace its banner according to actual validation state.
