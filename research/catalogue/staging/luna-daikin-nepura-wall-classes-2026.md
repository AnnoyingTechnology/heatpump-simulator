# Daikin Nepura wall classes: FTXTA-D and FTXTP-A (2026)

Checked 2026-10-11. This candidate covers the official 2026 catalogue pages 345 and 349 as printed class evidence. It does not replace or alias existing exact/short profiles. Both the HTML page snapshots and the primary positioned-text SVG/background renderer assets are pinned, because the technical tables merge class columns.

Candidate JSON: `luna-daikin-nepura-wall-classes-2026.json`. Its nine records comprise four FTXTA-D finish classes, one shared RXTA-C class, two FTXTP-A size classes, and their RXTP-A outdoor class records.

## Published pair classes

| Indoor class | Outdoor class | Source pairing text |
|---|---|---|
| FTXTA30DG | RXTA30C | `30DG/L/P/Y + 30C` (p.345 grouped class pair) |
| FTXTA30DL | RXTA30C | same grouped class pair |
| FTXTA30DP | RXTA30C | same grouped class pair |
| FTXTA30DY | RXTA30C | same grouped class pair |
| FTXTP25A | RXTP25A | `25A + 25A` (p.349 pair column) |
| FTXTP35A | RXTP35A | `35A + 35A` (p.349 pair column) |

The pairings above are catalogue class pairs. Neither page provides the corresponding full factory suffixes or proves exact full-SKU eligibility or current France stock. Every unit records that limitation explicitly. Existing exact FTXTA C2V1B, FTXTP-M, and other generation profiles remain separate.

## p.345 FTXTA-D variants and shared preliminary values

The page lists the design families FTXTA-DG, FTXTA-DL, FTXTA-DP, and FTXTA-DY; its spec table groups class 30DG/L/P/Y in one indoor column and pairs that group with RXTA30C. The actual renderer shows the shared cells. The page footnote says blue cells contain preliminary data, and the table’s numeric cells are blue. These values are therefore recorded as **preliminary**, not stable final specifications.

| Indoor class(es) | Indoor casing H × W × D | Cooling high fan | Heating high fan |
|---|---:|---:|---:|
| FTXTA30DG / 30DL / 30DP / 30DY | 295 × 798 × 189 mm | 13.1 m³/min = 786 m³/h | 12.3 m³/min = 738 m³/h |

| Outdoor class | Casing H × W × D | Refrigerant | Cooling outdoor DB | Heating outdoor WB |
|---|---:|---|---:|---:|
| RXTA30C | 605 × 930 × 376 mm | R-32 | −10…46 °CDB | −31…18 °CWB |

The page points to a separate operating-range drawing; only the tabulated preliminary endpoints are captured, not a full operating boundary. Outdoor airflow is not published.

## p.349 FTXTP-A values

The renderer shows the indoor casing and airflow cells merged across the 25A and 35A classes; outdoor casing and range cells are also merged across RXTP25A/35A. Each pair remains distinct because the efficiency table prints separate `25A + 25A` and `35A + 35A` class columns.

| Indoor class | Indoor casing H × W × D | Cooling high fan | Heating high fan |
|---|---:|---:|---:|
| FTXTP25A | 286 × 770 × 225 mm | 11 m³/min = 660 m³/h | 10.5 m³/min = 630 m³/h |
| FTXTP35A | 286 × 770 × 225 mm | 11 m³/min = 660 m³/h | 10.5 m³/min = 630 m³/h |

| Outdoor class | Casing H × W × D | Refrigerant | Cooling outdoor DB | Heating outdoor WB | Additional heating DB line |
|---|---:|---|---:|---:|---:|
| RXTP25A | 605 × 930 × 376 mm | R-32 | −10…46 °CDB | −31…18 °CWB | −30…24 °CDB |
| RXTP35A | 605 × 930 × 376 mm | R-32 | −10…46 °CDB | −31…18 °CWB | −30…24 °CDB |

The page also points to a separate operating-range drawing; the candidate captures printed endpoint ranges only. Outdoor airflow is not published.

## Future multi-only review gap

These classes are expressly excluded from the monosplit pair records above:

- Printed p.315 lists CTXA15DG/P/L/C/Y as connectable to multi outdoor units only.
- Printed p.317 lists CTXA15CW/S/B as connectable to multi outdoor units only.
- Printed p.320 marks CTXM15A multi-combination only.

They are recorded as unresolved future multi-split review items. No CTXA/CTXM15 class is used as a monosplit partner. The official source pages are included as context-only evidence in the candidate sources and checksum manifest.

## Scope limits

No source capacity, efficiency, charge, compressor map, cycle UA, or performance curve is imported. No full SKU or compatibility is inferred from shared digits, and no current France sales availability is claimed. This remains a bounded Daikin class supplement, not a complete Nepura range. No accepted data, importer, runtime, build, or git state was changed.
