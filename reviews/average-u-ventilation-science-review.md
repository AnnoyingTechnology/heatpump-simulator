# Average envelope U and sensible ventilation recovery: independent science review

Reviewed 2026-10-11. **Accept the scoped average-U/automatic-area mapping and prescribed sensible-recovery equations at the frozen source hashes below. No unresolved scientific source blocker remains in this scope. Updated-source whole native regression, robustness and final interface/browser proof remain parent-owned release gates.** This acceptance is for the declared generic model, not a measured building envelope, installed ventilation unit or OEM heat-pump fit.

The reviewer read the final data helpers/runtime, engine properties/demand/ventilation/energy path, new tests and source-pinned receipts; independently operated native checks against `/tmp/heatpump-reference-regression-8h6m5de3`; and recomputed the owner area/U/default-loss arithmetic. Only documentation/review artifacts were edited. No production/test edits, git actions or private Home Assistant access were performed. The previous shared-header review retains its historical source hashes; this review covers the later ventilation extension.

## Average U and exposed area

The primary room input is effective average U in W/(m² K), mapped to the unchanged engine envelope law through `H=U×A_exposed`. One U represents the room's lumped walls, glazing, roof/floor and thermal bridges. It is not a resolved material model or an independently measured transmittance. It does not multiply whole-room H by floor area or volume again.

Automatic area starts with a square box: `2×floorArea + 4×sqrt(floorArea)×height`. The stated opening plus solid-contact footprint is removed from its inferred shared face. Each deduction is capped to that room's face. Several links on one inferred face use the maximum footprint, representing a deliberately overlapping-footprint assumption rather than a surveyed union. Off indoor units retain their rooms and shared surfaces. Room ordering infers ceiling/floor or left/right adjacency; roof slopes, ground temperature, buried floors and actual party-wall layout remain unresolved. A positive exposed-area override supplies a better owner estimate without requiring individual surface inputs.

The independently recomputed defaults agree with final source:

| Room | Exposed area m² | Effective average U W/(m² K) | H W/K |
|---|---:|---:|---:|
| Attic | 91.8950214064 | 0.1632297351 | 15 |
| Upstairs | 94.9833972233 | 0.2632038938 | 25 |
| Ground | 104.7652177196 | 0.4295318712 | 45 |

U is rebased from the existing provisional H after the shared geometry exists. Thus 85 W/K total envelope is preserved; no compressor efficiency, refrigerant property or COP is fitted. Geometry/area edits retain U and scale H. Advanced H and legacy G edits rebase U coherently; runtime passes the complete house configuration to derive shared area. The area cap does not alter the separately prescribed interzone conductance. Opening and insulated-solid paths remain simultaneous and nonoverlapping, with the previously reviewed λ=0.040 W/(m K), film resistance 0.26 m² K/W and default link H=173.803680982 W/K.

## Sensible recovery and gross moisture exchange

The room's balanced dry-air rate remains `md=storedRoomDryAirMass×grossACH/3600`. The accepted boundary equation is:

```text
Cmin = min(md×cpOutdoor, md×cpRoom)
Qvent = md×(hOutdoor−hRoom) + eta×Cmin×(Troom−Toutdoor)
waterVent = md×(wOutdoor−wRoom)
```

