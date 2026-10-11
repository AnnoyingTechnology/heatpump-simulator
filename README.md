# Heatpump Simulator 2026

A desktop, frontend-only heat-pump sandbox with a real R32 thermodynamic engine, independent science research and a vector workbench. It opens in Live; Examples provides separate illustrative snapshots.

## Run locally

Requires a Node version supported by the pinned Vite dependency (currently Node 20.19+ or 22.12+).

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. To check and build the static site:

```sh
npm run build
npm run preview
```

The production output is `dist/`, with relative asset URLs suitable for a GitHub Pages project subdirectory. No backend, external runtime assets or API access is needed.

## GitHub Pages

Repository: https://github.com/AnnoyingTechnology/heatpump-simulator

Site: https://annoyingtechnology.github.io/heatpump-simulator/

`.github/workflows/pages.yml` installs locked dependencies, checks types, builds and verifies the released Reference model with the guarded property backend, then publishes `dist/`. Pushes to `main` deploy automatically; the workflow also supports manual runs. GitHub Pages uses the GitHub Actions publishing source. The existing relative asset base keeps the worker and self-hosted WASM inside the project URL.

The first deployment passed 35 checks on GitHub and four hosted checks. The expanded stability release passed all **45 checks**, followed by four hosted checks and **600.7 simulated seconds at requested 5×** with the attic off, outdoor −0.5°C, ground target 17.5°C and upstairs target 22.5°C. The owner test uses 35% RH; the original failure's humidity remains unknown. Inverter protection, unequal-temperature indoor condensers and conservative outdoor fog retain the original physical limits. Stability evidence is in `reviews/github-pages-stability-deployment.json`. The subsequent zoom/thermostat/trend release passed **47 Reference/property checks and 2 history checks** on GitHub, followed by **5 hosted-browser checks**, including scales after zoom and borderless metric plots. Its matching deployed artifacts and successful run `38115146723` are recorded in `reviews/github-pages-zoom-deployment.json`.

The current inverter/theme/loss-scale release (`0e7bc15`) passed **52 Reference/property checks and 2 history checks** on GitHub, followed by **6 hosted-browser checks**. Every room permanently shows all eight supplied insulation-era ranges below its loss slider. Scripts, styles and WASM match the verified build; the deployment receipt is `reviews/github-pages-interface-deployment.json`.

The hosted application, worker and WASM match the verified build. Paused weather and individual-unit edits preserve the clock. Recheck with `node tools/check-hosted-pages.mjs` and `node tools/check-hosted-stability.mjs`, using the project's isolated QA Chromium. The first deployment evidence remains in `reviews/github-pages-deployment.json`; current browser checks are in `reviews/github-pages-browser-results.json`.

## Current interface

Sonnet 5.5 authored the desktop workbench through local Claude Code. All application illustrations are native SVG/CSS: simple outdoor/indoor/room zones, equipment, pipes, gauges, frost and meltwater. Outdoor temperature/humidity and room air/volume/heat loss live unboxed in their environment zones. Indoor target, On/Off, supplied-air temperature and net room kW live beside each indoor unit; model, mode, efficiency and cleanliness live beside the outdoor unit. Advanced assumptions open in local popovers. PNG screenshots under `design/` are review evidence and are not shipped in the application.

The workbench provides live heating/cooling, automatic visible frost/defrost, capacity-driven Add/Remove room controls, pipe lengths/diameters, pressure conventions, selectable components, click-to-zoom zones, pause/restart and requested speeds up to 50×. The owner group has three connections; Generic exposes an explicitly assumed port capacity. Larger layouts use vertical scrolling to preserve full-width inlet/outlet streams and readable controls. A global exchanger-cleanliness slider runs from 100% clean to 10% remaining clear passage, with outdoor and individual indoor overrides. Restart applies current initial room temperatures and retains edited configuration.

