# Heatpump Simulator 2026

Active new project, commissioned 2026-10-10. This document records owner decisions, not measured system facts.

## Current milestone

Independent science research, the large vector workbench and the first generic live R32 engine are complete. The owner-requested clean zones, direct room setpoints, corner readings, pinned weather and cleanliness overrides are implemented. The guarded numerical suite passed 21/21 plus a separately added backend-failure case, complemented by independent scientific checks and actual-worker browser evidence. Live is the default; illustrative Examples remain separate. Physical field lines are a bounded advanced sensitivity option; idealized lines remain the default. Broader domain/empirical validation and a supported faster property backend remain follow-up work. Publication, branding and the owner-triggered Opus review have not started.

## Product

A heat-pump sandbox, neither a game nor a research instrument. Aim for the strongest physically consistent model practical in maintainable browser code, without FEA or GPU requirements. English first; French later. Static frontend compatible with GitHub Pages, with no backend or runtime API dependency.

Desktop/laptop only; intended for screens of at least 16 inches. Following owner review, use clean, clearly labelled **outdoor / indoor / individual room zones**, with no detailed building, roof, furniture, windows or masonry artwork. Preserve properly connected refrigerant paths and physically proportioned equipment; tubing routing may be schematic and its drawn length need not equal physical length. Keep diagram geometry and physical parameters distinct. **All simulator/front illustrations must be pure vector**, as explicitly confirmed by Julien on 2026-10-10. Use native SVG and CSS for equipment, zones, tubing, valves, instruments, weather and frost. No raster textures/photos/generated bitmap artwork in the interface. Research-source images and QA screenshots are evidence, not interface assets.

Outdoor temperature and humidity must remain permanently available while navigating configuration. Other frequent controls (mode, time, room inputs, indoor-unit count and basic equipment choices) must be permanently visible or one click away. Place advanced engineering/display settings and detailed evidence behind secondary controls. This control hierarchy is an explicit owner decision from the first mockup review.

## Core scope

- Heating and cooling, one to five indoor units, each serving its own room.
- Room size and heat-loss controls, temperature and setpoint, sensible/latent considerations in the scientific design.
- Outdoor dry-bulb temperature and relative humidity. Frost accumulation and defrost are mandatory and must be visible.
- Global exchanger cleanliness from 100% clean to 10% remaining clear passage, with outdoor and individual indoor overrides. Model air-side transfer and airflow effects, keep dirt visible on vector coil artwork and separate from frost. This is a generic blockage sensitivity, not a measured manufacturer fouling curve.
- Readable corner values in room/outdoor zones: current simulated sensor values, requested room setpoint beside current temperature, supply/exhaust temperatures and useful output. Each room has a directly accessible setpoint slider in the diagram. Temperature-history charts are deferred.
- Pause/reset and simulation speed including 1×, 2×, 5×, 10×; slower-than-real-time is desirable.
- Selectable/configurable outdoor and indoor equipment, with visuals reflecting dimensions/capacity. Indoor sizes need not differ visibly merely because capacity differs.
- Tubing diameter and physical length, with per-branch settings and service/manometer locations.
- Visible reversing/control valves, compressor, heat exchangers, flow direction and refrigerant temperature/phase; the science research must establish the actual circuit rather than force an assumed three-way valve topology.
- Heat-exchanger surface displayed in m² with a clear definition (primary, finned/air-side, etc.) and source/estimate provenance.
- Instantaneous heat transfer and total electrical input in kW, correctly defined heating/cooling COP, pressures with an explicit gauge/absolute convention, outlet air temperatures at both sides.
- Editable compressor efficiency, with its thermodynamic meaning established by the science specification.
- Initial owner preset: Daikin 3MXM52N8 + FTXA25 + FTXA35 + FTXA25. Exact indoor suffixes and installation geometry remain unknown unless established by sources. Owner-provided source: https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html . Fetch scripted requests using a Firefox-like user agent; if rejected, use the authenticated Playwright browser rather than declaring the site unavailable.
- Research common domestic/small-business refrigerants used over approximately the past 30 years, plus R290 and R1234yf. Offer as simulated fluids only those with validated thermophysical data and suitable model coverage; distinguish pure fluids from blends and account for glide where relevant.

## Deferred

Charge adjustment, slow leaks, oil transport/return, saving/export/sharing, exhaustive current Daikin/Mitsubishi product catalogues, mixed domestic hot water, three-pipe heat recovery VRV/VRF, French, and branding. Document extension boundaries without building speculative subsystems. No mobile work.

## Research and review

GPT-6 Luna collects primary sources and equipment/refrigerant evidence. GPT-6.1 Sol develops the thermodynamics and root-level heatpump-science-reference.md, with an independently reviewed model specification. Sonnet 5.5 through the authenticated local Claude Code CLI owns visual/interface design. An independent science-compliance review checks the scientific documents and interface. No budgets imposed. Opus 5.5 review is owner-triggered only.

Treat observed facts, historical evidence, model assumptions and unknowns separately. Do not invent manufacturer internal controls or calibration maps. Use citations directly adjacent to scientific/manufacturer claims. Numerical mockup readings are demonstration values and must be marked consistently; they are not validated physical outputs.

## Workspace boundaries

All maintained project artifacts belong in this directory. Respect the parent AGENTS.md. Do not access directories named Intime. Do not change personal skills, global client configuration or memory stores. Do not create GitHub repositories, push, publish, or send messages during this milestone. Keep browser access read-only apart from opening the local preview. No external runtime assets or fonts are required.

The owner requested a local Git repository and regular commits on 2026-10-10. This project has its own local `main` repository; commit verified milestones and keep it separate from the parent agent workspace. No remote is configured.
