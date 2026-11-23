# Panasonic and Mitsubishi Heavy Industries catalogue batch (2026-11-23)

Owner request (2026-11-23): fill missing product databases and publish a complete release. This batch extends the manufacturer scope beyond Daikin and Mitsubishi Electric. The original research contract had excluded Mitsubishi Heavy Industries from its first pass. That exclusion is superseded by this request (see the addendum in `research/catalogue/research-contract.md`).

Executed by Claude Opus 5.5 through Claude Code. This batch was not staged through Qwen/OpenCode. It uses a deterministic transcriber with mechanical readback instead, plus visual span review of the rendered pages.

## Sources

| Candidate | Source | Pinned PDF sha256 | Pages pinned |
|---|---|---|---|
| `panasonic-fr-2026` | Panasonic *Catalogue Climatisation Résidentielle 2026* (FR, 202601): <https://fra-connect.mo.cloudinary.net/PRODUCT/DOCUMENT/66/RAC_Catalogue_2026_FR_202601.pdf> | `2bb60c62…3922493` | PDF pp.30–34, 37–40 |
| `mhi-eu-2026` | Mitsubishi Heavy Industries *Residential Air-Conditioners Catalogue for Europe 2026* (26R01EU, revision 1): <https://mhi-hvac.co.uk/wp-content/uploads/RAC-Brochure-2026-26R01EU_included_revision_1.pdf> | `13f1070f…e96b5db` | PDF pp.32–36, 38–45, 49 |

The page text and page renderings are committed under `research/sources/` with sha256 pins in each readback receipt. The PDFs themselves stay in the ignored `research/catalogue/source-cache/`. `python3 tools/transcribe-catalogue-2026.py extract` regenerates the pins from a re-downloaded PDF.

## Method

`tools/transcribe-catalogue-2026.py` produces both candidates, both receipts (`reviews/*-readback.json`) and the acceptance entries:

- Per-column rows are read by regex from the pinned layout text.
- Merged cells (casing, refrigerant, operating ranges) use explicit column-span maps that were read from the page images. Any change in cell count or span sum raises an error.
- Every fact carries the exact printed row as its excerpt.
- The readback re-checks that each excerpt is a pinned row and that the value is visible in it.
- Airflow is converted from m³/min to m³/h (×60).

Results:

- **Panasonic:** 41 indoor and 32 outdoor units.
  - Single-split: Etherea (three finishes), TZ, BZ, console CFEA and ducted CD3EA.
  - Multi-only heads, page 38: wall, console, 60×60 cassette and ducted.
  - 13 multisplits: Multi Z Deluxe CBE ×8, Power Heat ABEC ×2, Multi TZ TBE ×3.
- **MHI:** 79 indoor and 44 outdoor units.
  - SRK ZSX-WF/ZSX-W/ZR-WF/ZR-W/ZT-WF/ZS-WF/ZS-W/ZTL-W/ZSP-W1 wall series.
  - SRF floor, SRR ducted and FDTC cassette.
  - 9 SCM multisplits (2–5 heads).
  - Columns that list several finish suffixes (e.g. `SRK20ZSX-WF,-WFB,-WFT`, `SRC50ZSX-W2,-W3`) are expanded into distinct references. Every listed indoor finish is paired with every listed outdoor suffix.
- **Imported data:**
  - casings;
  - nominal cooling capacity class;
  - indoor cooling high-fan airflow and outdoor cooling airflow, where printed;
  - factory refrigerant;
  - published outdoor operating ranges;
  - exact single-split pairings;
  - multisplit head counts and total-capacity ceilings.

## Explicit unknowns and exclusions

- **SCM125ZM-S** is R410A, and catalogue outdoors are limited to R32/R290. It is recorded under `unresolvedReferences` and not imported.
- **Pair-dependent values on shared outdoors.** Some outdoors are printed in several pair columns:
  - SRC50ZSX-W2/-W3 and SRC60ZSX-W1/-W3 print heating limits that differ by indoor family (floor/ducted −15 °C, cassette +20 °C maximum, wall −20/+24 °C).
  - The wall column value is applied, and every differing column is named in `unknowns`.
  - Nominal capacity is dropped where pair columns disagree (CU-Z50CBEA, SRC60ZSX-W1, SRC60ZSX-W3).
- **Multisplits.**
  - Exact indoor combination tables are not imported: Panasonic pp.41–47 and MHI pp.52–63.
  - `exactEligibility` stays `unknown`, and every same-manufacturer head is offered with the "combination unverified" label.
  - The printed total-capacity maximum is applied as a class-sum ceiling. Minimum totals are documentary.
  - SCM100ZS-W carries footnoted combination restrictions, recorded as an unknown.
- **Panasonic multisplit airflow** is not printed per outdoor on the pinned pages. The simulator applies its labelled generic/manual airflow.
- **Availability.** The MHI catalogue is a Europe edition. France availability and current stock are unverified for both makers (`marketScope`).
- **Performance.** EER/COP, SEER/SCOP, sound and electrical data are not applied. Compressor, exchanger and control behaviour stay generic.

## Not added

- **Toshiba.** The official 2026 residential catalogue prints neither indoor/outdoor airflow nor operating ranges in its specification tables, and the importer requires operating ranges. Deferred until a data book with those rows is pinned.
- **Fujitsu/Atlantic and LG.** No official manufacturer technical PDF with complete specification tables was located in this pass. Retailer and spec-aggregator pages are not accepted evidence.

## Verification

- Schema validation passes for both candidates: 73 and 123 units.
- `tools/import-equipment.py` regenerates `src/equipment-data.ts` deterministically. All 421 earlier profiles are byte-identical and keep their order.
- `tests/catalogue.test.py` passes 65 tests. A new branch covers indoor units with unpublished airflow.
- Frontend, topology and type checks pass.
- `tools/check-equipment-models.mjs` passes 6/6. Every accepted monosplit, including the new ones, maps to a matched head.
- `tools/check-new-manufacturers.mjs` passes 5/5:
  - Panasonic and MHI multisplits offer only their own heads, with exact eligibility unknown;
  - a shared MHI outdoor keeps every printed partner;
  - the simulation keeps running.
- Runtime catalogue after this batch, outdoor / indoor:

  | Manufacturer | Outdoor | Indoor |
  |---|---|---|
  | Daikin | 91 | 185 |
  | Mitsubishi Electric | 59 | 86 |
  | Panasonic | 32 | 41 |
  | Mitsubishi Heavy Industries | 44 | 79 |
  | **Total** | **226** | **391** |

A related fix shipped with this batch. Adding a room on a manufacturer outdoor used to create a generic `G25` head that the outdoor does not offer. The new slot now takes that outdoor's first selectable head, as an outdoor switch already did.
