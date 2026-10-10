# Project progress

Updated 2026-10-10. This is the current implementation checkpoint; detailed evidence remains in `reviews/` and `research/`.

## Completed and verified

- Frontend-only, pure-vector desktop workbench, with settings and measurements beside their environment or equipment.
- Owner equipment preset and exact floor volumes: Ground 45.4 m² / 100 m³, Upstairs 54.5 m² / 155 m³, Attic 26 m² / 84 m³.
- Individual indoor On/Off, room area/height/loss controls, outdoor weather, equipment cleanliness, branch line lengths and click-to-zoom zones.
- Shared pipe-mounted manometers for outdoor and indoor branches; compact indoor controls. Latest interface checkpoint: `cdee99a`.
- Separately validated R32 Reference heating/cooling, room dynamics and natural frost/defrost. Production starts this actual worker model.
- Conserved refrigerant mass/internal-energy implementation remains experimental and gated. Pressure-conditioning corrections passed the actual-backend core and rollback checks.
- Product scope uses initial charge adjustments to compare post-loss scenarios. Ongoing leaks were removed. Optional compressor/fan audio is recorded for later, off by default.
- Recent build, production entry, charge-control and zone-navigation browser checks passed.
- Fixed ineffective speed pacing and reduced exchanger-solve overhead. A five-check browser run verified speed response, pause, quarter-second steps, desktop header fit and fast passive scenes. Requested 1×/2× achieved approximately 1×/2×; requested 50× reached 2.5× in active heating and 49× with all units off. The selector now shows achieved speed. Three focused real-EOS tests passed, including 144 outlet/pressure-perturbation comparisons, stale-slope recovery and identical batched/unbatched physical trajectories.
- Fresh optimized Reference regression: **25/25 passed**, covering heating/cooling, natural frost/defrost and heating return, storage/energy/water balances, timestep refinement, physical transport and connection capacity. Build, production entry and all ten zone-navigation checks also passed. Evidence: `reviews/reference-speed-regression-results.json`.
- Reviewed experimental nozzle correction committed as `d1aaa73`; fixed-state balance, phase-spanning, choking, one-ULP flow and failure/rollback checks passed without relaxing physical limits.
- Guarded exact-HEOS backend built and committed as `6bbf2c7`, then independently accepted and selected by the public Reference worker. All 522 raw getter comparisons exactly matched the original native state; 2,000 invalid-state/recovery cycles passed in both Node and Chromium. Integration passed **56 numerical checks** (7 properties, 25 Reference, 7 focused coil/nozzle, 17 inventory core), both five-check browser pacing runs, production build and root/subdirectory entry. Measured requested-50× active heating improved from 2.5× to approximately **13×**, with 1×/2× retained and idle at 47–49×. Evidence: `reviews/guarded-backend-verification-results.json`.
- Published the owner-authorized public repository at https://github.com/AnnoyingTechnology/heatpump-simulator and the HTTPS site at https://annoyingtechnology.github.io/heatpump-simulator/. GitHub Actions installs the lockfile, checks/builds, runs **35 released-model/property checks**, and deploys `dist/` on pushes to `main`. First deployment of `084f292` succeeded; all four hosted-browser checks passed, including real worker/sensors, paused weather/individual-unit edits, resumed accelerated time and error-free asset/runtime loading. Deployed WASM exactly matches the verified local artifact. Evidence: `reviews/github-pages-deployment.json` and `reviews/github-pages-browser-results.json`.

## In progress

- **Reference stability:** reproduced the ordinary owner-control fault with attic off, outdoor −0.5°C / 35% RH, upstairs target 22.5°C and ground target 17.5°C at requested 5×. An initial browser failure reached the unchanged 145°C discharge ceiling at 61.5 s; a similar engine fixture then failed around 291.75 s when the cold ground branch restarted beside the hot middle branch. Commit `ff74ec0` adds generic inverter supervision and actual mixed parallel-condenser outlets. The exact owner-control browser subsequently passed **1,204.25 physical seconds at requested 5×**, including protection and heating restart, without a clock reset or fault; energy residual stayed below 4e−7 J. This does not establish the owner's precise 5:07 timing or unknown humidity. Fault rendering retains room temperatures/time and shows the reason directly; corrected-input recovery preserves state. Evidence: `reviews/reference-owner-browser-35-results.json` and `reviews/reference-fault-presentation-results.json`. Conservative outdoor exhaust fog and configured defrost startup are now independently source-reviewed; cold 0°C / 99% RH completes melting, drainage and actual heating return through 600 s with unchanged conservation/hard limits. Fresh local regression verified 44/45 in a full run, then the corrected quarter-step melt-observation test passed separately; production entry passed. The mandatory corrected full 45-check GitHub run and hosted endurance remain pending before release. Evidence: `reviews/reference-stability-regression-results.json`, `research/reference-fog-continuation.json` and `reviews/reference-stability-science-review.md`.
- **Simulation speed:** pacing and exact-backend improvements are complete and verified. Requested 50× active heating remains CPU-limited, with achieved speed shown beside the selector. Physical piping and experimental inventory workloads have separate performance limits.
- **Experimental charge physics:** the reviewed isentropic integral resolved the saved 11 s rejection. The single frozen-checkpoint continuation reached 48.5 s with 0.0001067 kg of naturally deposited ice, then stopped at its unchanged density-evaluation work limit. Exact rollback passed, but reversal, thaw, drainage and useful heating return did not. Runtime was 584.4 wall seconds for 37.5 accepted simulated seconds. The full final checkpoint is retained for diagnosis without repeating warmup: `research/charge-frost-continuation-progress.json`.
- **Owner-layout startup:** conserved-state inspection identifies uniform cold phase allocation and homogeneous outlet transport as coupled uncertainties. The independent review conceptually accepted the bounded phase-allocation/valve-start comparison proposed in `research/owner-startup-diagnosis.md`; it has not been run or accepted as a remedy.

## Required before charge release

- Complete natural charged frost validation and satisfactory browser throughput for the reviewed nozzle implementation; its focused convergence/failure/rollback checks already passed.
- Sustained useful three-head heating without generic liquid-carryover protection dominating startup.
- Complete natural charged frosting → latent melting → drainage → useful heating return, including timestep refinement.
- Fresh-source cooling and browser throughput validation.

The public charge gate remains closed. The Reference model has no charge response; its prior frost validation does not certify the experimental inventory model.

## Later

Validated additional refrigerants/equipment, saved scenarios/export, French, optional outdoor sound, mixed water systems, heat-recovery VRF and branding. The owner will trigger the proposed Opus review.

## Maintenance

Commit completed, verified milestones locally. Update this file and relevant README sections when behavior, validation or open gates change; keep agent instructions for working rules rather than a task log.
