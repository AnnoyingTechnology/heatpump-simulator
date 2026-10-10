# Reference stability: outdoor fog review

Status: **accepted for the scoped Reference production changes**. Independent review dated 2026-10-10. Source physics, focused native checks, fresh45/45 CI, hosted4/4 normal checks and600.7s owner-configuration endurance gates are complete. Reviewer owns this document only. No production changes, builds or warm-up simulations executed. Short independent scalar/algebraic EOS checks and one filtered existing-build test are identified below. Author/root endurance results are attributed evidence; the CI receipt was independently retrieved. Historical intermediate gate statements below describe their dated review stage, not current release status. Public charge remains a separate disabled gate.

## Defect and evidence scope

Read `air.ts`, Properties humid-air helpers, room/outdoor air/fan handling, film derivation and whole-system heat/water ledgers. The contact/bypass model linearly mixes gas-stream enthalpy and vapor water ratio. Mixing individually admissible moist-air states can cross the saturation curve. Rejecting the resulting fog as unsupported was an explicit initial model limitation; it becomes a product stability defect when reachable through ordinary outdoor weather controls.

The author reports Reference failures at outdoor 0°C/99% RH after 29.25 s (target21) and13.5 s (target23), 0°C/95% after338.75 s on reversal, and3°C/95% after300 s on reversal. Its exact first mixed outlet is approximately −1.55665°C, W=0.003329203793 versus saturated W=0.003329109756. Native RH evaluation rejects the supersaturated all-vapor representation. This is evidence for a physical phase-domain omission, not evidence that pressure tolerances need relaxing.

The user's public fault around5:07 at5× is now associated with attic disabled, outdoor−0.5°C, ground target17.5°C+ and middle target22.5°C. Humidity and an exact fault checkpoint remain unknown; root starts with default35% RH. Root reports the ordinary owner7°C/35% case passes600 s and owner3°C/85% completes natural frost/defrost/return by460.5 s. Do not claim fog explains the user's exact failure until configuration or fault evidence matches. Preserve other nonlinear/domain failures rather than converting every HA error into fog.

## Conservative equilibrium closure

