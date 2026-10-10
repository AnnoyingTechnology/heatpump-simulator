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

## In progress

- **Simulation speed:** a fresh browser measurement found ×1, ×5 and ×50 all advancing about 0.65 simulated seconds per wall second on the owner preset. The fixed-quarter-second scheduler and real-EOS calculation throughput are being investigated. The clock is actual completed physical time; faster settings are currently ineffective on this workload.
- **Experimental charge physics:** remove a noisy isentropic nozzle enthalpy subtraction using a bounded real-EOS integral. Independent numerical review is ongoing; conservation limits and physical inventories remain unchanged.

## Required before charge release

- Reviewed production nozzle implementation with meaningful convergence, failure and rollback checks.
- Sustained useful three-head heating without generic liquid-carryover protection dominating startup.
- Complete natural charged frosting → latent melting → drainage → useful heating return, including timestep refinement.
- Fresh-source cooling and browser throughput validation.

The public charge gate remains closed. The Reference model has no charge response; its prior frost validation does not certify the experimental inventory model.

## Later

Validated additional refrigerants/equipment, saved scenarios/export, French, optional outdoor sound, mixed water systems, heat-recovery VRF and branding. The owner will trigger the proposed Opus review.

## Maintenance

Commit completed, verified milestones locally. Update this file and relevant README sections when behavior, validation or open gates change; keep agent instructions for working rules rather than a task log.