Zoom and tall-room scrolling stay inside the available workbench height; the temperature/phase legend stays at the viewport bottom. Pressure readings also remain visible in overview. The three headline readings use full-height separators and SVG plots of the last two hours of **simulated time**, retaining the latest accepted reading in each ten-second bin. Plots start empty, show gaps for unavailable values and mode changes, remain unchanged while paused, and clear on Reset. Examples do not fabricate historical readings. Plot scales are automatic, include zero and are stated in the plot tooltip.

Each graph sits to the right of its value, with the small label beneath the value. Compact outdoor controls reclaim enough height for the default three-room overview to fit without scrolling at 1280×720 and larger. A vector theme chooser beside the brand offers System (default), Light and Dark. System follows operating-system changes; explicit choices persist locally. Theme changes preserve physical state and the fixed refrigerant/air colour scales; denied storage still allows a page-local override.

The default Reference inverter estimates room heat demand from sensible envelope, ventilation and fabric exchange, then applies proportionate temperature feedback with a bounded slow integral. It modulates through target crossing when the minimum capacity fits the load. Loads below minimum output can cycle with a comfort margin, dwell and protection. Branch valves use positive room demand as relative flow weights; actual refrigerant equations still determine delivered heat. Explicit indoor Off remains immediate. This is a generic controller, not a fitted Daikin algorithm or electrical-power map.

Future conventional equipment can select the separate fixed-speed `on-off` strategy. Its thermostat stops at target and restarts 1°C below/above it in heating/cooling, with the existing `thermostatDeadbandK` margin, minimum-on/off times and protection. At fixed motor speed, capacity and electricity still vary with physical conditions.

A single header groups Pause, Reset and operating status together. Bold inline COP and electrical/useful-output power retain small labels below, with vector plug and sun/snowflake symbols. Measurements and common controls live on the diagram; source selection and unique model diagnostics live in the outdoor unit settings. Speed uses a compact dropdown. Click the outdoor or indoor zone, or a room, to zoom; use Zoom out or Escape to return. Outdoor fans use a static grille and indoor heads show a horizontal outlet with slats. Indoor coils span almost the full casing width with a 5% right-side margin. Room-air temperature sits in the inlet streams; supply temperature and net heating/cooling power sit in the outlet streams, directly on the background. Vector airflow exits the outdoor unit to the left and indoor units downwards, with plain outdoor inlet/exhaust-air temperatures and refrigerant coil heat beside the leftward exhaust. Flow lines leave gaps around the values. Room volume is calculated from floor area and ceiling height (2.2–6 m); the envelope-loss help retains the supplied era bands with their unknown reference size clearly identified. Airflow cues follow actual fan operation; mechanical blade rotation is omitted.

Every envelope-loss slider has a permanent 0–1000 W/K ruler and all eight supplied Pre-1974 through RE2020 reference bands directly below it. Overlapping ranges share a neutral reference track, with exact names and numbers in a compact key. These are building examples of unspecified reference size, not statutory room defaults; no standard is applied or scaled automatically. The full explanation remains beside the slider.

In Examples, readings come from explicitly constructed R32 fixtures. Changing configuration does not recalculate heat, COP, pressures or outlet temperatures. Only the illustrative preview clock and ice→retained-liquid ledger advance.

Dragging weather/room-target controls or requesting indoor On/Off keeps the last completed physical readings visible, explicitly labelled until the next simulation step. Paused edits wait for Resume without advancing simulation time. Mode and structural changes withhold incompatible readings. Pipe interiors encode temperature across their width; separate monochrome marks show vapor, liquid or two-phase fluid. Materialized refrigerant probes display actual inlet/outlet temperatures on exchangers and compressor suction/discharge, including truthful zero temperature change during evaporation. The permanent refrigerant legend spans −40…145°C; air fills use a separate −30…50°C scale. Casing dimension annotations are omitted while equipment proportions remain consistent.

A calculation fault displays its reason directly and retains accepted room temperatures, time and outdoor ice/water. Operating heat, COP, pressure and airflow readings are withheld. Changing inputs can recover from the retained physical state; Reset is an explicit restart.