CoolProp models humid air as dry air plus water vapor and defines its H/W on a dry-air mass basis; its saturation includes the ice/water branch and enhancement factor. Therefore use the same CoolProp saturation function rather than a fitted dew-point approximation. [CoolProp humid-air documentation](https://coolprop.org/fluid_properties/HumidAir.html)

MIT's air/water energy balance explicitly includes the leaving condensed-water enthalpy alongside the gas mixture; excess vapor beyond equilibrium saturation condenses. This supplies the primary physical basis for carrying a separate condensed phase rather than clipping RH. [MIT Fundamentals of Energy in Buildings, air/water mixtures](https://ocw.mit.edu/courses/4-42j-fundamentals-of-energy-in-buildings-fall-2010/a860d453697831aca223049667c430bb_MIT4_42JF10_water_vapor.pdf)

For an outdoor post-contact mixture, let H* be total stream enthalpy in J/kg dry air and W* total water in kg/kg dry air. The fog equilibrium has vapor Wv=Ws(T,p), condensed Wc=W*−Wv≥0, and

`H* = Hgas(T, Wv, p) + Wliquid*hLiquid(T) + Wice*hIce(T)`

with `Wv+Wliquid+Wice=W*`. Preserve unsaturated valid gas states without an artificial phase change. At saturation classify using the computed Ws comparison, not a failed RH call. Accepted RH=1 is a derived equilibrium property, not a clamp on an inadmissible vapor state.

For consistency with existing film storage, the reduced phase enthalpies are `hLiquid=4180*T°C` and `hIce=2100*T°C−333500` J/kg. These are declared constant-cp/0°C-reference approximations, not exact IAPWS droplet/ice properties or supercooled-droplet nucleation physics. At0°C explicitly admit ice/liquid coexistence over the fusion enthalpy interval. Do not let bisection jump across that latent interval and return a tiny temperature bracket with an unclosed H residual. CoolProp's exact ice/water switching near273.16K differs slightly from the existing0°C film convention; retain/document this reduced model convention and test both sides rather than assuming a perfectly smooth saturation derivative.

## Outdoor boundary and fan contract

The proposed **outdoor-only fog exits to ambient** closure is coherent and proportionate. It creates no stored fog reservoir: all entrained droplets/ice leave with the exhaust. Original contact total H*/W* therefore remain the governing air-side heat/water fluxes. Film deposition/evaporation stays the original contact water removal, not contact removal plus exhaust fog. Adding fog to retained film would invent capture and change both ledgers.

Critical source issue to prevent: the current outdoor fan line reconstructs `airH(outletC,outletHumidityRatio)`. After a fog flash this is only gas enthalpy and omits condensed-phase enthalpy. Expose original total outlet H/W, add fan power per dry-air flow to **total** H*, then equilibrate again at unchanged W*. This lets fan heat warm/melt/evaporate fog while conserving energy and total water. Reporting only saturated vapor Wv must not overwrite W* used by the boundary ledger. No fake film mass, latent reset or new weather water source is needed.

Existing outdoor film energy storage, atmosphere heat flux and water boundary signs are compatible with the exhaust-fog choice if they retain original contact totals. Fog affects exhaust thermodynamic state/phase diagnostics, not coil heat or deposition. Fan-stopped exhaust temperature remains null; natural exchange still follows the declared air-side model.

The indoor recirculation path is different: fog returning to a room needs a retained/collected condensed-water store and corresponding enthalpy/water transport. It cannot be silently exported to ambient. This scoped outdoor fix may retain the explicitly unsupported indoor/room-fog domain, but that limitation must stay visible. Room candidate supersaturation after ventilation/envelope cooling is not solved by outdoor exhaust treatment.

## Implementation acceptance gates

1. Native-EOS exact failing contact fixture returns nonnegative phase amounts and conserved total H/W without requesting RH for supersaturated vapor. Separate tests cover unsaturated no-change and saturation onset from both sides.
2. Liquid, ice and0°C coexistence branches close energy independently. Test fog evaporation under fan heat, including insufficient heat and complete evaporation. Keep nonfinite/domain/backend faults as real failures.
3. Use bounded monotone brackets and an independent enthalpy residual, with an initial target around `1e−5 +1e−10*abs(H*)` J/kg dry air, plus native precision/refinement evidence. Root/author may choose a tighter measured budget. No tolerance change to whole-system heat/water acceptance. Water accounting is arithmetic, not a humidity cap.
4. Confirm total exhaust H+fan/md, total water and original contact surface flux are wired through engine ledgers. Native-backed room/metal/film/system energy and water must close, including a rejected fog/thermal candidate rolling back all state/clock/control/ledgers.
5. Short exact fog fixtures precede bounded weather/reversal regressions. Fresh source must pass prior Reference/coil/nozzle regressions and previously failing high-RH cases; capture accepted checkpoints and actual faults. No successful continuation claim from a standalone saturation helper.

**Current review disposition:** the conservation/phase proposal is accepted for implementation and focused evidence. Production release acceptance awaits the actual code, residual/refinement/rollback tests and root browser fault presentation review. The charge model remains a separate experimental gate.

## Separate ordinary-use shared-pressure envelope defect

Root's real-browser reconstruction (outdoor−0.5°C/default35% RH, attic Off, middle target22.5°C, ground17.5°C) faults at61.5 s, not yet the user's exact307 s. Read the full config/output in `/tmp/heatpump-owner-browser-fault.json` and the current two-pressure solve. The previous accepted thermal state is conserved; fault rendering zeros actual output rather than accepting the failed candidate.

The best rejected pressure point is te−8.235679°C/tc61.087306°C, residual equations approximately −0.001/0.305 W. An independent scalar native EOS evaluation using the actual configured SH3K/isentropic efficiency0.7 gives:

| Quantity | Independently observed |
|---|---:|
| pL | 619133.051 Pa |
| pH | 4027992.436 Pa |
| pressure ratio | 6.505859 |
| discharge T | **144.999994726°C** |
| configured discharge cap | **145°C** |

This is a solve pinned to the physical discharge-temperature boundary. It is not evidence to relax the original0.1W closure tolerance or accept a0.305W best candidate. The lone middle branch remains active with room≈19.9046°C, target22.5°C, and raw thermostat demand≈69.9076rps. Fixed compressor speed plus finite branch/surface capacity and the hard envelope can become incompatible. A real bounded drive must derate/hold instead of requesting a continuously rising command until the algebraic solve faults.

Recommend a declared generic Reference envelope governor based on actual accepted cycle Td/ratio, acting before the hard cap; distinguish thermostat demand, armed command and actual operation. Prior inventory-mode control machinery may be reused where its physical inputs apply, but its stopped discharge prediction must not fabricate a Reference sensor. Any lower-speed solve retries must be bounded and transactional and freshly close **all** original equations at the accepted speed. An arbitrary solver failure cannot be converted to a protection hold through string matching; retain numerical/backend faults and require explicit envelope evidence for controller fallback. Last-indoor Off, defrost/reversal and restart dwell retain their existing thermal/inventory/clock semantics.

Acceptance now has two independent branches: conserved outdoor fog and actual Reference compressor envelope control. Both need fresh native-EOS/engine evidence. User exact timing remains unconfirmed. **Pressure/fog production promotion not yet accepted by this review.**

### Concrete Reference control proposal

Author/root now authorize applying the existing declared generic `driveStep` to Reference mode as well: minimum-speed startup,10 s hold,0.5rps/s upward slew, ordinary downward slew,30 s restart dwell and existing soft/stop/recovery margins. These remain generic assumptions, not a manufacturer map.

Conceptually accept prior **accepted current-orientation** cycle Td/ratio for running feedback, plus a fresh minimum-speed cycle forecast at **current** metal temperatures and active branch/orientation when stopped or after reversal. Holding an old145°C discharge reading forever would be a stale-sensor deadlock; the fresh algebraic forecast can recover as real stores cool. It is a control estimate, not a materialized stopped discharge sensor. The driven actual cycle still independently closes every original residual and hard cap. A feasible trial crossing the supervisor stop is discarded and a passive thermal interval may proceed. No catch-and-relower retry for arbitrary Newton failure is proposed; that distinction is correct.

Readiness checks: do not publish discarded trial ports/work as actual operation; timers must count actual cycle presence rather than requested running/defrost alone. Preserve shared-drive/control state under whole thermal rollback, leave requested mode separate from actual stopped cycle/COP, and explicitly retain the chosen fan policy during protection. Defrost tests may encounter a real30 s protection dwell but still need actual reversal/melt/drain/return, not a looser “requested defrost” assertion. **Control proposal accepted conceptually; saved implementation/tests pending.**

### First saved governor source findings

The first saved engine draft implements fresh current-metal forecasts and independently checks valid driven candidates against supervisor thresholds; arbitrary solve errors still propagate. Whole-engine checkpoint already includes shared drive state, and Reference compressor timers now depend on actual cycle presence. Those changes follow the accepted contract.

Two concrete defects/gates were reported before promotion:

- Existing COP conditions still accept `!inventory` without an actual cycle/compressor check. Reference protection may leave stored hot-coil/fan heat flowing to the room with zero compressor work; it must not report that as operating cycle COP. Require actual cycle/compressor operation, while retaining signed residual room heat as a separate real diagnostic.
- Running feedback currently checks only cycle mode. An indoor active-set reduction can preserve prior multihead feedback and a high command while the remaining finite coil needs a substantially higher lift; the driven solve can then exceed the hard cap before producing a valid soft-stop candidate. Test real branch changes and use an explicit physically declared conservative response rather than catching arbitrary solver failure or resetting stores. Reference's new drive assumptions also need a visible generic-control warning, currently located only in the inventory warning branch.

These are source findings, not warm-up test outcomes. Production acceptance remains pending corrections and native-backed regressions.

## Cold branch entry: parallel-heating closure

Author's new-governor forensic continuation reaches291.75 s before the ground room crosses its thermostat threshold and opens a cold metal coil≈19.6793°C while the other active coil is≈47.5242°C. Exact-boundary algebraic solves at18/29/40/50/61.67/75rps all reject with5–9.5kW best residuals. This author evidence identifies a second closure restriction, beyond stale feedback: old heating requires every branch to leave at the same local saturation−SC target. Different finite coil temperatures can make that constraint incompatible at all allowed speeds.

Conceptually accept a scoped **idealized-line forward heating allocation**: compressor displacement fixes total flow; active branch flows use declared UA proportions; each finite-UA coil produces its actual outlet h. Compute `hMix=Σmi*hi_out/Σmi`, expand that actual common stream, and solve `mTotal*(hMix−hSCtarget)` plus outdoor-UA residual. Mass continuity is exact by allocation and original0.1W heat residual/hard envelopes remain. This is a generic balancing law, not an OEM multi-split controller or pressure-network derivation.

A warm branch may leave wet while a colder branch leaves subcooled liquid; their enthalpy-weighted mixture may achieve the common subcooling target without each achieving it. Keep branch Q=mi*(hi_in−hi_out), actual mixed expansion state and physical port provenance. The common outlet summary should reflect the actual mixture, with target separately identified. No branch0 alias or copied target state is a valid replacement for actual branch outlets.

A lower condensing-temperature bound just above the hottest metal is sufficient for condensation heat direction; adding SC to that bound incorrectly assumes all branch outlets equal the global target. A mixed target below the hottest metal is valid only through compensation from colder branches. Each branch finite-UA inverse must retain its own pinch/bracket constraints; no heat-through-pinch is permitted.

Fresh acceptance requires single/equal-temperature equivalence with the prior valid closure, heterogeneous-metal branch energy/mass/mixing identities, thermostat cold-entry continuity and current native-EOS/thermal rollback. Nonzero physical-line cases retain their existing branch closure until separately addressed: do not imply this scoped idealized fix resolves that limitation. **Parallel-heating proposal accepted conceptually, implementation pending.**

### Updated saved source assessment

Read the completed allocation diff and updated governor engine source. Idealized heating now computes actual PH branch outlets, actual weighted PH condenser outlet and expansion using hMix; compressor mass continuity remains independently checked and the new SC residual plus outdoor residual retain the0.1W acceptance. The mixed header sensor is actual, not a copied target. Nonzero field-line behavior remains separate and its per-branch-SC assumption is visibly declared.

The reported COP source defect is closed: Reference COP now requires actual cycle and positive compressor power. Controller/allocation assumptions are visible. Prior feedback also matches actual positive branch flows against the new active flags, avoiding stale multihead feedback selection. Whole checkpoint retains drive/controller state; rejected actual candidates never enter stored heat/electricity, and compressor/on/heating timers use actual operation.

Author reports exact saved cold-entry boundary now closes across18…75rps with all original residuals below0.022W, versus former4.9–9.5kW failures. This is attributed diagnostic evidence. Await the native-backed endurance/regression records, actual cold-entry thermostat transition and thermal rollback. A minimum-speed forecast does not itself prove high-command safety after branch removal; specifically request a warmed3→1 indoor-Off case. No speculative speed-law patch is required if actual supported cases demonstrate bounded control. **Cycle/governor source accepted for focused regression; whole stability production gate remains pending, including fog.**

### Scoped cycle/governor commit acceptance

Read `reference-protection.test.mjs` and the new heterogeneous-heating cycle test. Author reports cycle7/7 and protection1/1 PASS (11.15s), plus an owner35%RH≈600s successful continuation. The protection test warms three branches80s, disables two through real updateConfig with continuous room temperatures/clock, then continues100s. Every quarter-step independently checks original system energy/water bounds, actual hard discharge/closure, and zero compressor/nullCOP when there is no cycle; it ends in an actual lone-branch cycle. The heterogeneous test checks actual mixed condenser/expansion enthalpy, differing branch outlet states, every branch Q identity, global cycle energy, mass and original residual tolerance.

**Accept the scoped cycle/governor commit** on source plus focused attributed evidence. Whole Reference production promotion still needs root's immutable exact-user browser/endurance and full regression checks; fog is a separate pending change. No controller state or fluid/thermal store may be reset to gain stability. Whole checkpoint structurally includes the shared drive; a real post-drive thermal rejection/rollback regression remains useful integration evidence. User307s timing/cause is still not asserted identical to the reproduced61.5s/291.75s failures.

## Saved outdoor-fog source review

Read `equilibrateExhaust`, complete `airExchange` and engine outdoor fan diff. Fog classification uses a valid dew-state H threshold rather than trying RH on supersaturated gas. Unsaturated streams retain original H/W; fog solves saturated vapor plus condensed-phase enthalpy in a bounded bracket with an explicit0°C fusion interval and an independent `1e−5+1e−10|H|` J/kg dry-air residual. Normal liquid/ice solutions verify nonnegative fog and finite vapor. Exceptions propagate through whole-engine transaction; no catch-and-continue is introduced.

The engine opts in only for outdoor exhaust. Contact totalOutletEnthalpy/totalOutletWater, coil-air heat and surface water exchange stay unchanged. Fan heat is applied to original total enthalpy then re-equilibrated at original total water. Indoor fog throws explicitly. These satisfy the accepted mass/energy contract and avoid fictitious film capture.

Reviewed new phase/contact tests: known−2°C ice fog,+1°C liquid fog and0°C mixed-phase fog reconstruct both conserved quantities, fan addition is separately reconstructed, exact supersaturated contact water/heat identities hold, and indoor fog remains rejected. Author test execution/result pending at this source snapshot.

One short independent scalar HA probe establishes dry W0 and1e−12 dew calls return finite values≈−123.75°C. Such a dewpoint is valid even when actual outlet is20°C; the−60°C fog-solve bracket must not become a universal dewpoint limit. Reported guard/test suggestions are finite reference/p/dew and consistent fusion-branch amount validation, normal unsaturated/dry no-change, saturation onset±, complete fan evaporation and real post-drive fan/HA failure rollback. These improve contract evidence without loosening physical residuals. **Outdoor-fog source physics accepted for focused testing; full stability production gate awaits final tests/integration.**

### Final fog evidence and equal-temperature equivalence

Final fog source adds finite h/W/p/reference/dew guards, explicit dry-gas handling, a fog-only−60°C bound and fusion-phase amount checks. Read all four native-backed tests. The initial4/4 result used an injected fifth dew-call failure; the later warm-gas fast path made that call count obsolete. Final source instead uses a real outdoor weather edit from−6°C to0°C at99% RH, retaining cold metal, to create genuine fog and inject the **second** dew-call failure at the fan. Author reports final4/4 PASS1.84s, covering known phases, exact contact totals/indoor rejection, dry/unsaturated/onset± near−0.01/0/+0.01/+5°C and complete fan evaporation. The corrected fault occurs after drive/cycle preparation and restores room/outdoor stores, time/timers/active flags, all ledgers and drive exactly; actual output becomes stopped/nullCOP rather than committing heat. This is a supported exception-recovery test, not a surrogate physics trajectory.

`reference-fog-precision.json` records21 known-phase fixtures compared at half the enthalpy-root budget: maximum temperature change9.9824e−9°C and reconstructed H error1.0312e−5J/kg within the absolute+relative budget. Root reports pre-fog immutable exact-owner browser continuation1204.25s at requested5× with real protection/restarts, no fault/reset and system E error<4e−7J. These close the reviewed source/precision/transaction gates; fresh full-source regression and final browser promotion remain parent checks.

Single/equal-temperature idealized-heating equivalence follows directly: `mi=mComp*UAi/ΣUA` gives every branch the same `UAi/mi=ΣUA/mComp`; at equal metal temperature the finite-UA inverse is identical, so all outlet h match. The common mixed SC residual forces that h to hTarget. The prior branch target relation `ΣUA/I(hIn,hTarget,Tmetal)=mComp` gives the same I and therefore the same unique outlet/pressure closure. One active branch is this case automatically. Native comparison is still useful to bound approximate0.1W-closure output differences; do not demand arbitrary pressure equality finer than that equation tolerance without conditioning evidence.

Root's fresh full regression currently reports a stale/singular continuation assertion failure. Exact assertion/conditioning remains to diagnose; do not waive it or relax production heat tolerance. If only the old0.001K equality fails because both newly weighted pressure equations close within0.1W at slightly different roots, a tighter test-only equation tolerance can make the same-root assertion meaningful while preserving the production budget and existing temperature assertion. **Final production acceptance remains gated on resolved full-suite result.**

### Resolved warm-Jacobian assertion and defrost policy proposal

Author measured the old0.1W fixture: baseline te−6.259540°C/residual0.0791W; stale−I solve differed−0.00129288K with residual0.0491W, and singular-J solve differed−0.00046889K with residual0.0322W. All original production equations closed, but0.001K root equality was finer than this condition supported. At a **test-only0.001W** equation tolerance, stale/singular differences fell below1.45e−5K and residuals below0.0009W. The fixture now uses that tighter comparison precision while retaining the original0.001K temperature assertions and unchanged production0.1W tolerance.

This reviewer independently ran only the filtered stale/singular fixture against the existing compiled native backend/build:1/1 PASS,6.27s. No compilation, whole suite or warm-up loop was run. This closes the specific assertion gate; the earlier root full-suite snapshot cannot be reported as passing until its corrected run completes.

Root/author propose using the existing configured35rps defrost command immediately for Reference defrost startup and its fresh restart forecast, rather than the ordinary18rps/10s startup policy. Accept this concept as an explicit mode-dependent generic control assumption **if**35rps independently closes the actual cold-boundary cycle. It is not a lower-speed numerical retry and must not bypass hard envelopes, supervisor stop/recovery or restart dwell. Requested defrost while protected still reports actual compressor stop/nullCOP. Actual phase reversal/melt/drain/heating return and final source review remain required; no specific OEM defrost actuation is claimed.

### Independent native one/equal-temperature check

Executed only two fixed-boundary algebraic cycles against the existing compiled source and shipped guarded native backend (1.73s; no compilation or warm-up). One branch and three equal30°C branches use unequal UA300/450/700W/K, outdoor metal−3°C and35rps. Test-only heat tolerance is0.0001W. Independently reconstruct the former targeted branch flows `UAi / conductanceIntegral(pH,hDischarge,hTargetSC,30°C)` at the new accepted pressures.

| Active branches | Original reconstructed versus new maximum flow difference | Accepted residual | Actual branch outlet h spread |
|---|---:|---:|---:|
|1|1.6547e−11kg/s|4.1529e−6W|0J/kg|
|3|2.2063e−10kg/s|6.2309e−5W|0J/kg|

This native evidence supports the exact algebraic proof and closes the single/equal-temperature gate. It does not require the incompatible heterogeneous prior closure to agree, and changes no production tolerance/state.

## Final Reference source and cold-weather trajectory

Read the final air/engine diffs, all fog tests, dynamics test changes and `reference-fog-closure.md`. Source fingerprints are air `ac6f645fbacc073afdcb3abf214257d142358af0b1f58e87d61105f342f9cf6e`, engine `62dbd7135c0f23cff31e30460164ee7778df2cea41a7b086745e23df6974c8fc`, cycle `3507bfc45f68af571de8c017cab252fb3a457f3b4179f6e063801e2893a72548`.

The final Reference mode uses configured defrost speed for its startup minimum and fresh forecast, retaining supervisor/hard limits and restart dwell. At the saved344s cold boundary, author reports35rps closes0.00355W within the original0.1W limit. Ordinary heating/cooling minimum-speed startup remains unchanged. This closes the conceptual defrost-policy gate: no failed18rps trial is caught and relabeled successful.

Author's frozen Reference cold0°C/99% RH/setpoint21°C run passes the former29.25s fog failure and naturally reaches reversal323s/defrost326s. The accepted344s checkpoint continues without changing stores through complete melt/draining396.25s, reversal406.25s, idle409.25s, actual heating426.25s and600s. Final system energy residual is−4.55e−7J and water−5.04e−15kg; every quarter-step retains original ledger/closure/hard-discharge checks. Thus this is actual frost, reverse circulation, melt/drain and174s further heating, rather than a requested-defrost flag or standalone phase helper. The private research continuation loader restores the complete Reference checkpoint, verifies exact prior output and energy identity, then advances only normal engine steps. Reviewer read it but did not run a warm-up or continuation. This attributed Reference evidence does not promote the experimental charge/frost model.

The four initial full-suite assertion failures are addressed with explicit test semantics rather than production tolerance changes; completion still requires their final passing execution. Cached-Jacobian localization uses the tighter test-only0.001W equation tolerance and retains0.001K comparison. Defrost tests permit requested defrost during genuine restart/protection wait only with null effective mode/zero compressor work; they still require actual reverse circulation, positive melting and all phase transitions. All-Off waits within a bounded interval for an actual defrost cycle before testing abortion and retains exact thermal storage/clock continuity. Wet-cooling refinement observes60s after the declared startup/ramp, rather than30s while ventilation temporarily dominates dehumidification. Author measures net room water+1.76e−5 at30s and−0.000109 at60s; finest step comparisons are6.77e−5°C and0.000439 relative electricity, within the **unchanged**0.002°C/0.002relative budgets. Positive condensate and net humidity reduction remain required.

**Source disposition:** accept these scoped Reference changes and corrected tests for the fresh full regression and release checks. No outstanding source physics defect is identified at the fingerprints above. The first41/45 run remains a historical failed run; it must not be reported as successful. Final production acceptance awaits the corrected full suite and root's hosted browser verification. Exact user307s timing is still not established; the independently reproduced ordinary defects and post-fix user-configuration browser endurance are the supported claims. Indoor fog and nonzero-line per-branch SC limitations remain explicit.

### Early-trigger melting observation

The author's isolated dynamics run initially reports13/14, failing only the early-trigger `melted` diagnostic flag. Its unchanged0.005kg frost/30s dwell fixture reaches maximum ice0.005327kg, actual defrost, ice exhaustion/draining125s and heating return155s. One-second calls contain four unchanged quarter-second model steps but expose only the final substep diagnostics: a short positive melt-power burst can therefore disappear from that sampled flag. This does not establish a missing latent-energy process.

Read the revised fixture: exactly the same controls,250s observation window, frost threshold, ledger limits, actual-defrost and melt assertions now observe1000calls of0.25s rather than250calls of1s. This increases diagnostic sampling to the native model step without changing the underlying integration trajectory or weakening criteria. Accept this test rationale, subject to the focused result and complete fresh suite. Parent's in-progress full-suite snapshot still contains the former one-second observation and must be distinguished from the corrected fixture.

Root's completed final-source full run is44/45 in210.922s, with only that former one-second melt observation failing. The corrected quarter-step fixture also accounts for the exact dwell deadline: `driveStep` tests the previous interval's offSeconds, holds that interval if below minimum, then increments offSeconds by dt. Its final stopped interval can therefore report zero remaining restart delay at the endpoint. The test permits this only in the bounded `[minOff,minOff+0.25]` interval, still requires zero actual compressor work/null effective mode, and still requires actual defrost and positive melting later. Read the control source and test; this is a discrete-interval timing convention, not acceptance of an unexplained stop. Production physics/hard caps/residual tolerances remain unchanged. Final focused corrected fixture and mandatory fresh45/GitHub plus hosted browser verification are pending;44/45 is not a release pass.

Author's corrected early-trigger focused result passes in28.96s, retaining actual reverse circulation and positive melt; the other13 dynamics cases passed separately. Final fog4/4 also passes again in1.76s. Commit `387e557` retains the reviewed production fingerprints. Read the final fan fault matcher: it filters the exact original outdoor total-water input before counting the second dew call, excluding indoor dew calls. Read raw `reference-wet-refinement.json` and `reference-fog-continuation.json`; measured convergence and actual melt/return numbers above agree, including600s final heating4870.879W/COP2.35769. The cold evidence is explicitly an accepted344s predecessor continuation, not a full final-source warm-up. **All scoped source/focused science gates are accepted; fresh complete45-case CI and hosted verification remain required before final release disposition.**

### Fresh complete CI result

Independently retrieved GitHub run `38082400611` and its log: commit `ce9d221a3849d15650838d289a2fd33ab3f56eab`, completed success, tests45/pass45/fail0 in238119.040155ms. Types/static build, released Reference/guarded properties and deployment all complete successfully. [Fresh CI receipt](https://github.com/AnnoyingTechnology/heatpump-simulator/actions/runs/38082400611). This closes the complete corrected regression gate; it supersedes the historical41/45 and44/45 observation snapshots. Root separately reproduces corrected focused melting1/1 in29.376s and fog4/4 in1.717s. Final hosted normal-case and owner600s/requested5× receipts remain pending, so final hosted acceptance is not yet recorded.

Read root's final hosted normal receipt `github-pages-browser-results.json` checked20:11:41UTC:4/4 pass for actual running worker/sensors, paused weather/individual-control clock continuity, acceleration without restart and no application/loading errors. It identifies deployed bundles `index-G5aE9vy7.js`/`worker-4IABHY1z.js` and guarded WASM SHA256 `7c6160bf570e2a33ca09e9e1de288266c09052b9e38c45885dd09848e9d3a89c`. Owner endurance is still pending. Its initial no-samples 'Missing attic control' receipt is a test-label setup rejection, not an engine outcome; root corrected the accessible-label prefix and confirms all intended live settings before the ongoing endurance run. No successful600s outcome is inferred from interim progress.

### Final production disposition

Read the completed `github-pages-stability-browser-results.json`: hosted controls are explicitly confirmed outdoor−0.5°C/RH35%, ground17.5°C, upstairs22.5°C, attic Off and requested5×. The actual worker advances from0.3s to601s,600.7physical seconds in122.631wall seconds, with no recorded fault/reset/runtime error. Its423s sample has no materialized discharge reading during a root-observed real protection hold;480.8s reports an actual discharge103.5594°C again, demonstrating recovery rather than a permanent stopped-sensor deadlock. Other recorded operating discharge temperatures remain below the145°C hard cap. The successful normal hosted4/4 and full native45/45 CI remain separate supporting checks. Re-read current production fingerprints: all three still match the accepted source above.

**Accept the scoped Reference production change.** It fixes the independently reproduced ordinary shared-pressure/control and outdoor supersaturation defects, preserves original heat/water/native hard limits, and demonstrates real frost/melt/drain/heating return plus the tested owner-configuration browser endurance. This acceptance is scoped to the declared generic Reference model and observed regimes; it does not assert the unknown actual user humidity or reproduce the exact307s historical timing. It does not promote the experimental charge model, provide OEM calibration, solve indoor fog storage, or resolve the separately declared nonzero-physical-line branch closure limitation. No outstanding science release block remains for these Reference changes.
