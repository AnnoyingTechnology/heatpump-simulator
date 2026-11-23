# Heatpump Simulator

A desktop, frontend-only air-to-air heat-pump sandbox. It solves real refrigerant thermodynamics in the browser on a pure-vector workbench. It is neither a game nor a calibrated research instrument. Every model assumption is labelled.

**Live:** <https://annoyingtechnology.github.io/heatpump-simulator/>

The app opens in **Live**, which runs a physical simulation in a Web Worker. **Examples** shows separate, explicitly illustrative snapshots.

## Features

- **Heating and cooling.** Visible frost accumulation, automatic defrost, meltwater and a cumulative drained-water total.
- **Multi-room houses.** Each indoor unit serves its own room, with editable area, ceiling height, average U-value, sun gains and setpoint. Room links model doorway or floor-opening exchange plus insulated solid contact. Single- or dual-flow ventilation is available with sensible recovery.
- **Refrigerant circuit you can inspect.**
  - Compressor, four-way reversing valve, per-branch EEVs, accumulator, coils and service port.
  - Per-pipe temperature and phase colouring, pressures (gauge or absolute), coil-end probes, and outlet air temperatures on both sides.
- **Readings:**
  - instantaneous COP and COP since start;
  - useful power, electrical input and energy;
  - two-hour plots of simulated time;
  - per-room temperature and target traces.
- **Controls:**
  - pause and reset;
  - requested speed 1×, 2×, 5×, 10× and 50×, with the achieved rate shown;
  - season presets and URL initialisation;
  - EN/FR interface;
  - System, Light and Dark themes.
- **Engineering settings:**
  - compressor isentropic efficiency (generic 70 % default);
  - shared exchanger cleanliness from 100 % to 10 % clear passage (default 95 %);
  - pipe length and diameter per branch;
  - idealized or physical field lines;
  - a quasi-steady **Charge** model for reduced-charge scenarios.
- **Refrigerants:** R32 (default), R22, R290, R134a, R1234yf, R410A and R407C for the generic Reference circuit.
  - R410A and R407C use fixed-composition pseudo-pure equations of state that keep their glide. Fractionation is out of scope.
  - Physical field lines and the conserved-inventory model are qualified for R32 only.
- **Equipment catalogue:** see below.

## Equipment catalogue

The outdoor model selector offers three kinds of entry:

- the owner preset (Daikin 3MXM52N8 with FTXA25/FTXA35/FTXA25);
- a **Generic** group with an editable port count;
- 226 outdoor and 391 indoor manufacturer profiles, grouped by brand.

| Manufacturer | Outdoor | Indoor | Multisplits | Source editions |
|---|---:|---:|---:|---|
| Daikin | 91 | 185 | 22 | 2026 France/Europe catalogues and data books; separately identified legacy N/N8/N9 |
| Mitsubishi Electric | 59 | 86 | 12 | 2026/27 France residential range, including 3 R290 RZ pairs |
| Panasonic | 32 | 41 | 13 | France 2026 residential catalogue |
| Mitsubishi Heavy Industries | 44 | 79 | 9 | Europe 2026 residential catalogue (26R01EU rev. 1) |

Every imported value is pinned to a source page, row and column through a reviewed acceptance file (`research/catalogue/`). The imported fields are:

- casing dimensions;
- published airflow;
- nominal capacity class;
- factory refrigerant;
- operating ranges;
- exact single-split pairings;
- multisplit head counts and capacity ceilings.

Matched monosplits enforce one port and their published partners. A multisplit offers every catalogued head of its own manufacturer. Each head is marked **"combination unverified"**, because exact OEM combination tables are not imported.

Catalogue labels **do not** imply OEM performance. Compressor, exchanger and control behaviour stay generic. Unpublished airflow falls back to a labelled generic or manual value. France availability and current stock are not asserted.

Open coverage and per-reference reasons:

- [Daikin ledger](reviews/daikin-luna-coverage.md)
- [Mitsubishi Electric ledger](reviews/mitsubishi-electric-luna-coverage.md)
- [Daikin/Mitsubishi final review](reviews/catalogue-completion-terra-2026-11.md)
- [Panasonic/MHI batch](reviews/catalogue-panasonic-mhi-2026-11.md)

Toshiba, Fujitsu/Atlantic and LG are not yet included.

## Physics model and limits

**Property backend.** Live uses a pinned, self-hosted CoolProp HEOS/psychrometric backend compiled to WASM. The public worker uses the independently reviewed guarded build, see [`tools/coolprop-safe/`](tools/coolprop-safe/README.md).

**Reference model.** The default model is a quasi-steady, shared-pressure cycle. It includes:

- per-branch, phase-aware heat transfer with finite UA;
- dynamic room air, fabric and metal states;
- conserved outdoor ice and water enthalpy;
- outdoor exhaust fog.

Fixed 1 K subcooling applies unless **Charge** is selected.

**Inverter controller.** The default is a generic inverter controller, not a fitted OEM algorithm:

- It estimates room demand and applies bounded proportional-integral feedback.
- A ±1 °C call band applies: heating starts at target −1 °C and stops at target +1 °C, reversed in cooling.
- The fan command is 25–100 %, with fan power following its cube.
- The compressor ramps at 2 rps/s up and 4 rps/s down, with an 8 rps runtime minimum. Physical-line cooling keeps 18 rps.
- A fixed-speed `on-off` strategy exists for future conventional equipment.

**Charge models.**

- The **Charge** model sets condensing pressure, subcooling, superheat and EEV regime from a percentage of a generic, installation-derived nominal charge, with shortage and flooding protection. It redistributes charge instantly.
- The time-integrated conserved-inventory model remains behind a validation gate. See [PROGRESS.md](PROGRESS.md).

