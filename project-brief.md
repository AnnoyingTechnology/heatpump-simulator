# Heatpump Simulator 2026

Active new project, commissioned 2026-10-10. This document records owner decisions, not measured system facts.

## Current milestone

Updated 2026-10-11. Independent science research, the vector workbench, live Reference engine, French presentation and room-temperature charts are implemented. GitHub Pages publication is authorized and live; `PROGRESS.md` records exact release receipts and the active backlog. Seven Reference refrigerants pass local qualification; physical lines remain R32-only. Charge response is the active conserved-inventory milestone and stays gated until its scientific and throughput checks pass. Manufacturer metadata is source-reviewed but does not establish OEM performance maps or complete indoor/outdoor eligibility. Branding is deferred, and Opus review remains owner-triggered.

## Product

A heat-pump sandbox, neither a game nor a research instrument. Aim for the strongest physically consistent model practical in maintainable browser code, without FEA or GPU requirements. English is the default; French presentation is implemented. Static frontend compatible with GitHub Pages, with no backend or runtime API dependency.

Desktop/laptop only; intended for screens of at least 16 inches. Following owner review, use clean, clearly labelled **outdoor / indoor / individual room zones**, with no detailed building, roof, furniture, windows or masonry artwork. Preserve properly connected refrigerant paths and physically proportioned equipment; tubing routing may be schematic and its drawn length need not equal physical length. Keep diagram geometry and physical parameters distinct. **All simulator/front illustrations must be pure vector**, as explicitly confirmed by Julien on 2026-10-10. Use native SVG and CSS for equipment, zones, tubing, valves, instruments, weather and frost. No raster textures/photos/generated bitmap artwork in the interface. Research-source images and QA screenshots are evidence, not interface assets.

Outdoor temperature and humidity must remain permanently available while navigating configuration. Other frequent controls (mode, time, room inputs, indoor-unit count and basic equipment choices) must be permanently visible or one click away. Place advanced engineering/display settings and detailed evidence behind secondary controls. This control hierarchy is an explicit owner decision from the first mockup review.

## Core scope

- Heating and cooling, with indoor-unit count limited by the selected outdoor unit’s port capacity; each indoor unit serves its own room.
- Room size and heat-loss controls, temperature and setpoint, sensible/latent considerations in the scientific design.
- Outdoor dry-bulb temperature and relative humidity. Frost accumulation and defrost are mandatory and must be visible.
- Shared exchanger cleanliness from 100% clean to 10% remaining clear passage, default 95% and permanently bound across all coils. Model air-side transfer and airflow effects, keep dirt visible on vector coil artwork and separate from frost. This is a generic blockage sensitivity, not a measured manufacturer fouling curve.
- Readable corner values in room/outdoor zones: current simulated sensor values, requested room setpoint beside current temperature, supply/exhaust temperatures and useful output. Each room has a directly accessible setpoint slider in the diagram. Bounded two-hour room-temperature charts use accepted simulation time.
- Pause/reset and requested simulation speed including 1×, 2×, 5×, 10× and 50×; show achieved rate beside status and elapsed HH:MM:SS. Slower-than-real-time remains desirable.
- Selectable/configurable outdoor and indoor equipment, with consistent physical proportions and capacity labels. Do not annotate casing dimensions or draw rulers. Indoor sizes need not differ visibly merely because capacity differs.
- Tubing diameter and physical length, with per-branch settings and service/manometer locations.
- Visible reversing/control valves, compressor, heat exchangers, flow direction and refrigerant temperature/phase; the science research must establish the actual circuit rather than force an assumed three-way valve topology.
- Visible heat-exchanger surface in m² was removed from scope; physical conductance assumptions remain explicit.
- Instantaneous heat transfer and total electrical input in kW, correctly defined heating/cooling COP, pressures with an explicit gauge/absolute convention, outlet air temperatures at both sides.
- Editable compressor efficiency, with its thermodynamic meaning established by the science specification.
- Initial owner preset: Daikin 3MXM52N8 + FTXA25 + FTXA35 + FTXA25. Exact indoor suffixes and installation geometry remain unknown unless established by sources. Owner-provided source: https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html . Fetch scripted requests using a Firefox-like user agent; if rejected, use the authenticated Playwright browser rather than declaring the site unavailable.
- Research common domestic/small-business refrigerants used over approximately the past 30 years, plus R290 and R1234yf. Offer as simulated fluids only those with validated thermophysical data and suitable model coverage; distinguish pure fluids from blends and account for glide where relevant.

Charge adjustment is the active conserved-inventory milestone. Compare reduced-charge scenarios by changing the initial charge and restarting. The owner removed the ongoing leak feature on 2026-10-10.

Owner floor defaults: Ground (Level 0) 45.4 m² / 100 m³; Upstairs (Level 1) 54.5 m² / 155 m³; Attic (Level 2) 26 m² / 84 m³. Initial ceiling heights are derived from these exact area/volume pairs.

## Deferred

Oil transport/return, saving/export/sharing, mixed hydronic floor heating and domestic hot-water storage, three-pipe heat recovery VRV/VRF, and branding. Complete source-reviewed Daikin/Mitsubishi catalogue coverage remains active backlog, not an implemented full-range claim. Optional outdoor audio is also deferred: audio off by default, explicitly enabled by the user, with synthesized compressor sound responding to compressor load and fan sound responding to fan speed. Document extension boundaries without building speculative subsystems. No mobile work.

## Research and review

GPT-6 Luna collects primary sources and equipment/refrigerant evidence. GPT-6.1 Sol develops the thermodynamics and root-level heatpump-science-reference.md, with an independently reviewed model specification. Sonnet 5.5 through authenticated Claude Code provided the initial interface design; subsequent interface work is now owned by Codex at the owner’s request. An independent science-compliance review checks the scientific documents and interface. No budgets imposed. Opus 5.5 review is owner-triggered only.

Treat observed facts, historical evidence, model assumptions and unknowns separately. Do not invent manufacturer internal controls or calibration maps. Use citations directly adjacent to scientific/manufacturer claims. Numerical mockup readings are demonstration values and must be marked consistently; they are not validated physical outputs.

## Workspace boundaries

All maintained project artifacts belong in this directory. Respect the parent AGENTS.md. Do not access directories named Intime. Do not change personal skills, global client configuration or memory stores. The owner authorized creation of the GitHub repository, pushes of verified stable increments and GitHub Pages publication. Simulator browser interaction is authorized for verification. Sending messages to other people remains outside scope. No external runtime assets or fonts are required.

The owner requested a local Git repository and regular commits on 2026-10-10. This project has its own local `main` repository; commit verified milestones and keep it separate from the parent agent workspace. The authorized remote is `https://github.com/AnnoyingTechnology/heatpump-simulator.git`, and the published site is `https://annoyingtechnology.github.io/heatpump-simulator/`.

## Deferred mixed hydronic systems

Owner clarification 2026-10-11: future support should include rooms served by water-circulated floor heating and domestic hot-water tanks in mixed systems. Document this scope only; do not implement it during the current air-air pass. A later design must represent the water loop, circulation, emitters, controls and tank thermal storage, rather than treating them as air-air indoor heads.
