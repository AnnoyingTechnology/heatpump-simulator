# Charged frost/defrost acceptance

Status: **open, not accepted** (2026-10-10). Natural atmospheric ice deposition and automatic reversal are observed. Earlier coupled source versions completed real melting and entered draining, but no matched final-source run has completed draining and resumed useful heating. Timestep refinement remains unperformed.

## Acceptance and assumptions

`tests/engine/charge-frost.test.mjs` begins with zero outdoor film water and real finite R32 mass/internal energy. It requires:

- Atmospheric deposition and a positive retained ice inventory without injected film mass/energy.
- Automatic reversal and physical cooling orientation during defrost.
- Actual integrated compressor electricity and reverse refrigerant heat sufficient for the measured latent melt requirement; protected/restart pauses are permitted.
- Positive retained liquid and drainage, complete ice exhaustion, and the accepted pre-transition metal temperature meeting termination.
- A return after draining with physical heating orientation, positive compressor electricity, positive indoor refrigerant heat and negative outdoor refrigerant heat. State labels alone cannot pass.
- Unchanged physical refrigerant cell identities/volumes; closed R32 mass, refrigerant energy, full-system energy/water, and an independently integrated outdoor deposition/retention/drainage balance.

The laboratory scenario uses outdoor air -1 C at 90% RH, 0.6 kg R32 initialized at -1 C, indoor metal initially 20 C, and all fixture physical volumes/conductances/capacities. Heating/defrost demand is the minimum 18 rev/s. Generic control assumptions shorten the ice trigger to 0.0001 kg after 5 s of heating and termination to 1 C; the fixture's 3 s reversal, 30 s minimum-off period and 10 s drainage dwell remain. This is a finite generic coupling exercise, not OEM calibration or validation of the default 0.15 kg trigger.

Science-reviewed cumulative limits are **1e-7 kg (.1 mg) R32 mass** and **.01 J refrigerant energy**, with actual core hard stops and no mass/energy projection, repair or ledger rebase. Test limits also retain .01 J full-system energy and 1e-9 kg water. An earlier 1e-8 kg short-run mass assertion was a regression observation, not the declared universal accuracy budget; its measured 1.0087e-8 kg residual lies within the explicit reviewed long-run limit.

The test logs compiled `charge.js`/`engine.js` SHA-256 fingerprints, phase/state transition times, peak ice/liquid, integrated heat/electricity/water, maximum actual residuals, periodic residual trend, and reported adaptive substep counts. Newton counts are not exposed in EngineOutput. `CHARGE_FROST_STEP_SECONDS=.125` changes both the actual outer step and configured maximum step; it will be compared against .25 s on the same released source after the base passes.

## Observed source-specific evidence

These are historical probes, not claims about the current unvalidated source.

| Isolated source / scenario | Observation | Outcome |
| --- | --- | --- |
| Early core, +1 C/90% RH, 24 C room demand, initially warm fluid | Fault at 8 s; metal +0.416 C, no ice; pressure ratio reached the existing limit 8 | Real operating-domain stop, not successful frosting |
| Early cold-equilibrium core, fixed 18 rev/s | Reversal 48.75 s; defrost 51.75 s; real ice 0.000111195 kg; metal -0.526 C at 80.25 s | Stopped at 99.75 s on the former 1e-8 kg test assertion; no completed-melt claim |
| Tighter mass/phase pressure Jacobian before finite-passage fix | Reversal 48.5 s with 0.000100349317 kg ice; mass/energy residuals 4.21e-11 kg/9.27e-6 J | Reversed passive hydraulic solve stalled for over six wall minutes and was terminated |
| Finite-passage/hybrid core, before aggregate balance preconditioning | Ice exhausted by 100.25 s; draining 121.5 s | Fault at 127.25 s: local outdoor-cell mass residual 6.16e-11 kg exceeded its 5.08e-11 kg floor |
| Aggregate-preconditioned full solver, before linked energy precision | Ice exhausted by 100.25 s; draining 122 s | Fault at 127.5 s: local cell energy 1.79e-5 J versus tolerance 1.40e-5 J; aggregate mass/energy only -3.58e-14 kg/-4.81e-9 J |
| Linked energy precision, full solver before analytic storage Jacobian | Real melt and draining 122 s | Over eight wall minutes without useful heating return; terminated as numerical/usability stall |
| Analytic EOS storage Jacobian with final physical drive, **before subsequent exact coil-heat Jacobian** | Reversal 48.75 s, defrost 51.75 s; actual compression initially stopped for restart timing. At 60.25 s: ice 0.000117434698 kg, metal -2.37317 C, mass/energy residuals 2.95e-10 kg/9.45e-5 J | No further reported progress for several wall minutes; terminated at 6m43s wall on root instructions. No fault or completed melt/return was inferred |

Pre-stall 48.5 s inventory in the tighter-mass probe was genuinely finite: accumulator 0.432487 kg in 0.6 L, density 720.812 kg/m3, quality 0.0123012 (vapor volume fraction about .305), pressure 10.6584 bar, enthalpy 219166.9 J/kg. Indoor gas pressure was 12.0332 bar and passive reversed header flow about 0.343 kg/s. This implicated a large physical equalization transient rather than a fabricated cycle reset.

The termination check examines the previously accepted film state. The first draining output may already cool below 1 C during its passive interval (observed 0.940 C); the test correctly checks the pre-transition threshold. Likewise, actual compressor speed zero at commanded defrost entry is permitted by the retained 30 s restart delay. The final test demands integrated actual compressor operation and actual thaw, not a requested-speed label.

No physical limits were relaxed, no faults ignored, and no ice or latent heat was injected. The attempted algebraic tree-reduction prototype failed a separate headspace recovery regression and was removed; it is not an accepted alternative. The subsequent exact coil-heat derivative changes and proposed protective EEV changes require a fresh matched-source full event before any release acceptance or convergence claim.

A test-only common-source-pressure/accumulator-drop coordinate option is available through `CHARGE_FROST_PRESSURE_DROP_COORDINATES=1`; it is not public activation or physical acceptance. It preserves absolute-pressure snapshots and all charge/geometry/safety/conservation checks. Independent source review and the author's bounded long-run release remain prerequisites before a new matched full frost gate. The active test is a separate solver-release artifact, not evidence that this status document's open gate has passed.
