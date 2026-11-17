# Daikin FVXM-B and FDXM-F9 class supplement (2026)

Checked 2026-10-11. This source-only candidate covers the current class pairings printed on Daikin Europe General Catalogue 2026 pages 326 and 327. It keeps published class identities separate from full factory SKUs and from older exact indoor records. No model suffix has been inferred. Outdoor classes appearing on both pages are represented once, with both pages’ pair evidence.

Candidate JSON: `luna-daikin-floor-duct-classes-2026-corrected.json`. The companion `.sha256` pins the candidate, this note, both HTML page snapshots, and the official renderer SVG/background assets used to review merged cells.

## Class pair coverage

| Indoor published class | Outdoor published class | Catalogue evidence |
|---|---|---|
| FVXM25B | RXM25A9 | p.326 class pair `25B + 25A9` |
| FVXM35B | RXM35A9 | p.326 class pair `35B + 35A9` |
| FVXM50B | RXM50A8 | p.326 class pair `50B + 50A8` |
| FDXM25F9 | RXM25A9 | p.327 class pair `25F9 + 25A9` |
| FDXM35F9 | RXM35A9 | p.327 class pair `35F9 + 35A9` |
| FDXM50F9 | RXM50A8 | p.327 class pair `50F9 + 50A8` |
| FDXM60F9 | RXM60A | p.327 class pair `60F9 + 60A` |

These are published one-to-one **class** pairs. The catalogue pages do not publish full factory suffixes for these classes. Exact full-SKU identity and eligibility, plus current France retail availability, remain unknown. Exact FVXM-B2 and FDXM indoor profiles remain separate and are not duplicated or aliased here.

## Indoor casing and high-fan airflow

Airflow figures below are the high-fan values converted from the catalogue’s m³/min by ×60 to m³/h. Cooling and heating are separate facts in the JSON. The source does not publish outdoor volumetric airflow.

| Indoor class | Casing H × W × D (mm) | Cooling high | Heating high |
|---|---:|---:|---:|
| FVXM25B | 600 × 750 × 238 | 8.7 m³/min = 522 m³/h | 9.2 m³/min = 552 m³/h |
| FVXM35B | 600 × 750 × 238 | 9.2 m³/min = 552 m³/h | 9.8 m³/min = 588 m³/h |
| FVXM50B | 600 × 750 × 238 | 11.6 m³/min = 696 m³/h | 12.8 m³/min = 768 m³/h |
| FDXM25F9 | 200 × 750 × 620 | 8.7 m³/min = 522 m³/h | 8.7 m³/min = 522 m³/h |
| FDXM35F9 | 200 × 750 × 620 | 15.8 m³/min = 948 m³/h | 15.8 m³/min = 948 m³/h |
| FDXM50F9 | 200 × 1,150 × 620 | 16.0 m³/min = 960 m³/h | 16.0 m³/min = 960 m³/h |
| FDXM60F9 | 200 × 1,150 × 620 | 16.0 m³/min = 960 m³/h | 16.0 m³/min = 960 m³/h |

The p.326 indoor casing is visually merged over FVXM25B/35B/50B. The p.327 indoor casing cells merge 25F9/35F9 and 50F9/60F9; airflow cells merge 50F9/60F9. Those groupings were checked against the actual positioned-text renderer layer and page background, not inferred from the flattened text order.

## Outdoor class facts

All published RXM-A classes in these page tables use R-32. Conditions are explicit: cooling range is outdoor dry-bulb (`°CDB`); heating range is outdoor wet-bulb (`°CWB`). Both pages also print a heating outdoor dry-bulb line. Where represented as facts, the `condition` field distinguishes that line from the wet-bulb range.

| Outdoor class | Casing H × W × D (mm) | Cooling DB | Heating WB | Additional heating DB |
|---|---:|---:|---:|---:|
| RXM25A9 | 610 × 923 × 367 | −10…50 °C | −21…18 °C | −20…24 °C |
| RXM35A9 | 610 × 923 × 367 | −10…50 °C | −21…18 °C | −20…24 °C |
| RXM50A8 | 610 × 923 × 367 | minimum −10 °C; maximum unresolved | minimum unresolved; maximum 18 °C | minimum unresolved; maximum 24 °C |
| RXM60A | 734 × 954 × 401 | −10…50 °C | −21…18 °C | −20…24 °C |

The p.326 and p.327 visual tables merge the 25A9/35A9 operating ranges. The p.327 table merges 25A9/35A9/50A8 casing dimensions and shows the 60A casing separately. Both pages show RXM50A8 alternatives with footnote (1): cooling maximum `50 (1) / 46 (1) °CDB`, heating minimum `-21 (1) / -15 (1) °CWB`, and heating dry-bulb minimum `-20 (1) / -15 (1) °CDB`. The footnote points to a separate operating-range drawing not included here, so no alternative is selected. The JSON records only unambiguous limits and preserves the missing limits as unknown.

## Evidence limits

This is a bounded class-level source candidate, not a full Daikin range. It adds no capacity, efficiency, charge, compressor map, cycle UA, or performance curve, and infers no airflow or compatibility. The literal `modelReference` values are the printed class strings; they do not prove factory SKU suffixes or current stock. Each unit carries the explicit unknown: “Factory suffix is unpublished in this catalogue table; exact full-SKU eligibility and current retail availability remain unknown.” The p.326/327 pages and their positioned renderer assets are pinned in the JSON’s source list and checksum file. No accepted data, importer, runtime, build, or git state was changed.
