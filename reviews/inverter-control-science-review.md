# Reference inverter control: independent science review

Reviewed 2026-10-11. **Accept the frozen source and scoped focused science evidence. Combined final regression and browser integration remain release checks owned by root.** No outstanding source blocker remains from this review. This acceptance covers the declared generic Reference controller; manufacturer calibration and experimental charge acceptance are excluded.

Reviewer read the implementing source, tests and research receipts, communicated defects before freeze, and verified the final source fingerprints. Reviewer changed only this file, launched no simulation tests or competing builds, and made no commit/push. Native execution results below are attributed to the implementer, not independently rerun results.

## Physical meaning and source basis

Variable-speed operation should adjust capacity with room demand, rather than requiring a stop whenever temperature crosses the target. Daikin describes that operating principle but supplies no universal PI law or electrical-power envelope on this page. It does not validate the simulator's gains or a particular multi-split model. [Daikin inverter description](https://www.daikin.eu/en_us/about/daikin-innovations/inverter-technology.html)

Actual equipment still has an admissible minimum speed, start/stop timing and operating envelope. Danfoss treats these as distinct design constraints and notes that the unit's selected minimum speed may differ from a compressor's qualified minimum. Its VZN application guide concerns different light-commercial equipment; its numerical limits are not transplanted into this domestic scenario. [Danfoss VZN application guide, minimum speed and control sections](https://assets.danfoss.com/documents/latest/580994/AB478735922007en-010201.pdf)

Integral limits alone do not prevent windup when the actuator cannot follow a request. Conditional integration must recognize the actual saturation direction; feedforward and cascaded actuator supervision also matter. These are standard anti-windup principles, not a manufacturer-specific algorithm. [MathWorks technical documentation on anti-windup, saturation and feedforward](https://www.mathworks.com/help/simulink/slref/anti-windup-control-using-a-pid-controller.html)

The implementation is a proportionate generic controller. At each room target it estimates sensible envelope, ventilation and fabric heat transfer, accounts for indoor fan heat, then adds proportional temperature error and a bounded slow integral. Heating/cooling signs are consistent. The1006J/kg/K estimate sets control gains only; it does not replace native humid-air heat capacity or stored enthalpy. The300s proportional timescale,600s integral timescale and±4000W integral bound are declared scenario choices. Latent demand is not explicitly forecast.

The accepted cycle's thermal capacity per speed is a lagged control estimate, not an exact linear compressor-capacity map. Restart uses the existing fresh minimum-speed EOS forecast. Clipping the resulting command to configured speed limits does not clip heat or electrical power. Actual power still follows compressor mass flow, actual enthalpy rise and configured efficiencies. No owner-declared electrical range is imposed without primary equipment data and its operating conditions.

## Actual flow, heat and conservation

Positive room requests supply relative branch-flow weights for ordinary inverter operation with idealized lines. Each branch retains its actual finite-UA exchanger outlet, `Q_i=m_i*(h_in−h_out)`, and the actual mixed enthalpy closes the shared header equations. Demand weights therefore influence distribution; requested watts are not inserted as delivered heat. Defrost/fixed-speed operation retains UA allocation. A retained minimum-on path with zero request uses its UA coefficient as an explicitly declared relative fallback, not as a watt quantity. This is generic valve allocation, not a derived valve/pressure network or OEM controller.

Every actual running candidate freshly solves the original EOS/UA equations and heat residual tolerance with the original hard discharge/pressure envelope. Prior pressure slopes/capacity feedback may seed or estimate control, but cannot substitute for fresh closure. Nonzero physical-line behavior remains the earlier declared branch-control scope; the new weights do not establish a new physical line network solution.

Room air, fabric, exchanger metal, outdoor retained water/ice, fan heat, drainage and boundary energy/water evolution remain the existing conserved model. Controller edits introduce no hidden stored-heat reset. Room-ID mapping preserves controller history across ordinary edits; mode/strategy changes reset control history only. Existing explicit scenario energy/water impulses remain recorded for physical size/spec edits.

## Findings raised and resolved before freeze

| Draft finding | Final source resolution |
|---|---|
| A negative error in an unrelated/disabled room enabled positive integral growth elsewhere at maximum speed. | Upper-limit anti-windup is directional per room, using actual armed command versus demand and maximum speed. |
| PI assignment preceded the current interval's protection rejection or running-to-reversal transition. | Integral commits only for the final accepted ordinary running interval with actual cycle, positive speed, completed startup and no protection. Defrost/reversing/draining/stopped intervals do not integrate. |
| Negative error kept integrating on a zero-request/inactive branch while another branch operated. | Per-room lower-output clamping blocks further negative integration at zero raw request or absent path, while permitting correction in the recovery direction. |
| Zero requested weights could invalidate a retained minimum-on branch. | Explicit positive relative UA fallback; actual branch heat remains EOS/UA-derived. |
| Omitted optional fixed speed defaulted to40rps even when outside the selected speed range. | Validate the effective fallback when on-off operation is selected. |
| A positive running command could remain below a newly raised selected minimum during slew. | After envelope admission of the minimum, the final positive command respects that minimum; a live18→30rps change has a focused check. |

PI, cycling latch, drive and thermal/ledger state participate in the whole-step checkpoint. The native-air-failure test verifies exact preserved prior controller/drive/room state; that injected failure happens **before PI commit**, so it is not evidence of reverting an already-mutated integral. Source inspection confirms the copied integral/latch also belong to the outer rollback transaction if a later guard fails.

## Inverter cycling and fixed-speed comparison

Target crossing alone no longer closes a positive-demand inverter branch. A declared aggregate below-minimum-capacity estimate and comfort margin govern its cycling latch, with minimum-on/off dwell. The minimum-capacity estimate is speed-scaled prior cycle capacity, not an OEM minimum-capacity map. Continuous operation is credible when the actual minimum capacity fits the load; continuous operation cannot be promised for all loads.

Conventional operation uses the selected fixed motor speed when admitted, rather than simulating a fixed electrical wattage. Thermostat operation and real protection stop it. A supervised command below its fixed point is stopped instead of being forced above the protection result. Dedicated configured defrost operation remains separate and protected. Delivered capacity and electricity may still vary at fixed speed as pressure, density and thermal boundaries change.

## Frozen evidence and limits

Read `research/inverter-control-validation.json` and `tests/engine/inverter-demand.test.mjs`. Implementer reports4/4 native focused tests in63.322s, followed by3 selected checks in4.036s after the final live-minimum clamp. They cover positive target-load demand, per-room upper/lower anti-windup, continuous operation across target for a600s above-minimum-load fixture, actual stop/restart below minimum, real fixed-speed operation, preservation under native air failure, strategy-history reset and invalid omitted fixed-speed range. Original system energy/water and accepted cycle residual checks remain in the dynamic fixtures. The final combined suite is a separate pending root check; no passing result is inferred from its progress.

The balanced fixture remains operating across target for600s, with an initial cold-coil transient: reported room range19.6772…21.1387°C for target21°C. This is not an OEM comfort guarantee. The owner600s fixture is stable with maximum system energy residual8.4564e−7J and water3.4764e−15kg, but final room temperatures16.3648/21.0410/17.1346°C do not prove fully settled targets. Longer equilibrium, cooling/latent behavior and the combined UI scenario need their appropriate separate evidence before stronger product claims.

Final independently checked SHA256 fingerprints match the implementing receipt:

| File | SHA256 |
|---|---|
| `src/engine/demand.ts` | `0bc92aff6374ef68f3dead9154df54a53b5694af8162bdf0bc2e7482288ae268` |
| `src/engine/drive.ts` | `20eb503ff13439e2a7d22a5c5334c3fa232083a696543c92442cc1a1d3a7296c` |
| `src/engine/engine.ts` | `a27647f727b62e13e09d61a6ecf4a4b282c9287bef48a2662087542f44e9b862` |
| `src/engine/cycle.ts` | `159c03d3de5e22fb928e606e20a4d7b142c73778d7080a187fa42ccdf4af26ee` |
| `src/engine/defaults.ts` | `5ca7d8006c6990e4b6b99a6ef353ec075b720a07701dac39a23ca9fb4fec99f8` |
| `src/engine/types.ts` | `c17bfdf3091b4f23fdec3c153a7242e50c7ec403b031a3be8cd022672cf3a371` |
| `tests/engine/inverter-demand.test.mjs` | `8619668a954e845a2e72bfebd66f46b916f7c236d6edfd566c258d1bbc116982` |

No unresolved source science blocker remains at these fingerprints. Root retains final combined-regression/browser/release ownership. Manufacturer fit, precise settled comfort, latent-load forecasting and experimental charge acceptance remain separate; the public charge gate stays disabled.
