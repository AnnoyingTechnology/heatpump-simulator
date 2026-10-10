# Refrigerant temperatures and visible probes

Observed 2026-10-10. Scope: source inspection and short actual pinned CoolProp 8.0.0 R32/HA probes, without changing engine, view, scene or colour code. These are generic-model outputs, not measurements or manufacturer calibration. No full integration suite was rerun.

## Finding

The checked heating engine **does not calculate equal outdoor-exchanger inlet/outlet temperatures**. The actual current UI default produces a 3 K refrigerant temperature increase across that exchanger. Its compressor temperature rise is about 47–54 K in the sampled first ten simulated seconds. One-decimal rounding preserves both differences. The display currently makes the owner infer temperatures from tube colours: it lacks permanent refrigerant endpoint readings on the equipment. The outdoor corner's exhaust reading is **air**, not the exchanger's refrigerant outlet.

A definite colour limitation exists: `src/circuit.ts` clips every temperature below −10°C to the same blue. An observed cold heating sample has refrigerant inlet −28.0193°C and outlet −25.0193°C; both render exactly `rgb(47,95,179)` despite their 3 K difference. Ordinary warm-weather heating endpoints differ by only a small colour interval. Above 105°C the same function similarly clips all values to its hot endpoint. Numeric engine outputs themselves are not clipped by this display function.

Source inspection found no replacement of both outdoor endpoint temperatures with one number: heating `coilL` receives `expOutC`, `coilG` receives `suctionC`; cooling/defrost receive `condOutC` and `dischargeC`. The outdoor-coil popup currently reports metal/film temperatures and heat, but does not report refrigerant inlet/outlet temperatures. The accumulator popup's single “Inlet / outlet” suction number belongs to the idealized accumulator, not the heat exchanger. `coilM`/`inM` deliberately have no temperature because no spatial midpoint state is exposed; do not substitute metal temperature or arbitrarily interpolate inlet/outlet temperature as if latent exchange were sensible heating.

## Actual numerical evidence

The current UI default was reproduced from `src/state.ts` and `src/runtime/config.ts`: outdoor 7°C/35% RH; three rooms 45/75/50 m³, envelope conductances 60/85/70 W/K; initial air/coil 20°C; targets 21°C; idealized field lines; default generic compressor/UA parameters. The real engine used the existing compiled current source and self-hosted WASM, with successive `step(.25)`, `step(.75)` and `step(9)` calls. All three snapshots ran without fault.

| Simulated time | Outdoor refrigerant IN → OUT (°C) | ΔT (K) | Compressor S → D (°C) | ΔT (K) |
| --- | --- | --- | --- | --- |
| 0.25 s | 2.601713 → 5.601713 | +3.000000 | 5.601713 → 53.025523 | +47.423810 |
| 1 s | 2.479921 → 5.479921 | +3.000000 | 5.479921 → 53.430835 | +47.950913 |
| 10 s | 1.170290 → 4.170290 | +3.000000 | 4.170290 → 57.982795 | +53.812505 |

