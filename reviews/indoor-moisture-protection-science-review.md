# Reference indoor moisture and protection: independent science review

Reviewed 2026-10-11. **Accept the frozen source and final scoped focused evidence below. No unresolved source science blocker remains in this scope. Fresh broad regression, retained-scenario campaign and browser integration remain release gates owned by root.** This is acceptance of the declared generic Reference model, not manufacturer calibration, complete indoor icing physics or experimental charge release.

Reviewer read source, differences, tests and receipts; reported defects before freeze and independently checked the final fingerprints. Reviewer made no production edits, builds, engine simulations, commit or push. Native engine results are attributed to the implementing agent. A short independent raw guarded-EOS scalar check is identified separately below.

## Room phase storage and conservation

CoolProp defines humid-air enthalpy in J/kg dry air, humidity ratio in kg water/kg dry air and specific volume in m³/kg dry air. Gas properties alone do not represent retained condensed water. [CoolProp humid-air documentation](https://coolprop.org/fluid_properties/HumidAir.html)

The room now stores total gas-plus-condensed-phase enthalpy in `airEnthalpyJ`, gas humidity ratio separately, and retained water/ice masses. The original whole-system energy sum includes that enthalpy exactly once; water includes gas water plus retained mass. Condensed liquid uses `4180*T`, ice uses `−333500+2100*T` J/kg, consistent with the existing film's 0°C liquid reference. The equilibrium solver retains the fusion interval at 0°C, conserves total H/W, and returns actual vapor plus retained phase. Its enthalpy root tolerance remains `1e−5+1e−10*|h|` J/kg dry air. Saturated RH=1 follows the solved phase/saturation state; it is not clipping arbitrary supersaturation.

Ventilation exchanges gas enthalpy and vapor only; retained water stays in the room. Actual coil condensate drains through the existing water and drainage-enthalpy accounting. Returned outlet mist enters room total H/W instead of being invented as coil drainage. Fan heat is added to total outlet enthalpy before any required phase reflash. Room/fabric/metal candidates and controller history remain one transaction. Volume changes retain condensed mass, and pressure edits normalize canonical gas/phase quantities; configuration energy/water impulses remain explicit.

This is an equilibrium lumped condensate reservoir. It does not locate droplets, model wall sorption, drain floors, transport humidity through room links or resolve an indoor ice film. Constant water/ice heat capacities and the simplified 0°C transition remain declared approximations. The unsupported indoor-coil-icing error remains; retained room ice and outdoor exchanger frost are distinct states.

## Antifreeze and overlapping protection

Stopping the compressor while keeping the indoor fan operating until a cold exchanger warms is a real control structure. Mitsubishi Electric describes this in OBH801B, section10-1.1, p22. It validates the principle, not the simulator's thresholds or a Daikin control map. [Mitsubishi Electric service manual](https://mitsubishielectric.pt/documents/20124/62658/UI%2BMLZ-KP/89b1a287-e2e4-9aa4-f907-815709a1f37a)

The generic cooling policy stops at mean metal temperature2°C and releases at5°C. A prospective cooling-metal check uses the actual air exchange and candidate refrigerant heat; an interval crossing2°C discards the freshly closed algebraic cycle before heat/work is committed. Reference has no stored refrigerant inventory to reset. The accepted passive/fan interval then evolves through the normal thermal ledger; stopped compressor work is zero and COP is null.

Review identified both protection-trigger orderings and an Off interval losing its release requirement. Final source now persists separate discharge, pressure, condensing and antifreeze latches. Diagnostic cause is not the recovery state. Unknown stopped temperatures do not prove recovery; actual cooling coil temperature remains available while stopped. Explicit heating-mode exit cancels the cooling-only latch. Existing minimum-off dwell applies after recovery. These corrections avoid treating a warmed-to3°C coil or a still-hot discharge as recovered because another displayed cause changed.

The added condensing governor uses declared60°C derating,63°C stop and59°C recovery, preserving the65°C hard condensing boundary. Actual running candidates still freshly satisfy the original EOS/UA equations, pressure ratio and discharge-temperature limits. Protection does not convert a failed nonlinear solve into accepted heating or change stored thermal states.

## Warm heating and held restart estimate

Idealized heating can release its prescribed subcooling target at the existing positive1K saturation lift. Actual finite-UA branch outlets and their weighted mixed PH header determine heat, liquid return and expansion enthalpy. The mixed header may lie below a hotter branch when colder coils compensate; the floating outlet bound therefore uses the coldest sink. Accepted cycles require a liquid mixed outlet, dry suction, positive compressor work and the original heat/mass residual limits. Physical field-line heating retains its earlier control formulation. This is an explicit alternate controller regime, not a proved universal complementarity law or OEM operating strategy. Additional cold-corner seeds change initialization only.

An already latched envelope hold may use a current thermal-boundary control estimate to defer an infeasible full-cycle forecast. Review corrected its former hottest-sink assumption, which contradicted the floating mixed-header regime. Final estimate uses the coldest active sink, checks its native property domain, and compares discharge enthalpy against the temperature cap before constructing an excessive PH state. Unavailable pressure/temperature information cannot release a required latch. Recovery still needs a freshly closed actual operating cycle; the estimate supplies no heat, work or sensor reading.

This estimate is a declared controller heuristic, not a global real-fluid discharge lower-bound proof. Reviewer's independent15-state scalar check at fixed condensing23/30/50°C, evaporating−20…20°C, SH3K and efficiency0.7 found discharge temperature decreasing with increasing evaporating temperature in those samples. That supports the chosen tendency only; it does not establish monotonicity throughout the operating domain.

## Volumetric airflow

Optional volume flow is divided by native specific volume at the actual inlet gas temperature, humidity and pressure to obtain dry-air mass flow. This uses the correct CoolProp basis, with the same conversion in the prospective antifreeze check and actual indoor/outdoor thermal update. Dirt scales passage flow/UA as before. Natural-flow behavior and constant forced-fan power remain the existing generic assumptions. Catalogue high-fan flow across modes is not a measured fan curve or full capacity calibration.

## Frozen evidence and release boundary

Read `reviews/reference-moisture-final-focused-results.json`, `research/reference-indoor-protection.md` and the four named focused test files. Final implementing-agent result: **10/10 native focused tests pass**: envelope3/3 in40.172s; room moisture, airflow and warm heating7/7 in20.455s. Tests cover phase H/W reconstruction, freezing/re-evaporation, volume/pressure edits, actual antifreeze hold/fan warming/restart, both protection orderings/Off/mode exit, native airflow equivalence, heterogeneous warm headers and fresh crossover closure. Both original retained cold/hot schedules complete their physical checks; cold exercises an actual hold, while safe hot derating need not create a hold.

The passive condensation refinement uses timesteps0.25/0.125/0.0625s for40s. Temperatures7.424643/7.434467/7.439359°C yield difference ratio0.498, consistent with first-order integration; every run retains original energy<0.01J and water<1e−10kg checks. It is refinement evidence for that fixture, not accuracy certification for all scenarios.

The earlier73/73 regression and10/12 retained replay receipts are explicitly intermediate source. They do not establish the final combined release. Fresh broad tests/campaign/browser checks remain pending; the friend's native worker-fatal screenshot is not reproduced or explained by these fixes. Public charge remains gated. No equipment performance fitting is accepted.

Independently checked final SHA256 fingerprints match the focused receipt:

| File | SHA256 |
|---|---|
| `src/engine/air.ts` | `6dfb70bd7b7c5b84501e0de1633cf8378ea0b2bd0eb903dafe09c31625745d15` |
| `src/engine/engine.ts` | `ddcce40d6a88656b7410dfa0615ec962fca5f6b2a2f87d0b1f43193e12526553` |
| `src/engine/types.ts` | `7da718b766ed47970f705aeb84f2fb9743f35ce477d6abb98ca0dfe652a279fb` |
| `src/engine/drive.ts` | `0fb04506689d27ed4c11d89f22a30db504747e36362a850b49577a334e72ef6a` |
| `src/engine/cycle.ts` | `888c92ab17782c7eccd876a519bbce2fa1deb95d126c868779ffd41a2004cea0` |
| `src/engine/envelope.ts` | `feffb4700d52704aef95c7d2ff6dedd247274eeeb2a01c1662d1c6904b7aec50` |

## Owner heat-loss interpretation: separate calibration audit

The UI coefficient is whole-room envelope conductance H in W/K: `Q=H*(Troom−Tout)`. A coefficient in W/(m²K) instead requires area. The three whole-room H values sum; they are not averaged or multiplied by floor area. Internal floor links redistribute heat and cancel in the whole-house balance.

Current owner envelope45+25+15=85W/K. Illustrative dry-air density1.2kg/m³ and cp1006J/(kgK),339m³ total volume and assumed0.25ACH give approximately28.42W/K additional unrecovered ventilation, or113.42W/K total. At room18/21.5/18.3°C and outdoor1°C, envelope1537W plus ventilation530.72W minus200W gains gives1867.72W before thermal-storage change and additional solar gains. A500W electrical observation would imply whole-service COP about3.735 for this steady approximation; it does not independently measure building H or compressor efficiency. The649W/20-minute generic comparison is not established steady equilibrium.

The illustrative RT2012 whole-building110–180W/K range is not a statutory room coefficient or a universal building H. The regulation uses Bbio/Cep/Tic criteria and depends on building/climate characteristics. On a consistent total-building basis113W/K does not indicate2–3 times better insulation. [Ministry RT2012 explanation](https://www.ecologie.gouv.fr/politiques-publiques/reglementation-thermique-rt2012)

The owner's article confirms airtightness efforts, double-flow ventilation and approximately200W equipment gains. The current0.25ACH is an unmeasured unrecovered/equivalent residual-flow assumption; actual mechanical heat recovery and infiltration are not separately modeled. Double-flow heat recovery can reduce ventilation losses, but no measured recovery efficiency is supplied. [Owner sizing article](https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html), [ADEME ventilation explanation](https://agirpourlatransition.ademe.fr/particuliers/amenager-maison/renover/choisir-systeme-ventilation)

No equipment fitting or house-loss change is authorized by this unit clarification. Historical daily means with setbacks remain distinct from the continuous500W observation, as recorded in `research/owner-heating-calibration-points.md`.
