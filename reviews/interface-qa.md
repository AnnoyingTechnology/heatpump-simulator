# Interface milestone QA

Reviewed on 2026-10-10. This record covers interface behavior and static hosting. The subsequent live worker and scientific validation have separate records. Sonnet 5.5 authored the interface; the coordinator ran build/render/browser checks; a separate GPT-6.1 Sol agent reviewed scientific presentation.

## Build and browser checks

`npm run build` runs strict TypeScript checking and produces a static Vite build. The browser runner uses an isolated local Chromium profile over loopback CDP, separate from the owner's normal browser. No browser settings, client configuration or authenticated external services were changed.

The revised zoned interface production build passed and all **16 Examples/browser checks passed**. Four rendered evidence views were recaptured after the corner-readout and header corrections; five-room rendering was also inspected at 1440×900. The previous workspace layout validation passed. The live worker loads the pinned local CoolProp JS/WASM backend; Examples does not start it unless the user has previously selected Live.

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

## Rendered evidence

[`tools/capture-workbench.mjs`](../tools/capture-workbench.mjs) captures these review views with reduced-motion rendering. Screenshots are evidence only; none is imported or shipped as artwork.

- [Overview](../design/interface-preview.png)
- [Outdoor circuit close-up](../design/interface-outdoor.png)
- [Frost preview](../design/interface-frost.png)
- [Five-room configuration](../design/interface-five-rooms.png)

## Practical limits and next review

The owner accepted the visual direction with a request for clear zones and readily accessible common controls; that revision is verified above. It provides three zoom presets; free pan/zoom is not implemented. Overview labels are intentionally small, with detailed readings available in the inspector and outdoor close-up. Generic rooms four/five are schematic additions. Casings share a physical scale; room zones, expanded internals and drawn pipe routes are schematic. Outdoor/indoor titles have a reserved header row so the status overlay does not cover them; fresh screenshot inspection confirmed this in the overview.

Each room now has a direct setpoint range and number field beside measured air temperature, requested temperature and supply/power readouts. Outdoor ambient, RH, fan outlet and ice appear in a corner panel. Common weather sliders remain pinned. The Equipment tab offers global cleanliness and an outdoor override; Rooms offers indoor overrides. The outdoor exchanger inspector opens Equipment in one click. Advanced generic UA/airflow/compressor assumptions are separate from manufacturer casing labels.

The stage reserves a compact two-row status/view header and a bottom legend. Neither covers equipment or room panels. Five-room frosting headers remain below 150 px in the checked desktop sizes. Held last-accepted ice/liquid remains visible while a live input is pending or rejected, with a held label; stale active cycle readings stay unavailable. Room history charts, broader manufacturer products and other fluids remain later work. Scientific fixture consistency does not establish manufacturer performance; actual numerical acceptance is tracked in [the engine review](engine-science-review.md).

Branding, publication and the owner-triggered Opus review have not started.