At 0.25 s the outdoor inlet/outlet enthalpies are 242.329609/519.510352 kJ/kg, mass flow 0.0157237645 kg/s, and the outdoor metal receives −4.358325 kW from refrigerant: `m(h_out−h_in)=+4.358325 kW` is absorbed by the refrigerant. A small ΔT therefore does not imply small heat transfer. Pure-fluid saturated liquid/vapor have distinct enthalpies at the same saturation temperature; CoolProp's primary API documents saturation endpoints and latent enthalpy differences. The current engine then targets nominal 3 K suction superheat, so its heating exchanger's complete inlet/outlet difference is nonzero. [CoolProp saturation and latent-heat API](https://coolprop.org/coolprop/HighLevelAPI.html#vapor-liquid-and-saturation-states).

The nominal 3 K target is a generic control assumption. Actual forward outlet limiting resolution can cause small deviations; it must not become a fabricated display offset. Read the returned states.

**A real zero-temperature-change cooling branch is also legitimate and was checked.** A five-branch idealized solve used retained metal temperatures 14/14.5/15/20/22°C, refrigerant conductances 250/400/300/350/450 W/K, outdoor metal 40°C and 50 rps. Branch 0 returns exactly 10.8976676°C at both inlet and outlet while enthalpy increases from 287.400220 to 490.470804 kJ/kg. At 0.0038192784 kg/s it absorbs **775.583 W** from the indoor metal. Its other four branch temperature increases are 2.653649/4.099515/9.102322/11.102323 K; the mixed compressor suction is 13.897650°C. This generic allocation permits an individual outlet to remain in the saturation region while warmer branches supply superheated return. Shared mixed-suction control does not require every individual branch to gain 3 K.

For such a branch, visible readings should truthfully say `REF IN 10.9°C / OUT 10.9°C / ΔT 0.0 K` beside `Refrigerant heat absorbed 0.776 kW`. A brief contextual explanation can say “Heat absorbed without temperature rise.” Show the actual heat and temperature; do not force a colour gradient, minimum displayed ΔT or a sensible-heat `m cp ΔT` interpretation. Refrigerant coil heat is distinct from useful room-air cooling during metal storage transients. Conversely, the default outdoor heating endpoints really differ by 3 K; explaining latent exchange alone would not address their missing visible difference.

Examples retain their independently marked fixed values from `src/fixtures.ts`:

| Example | Outdoor refrigerant IN → OUT (°C) | ΔT (K) | Compressor S → D (°C) | ΔT (K) |
| --- | --- | --- | --- | --- |
| Heating normal/frost | −5 → 0 | +5 | 0 → 100.25 | +100.25 |
| Cooling | 92.14 → 42 | −50.14 | 12 → 92.14 | +80.14 |
| Reverse defrost | 38.87 → 12 | −26.87 | 5 → 38.87 | +33.87 |

A short real cycle solve with the retained warm indoor metals from the independently validated natural owner defrost event (40.832879/40.592943/40.742295°C, outdoor metal −5.746737°C, 35 rps, idealized lines) returns suction 34.270448°C and discharge 49.516254°C: **15.245806 K compressor rise**. The outdoor refrigerant enters at 49.516254°C and leaves at −5.746692°C, a −55.262946 K change. Its generic controller uses an 8 K saturation-temperature lift in this transient. This is a separate instantaneous cycle probe, not a newly integrated trajectory or calibrated hardware operating point. It establishes that a roughly 20 K compressor temperature rise can be consistent with a low pressure lift; no arbitrary minimum rise should be added to the engine or display.

Compression uses actual EOS `h_D=h_S+(h(p_H,s_S)−h_S)/η_is`. Temperature rise depends on inlet state, pressure ratio and isentropic efficiency; neither room target nor ambient temperature directly fixes it. Electrical drive efficiency affects electrical input/losses, not a second imposed refrigerant temperature gain. Current equations are in `src/engine/cycle.ts`.

## Exact on-equipment sensor contract

Show these probes permanently on the relevant equipment or connected tube, with unambiguous **REF** labels separate from existing **AIR** supply/exhaust readings. Use actual `engine.cycle.mode`, because requested heating remains selected during reverse-cycle defrost. For Examples, use `readingFlowMode`, mark readings EXAMPLE, and use the equivalent fixture fields below.

| Probe | Live heating | Live cooling / reverse defrost | Examples equivalent |
| --- | --- | --- | --- |
| Outdoor coil REF IN | `cycle.expansionOutlet.temperatureC` | `cycle.discharge.temperatureC` | heating `expOutC`; otherwise `dischargeC` |
| Outdoor coil REF OUT | `cycle.suction.temperatureC` | `cycle.condenserOutlet.temperatureC` | heating `suctionC`; otherwise `condOutC` |
| Compressor REF S | `cycle.suction.temperatureC` | same fixed suction port | `suctionC` |
| Compressor REF D | `cycle.discharge.temperatureC` | same fixed discharge port | `dischargeC` |
| Indoor i REF IN | `cycle.branchInlets[i].temperatureC` | same actual flow inlet array | heating `dischargeC`; otherwise `expOutC` |
| Indoor i REF OUT | `cycle.branchOutlets[i].temperatureC` | same actual flow outlet array | heating `condOutC`; otherwise `suctionC` |

Place outdoor heating IN on the small/liquid-side port and OUT on the gas-side port; cooling/defrost reverses these flow labels. Indoor heating IN is gas-side/OUT small-side; cooling/defrost IN is small-side/OUT gas-side. Compressor S/D physical ports never swap. Actual branch return temperature before mixing can differ from compressor suction: do not copy shared suction onto every indoor OUT.

Render one decimal °C for endpoints and optionally an adjacent `ΔT = OUT−IN` in K (one decimal; signed). This gives default heating `2.6 → 5.6°C; ΔT +3.0 K`, then `1.2 → 4.2°C; ΔT +3.0 K` at 10 s. If a future supported state has a genuinely small ΔT, retain accurate numeric values and use more decimals for ΔT when needed; never exaggerate it. Do not compare ambient/metal temperature to one endpoint and call that the refrigerant exchanger ΔT.

When there is no solved cycle (idle, reversal, drainage, initialization or fault), refrigerant probes show `—` with “no solved flow”/unavailable context. Actual residual metal/room/film readings can remain separately visible. Closed or Off branches similarly show no solved REF endpoints even when another branch operates; require `branchMassFlowsKgs[i]>0`. Defrost has a solved cycle while forced-air fans are off: its REF values remain visible, but forced AIR supply/exhaust stays unavailable. These rules prevent retained or fabricated readings.

## Colour limits and operating coverage

Recommend an **air** scale spanning the owner's −30…+50°C reference envelope, with useful detail near normal indoor 17…26°C. This is a display scale, not permission to extend the physical solver. Recommend a separate **refrigerant** scale with most visual detail in −40…65°C and a clearly labelled hot-vapor extension through 145°C. Include −40, 0, 20/35, 50, 65 and the hot-tail boundary in the legend, rather than only distant extrema. Preserve separate temperature and phase encodings; the maximum colour stop is not a “liquid maximum.” Actual numbers must remain unmodified, including any value outside a chosen display range; if a colour is saturated, identify under/over-range.

R32's EOS critical temperature is 78.105°C. At 105°C it cannot be subcritical equilibrium liquid in this model; the checked 49.99 bar/105°C state is vapor. Hot compressor discharge vapor above 105°C remains possible within the selected 145°C compressor guard. Saturation/condensation can occur well above a 26°C room target because exchanger heat transfer needs temperature differences, and discharge vapor is hotter than condensing saturation. [Official R32 properties and EOS limits](https://coolprop.org/fluid_properties/fluids/R32.html), [CoolProp phase regions](https://coolprop.org/coolprop/HighLevelAPI.html#imposing-the-phase-optional).

Current UI outdoor controls are −20…40°C; the engine explicitly accepts −25…45°C and rejects −30/+50°C before operation. The engine's selected refrigerant coverage is evaporating saturation −40…45°C, condensing saturation ≤65°C, pressure 0.5…50 bar absolute, discharge ≤145°C and pressure ratio ≤8, with further pinch/phase/pipe guards. These are generic-model coverage assumptions, not Daikin operating limits. A brief real-EOS sample at outdoor −25°C heating gives REF −28.0193→−25.0193°C, compressor −25.0193→103.8567°C; at +45°C cooling (room26,target17), outdoor REF 97.9462→54.7599°C. These quarter-second samples demonstrate admissible points only, not sustained coverage at those limits.

The pinned humid-air backend separately accepts 50% RH property queries at −30/+50°C and recovers temperature within 2×10⁻¹³ K. Observed humidity ratios are 0.0001172521/0.0405965208 kg/kg dry air respectively. This proves those specific moist-air property requests work, not that the coupled cycle, room humidity, frost or control model is validated there. Below freezing, RH here follows the pinned backend's ice-saturation convention.

Do not expand the engine guard merely to match the colour legend. Any later −30/+50°C operating extension needs actual conservative dynamic heating/cooling/frost/defrost evidence, humidity boundaries, pressure/discharge/pinch limits and physical-line failures checked at the new corners. An EOS or moist-air property query succeeding there does not establish complete equipment-model coverage.

## Recommended edits and checks

1. Root/Sonnet: add visible REF endpoint probes and signed ΔT beside the outdoor exchanger; fixed compressor S/D probes and actual per-indoor endpoints where space permits. Use the mapping above, including defrost and closed branches. Keep AIR labels explicit.
2. Root/Sonnet: separate air and refrigerant colour mappings; remove the current below−10°C equal-colour clipping across the normal cold-refrigerant operating range; add useful legend ticks and the hot-vapor tail. No engine temperature adjustment is warranted by these observations.
3. Browser verification: check current UI default at first solved quarter-step and at progressed time; assert visible outdoor REF endpoints differ by about 3 K and match returned worker numbers at 0.1°C. Check cooling and defrost OUT/IN reversal, Examples labels, all-Off/branch-Off and no-cycle fault states. A cold allowed-input case should retain exact numbers and distinguish formerly clipped cold colours. Check that air corner readings are not reused as REF temperatures.

The recommendation corrects observability and colour coverage. It does not claim the existing spatially lumped generic coil model reproduces a manufacturer's temperature profile or full compressor operating envelope.

## Follow-up: declared outdoor port capacity

The owner subsequently requested removal of the arbitrary five-room global cap. The engine now requires `EngineConfig.indoorPortCapacity`: a positive finite integer describing the declared outdoor group's available indoor connections. Validation requires at least one room, room count no greater than that declaration and unique room IDs. `defaultEngineConfig` declares five ports as its generic default; asking it to create six room records does not infer a six-port outdoor unit. The caller must explicitly declare capacity six or select a sourced group with that many connections. The owner preset is mapped separately by root to three ports. Connection count alone establishes neither total heat capacity nor permissible combinations, compressor calibration or manufacturer operating limits.

The cycle/component code already uses branch arrays and reductions; inspection found no additional five-room constant in engine physics. Only config/interface/default/validation code changed. Existing refrigerant properties, numerical solver, component parameters and controller equations remain unchanged. Repository engine configurations are constructed from defaults. A legacy handcrafted config missing the required capacity now receives an explicit validation error before any property query; no unknown hardware capacity is silently assumed.

Focused verification: TypeScript emission passed, then `node --test tests/engine/port-capacity.test.mjs` passed **3/3**, zero failures/cancellations, in **9,420.6 ms**. The real pinned EOS/HA six-branch fixtures use idealized piping. Heating uses default outdoor3°C/85%RH and room20°C/target21°C; cooling uses outdoor32°C/50%RH and room27°C/target24°C. Each operates at 0.25 s and 1 s with six actual branch inlet/outlet states, positive branch flows, correct signed refrigerant heat, dry compressor suction and mass/energy closure.

| Mode / time | Low / high pressure (bar absolute) | Global energy residual (J) | Water residual (kg) |
| --- | --- | --- | --- |
| Heating / 0.25 s | 7.877717 / 15.545129 | +6.86×10⁻⁸ | +5.63×10⁻¹⁶ |
| Heating / 1 s | 7.850513 / 15.565547 | +3.38×10⁻⁸ | +3.67×10⁻¹⁷ |
| Cooling / 0.25 s | 15.112270 / 28.317232 | −3.05×10⁻⁸ | −6.05×10⁻¹⁶ |
| Cooling / 1 s | 15.071775 / 28.530189 | −5.46×10⁻⁸ | −6.84×10⁻¹⁶ |

The structural test runs six heating rooms for 0.5 s, removes the sixth while declaring five ports, and checks unchanged simulated time, outdoor film mass/enthalpy, remaining room IDs, T/w/fabric/metal inventories and an independently calculated negative storage-energy boundary impulse for the removed room. Energy and water ledgers close; a subsequent quarter-step operates with five branches. Lowering declared capacity below current room count rejects before mutating the engine snapshot. Invalid zero/negative/fractional/nonfinite capacities, zero rooms, excessive count, duplicate IDs and missing capacity also reject before property queries.

This is bounded generic six-room connection/conservation evidence, not a validated six-port manufacturer catalogue or long-run/physical-line performance claim. Larger declared counts are no longer rejected merely because they exceed five; they remain subject to the unchanged operating-domain/convergence guards and actual browser CPU/memory limits. No thermal parameter is automatically multiplied when more ports are declared. The full integration suite was not rerun for this config-bound follow-up.
