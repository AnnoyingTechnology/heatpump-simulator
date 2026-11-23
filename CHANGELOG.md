# Changelog

## 1.0.0 (2026-11-23)

First tagged release. It follows 154 verified milestone commits since 2026-10-10.

### Added

- **Panasonic catalogue** (France 2026 residential): 32 outdoor and 41 indoor profiles.
  - Etherea, TZ, BZ, console and ducted single-splits.
  - Multi-only heads.
  - 13 Multi Z Deluxe, Power Heat and Multi TZ multisplits.
- **Mitsubishi Heavy Industries catalogue** (Europe 2026): 44 outdoor and 79 indoor profiles.
  - SRK wall series, SRF floor, SRR ducted and FDTC cassette.
  - 9 SCM multisplits.
- A manufacturer registry (`EQUIPMENT_MANUFACTURERS`). Brand labels, dropdown grouping and ordering now come from one list.
- `tools/transcribe-catalogue-2026.py`: a deterministic, source-pinned transcriber with mechanical readback receipts.
- `tools/check-new-manufacturers.mjs`: browser checks for the new brands.
- A catalogue test branch for indoor units with unpublished airflow.

### Changed

- The README is rewritten as a concise project overview.
- The outdoor inspector title names the selected catalogue model instead of "generic compatible".

### Fixed

- Adding a room on a manufacturer outdoor no longer creates a generic `G25` head that the outdoor does not offer. The new head is the outdoor's first selectable model.

### Baseline at 1.0.0

- **Physics:**
  - live CoolProp-based Reference cycle with 7 qualified refrigerants;
  - frost, defrost and drained water;
  - multi-room house with room links and ventilation;
  - generic inverter controller;
  - quasi-steady Charge model.
- **Interface:** EN/FR, themes, and two-hour session and room plots.
- **Catalogue:** 226 outdoor and 391 indoor source-reviewed profiles across Daikin, Mitsubishi Electric, Panasonic and Mitsubishi Heavy Industries.
- **Known limits:**
  - Exact OEM multisplit combinations and performance maps are not modelled.
  - The conserved-inventory charge model remains behind its validation gate.
  - Toshiba, Fujitsu/Atlantic and LG are not yet catalogued.

Open work is listed in [PROGRESS.md](PROGRESS.md#current-backlog).
