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

The production output is `dist/`, with relative asset URLs suitable for a GitHub Pages project subdirectory. No backend, external runtime assets or API access is needed. Deployment is a later milestone.

## Current interface

Sonnet 5.5 authored the desktop workbench through local Claude Code. All application illustrations are native SVG/CSS: simple outdoor/indoor/room zones, equipment, pipes, gauges, frost and meltwater. Outdoor temperature and humidity stay available on every sidebar tab; selecting a room opens its inputs directly. PNG screenshots under `design/` are review evidence and are not shipped in the application.

The workbench provides live heating/cooling, automatic visible frost/defrost, 1–5 rooms, room volume/heat-loss controls, direct room setpoint sliders beside sensor and supply readings, compressor efficiency, pipe lengths/diameters, pressure conventions, selectable components, view presets, pause/reset and requested speed controls. A global exchanger-cleanliness slider runs from 100% clean to 10% remaining clear passage, with outdoor and individual indoor overrides. Choosing a fourth or fifth room switches the three-port owner preset to a generic outdoor group.

In Examples, readings come from explicitly constructed R32 fixtures. Changing configuration does not recalculate heat, COP, pressures or outlet temperatures. Only the illustrative preview clock and ice→retained-liquid ledger advance.

Live uses the pinned self-hosted CoolProp HEOS/psychrometric backend, a quasi-steady shared-pressure cycle, per-branch phase-aware heat transfer, dynamic room air/fabric/metal states and conserved outdoor ice/water enthalpy. Instantaneous useful-room COP includes storage effects and starts low while coil metals warm. Natural frost, latent melting, draining and return to heating have passed independent numerical and actual-worker browser checks. The guarded 21-test suite passed, together with the separately added backend-failure regression; the independent review accepts the exercised generic prototype with explicit limits.

This is a generic, uncalibrated R32 reduced-order model. Manufacturer labels/casing dimensions do not establish manufacturer performance or exact installed topology. Generic coil/compressor/control and fouling assumptions are explicit; exact finned exchanger areas remain unknown. Other refrigerants require separate validation. Ice sublimation and indoor icing are outside current coverage, and unsupported operating points stop with an explicit fault while retaining stored inventories.

Idealized field lines are the default: length, diameter, pressure loss and ambient line heat are excluded there. **Physical (advanced)** enables bounded distributed homogeneous-equilibrium pipe calculations with assumed wall thickness and outdoor exposure. These are sensitivity estimates; two-phase losses, fittings, slip, oil and actual routing are not calibrated installation predictions.

Requested speed is limited by actual solver throughput. The worker keeps calculations off the interface thread and submits small chunks; displayed simulation time advances only after completed steps. Current safe real-EOS calculations can run slower than real time, especially with physical piping. Performance measurements and supported faster-backend options are documented below. Numerical tests exercise thousands of actual flashes and can take tens of minutes.

## Project decisions and research

- [Owner decisions and milestone scope](project-brief.md)
- [Science reference](heatpump-science-reference.md)
- [Thermodynamic model specification](model-specification.md)
- [Source register](research/primary-source-register.md)
- [Owner installation evidence](research/owner-installation.md)
- [Model validation plan](research/model-validation-plan.md)
- [Observed browser property-backend feasibility](research/coolprop-browser-feasibility.md)
- [Implemented equations, assumptions and performance](research/engine-implementation.md)
- [Safe/fast property-backend follow-up](research/coolprop-fast-browser-options.md)
- [Interface design notes](design/interface-design.md)
- [Interface browser QA](reviews/interface-qa.md)
- [Independent science-compliance review](reviews/science-compliance-review.md)
- [Independent numerical engine review](reviews/engine-science-review.md)

Heating, cooling, individual room thermal behaviour, and visible frost/defrost are core requirements. The owner preset is Daikin 3MXM52N8 with FTXA25, FTXA35, and FTXA25 indoor units. Exact indoor suffixes and unverified installation details remain unknown. Broader equipment/refrigerant coverage requires property and performance validation.

Charge/leaks, oil, saving/export, French, mixed water systems, heat-recovery VRF, and branding are deferred. An Opus 5.5 review is reserved for the owner to trigger separately.

The numerical implementation is in `src/engine/`, its worker/runtime bridge in `src/runtime/`, and real-backend checks run with `npm run test:engine`. The project has its own local Git repository with verified milestone commits; no remote or publication is configured.