Live uses the pinned self-hosted CoolProp HEOS/psychrometric backend, a quasi-steady shared-pressure cycle, per-branch phase-aware heat transfer, dynamic room air/fabric/metal states and conserved outdoor ice/water enthalpy. Instantaneous useful-room COP includes storage effects and starts low while coil metals warm. Natural frost, latent melting, draining and return to heating have passed independent numerical and actual-worker browser checks. The guarded 21-test suite passed, together with the separately added backend-failure regression; the independent review accepts the exercised generic prototype with explicit limits.

The generic inverter starts at minimum speed, ramps and reduces speed before compressor temperature/pressure limits; protection holds and restart waits are displayed without resetting thermal state. With idealized lines, parallel indoor heating coils have separate finite-UA outlet states and a shared mixed-header target, so a cold unit can start beside a hot one. Refrigerant allocation follows relative room demand during ordinary inverter operation, with declared UA fallback for retained paths; defrost and fixed-speed use UA allocation. Physical field-line heating retains the earlier individual-subcooling closure and can reject unequal warm/cold branch conditions; it remains an advanced bounded option.

This is a generic, uncalibrated R32 reduced-order model. Manufacturer labels/casing dimensions do not establish manufacturer performance or exact installed topology. Generic coil/compressor/control and fouling assumptions are explicit; exact finned exchanger areas remain unknown. Other refrigerants require separate validation. Outdoor exhaust can carry fog with conserved total heat/water, including fan heat and ice/liquid phase change. Ice sublimation, indoor icing and room/indoor fog are outside current coverage; unsupported operating points stop with an explicit fault while retaining stored inventories.

Each branch has a permanent length number/slider between the outdoor group and wall. The corridor also provides the field-line model switch; bore and insulation assumptions stay one click away. Idealized field lines are the current default: length, diameter, pressure loss and ambient line heat are excluded there. **Physical (advanced)** enables bounded distributed homogeneous-equilibrium pipe calculations with assumed wall thickness and outdoor exposure. These are sensitivity estimates; two-phase losses, fittings, slip, oil and actual routing are not calibrated installation predictions. The upcoming inventory model retains physical line volume even when transport losses are idealized.

Requested speed is limited by actual solver throughput. The worker keeps calculations off the interface thread and batches one to four unchanged quarter-second physical steps, retaining at most one second of requested work. The clock advances only after completed steps, and the reading below the speed selector shows the achieved rate. Exchanger outlets use exact pure-fluid latent inversion and a bounded sensible-zone solve; pressure continuation reuses a numerical slope only while fresh EOS residuals satisfy the original closure limits. The guarded native backend reuses exact HEOS states without duplicate property flashes. Earlier guarded-backend browser checks, before the inverter/fog stability changes, measured about 1× and 2× at those settings, about 13× for active owner-preset heating requested at 50×, and about 47–49× with all units off. These are workload-dependent observations, not a guaranteed maximum. Physical piping and the experimental inventory model can be much slower. Numerical tests exercise thousands of actual flashes and can take tens of minutes.

## Project decisions and research