The signed correction warms winter intake and cools summer intake. Cmin uses both actual inlet gas states on the same dry-air basis as h and w. CoolProp defines C per kg dry air, H per kg dry air and W as kg water/kg dry air. [CoolProp humid-air table](https://coolprop.org/fluid_properties/HumidAir.html#table-of-inputs-outputs-to-hapropssi) The sensible effectiveness/Cmin structure is consistent with the EnergyPlus exchanger equations. That source supports the heat-capacity-rate relation; its additional supply/exhaust saturation handling is not implemented here. [EnergyPlus engineering reference](https://energyplus.readthedocs.io/en/stable/guides/engineering-reference/16.8-heat-exchangers.html)

At identical room/outdoor states, recovery leaves gross dry-air flow and vapor flux unchanged. Later humidity trajectories may differ because room temperature and retained phase change. Equal-temperature unequal-humidity exchange survives eta=1. Inlet Cp is frozen for this algebraic approximation; no variable-Cp core integration or global real-exchanger accuracy claim follows from the effectiveness limit.

The recovery correction appears exactly once in room enthalpy and the external energy boundary. It is excluded from HVAC output, useful-service heat and COP, and adds no electrical power. The demand controller uses its existing constant 1006 J/(kg dry air K) scaled by `(1−eta)` for its sensible ventilation estimate; accepted thermal storage uses the native Cp/Cmin equation. Omitted/zero recovery preserves prior single-flow behavior. Engine configuration validates eta in [0,1] before mutation.

This is a prescribed energy/water boundary model. It does not materialize an adjusted supply gas or a heat-exchanger core. In particular, a saturated 45°C intake cooled by recovery would require real phase handling in a physical exchanger. Passing the room phase/conservation checks below establishes robust lumped storage accounting, not realistic supply conditions, core condensation/drainage or frost behavior. Core phase changes, latent/moisture recovery, bypass, ventilation fan power, unbalanced streams, central exhaust mixing and duct topology are unresolved. All prescribed room ACH receives the same chosen sensible effectiveness; unrecovered infiltration is not a separate path.

## Owner assumptions and interface data

Dual-flow ventilation is owner-confirmed. **0.5 gross ACH and 75% sensible effectiveness are owner-selected scenario assumptions**, not measurements or published performance for a known unit. The whole-house ruler's nominal air term is `0.34×339×0.5×(1−0.75)=14.4075 W/K`, for 99.4075 W/K including the 85 W/K envelope. Its 0.34 Wh/(m³ K) coefficient is representative; this ruler is not the worker's instantaneous moist-air/latent flux. The eight RT/RE examples have unspecified building size, surface and air-exchange conditions. They remain a whole-house illustration, not room grades or certification.

The frontend permanently couples all coil clear-passage fractions to the shared owner-selected 95% input; legacy overrides are ignored and cleared. This is a declared dirt-model input, not a measured 95% capacity multiplier or an OEM performance fit. Native engine users retain their standalone coil inputs. Admitted window-solar watts remain an independent sensible room gain, excluded from HVAC/COP; their default is zero. The heat-pump isentropic efficiency assumption is unchanged by this acceptance.

## Independent evidence and release boundary

[Reviewer native receipt](average-u-ventilation-independent-results.json) and [reproducible check](average-u-ventilation-independent-check.mjs) use raw guarded humid-air calls, forward enthalpy derivatives (remaining inside the gas domain at saturated inlets), independent scalar Cmin reconstruction and direct frozen-state room/ledger comparisons. Engine source/native files match the immutable snapshot and current source. This shares the native EOS and provides numerical/implementation consistency evidence, not independent experimental calibration.

Checks cover winter 0°C, summer 35°C, equal-temperature unequal-humidity exchange and saturated 45°C intake, at eta=0/0.75/1. For isolated rooms at eta=0.75, first-step recovered powers are +164.284646 W, −97.979517 W and −275.004174 W respectively, with matching room/external ledger increments over 0.25 s. Total exchanged room water matches the gross-flux reconstruction. HVAC heat/COP, compressor work and drainage remain absent. A 10 s saturated-intake evolution retains 0.002325157 kg of room condensate with energy residual 1.284207×10⁻⁹ J and water residual 6.331741×10⁻¹⁷ kg, and invents no core drainage.

[Implementer native receipt](ventilation-recovery-focused-results.json) reports 24/24 recovery and adjacent moisture/interzone/demand checks passing; all 14 listed source/test/document fingerprints were independently matched. [Data-agent receipt](u-envelope-data-browser-results.json) reports 8/8 mapping/geometry/compatibility/worker-continuity groups passing, including Off rooms and preserved accepted storage. Those groups were operated by the data agent; the reviewer independently recomputed the default arithmetic and inspected source mapping.

The preceding 75/75 robustness campaign used pre-recovery source and does not certify this extension. The updated immutable whole native suite and required updated-source robustness/interface checks remain parent-owned release gates. No receipt here establishes installed ventilation performance, actual envelope U, full house electrical COP, core icing physics or public charge release.

## Exact independently checked source fingerprints

| File | SHA256 |
|---|---|
| `src/engine/engine.ts` | `1476bef6b75e16cb72e9cdd1fcf7ee01d4a93e60c629e2848e5c2c14bb3bd05f` |
| `src/engine/ventilation.ts` | `6aef508a062fca992c2b7a1961ae69c12ae5317c5824326ffe57a1a0a4ecd8d8` |
| `src/engine/types.ts` | `872d14a3bbdc07a69883fdf3c393b9cc0ef9fbe9de72d33a983f699f2361a9b7` |
| `src/engine/properties.ts` | `6fb2812381e471623e449a5b593cd4e1d9874f32e559b33bd05c2eac7b6ad36e` |
| `src/engine/demand.ts` | `83b3115c656098d0c8d57b97b0d0d5abf6b014c797324e7ff31756a7c28adf90` |
| `src/types.ts` | `ce1e1abb9641f06f489b4c6c6938cb736f5be7db1b3b3c91c0ede9e98d32b3f6` |
| `src/state.ts` | `8509851dbc6705be1de2aea49ac3a185725bae6a28e1c71154a96020e457fc5b` |
| `src/runtime/config.ts` | `e81786b88fdda6eb0f967ac57a736c395e82d6ce4f91425a9d0a9e58e58d48ad` |

Unchanged shared-header cycle/envelope/drive and native JS/WASM fingerprints are in the independent receipt. Interface presentation is being finalized by root and is not included in this frozen data/engine acceptance. The reviewer corrected one documentation sentence that implied an adjusted supply-state flash: the authoritative room/area note now explicitly describes resulting room phase storage and core-model exclusions.
