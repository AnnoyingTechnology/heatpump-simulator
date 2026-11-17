# Daikin FFA and FNA source checkpoint — 2026-11-18

The official Europe product tables give exact FFA25/35/50/60A2VEB9 and FNA25/35/50/60A2VEB9 columns. The candidate files preserve each column's unit dimensions and cooling high-fan airflow (m³/min converted exactly to m³/h). FFA dimensions are for the indoor unit, excluding the separate panel. FNA height is left unknown: the table gives both 620 and 720 mm with a footnote; that condition has not yet been reviewed. These are candidates, not runtime acceptance. France sales status and exact MXM eligibility are unknown. The p.329 matrix names classes; its flattened dots must be checked visually before class-to-outdoor cells can be asserted, and class connectivity cannot establish exact suffix eligibility. FBA, FCAG and FHA still need individual product-table review.

Snapshots, retrieved 2026-11-18:

| File | Official source | SHA-256 |
|---|---|---|
| `research/sources/terra-daikin-ffa-a9-table.html` | https://www.daikin.eu/en_us/products/product.table.html/FFA-A9.html | `afdbce9eeede3cffbd66457c25b1197ab4343aba1a429247de871ee95e2958c8` |
| `research/sources/terra-daikin-fna-a9-table.html` | https://www.daikin.eu/en_us/products/product.table.html/fna-A9.html | `4125f3b75faee791d2b877f10bfdc1d987fbc26fb9485fd3348fa86aa6c2c286` |

The existing p.329 snapshot is pinned in `provenance/daikin-luna-acceptance-receipt.md`. No runtime fields or pairings were promoted in this checkpoint.

## FFA/FNA physical-field follow-up

The FNA table's height row reads `620, 720 (1)` in all four columns, and its Notes row defines `(1) - Including installation legs`. The 620 mm casing is therefore used without installation legs; 720 mm includes the legs. FFA's separate panel is not included. The eight exact indoor references and these physical fields are now imported, without outdoor pair claims. The p.329 HTML snapshot flattens matrix cells. The presumed pinned 2026 PDF is absent from the workspace; no cell positions can be established from the HTML alone. Exact full-SKU eligibility also remains unknown. Runtime counts after this physical-field batch: Daikin 90 outdoor / 171 indoor, Mitsubishi Electric 25 outdoor / 45 indoor.