- [Current progress and open validation gates](PROGRESS.md)
- [Speed optimization regression and measured throughput](reviews/reference-speed-regression-results.json)
- [Guarded backend acceptance and measured throughput](reviews/guarded-backend-verification-results.json)
- [Independent guarded backend review](reviews/guarded-backend-science-review.md)
- [Owner decisions and milestone scope](project-brief.md)
- [Science reference](heatpump-science-reference.md)
- [Thermodynamic model specification](model-specification.md)
- [Source register](research/primary-source-register.md)
- [Owner installation evidence](research/owner-installation.md)
- [Exact Daikin 3MXM52N8 manufacturer specifications](research/daikin-3mxm52n8-specifications.md)
- [Generic inverter comfort controller](research/inverter-control.md)
- [Model validation plan](research/model-validation-plan.md)
- [Observed browser property-backend feasibility](research/coolprop-browser-feasibility.md)
- [Implemented equations, assumptions and performance](research/engine-implementation.md)
- [Safe/fast property-backend follow-up](research/coolprop-fast-browser-options.md)
- [Guarded exact-backend build plan](research/safe-coolprop-build-plan.md)
- [Charge and leak sources](research/refrigerant-charge-source-register.md)
- [Conserved refrigerant model design](research/refrigerant-charge-model-design.md)
- [Independent charge-model review](reviews/charge-model-science-review.md)
- [Charged frost validation](reviews/charged-frost-validation.md)
- [Owner startup diagnosis and unexecuted comparison proposal](research/owner-startup-diagnosis.md)
- [Interface design notes](design/interface-design.md)
- [Interface browser QA](reviews/interface-qa.md)
- [Independent science-compliance review](reviews/science-compliance-review.md)
- [Independent numerical engine review](reviews/engine-science-review.md)
- [Control refinement and Off scientific review](reviews/control-refinement-science-review.md)

Heating, cooling, individual room thermal behaviour, and visible frost/defrost are core requirements. The owner preset is Daikin 3MXM52N8 with FTXA25, FTXA35, and FTXA25 indoor units. Exact indoor suffixes and unverified installation details remain unknown. Broader equipment/refrigerant coverage requires property and performance validation.

Daikin and Mitsubishi Electric consumer-range imports are assigned to the owner's Qwen3.8-Flash-Next through OpenCode, with exact manufacturer references and independently validated performance/refrigerant data. The source contract and candidate schema are under `research/catalogue/`. Future catalogue entries can use separate inverter and conventional fixed-speed controller strategies. The exact N8 specification note records Julien's observed steady 130 W at low temperature difference and confirmed 2350 W upper value separately from Daikin's published combination-table ratings. Those table minima are not universal operating floors; no compressor RPS map is inferred from them.

The conserved R32 circuit now stores actual refrigerant mass and internal energy in coils, physical line volumes and a generic accumulator. Initial charge and geometry define a new scenario at Restart. Compare reduced-charge scenarios to explore conditions after refrigerant loss; ongoing leaks are outside the product scope. Physical coil-end sensors remain meaningful during idle operation, redistribution and reversal. Generic liquid-carryover protection can stop the compressor while passive heat exchange continues; the workbench reports that hold explicitly and suppresses COP.

This inventory implementation remains behind a validation gate. Its latest frozen-checkpoint continuation resolved the earlier 11 s failure and reached 48.5 s with natural ice, then hit the unchanged numerical work limit before accepted reversal or thaw. Complete charged frost/defrost and sustained three-head heating remain open. The public default is still the separately validated quasi-steady Reference model, which has no refrigerant inventory or charge response. Inventory line volumes are physical but transport is currently idealized and adiabatic; the Reference model's advanced physical piping remains separately available. Internal volumes, passage geometry, homogeneous two-phase closure and controller assumptions are generic rather than inferred OEM internals. Oil, saving/export, French, mixed water systems, heat-recovery VRF and branding remain later work. An Opus 5.5 review is reserved for the owner to trigger separately.

The numerical implementation is in `src/engine/`, its worker/runtime bridge in `src/runtime/`, and real-backend checks run with `npm run test:engine`. The project has its own Git repository with verified milestone commits. `origin` points to the owner's GitHub repository above; the Pages workflow verifies the released model before publication. Experimental charge acceptance remains separate.

The public worker selects the independently reviewed guarded exact-HEOS artifact built with `tools/coolprop-safe/`. Engine tests retain the original backend by default for comparison; `HEATPUMP_TEST_BACKEND=guarded` exercises the same assertions against the production artifact after compiling the engine. For example: `HEATPUMP_TEST_BACKEND=guarded node --test tests/engine/properties.test.mjs`. This test selection does not open the charge gate. Reproduction and native failure/recovery checks are documented in `tools/coolprop-safe/README.md`.
