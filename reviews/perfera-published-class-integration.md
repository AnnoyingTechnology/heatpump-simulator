# Perfera published-class acceptance

This isolated integration adds the seven source-listed FTXM-A/RXM-A monosplit class pairs from the official Daikin Europe 2026 General Catalogue, ECPEN26-500 (02/2026), printed p.320. It does not map them to guessed factory suffixes or replace the archived exact A2/A5 profiles.

The accepted candidate is designated Luna's separately corrected `luna-next-daikin-perfera-published-class-physical-corrected-2026.json`, SHA-256 `ff0444d5fb9aeb5e97f7b271cfec1787c920c88cfe43b1884922fddc14f3de24`. Its earlier candidate is preserved unchanged. The corrections concern source URLs, cell locators, identity excerpts and explicit unknowns; all numeric values/conditions were independently compared and remain unchanged. The independent acceptance receipt is `perfera-published-class-independent-acceptance.json`, SHA-256 `21d3d9339cec53ce708f2b3ffa58bb3283c9d234efb57823418ba2db306871cc`.

The flattened catalogue HTML alone does not preserve merged cell boundaries. Review used both official renderer layers: vector layout SHA-256 `6e893f94b23cbf4c82418519bff09c9ac06c59e9d7aa187b366ad1ff6b9b9a7d` and table substrate SHA-256 `248196cdf69bfd9ec8e2998716ac412986ed603583870a9122c9be42b350b1a3`. The receipt pins the HTML and both original layer bytes; a pinned composite documents the visual readback. The RXM20–42 casing cell is merged, the identical RXM50A8 cell is separate, and RXM60/71 share the larger casing. Indoor cooling and heating high-fan rows were checked separately and converted from m³/min by ×60. Heating operating limits retain their wet-bulb condition; a separate dry-bulb row is not substituted.

Accepted class pairs:

| Indoor published class | Outdoor published class | Cooling high-fan flow m³/h |
|---|---|---:|
| FTXM20A | RXM20A | 714 |
| FTXM25A | RXM25A9 | 714 |
| FTXM35A | RXM35A9 | 792 |
| FTXM42A | RXM42A | 798 |
| FTXM50A | RXM50A8 | 762 |
| FTXM60A | RXM60A | 936 |
| FTXM71A | RXM71A | 948 |

The importer accepts classes only through the separate `reviewed-class-fields` kind, explicit `identityKind: published-class`, source edition, an independently hash-bound field/condition/pairing readback and an explicit candidate statement that the factory suffix, full-SKU eligibility and current retail availability remain unknown. Ordinary exact profiles retain their existing contract. Classes are not aliases to full references with similar model digits.

Selection applies published casing and indoor cooling high-fan volumetric flow. Outdoor high-fan flow is unpublished and leaves the existing editable mass-flow setting. Heating reuse of cooling airflow is labeled as a generic assumption. No capacity scaling, charge calibration, electrical minimum, compressor displacement/efficiency, coil conductance or fan watts are inferred. Published ambient operating limits are documentary metadata.

Native choices, the casing and persistent outdoor information identify classes and the unpublished suffix in English and French. A source-listed partner satisfies the necessary one-head class topology; full factory-reference OEM eligibility and the overall validation stay unknown. Unreviewed alternatives remain unknown. Two connected heads violate the published monosplit topology. Switching an indoor head Off does not change its connection identity.

Preservation comparisons verified all 280 previous accepted records, existing ledger metadata and all 92 outdoor/188 indoor runtime profiles unchanged as JSON values. Only fourteen class records are appended. The isolated catalogue now contains 74 Daikin outdoor choices and 150 Daikin indoor choices, plus 25 Mitsubishi outdoor and 45 indoor profiles; owner/generic choices are separate.

Verification: 40 catalogue acceptance tests, 58 native-selector/store/browser checks, a 33-check ATXC regression, TypeScript and isolated production build passed. Browser checks exercise class-vs-exact identity, unknown eligibility, unsupported topology, published volumetric flow, manual outdoor airflow, persistent room pool/room settings/history and English/French markers. The physical worker continues without a fault; zero browser exceptions were recorded.

Coverage remains bounded. CTXM15A is multi-only and is withheld until source-qualified multiport eligibility exists. The current MXM port/class/reducer rules still do not establish complete indoor family/full-SKU compatibility. Exact ARXM/ARXF outdoor profiles paired with the accepted Siesta ATXM/ATXF heads remain gaps; these prefixes are not aliases to RXM/RXF. Other unaccepted cassette/ducted/Nepura variants and regional or historical suffixes require their own pinned field/pairing review. This does not claim the complete manufacturer range or France retail stock.

Root application/source/build were not changed by this work; publication belongs to the parent review and hosted-asset gate.
