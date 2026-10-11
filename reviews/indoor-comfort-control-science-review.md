# Indoor comfort calls and fan modulation: independent science review

Reviewed 2026-10-11. **Accept the frozen source and scoped independent checks below. The concrete fault-output issue was corrected and independently verified; no unresolved scientific source blocker remains. Final full Reference regression, revised retained recovery/endurance schedules and the remaining browser mode-change check remain release gates owned by root.** This accepts the declared generic controller and its accounting, not an OEM controller, measured fan map, demonstrated comfort accuracy or new charge-model acceptance.

The reviewer read the final source, `research/inverter-control.md`, focused tests and receipts, independently matched hashes, and ran reviewer-only checks against final `/tmp/heatpump-indoor-comfort-final-fallback-hr9qhcdk`. No production or test file was edited; no git action was taken.

## Accepted control behavior

The persistent signed-error call uses `target−room` in heating and `room−target` in cooling. A known satisfied room starts at error ≥+1 K; a known calling room stops at error ≤−1 K. Between these thresholds it preserves its call even when the positive PI request crosses zero. Explicit Off clears the call. New/reset/explicitly re-enabled rooms have a separate owner-selected initialization rule: they seed calling at error ≥0. A mode change reseeds the opposite-direction call. These initialization choices and the ±1 K default margin are generic policy assumptions; they are not manufacturer thresholds.

Calls are matched by room ID across ordinary configuration edits, separately from the actual refrigerant paths. Defrost can use enabled indoor refrigerant paths without overwriting the comfort calls; its indoor/outdoor forced fans remain off under the existing reverse-cycle policy. Cooling protection can retain a comfort call while preventing compressor work. The final ordinary call stopping sends the compressor to idle immediately, including before minimum-on dwell. A renewed call still requires minimum-off dwell and existing physical envelope admission. Below-minimum-capacity cycling remains possible and should not be described as eliminated by inverter modulation.

For a calling inverter room, command fraction is `f=0.25+0.75*clamp((error+margin)/(2*margin),0,1)`. Thus a retained call at its target commands 62.5% flow and 24.4140625% of configured high-fan watts; it approaches 25% flow before its stop boundary. Fixed-speed control commands full fan while calling. Calling state and accepted physical fan command are exposed separately; they need not agree during a compressor hold or defrost.

The 95% normalized positive-request plus 5% normalized active refrigerant-UA allocation has dimensionless shares, sums to one, gives Off branches zero, and retains a positive reserved path for a calling branch whose PI request is zero. If all requests are zero it uses normalized active UA; validated active UAs are positive. The reserve is an arbitrary valve-command assumption. It neither supplies branch heat nor replaces finite-UA/real-EOS pressure and mixed-header closure. The same allocation is passed to restart screening, fresh forecast and the actual operating cycle. Physical field-line heating retains its earlier branch-control scope.

## Fan physics and thermal accounting

Ideal fan similarity gives approximately linear volume flow with rotational speed and cubic shaft power. Electrical power additionally depends on motor efficiency, which can vary at low load. The DOE/AMCA sourcebook supports these relationships and discusses motor-load efficiency effects; it does not establish this domestic blower's electrical curve. [DOE/AMCA fan sourcebook](https://www.energy.gov/sites/default/files/2014/05/f16/fan_sourcebook.pdf)

Accordingly, `flow ∝ f`, `air-side UA ∝ f`, and `fan electrical watts ∝ f³` are acceptable declared surrogates in this generic sandbox. Linear coil UA is a separate bounded modeling approximation, not a fan-affinity theorem. No measured fan/motor/coil map or equipment fitting is inferred. Dirt still multiplies flow/air-side UA at an unchanged command and does not itself reduce commanded watts.