**Speed.** Requested speed is limited by solver throughput. The clock advances only on completed physical steps. Observed throughput is about 13× for active owner-preset heating requested at 50×, and about 47–49× with all units off. These figures depend on the workload.

**Not modelled:**

- oil transport;
- ice sublimation, indoor icing and room fog;
- resolved stratification;
- two-phase pipe slip and fittings;
- measured fouling curves;
- finned-exchanger areas;
- manufacturer performance maps.

Unsupported operating points stop with an explicit fault. Accepted state is retained, and a local diagnostic JSON can be downloaded.

## Owner-house preset

The default house reproduces the owner's three-level home. These are provisional calibration assumptions, not measured material properties.

- **Floors:** ground 45.4 m² / 100 m³, upstairs 54.5 m² / 155 m³, attic 26 m² / 84 m³.
- **Envelope losses:** 45 / 25 / 15 W/K.
- **Air exchange and gains:** 0.25 ACH residual air exchange and a 200 W ground background gain. Dual-flow ventilation runs at 0.5 ACH with 75 % sensible recovery.
- **Floor links:** each is 4 m² open plus 45 m² of 120 mm glass wool, totalling 173.804 W/K.
- **Winter targets:** ground 17 °C, upstairs 21.5 °C, attic off.

At 1 °C outdoors, a 20-minute warm-start benchmark averaged about **649 W** electrical input. The owner reported roughly 500 W and accepted this as a useful starting approximation; it is not a fitted result. See:

- [owner-house calibration](research/owner-house-calibration.md)
- [benchmark](research/owner-house-engine-benchmark.json)
- [review](reviews/owner-house-science-review.md)
- [measured-reference comparison](research/owner-reference-comparison.md)

## Run locally

Requires Node 20.19+ or 22.12+.

```sh
npm ci
npm run dev          # hot reload is disabled so edits never erase a running simulation; refresh explicitly
npm run build        # static output in dist/, relative asset URLs
npm run preview
```

There is no backend and no external runtime asset or API. Weather, mode, per-room targets, On/Off and initial temperatures can be passed as URL parameters. See [URL parameters and the Home Assistant template](docs/home-assistant-url.md).

## Tests and CI

```sh
npx tsc -p tests/engine/tsconfig.json && HEATPUMP_TEST_BACKEND=guarded node --test tests/engine/properties.test.mjs   # one engine suite
npx tsc -p tests/frontend/tsconfig.json && node --test tests/trends.test.mjs tests/preconfiguration.test.mjs tests/i18n.test.mjs
python3 tests/catalogue.test.py
npx tsc -p tests/catalogue/tsconfig.json && node --test tests/catalogue/topology.test.mjs
```

Browser checks (`tools/check-*.mjs`) drive an isolated dev server through Chromium's DevTools protocol on `127.0.0.1:9223`. Start a separate, headless Chromium profile with `--remote-debugging-port=9223` first.

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs on every push to `main`. It performs these steps:

1. installs locked dependencies and builds;
2. runs the guarded-backend engine suite, the catalogue source boundary and topology tests;
3. runs a robustness smoke campaign;
4. publishes `dist/` to GitHub Pages.

`node tools/check-hosted-pages.mjs` verifies the deployed site.

## Catalogue pipeline

1. A candidate JSON in `research/catalogue/staging/` must validate against `catalogue.schema.json`. Check it with `python3 tools/validate-catalogue.py <file>`.
2. Accepted entries in `research/catalogue/equipment-acceptance.json` pin the candidate by sha256. They cite source receipts whose page pins live in `research/sources/`.
3. `python3 tools/import-equipment.py` generates `src/equipment-data.ts` deterministically. Tests fail if it drifts.
4. `tools/transcribe-catalogue-2026.py` regenerates the Panasonic and MHI candidates, receipts and acceptance entries from the pinned pages.

The rules for sources, units and unknowns are in the [research contract](research/catalogue/research-contract.md).

## Documentation

- [Progress, backlog and validation gates](PROGRESS.md)
- [Changelog](CHANGELOG.md)
- [Owner decisions and scope](project-brief.md)
- [Science reference](heatpump-science-reference.md)
- [Model specification](model-specification.md)
- [Implemented equations and assumptions](research/engine-implementation.md)
- [Refrigerant qualification](research/refrigerant-qualification-2026.md)
- [Primary source register](research/primary-source-register.md)
- [Generic inverter controller](research/inverter-control.md)
- [Charge-balanced closure](research/charge-balanced-closure.md) and [conserved-charge design](research/refrigerant-charge-model-design.md)
- [Room-link model](research/vertical-room-opening-model.md)
- [Compressor efficiency reference](research/compressor-efficiency-reference.md)
- [Interface design notes](design/interface-design.md)
- Independent reviews:
  - [science compliance](reviews/science-compliance-review.md)
  - [engine](reviews/engine-science-review.md)
  - [guarded backend](reviews/guarded-backend-science-review.md)
  - [charge model](reviews/charge-model-science-review.md)

## Deferred

The following are deferred:

- save/export of scenarios;
- opt-in compressor and fan audio;
- oil transport;
- mixed hydronic systems (water floor heating and domestic hot-water tanks);
- heat-recovery VRF;
- mobile layouts.

## Credits

- **Science:** GPT-6 Luna researched the sources, and GPT-6.1 Sol developed the thermodynamics. Both were independently reviewed.
- **Interface:** Claude Sonnet 5.5 designed the initial workbench, which Codex now maintains. Claude Haiku 5.5 designed the header mark.
- **Catalogue:**
  - Daikin and Mitsubishi Electric were staged with Qwen3.8-Flash-Next, then completed by Luna and Terra.
  - Panasonic and Mitsubishi Heavy Industries were added by Claude Opus 5.5.
