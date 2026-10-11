# Daikin Siesta exact monosplit pairs: bounded outdoor supplement

Checked 2026-10-11. This source-only candidate contains ten exact outdoor model references, their manufacturer-published one-to-one indoor/outdoor pair evidence, and separate published indoor cooling/high-fan and heating/high-fan airflow facts. Candidate JSON: `luna-siesta-outdoor-exact-pairs-2026.json`. Source snapshots and their SHA-256 pins are listed in the JSON and companion `.sha256` file.

## Exact pair coverage

| Indoor reference | Outdoor reference | Pair evidence |
|---|---|---|
| ATXM25A2V1B | ARXM25A5V1B | Daikin France ATXM-A / ARXM-A pair table |
| ATXM25A5V1B | ARXM25A5V1B | same |
| ATXM35A2V1B | ARXM35A5V1B | same |
| ATXM35A5V1B | ARXM35A5V1B | same |
| ATXM50A2V1B | ARXM50A5V1B | same |
| ATXM50A5V1B | ARXM50A5V1B | same |
| ATXF20F5V1B | ARXF20F5V1B | Daikin Europe ATXF-F / ARXF-F pair table |
| ATXF25F5V1B | ARXF25F5V1B | same |
| ATXF35F5V1B | ARXF35F5V1B | same |
| ATXF42F5V1B | ARXF42F5V1B | same |
| ATXF50F5V1B | ARXF50F5V1B | same |
| ATXF60F2V1B | ARXF60A5V1B9 | Daikin France ATXF-F / ARXF-A9 pair table |
| ATXF71F2V1B | ARXF71A5V1B9 | same |

ATXM20A2V1B and ATXM20A5V1B have no exact outdoor partner in the inspected ATXM-A / ARXM-A pairing table. The candidate leaves both unresolved; it does not create an ARXM20 identity. The 2026 class catalogue describes ATXM20A as multi-combination only, which is contextual evidence and not a monosplit pair.

## Published outdoor facts

All ten outdoor exact references publish R-32. Outdoor volumetric airflow is absent from the cited specification tables and remains unknown. Cooling ranges use dry-bulb conditions: France tables label them `°CBS`, Europe table `°CDB`. Heating ranges use wet-bulb conditions: France tables label them `°CBH`, Europe table `°CWB`.

| Outdoor reference(s) | Casing H × W × D (mm) | Cooling outdoor range | Heating outdoor range |
|---|---:|---:|---:|
| ARXM25A5V1B, ARXM35A5V1B | 610 × 923 × 367 | −10…50 °CBS | −21…18 °CBH |
| ARXM50A5V1B | 734 × 954 × 401 | −10 °CBS minimum; maximum unresolved | minimum unresolved; 18 °CBH maximum |
| ARXF20F5V1B, ARXF25F5V1B, ARXF35F5V1B, ARXF42F5V1B | 556 × 740 × 343 | −10…48 °CDB | −15…18 °CWB |
| ARXF50F5V1B | 610 × 923 × 367 | −10…48 °CDB | −15…18 °CWB |
| ARXF60A5V1B9, ARXF71A5V1B9 | 734 × 870 × 373 | −10…46 °CBS | −15…18 °CBH |

For ARXM50A5V1B, the source prints cooling maximum as `50 (1), 46 (1)` and heating minimum as `-21 (1), -15 (1)`. Footnote (1) directs the reader to a separate operating-range drawing. That drawing was not part of this batch, so neither alternative is selected. The candidate does not import other omitted ARXM columns or infer a range from a neighboring class.

The separate indoor `airflow` facts convert the source's m³/min high-fan values to m³/h by ×60 and retain distinct cooling and heating conditions. They are not outdoor airflow values. No capacity, efficiency, refrigerant charge, cycle map, UA, or performance curve is added or inferred from model digits.

The full-reference technical tables establish that the exact references are listed by Daikin; they do not establish current France retail availability. `status: unknown` is retained. The 2026 catalogue page class tables publish class identifiers without proving every factory suffix or a present France sales offer; they are not used as suffix expansions or as exact pair evidence.

## Source boundary and follow-up pages

The bounded context pages 334–340 in the Daikin Europe General Catalogue 2026 cover Siesta wall families. Pages 335 and 337 provide current class-level ATXM-A/ARXM-A and ATXF-F/ARXF-F context only. Pages 339–340 cover Siesta multisplit outdoor families (2AMXM/3AMXM and 2AMXF/3AMXF), which are distinct from the monosplit ARXM/ARXF references in this batch. The page 334–340 class tables do not supply the exact full-SKU mapping used above.

Official catalogue pages identified for a later bounded research batch; no specifications from these pages are included here:

- [Printed p.326](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/326/): FVXM-B floor-standing indoor with RXM-A outdoor classes.
- [Printed p.327](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/327/): FDXM-F9 concealed-ceiling indoor with RXM-A outdoor classes.
- [Printed p.345](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/345/): Nepura FTXTA-DG/L/P/Y with RXTA-C classes.
- [Printed p.349](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/349/): Nepura FTXTP-A with RXTP-A classes.

## Review limits

This is a bounded source candidate, not a complete Daikin range, importer change, simulator model, or evidence of current retail stock. It does not alter accepted catalogue data, runtime, importer, build, or git state. The 2026 classes and exact technical-table full references are kept as separate kinds of evidence; no RX/ARX aliases or historical exact-profile aliases are introduced.