Actual air exchange and prospective cooling antifreeze use the same fractional flow, UA and cleanliness, including native specific-volume conversion for optional volumetric flow. Fan watts enter the room/outlet enthalpy and electrical ledger exactly once. Fan heat is added before a wet/fog outlet phase reflash. Native humid-air H and W use a dry-air basis; room total enthalpy and gas-plus-retained-phase water remain the conserved stores. [CoolProp humid-air definitions](https://coolprop.org/fluid_properties/HumidAir.html)

The controller credits actual commanded cubic fan watts in its sensible loss estimate. Its constant 1006 J/kg/K and latent-load omission remain control approximations; actual humid-air energy, condensation, drainage and phase storage remain authoritative. No latent-energy source, water scaling, thermal-store reset, stale-cycle heat, solve-error-to-idle conversion, EOS alteration or relaxed physical tolerance was introduced. Native failures still produce faults after whole-step rollback, including calls, integrals, drive state, timers and stores. Existing conservative restart-screen limitations documented in the shared-header review still apply.

## Independent and attributed evidence

`indoor-comfort-independent-check.mjs` and `indoor-comfort-independent-results.json` record reviewer-executed checks on final source/native artifacts. The checks use the same EOS and air-exchange implementation, while independently reconstructing the control table and interval heat/water/metal ledgers; they are implementation consistency evidence, not experimental validation.

- The complete boundary table covers both retained call states, exact ±1 K, either side, target and explicit Off.
- Fresh heating and saturated cooling intervals at a retained target call command 62.5% fan and 6.103515625 W from a configured 25 W fan. Both have positive refrigerant paths and closure residuals 0.03196884/0.03170222 W, below the unchanged 0.1 W tolerance.
- Air enthalpy, total water and metal changes independently match the accepted flow/UA/fan/refrigerant ledger. A subsequent saturated cooling interval drains 1.0491853×10⁻⁷ kg/s while its modulated fan contributes 6.10374945 W; total energy residual is 1.1790×10⁻⁸ J and water residual −1.0625×10⁻¹⁶ kg.
- A deliberately failed transaction that would change a call restores thermostat/active history, integral, drive, timers, thermal stores and cumulative ledgers. Separate ordinary all-calls-Off checks stop compressor/forced fans, retain metal energy and hold a renewed call through minimum-off dwell in both modes.
- An independent forced humid-air inverse failure also rejects passive output. The corrected fallback reports zero fan fraction/watts and inactive physical paths while preserving the rolled-back comfort latch, in both modes.

Implementer `indoor-comfort-focused-results.json` reports all six inverter tests and five corrected thermostat tests passing on the equations-complete source before the diagnostic fallback correction. The initializer test-only correction sets re-enable target from observed native temperature +0.001 K; no physics tolerance changed. A subsequent implementing-agent backend-unavailable test passes on the final corrected fallback. Reviewer source comparison confirms that the only later production delta sets stopped fraction zero and publishes the restored call in that fallback; running equations are identical. Earlier broader results before the 5% reserve remain historical; final revised regression must establish the combined release.

Root's source-pinned `indoor-comfort-browser-results.json` reports the actual guarded worker for the owner house at −4°C outdoors, ground target16°C, 75% sensible recovery, 0.5 gross ACH and 95% coil cleanliness for600 s. Its engine hash is the pre-fallback source, whose running equations are identical. Ground remains satisfied with zero fan throughout; its temperature reaches17.354467°C. Therefore this validates absence of the reported rapid toggling in that interval, not a full ground-room heating cycle or eventual target attainment. Root also reports explicit all-unit Off stopping compressor while preserving epoch/time/stores. The scene reads the accepted fan fraction directly, with duration `1.8/f` and opacity `0.35+0.35*f` while reported fan watts are positive; these are display cues, not a resolved airflow field or altered numerical temperatures.

The revised retained tests have appropriate explicit replacement coverage. Historical checkpoints predate `thermostatCalls`; their test helper migrates recorded active flags to prior call history (or uses the initializer at time zero), then lets the current thermostat evaluate the actual errors. Saved hot-source seq16 has every room already satisfied beyond the stop margin, so its unchanged continuation must stop/conserve. A separately labelled target-only renewed-call extension proves zero configuration H/W impulse, then requires thermal-boundary hold, real fan/store evolution and freshly closed recovery. Cold sequence3's complete original schedule still checks every interval; an incidental old-trajectory hold is not required by physics under a new controller. A separate declared low-efficiency cold-source provocation requires actual discharge hold/zero work, retained stores, evolving warmed-boundary recovery and dwell. Its efficiency is a test provocation, not owner calibration. Exact seq22/28 mandatory cold-start holds and independent overlapping-cause driver checks remain. These changed test definitions are accepted; their final guarded execution is a release gate pending at review time.

## Checked fingerprints and release boundary

All engine/native hashes below are independently matched between the immutable snapshot and current source. The independent JSON also pins unchanged air, properties, ventilation, defaults and exact guarded adapter/JS/WASM hashes. UI and research hashes were read from current frozen files; root's browser receipt pins the UI hashes.

| File | SHA256 |
|---|---|
| `src/engine/thermostat.ts` | `f09821cdd3853d7e6c18e27e85ce278a333414ccc2b0366b51b9fa2c62873db0` |
| `src/engine/demand.ts` | `2723ec0b56398de36cace269a12f120622c1e0eef5caf2cfb6c4c61aaeba4301` |
| `src/engine/engine.ts` | `41b9ed30c02a6b8ae90d66333230dee01dde997910b0f6ffa8bd5e7ed1257b71` |
| `src/engine/types.ts` | `a29004e7e12e9a5e5995df642ff1c30d54b01d302d29b67ad1a4fe26e80d1771` |
| `src/engine/cycle.ts` | `294d647a26f60d319641c9b7fe4645378472dd5c70a8e6c0ef6075168aaf29e4` |
| `src/engine/drive.ts` | `d94247f20b359a61980e0d5af121d5299133f3b65a49358c4c40540a6655d0dd` |
| `src/engine/envelope.ts` | `eaab1d96df755b322050854fa8b7108e1f4918fbeb4dd1206d815ba9c74dc4e3` |
| `src/scene.ts` | `8e0d5ac49afc1b992f829bef09b9446b58b53a511860f248b3bba55ac2e023f5` |
| `src/style.css` | `8e778ec8f88715ff8e8058db514bfc27eb3211edb01466a178c723e454a3bda9` |
| `research/inverter-control.md` | `c29f43f01f4350d90cb8bfffba1aa0b2d825dc3ea88fcdb074d5c41d3d70305c` |
| final `tests/engine/thermostat.test.mjs` | `60b0ee18b95e18b8417e001594fe0e1f60c8099a8f999bfd6aa905ee2a36bc96` |
| final `tests/engine/dynamics.test.mjs` | `f8b5f19a436d6d627bcec1d5fad56c5cf7bddbae456d688a892c1767571b8a1a` |
| final `tests/engine/restart-preflight.test.mjs` | `a722e9680eb14a95145f4f6eb5d446b7a7fe11671e9bce5adc8f36e118eb76b3` |
| final `tests/engine/reference-envelope.test.mjs` | `a0065145e5411b879be8c9c91b20a40664cbd80228e9ca6606e4590334307d43` |

The reviewer reproduced the sole concrete diagnostic defect on the preceding source: simultaneous substep/passive-output failure retained the previous nonzero fan fraction despite zero watts/inactive output. Root corrected this metadata without changing heat, water or pressure equations; final independent checks verify fraction zero and restored call history. No unresolved scoped source blocker remains.

Full frozen regression/endurance and outstanding actual browser hot-to-cold recovery remain pending release gates at review time. Earlier91-reference/property and75/20-robustness acceptance cannot be promoted to acceptance of this changed controller. No OEM efficiency, capacity, electrical envelope or fan behavior has been calibrated by these changes.
