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
- Recent build, production entry, charge-control and zone-navigation browser checks passed. No publication or remote repository has been configured.
- Fixed ineffective speed pacing and reduced exchanger-solve overhead. A five-check browser run verified speed response, pause, quarter-second steps, desktop header fit and fast passive scenes. Requested 1×/2× achieved approximately 1×/2×; requested 50× reached 2.5× in active heating and 49× with all units off. The selector now shows achieved speed. Three focused real-EOS tests passed, including 144 outlet/pressure-perturbation comparisons, stale-slope recovery and identical batched/unbatched physical trajectories.
- Fresh optimized Reference regression: **25/25 passed**, covering heating/cooling, natural frost/defrost and heating return, storage/energy/water balances, timestep refinement, physical transport and connection capacity. Build, production entry and all ten zone-navigation checks also passed. Evidence: `reviews/reference-speed-regression-results.json`.
- Reviewed experimental nozzle correction committed as `d1aaa73`; fixed-state balance, phase-spanning, choking, one-ULP flow and failure/rollback checks passed without relaxing physical limits.

## In progress

- **Simulation speed:** the defect is fixed and regressions passed; high-speed active heating remains CPU-limited. Further acceleration requires validated backend or numerical improvements rather than changing the displayed clock or physical timestep.
- **Experimental charge physics:** a reviewed bounded real-EOS isentropic integral fixes the saved numerical rejection. An exact-checkpoint natural frost continuation is progressing; this is conditional validation, not completed physical acceptance. Sustained owner-layout startup remains under scientific investigation.

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
