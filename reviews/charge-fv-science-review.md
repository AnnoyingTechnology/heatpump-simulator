# Independent charge finite-volume review

Status: conditional research review; public charge release is **not accepted**. This review concerns the isolated `/tmp/heatpump-charge-release` candidate, not the current deployed Reference simulator. Reviewed 2026-10-11. No production edits, tolerance changes, shared builds or long simulations were performed by this reviewer.

## Observed source and backend

The isolated guarded R32 WASM now matches root checkpoint `a566d92`: SHA256 `55d4d93788e146f773ba7dbbd14ad47a3e24fc0a273eaad910879f5404bbe0d0`. Earlier results against `974919…` must retain their older-backend attribution. Sources were still being edited during this review; the following hashes identify the source inspection, not a final release snapshot:

- `src/engine/charge.ts`: `c1483587c10a961713c153c1b4689e94a8286bc016079a3a358330bf9d5330db`.
- `src/engine/charge-faces.ts`: `8df1ed35ee5eb671e2a47b6a4c208ee267d6dacd16b0e1a12447bf20c44f4bf6`.
- `src/engine/engine.ts`: `abfd49ebcce24e2eb06d49d0e4ec6f390e4fe924fd3f911657e77f8cfa7d6a1b`.

## Conservation and numerical meaning

The backward recurrence for internal face mass flows eliminates the same backward-Euler local mass equations: each incoming face equals its outgoing face plus the cell's actual mass accumulation divided by the accepted interval, plus any declared local loss. The remaining group/header/global constraints are necessary. Replacing the accumulator rows by aggregate rows does not authorize discarding the original equations; current acceptance retains all original local mass/energy residuals, header continuity, per-step aggregate budgets and cumulative drift limits.

Internal coil energy flux is one shared `m*h_face`, entered with opposite signs in the adjacent cells. MC reconstruction changes this face enthalpy, while authoritative finite cell M/U remains the original conservative storage. Density coordinates change the nonlinear unknowns, not the conservation law: M=ρV and U=Mh−pV. No accepted-cell projection or gas-port phase forcing is justified.

