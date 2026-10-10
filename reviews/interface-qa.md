# Interface milestone QA

Reviewed on 2026-10-10. This record covers interface behavior and static hosting. The subsequent live worker and scientific validation have separate records. Sonnet 5.5 authored the interface; the coordinator ran build/render/browser checks; a separate GPT-6.1 Sol agent reviewed scientific presentation.

## Build and browser checks

`npm run build` runs strict TypeScript checking and produces a static Vite build. The browser runner uses an isolated local Chromium profile over loopback CDP, separate from the owner's normal browser. No browser settings, client configuration or authenticated external services were changed.

The revised zoned interface production build passed and all **16 Examples/browser checks passed**. Four rendered evidence views were recaptured after the corner-readout and header corrections; five-room rendering was also inspected at 1440×900. The previous workspace layout validation passed. Live is now the default and starts the worker with the pinned local CoolProp JS/WASM backend. Selecting Examples pauses physical advancement without relabelling its fixtures as real calculations.

The reproducible runner is [`tools/check-workbench.mjs`](../tools/check-workbench.mjs). Recorded results are [`interface-browser-results.json`](interface-browser-results.json). Checks cover:

- Native vector illustration with no image/canvas elements or JavaScript exceptions.
- All header controls and sidebar tabs fit at 1440 and 1600 px desktop widths.
- Outdoor temperature and humidity stay visible on every tab, including with the bottom drawer open, at 1440×900 and 1600×1000.
- Outdoor/indoor/room zones replace all decorative building architecture; selecting a room opens its editable controls directly.
- Heating/cooling reversing-valve paths, small-line phase, absolute/gauge pressure conversion, and mode-specific COP boundaries.
- Input focus continuity and clear separation of configuration from unchanged snapshot readings.
- Three-port owner constraint, five complete room branches, conserved illustrative branch totals, and stale-selection removal.
- Editable line lengths/diameters, provenance and qualified family minimum/maximum guidance.
- Distinct gas/liquid service stops versus branch EEVs.
- Defrost COP and stopped-fan outlet omissions, preview ice→liquid conservation/exhaustion, persistence across idle/cooling, and explicit reset.
- Idle unavailable pressures/outlet readings, scenario drawer actions and wrapping keyboard tabs.
- Frost caution remains single across repeated state notifications.
- Actual production assets load beneath `/heatpump-simulator/`, with no failed runtime requests.

The QA harness resolves the exact dev-server module URL used by the application, including Vite's update timestamp. Importing an unversioned state module during dev-server updates creates a separate module instance and would inspect the wrong store. This concern belongs to QA tooling; production builds have one bundled store.

The additional [`tools/check-room-controls.mjs`](../tools/check-room-controls.mjs) passed **four focused browser checks** recorded in [`room-controls-browser-results.json`](room-controls-browser-results.json): native keyboard setpoint editing with stable focus/weather, actual engine-configuration cleanliness inheritance/overrides, vector fouling at 10/100% endpoints without changing Examples readings, and internally fitting one/three/five room panels at 1440×900 and 1600×1000. The tests check product interactions and source boundaries; they do not establish calibrated obstruction physics.

Long worker checks run against an immutable temporary source snapshot with a separate Vite instance and HMR disabled. This prevents concurrent source changes from resetting a numerical scenario. Snapshots are deleted when the harness exits; production hosting checks use the real static build.

The actual worker/browser natural-frost check passed without seeded ice or shortened trigger timers. At outdoor 3°C/85% RH and room targets 23°C, it observed defrost at the 305 s sample and resumed heating at 355 s. Room/outdoor corner values matched engine outputs throughout, energy/water residuals remained below 1e−4 J/1e−10 kg, and rejecting then correcting an outdoor input preserved time and visible held ice. See [`live-frost-browser-results.json`](live-frost-browser-results.json) and [`tools/check-live-frost.mjs`](../tools/check-live-frost.mjs).

The earlier failed trajectory is preserved as [`live-frost-browser-historical-failure.json`](live-frost-browser-historical-failure.json), dated 10:57 UTC. It documents the former selected 30°C evaporating-temperature limit (EN-08); it is superseded by the later successful natural trajectory rather than erased.

