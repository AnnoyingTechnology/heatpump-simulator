# Heatpump Simulator 2026

A desktop, frontend-only heat-pump sandbox project. Independent science research and the first interface review are complete. A real R32 thermodynamic engine is now being implemented and independently reviewed; the default Examples experience retains explicit illustrative snapshots until the live release gates pass.

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

The workbench provides heating/cooling, normal/frost/defrost/idle snapshots, 1–5 rooms, environment and room inputs, compressor efficiency, pipe lengths/diameters, pressure conventions, selectable components, view presets, preview speed/pause, and a diagnostic/provenance drawer. Choosing a fourth or fifth room switches the three-port owner preset to a generic outdoor group.

In Examples, readings come from explicitly constructed R32 fixtures. Changing configuration does not recalculate heat, COP, pressures or outlet temperatures. Only the illustrative preview clock and ice→retained-liquid ledger advance.

The live implementation uses a quasi-steady shared-pressure cycle, dynamic room air/fabric/metal states and conserved outdoor ice/water enthalpy. Generic coil and compressor parameters are assumptions. Alternative fluids and manufacturer performance remain outside current live validation; exact finned exchanger areas remain unknown rather than being invented. Longer frost/defrost, numerical convergence and physical line transport are still under independent review.

## Project decisions and research

- [Owner decisions and milestone scope](project-brief.md)
- [Science reference](heatpump-science-reference.md)
- [Thermodynamic model specification](model-specification.md)
- [Source register](research/primary-source-register.md)
- [Owner installation evidence](research/owner-installation.md)
- [Model validation plan](research/model-validation-plan.md)
- [Observed browser property-backend feasibility](research/coolprop-browser-feasibility.md)
- [Interface design notes](design/interface-design.md)
- [Interface browser QA](reviews/interface-qa.md)
- [Independent science-compliance review](reviews/science-compliance-review.md)

Heating, cooling, individual room thermal behaviour, and visible frost/defrost are core requirements. The owner preset is Daikin 3MXM52N8 with FTXA25, FTXA35, and FTXA25 indoor units. Exact indoor suffixes and unverified installation details remain unknown. Broader equipment/refrigerant coverage requires property and performance validation.

Charge/leaks, oil, saving/export, French, mixed water systems, heat-recovery VRF, and branding are deferred. An Opus 5.5 review is reserved for the owner to trigger separately.

The numerical implementation is in `src/engine/`, its worker/runtime bridge in `src/runtime/`, and real-backend checks run with `npm run test:engine`. See `reviews/engine-science-review.md` for the actual review status; source availability or a successful browser load is not a scientific acceptance verdict.