The MC helper uses the standard minmod combination of doubled one-sided differences and the centered difference. That is a recognizable reconstruction family; it is not proof that this compressible, implicit pressure-group DAE has a discrete maximum principle or is TVD for every accepted trajectory. [Clawpack's primary limiter documentation](https://www.clawpack.org/v5.9.x/pyclaw/evolve/limiters.html) supplies the conventional limiter basis, not validation of this engine.

## Concrete findings and accuracy gates

1. **Sensor endpoint defect, reported to implementer:** `engine.ts` initial/no-candidate inventory output hardcodes `outdoor:2` and `room:coil:2`. For 6/12 cells these are internal cells, not the small-side terminals. Select the physical terminal independently of resolution and verify the initial/idle output against a nonuniform retained history. The warning claiming exactly three cells is also stale for those options.
2. **Reference boundary mismatch, acknowledged and subsequently corrected by implementer:** the independent MC tube reference supplied boundary inflow enthalpies to endpoint slopes, while production uses zero endpoint slopes. Comparisons before alignment did not qualify the same discretization.
3. **Coupled spatial accuracy remains open:** the 3/6/12 coupled test originally established volume identity, conservation and reversal, without bounding delivered heat, outlet h/T/quality, pressure or phase-transition timing differences. These must be measured against a sufficiently finer spatial/temporal reference. A legal conserved solution is not automatically an accurate coarse solution.
4. **Condensation refinement is not yet asymptotic:** the implementer reports aligned 3/6/12/24/48 bubble times 2.225/2.125/2.125/2.125/2.15 s and outlet h approximately 203004.7/202752.5/202853.2/202856.7/202843.8 J/kg. Fine differences are nonmonotonic; 24/48 pressure differs approximately 0.48%. Report that limitation rather than asserting demonstrated spatial convergence. The reported 12-cell temporal integrated-outflow sequence 8405.946/8407.463/8408.221 J for dt .025/.0125/.00625 s supports first-order temporal behavior for that fixture, subject to the final pinned receipt.

The rejected P1 moment model is historical research evidence, not an approved alternative. No independent engine test was run in this review. Attempts to execute the standalone TypeScript helper encountered unavailable runtime/transpiler APIs; they produced no validation result.

## Idle initialization and migration

Uniform density at a uniform saturation temperature is one admissible initial distribution, not a unique equilibrium inventory. At fixed pure-fluid saturation P/T, local liquid/vapor volume fractions can differ while preserving their volume-weighted sum and therefore total M/U/V. A homogeneous single-phase equilibrium has a different uniqueness situation; do not generalize two-phase allocation freedom to it.

A declared warm-assembly initialization followed by a conservative Off soak with cold outside/warm rooms, then live restart on the **same engine**, is a legitimate new history experiment. It must retain every local M/U store, thermal state, controls, time and ledger reference; `engine.reset()` would instead reconstruct uniform inventory and reset those references. Keep the original uniform-cold protected counterexample. Record duration, actual Off valve positions/connectivity, local mass/phase rates and boundary heat before describing an idle distribution as steady.

This history remains conditional on the present adiabatic field lines/accumulator, homogeneous bulk coil transport and generic geometry. It does not establish the owner's actual idle charge allocation. MERL's primary cycling study describes Off redistribution, valve-connectivity dependence, and slow boiling of trapped liquid in an accumulator with limited heat transfer. Its alternative regenerative accumulator is a different physical closure, not permission to insert undocumented heat into this owner's system. [MERL TR2023-127](https://www.merl.com/publications/docs/TR2023-127.pdf).

The implementer reports a 120 s Off + 30 s heating history that passes the former nozzle rejection, heats rooms and first forms atmospheric frost. This is useful intermediate evidence, not complete frost/melt/drain/heating-return acceptance. Reported heating runtime cost remains substantial. New line/accumulator thermal, gravity or oil-return closures require an identified missing mechanism and explicit sourced assumptions; dry outlet forcing, oversized separators or charge fitting are not substitutes.

## Nozzle optimization contract

Increasing bounded golden-search refinement from 32/48 to 48/64 after a measured whole-flow disagreement preserves the constitutive law if the complete corrected-flow comparison and original tolerance remain enforced. The implementer reports the saved wet restart fixture decreasing disagreement from 5.93e−11 to approximately 1e−13 kg/s. Require the final source-pinned native/polynomial comparison, phase-boundary cases, one-ULP/Poiseuille/choking cases and bounded-failure rollback receipt.

For pure R32 coexistence, classify with native saturated entropies at the actual pressure, then derive x=(s−s_l)/(s_v−s_l) and 1/ρ=(1−x)/ρ_l+x/ρ_v. A preliminary PS inversion is mathematically redundant there. Reordering is acceptable only with finite ordered entropy bounds, positive finite densities, the same selected pressure/temperature domain, actual endpoint-side qualification, and unchanged native failure propagation. Single-phase states retain their actual PS/PT route. Comparing against native PS and complete nozzle flows is necessary; bypassing an unused PS call is not permission to recover from a genuine failed saturation/property query.

## Disposition

The conservative formulation and declared retained-history experiments are defensible research directions. Public promotion still requires fixed sensor endpoints, final frozen-source/backend receipts, proportionate coupled spatial/temporal accuracy bounds, actual charge sensitivity and continuous controls, useful declared nominal operation, complete naturally generated charged frost/defrost/melt/drain/return, ordinary cooling, exact rollback, and measured browser performance. A physically protected passive hold remains a valid outcome for a declared scenario, but does not satisfy nominal heating acceptance.

## Follow-up: expansion-valve control diagnosis

The implementer subsequently reports that the retained warm-history heating run overfeeds before protection: at +35 s opening 0.878, total liquid-feed rate 0.03140 kg/s versus compressor vapor rate 0.02184 kg/s, outdoor gas-end quality 0.812/SH=0 and accumulator mass 0.56558 kg; at +40 s opening 0.803, feed 0.03199 versus compressor 0.02292 kg/s, gas-end quality 0.693/SH=0 and accumulator mass 0.60915 kg. These are author-reported diagnostic values, not independently rerun here. The old integral-only law closes at 0.005×(0−3)=−0.015 opening/s despite the declared 0.1/s actuator capability. Correcting the measured control deficiency is a proportionate next experiment before inventing accumulator shell heating.

A bounded PI controller is an appropriate generic hypothesis. Danfoss's primary EKD316 manual documents single-loop superheat PI, gain/integration-time effects, low-superheat behavior and startup provisions. It does not validate our normalized-area gains or owner's control. [Danfoss EKD316/316C manual, pp. 13–15](https://assets.danfoss.com/documents/latest/86455/AI215386429656en-000201.pdf).

Required implementation contract:

- Preserve the actual evaporator gas-end sensor and actual saturation pressure. SH=0 during coexistence is truthful but cannot distinguish mild wetness from nearly liquid inventory; measure quality/feed/accumulator behavior separately.
- Use dimensionally declared gains: positional command u*=I+Kp(SH−SHtarget), with Kp in normalized opening/K and Ki in opening/(K s). For example Kp=0.03 and Ti=30 s gives Ki=0.001; this is an initial generic candidate, not a manufacturer-derived or accepted tuning.
- Keep physical opening in [0,1] and the unchanged declared actuator slew. Include output saturation and slew limitation in antiwindup; permit integral motion back toward feasibility. I is a command bias, not a valve position: arbitrary clipping of I to [0,1] can break bumpless initialization. Finite tracking or conditional integration must be specified, not merely labelled antiwindup.
- Store control memory per persistent physical branch in the candidate/snapshot. Only accepted elapsed substeps advance it. Numerical retries and rejected parent thermal candidates restore memory and physical stores exactly.
- Pickup protection takes precedence over re-arm/preposition. Explicit Off/reversal/recovery policies freeze or track integral memory and re-arm without changing M/U or jumping the actuator. Continuous ordinary steps must not erase integral memory by repeatedly reinitializing I from the current opening.

Acceptance remains contingent on sustained heating/cooling, sensor and phase/charge sensitivity, naturally complete frost/return, gain/time sensitivity and temporal/spatial refinement. A successful changed-control trace is new scenario evidence; preserve the original control counterexample and unchanged physical caps.

### Independent implementation checks and corrected findings

The subsequent static-port fallback selects the first/last physical coil IDs rather than index 2; the inspected source corrects the previously reported resolution-dependent endpoint defect.

The reviewer compiled a separate source/vendor snapshot at `/tmp/heatpump-review-pi-rtje4n8n`, without touching the implementer's build or duplicating its long simulation. The original antiwindup checked the pre-integration command and could integrate across a newly reached bound: opening .99, error 110 K, signed bias −2.31 and dt .25 produced raw 1.0175. The implementer corrected this by admitting only the part of integral action feasible within the current position/slew interval, while allowing an existing infeasible signed bias to move toward feasibility.

The corrected helper and candidate memory are accepted for this scoped implementation review. Independent copied tests passed 5/5 in 3.241 s against the guarded backend. Additional reviewer checks passed 5,000 randomized integral/position/slew/inactive cases. A real six-cell parent On→Off edit left inventory unchanged at edit time; its next accepted .25 s interval closed the valve .64925→.62425 with zero compressor power, mass residual 1.11e−16 kg and total-energy residual 1.21e−8 J. An actual subsequent bad-room humid-air thermal rejection restored fluid/bias/opening, rooms/outdoor, clock/timers, drive and ledgers exactly. All checks used unchanged physical acceptance limits.

Randomized MC face checks separately passed 4,464 local-bound assertions and 38,000 active-derivative comparisons, maximum derivative difference 9.50e−8. They establish helper arithmetic, not implicit PDE boundedness or coupled coil accuracy.

Pinned receipt: [charge-pi-independent-results.json](charge-pi-independent-results.json). Charge source SHA256 `bf3889391cdc99cb6e4d4d3521be4aede47c31d07790b39e22345d63f26af330`; corrected PI helper `360d75254a51387a9ad5e28c01d8896cbf08b9711c0d839d3bc487e0e666e7b4`; parent engine `222be1955b0fefc3b83433ea0af2a16448ccfacd5114d5e3f585a0855223e954`; matched guarded WASM as above. Subsequent source changes require new attribution. Sustained trajectories produced before this antiwindup correction remain evidence for their exact older controller; they are not final-source acceptance. Full heating/cooling/charge/frost/refinement/throughput release gates remain open.
