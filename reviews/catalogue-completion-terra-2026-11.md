# Terra catalogue continuation — incomplete checkpoint, 2026-11-18

This continuation is not complete. The requested visual reconciliation and later research batches have not been performed; their presence below is not a claim that they were researched or blocked by a source.

- `91d4b76` added the brief; `c1741f5` staged FFA/FNA candidates; `21a82d5` recorded the preceding checkpoint.
- `97c1e10` accepted the eight exact FFA/FNA indoor physical profiles. The FNA table labels 720 mm as including installation legs; 620 mm is used for casing without legs. No MXM compatibility was added. See `terra-daikin-heads-2026-11.md` and its source receipt.
- Runtime counts changed from Daikin 90 outdoor / 163 indoor to 90 / 171; Mitsubishi remains 25 / 45. France availability and exact full-SKU eligibility for the new heads remain unknown.
- Catalogue tests (52), topology tests (10), and both TypeScript checks passed after this batch; the build was intentionally skipped.

The p.329 pinned HTML loses cell positions. No ECPEN26-500 PDF snapshot is present in this workspace; the visual matrix check has not been completed, and no class connectivity is asserted. Finding an equivalent official position-preserving snapshot remains necessary. FBA-A(9), FCAG-B, FHA-A(9), remaining RXM columns, ATXM20, Siesta multisplit, ARXM50 drawing, Mitsubishi inventory and MXZ constraints, and 2022 historical suffixes have not been researched in this continuation. Their previous uncertainties remain in the coverage ledgers. This is a work checkpoint, not the requested final review.

## Bounded FBA/FCAG/FHA continuation — 2026-11-18

This batch adds 14 exact indoor physical profiles: three FBA, three FCAG and eight FHA. It follows the eight FFA/FNA profiles already present on the reset base `787db42`. Daikin runtime counts move from 90 outdoor / 171 indoor to 90 / 185; Mitsubishi remains 25 / 45. Candidate files, independent acceptance JSON and SHA-256 source pins are detailed in `terra-daikin-fba-fcag-fha-2026-11.md` and `../provenance/terra-daikin-heads-source-receipt.md`. The batch commit contains this review and its evidence.

FHA60AVEB99 remains unresolved: the exact heading exists but its dimension and airflow cells are blank. France availability and current sales status of all 14 added heads are unknown. The FCAG unit dimensions exclude decorative panels. The larger commercial classes in these tables were not part of the residential 35/50/60 batch. No exact MXM pair was located in the official sources searched; the review records the URLs and limitations. All five head families remain unpaired. The 2026 flipbook now returns 404, and the pinned p.329 HTML loses matrix positions, so no matrix cell has been reconstructed. FFA/FNA installation-leg and panel boundaries remain as recorded above.

The other earlier outstanding items are unchanged: remaining RXM pair columns, ATXM20 monosplit and Siesta multisplit eligibility, the ARXM50 range drawing, Mitsubishi range reconciliation and MXZ constraints/digital 5/6-head table, and 2022 Daikin historical suffix expansion. See the two coverage ledgers for reference-level scope and reasons. VRV/VRF, hydronic equipment and Mitsubishi Heavy Industries remain excluded. This bounded checkpoint is not a full catalogue completion claim.

Validation for this batch: `python3 tests/catalogue.test.py` (53 passed); catalogue TypeScript compile and topology tests (10 passed); `npx tsc --noEmit -p tsconfig.json` passed. The requested build was not run.