The two actual advanced-pipe interaction checks passed: selecting finite lines mapped declared lengths/assumed bore into the worker and produced nonzero Darcy friction, editing a length reached the physics, and returning to idealized lines removed that friction without resetting room storage or scenario time. See [`live-pipes-browser-results.json`](live-pipes-browser-results.json). This proves integration for that bounded scenario, not empirical installed-pipe accuracy.

The final safe-backend [`tools/check-live-engine.mjs`](../tools/check-live-engine.mjs) passed **seven integration checks** recorded in [`live-browser-results.json`](live-browser-results.json): real worker/EOS data, weather and room input/focus behavior, mode reversal preserving weather, retained-history five-room addition with actual per-branch refrigerant states, rejection/recovery suppressing stale pressures/COP/outlets, source separation, and production worker/WASM under a GitHub Pages project path. Long QA advances use bounded five-second requests rather than one CPU-heavy sixty-second batch, preserving the same simulated scenario horizon.

After the guarded numerical suite passed and independent review accepted the bounded prototype, [`tools/check-live-entry.mjs`](../tools/check-live-entry.mjs) verified the actual production entry point opens in Live without selecting it, advances the real worker clock, retains idealized piping by default, and loads all assets beneath `/heatpump-simulator/` without failed requests or JavaScript exceptions. Results: [`live-entry-browser-results.json`](live-entry-browser-results.json). The 16 Examples and four room/cleanliness checks were repeated after this default change. Strict TypeScript and production build passed.

## Rendered evidence

[`tools/capture-workbench.mjs`](../tools/capture-workbench.mjs) captures these review views with reduced-motion rendering. Screenshots are evidence only; none is imported or shipped as artwork.

- [Overview](../design/interface-preview.png)
- [Default Live entry](../design/interface-live.png)
- [Outdoor circuit close-up](../design/interface-outdoor.png)
- [Frost preview](../design/interface-frost.png)
- [Five-room configuration](../design/interface-five-rooms.png)
- [Actual live frost](../design/interface-live-frost.png)
- [Vector exchanger fouling](../design/interface-cleanliness.png)

## Practical limits and next review (historical sidebar milestone)

The owner accepted the visual direction with a request for clear zones and readily accessible common controls; that revision is verified above. It provides three zoom presets; free pan/zoom is not implemented. Overview labels are intentionally small, with detailed readings available in the inspector and outdoor close-up. Generic rooms four/five are schematic additions. Casings share a physical scale; room zones, expanded internals and drawn pipe routes are schematic. Outdoor/indoor titles have a reserved header row so the status overlay does not cover them; fresh screenshot inspection confirmed this in the overview.

Each room now has a direct setpoint range and number field beside measured air temperature, requested temperature and supply/power readouts. Outdoor ambient, RH, fan outlet and ice appear in a corner panel. Common weather sliders remain pinned. The Equipment tab offers global cleanliness and an outdoor override; Rooms offers indoor overrides. The outdoor exchanger inspector opens Equipment in one click. Advanced generic UA/airflow/compressor assumptions are separate from manufacturer casing labels.

The stage reserves a compact two-row status/view header and a bottom legend. Neither covers equipment or room panels. Five-room frosting headers remain below 150 px in the checked desktop sizes. Held last-accepted ice/liquid remains visible while a live input is pending or rejected, with a held label. Compatible weather/target edits now retain explicitly labelled completed cycle readings; rejected inputs and incompatible pending edits withhold them. Room history charts, broader manufacturer products and other fluids remain later work. Scientific fixture consistency does not establish manufacturer performance; actual numerical acceptance is tracked in [the engine review](engine-science-review.md).

## Direct controls and pipe encoding refinement

The outdoor-zone card now offers native temperature and humidity range/number controls, synchronized with the pinned sidebar. Each room has a direct On/Off switch beside its target, mirrored in Rooms. Casing rulers, H×W×D rows and the scale bar are removed. Temperature fills each tube interior; independent monochrome phase marks distinguish vapor, liquid and two-phase fluid. Unknown temperatures remain neutral/hatch-marked rather than interpolated.

[`tools/check-runtime-controls.mjs`](../tools/check-runtime-controls.mjs) passed six controlled-response checks for compatible held snapshots, passive acknowledgements, paused time, slider coalescing, one worker request in flight, hard invalidation and error/fault clearing. These checks exercise scheduling and freshness, not thermodynamic accuracy. Results: [`runtime-control-results.json`](runtime-control-results.json).

[`tools/check-control-refinement.mjs`](../tools/check-control-refinement.mjs) passed seven checks for actual worker weather input, stable layout/focus/readings across continuous target edits, individual/all-Off branches and fans, independent temperature/phase rendering, visible faults with closed diagnostics, removed annotations and one/three/five-room controls at 1440×900 and 1600×1000. Results and rendered evidence: [`control-refinement-browser-results.json`](control-refinement-browser-results.json), [`interface-controls.png`](../design/interface-controls.png). The outdoor card's label/value rows were separated after visual inspection found cramped text; its units remain on one line.

The separate [control science review](control-refinement-science-review.md) covers conservative stop/re-enable behavior, including ongoing defrost and compressor minimum-off timing. The focused actual-EOS regressions supplement the prior numerical acceptance; the long full numerical suite was not repeated for this control change.

## Simplified header and static fan drawings

The owner rejected the stacked toolbars and unrealistic rotating fans. Sonnet 5.5 replaced them with a single 72 px light header combining mode/playback, speed dropdown, real time, three headline measurements and status. A Readings button opens all nine former ribbon measurements, model/fault/warning detail and native Source/Example scenario selectors. The scene uses one compact view/inventory row; detailed fixture differences remain one click away. The earlier sections describe previous milestones where their layout differs from this final refinement.

The outdoor drawing is a static grille; indoor heads have horizontal outlet slats. No mechanical fan nodes rotate. Per-unit forced airflow, outlet availability and Off dimming remain tied to actual fan outputs. This avoids implying an uncomputed RPM or blade motion.

[`tools/check-simplified-chrome.mjs`](../tools/check-simplified-chrome.mjs) passed three checks covering both sources at 1440×900 and 1600×1000: no extra ribbon row, all primary controls within the one header, full readings/source/scenarios in one disclosure, Escape close with restored focus, null defrost COP, cooling-disabled frost scenarios, compact speed options and no fan rotation. Results: [`simplified-chrome-browser-results.json`](simplified-chrome-browser-results.json). The seven control, four room and sixteen Examples/static-hosting checks were repeated after this refinement. Fixtures and DOM helper selection were adapted to native dropdowns rather than the former segmented buttons.

Branding, publication and the owner-triggered Opus review have not started.

Requested speed is a scheduling target. The main thread submits fixed 0.25 simulated-second chunks with one request in flight; the clock advances only on completed physical steps. Safe real-EOS calls are CPU-limited, especially with physical lines, so these controls do not guarantee real-time or 10× throughput. The backend performance follow-up is recorded in [`coolprop-fast-browser-options.md`](../research/coolprop-fast-browser-options.md).

## Spatial controls and refrigerant instrumentation checkpoint — 2026-10-10

The current workbench has no sidebar or permanently mounted inspector/footer. Environmental weather and room measured-air/volume/heat-loss controls are unboxed; equipment mode, target, On/Off and readings are equipment-local. Common inlet/outlet refrigerant probes remain on the diagram, with independent temperature colours, phase marks and full-precision data attributes. The owner group has three ports; Generic exposes declared capacity with Add/Remove controls and scrolling beyond five rooms. Restart retains configuration. Requested speed includes50×; achieved time remains worker-limited.

Current focused checks: runtime scheduling **7/7**, actual-worker scenario controls **4/4**, actual-worker sensor/control provenance **4/4**, desktop chrome **3/3**, actual-EOS capacity **3/3** (also independently repeated). Build and strict TypeScript passed. Sensor checks compare every heating coil/compressor endpoint against genuine engine output, retain values/focus during target edits, and withhold closed-branch probes. Scenario checks cover Off/on thermal/time continuity, six real branches, room/line identity through removal and edited-input restart. The previous long numerical suite was not repeated for this UI/configuration checkpoint.

The earlier browser harnesses/results involving sidebar tabs are historical until adapted; their prior pass is not a claim that those selectors work in the current interface. A final Sonnet pass is underway for permanent branch-length sliders, larger probe text, label fit and a clipped outdoor coil note. Charge/leak physics has entered a separate conservative-model pilot and is not implemented at this checkpoint. PNG review captures are not application assets.
