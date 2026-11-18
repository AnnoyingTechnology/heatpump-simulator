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


## Bounded RXM and Siesta continuation — 2026-11-18

The batch in this commit follows `cf2cdc6` (merged as `7eb94d1`). Daikin runtime changes from **90 outdoor / 185 indoor to 91 / 185**; Mitsubishi stays **25 / 45**. The source-pinned audit accounts for all 14 published RXM class pair columns and all 33 exact A8/A9 table columns, adding 24 exact pairings including the separately sourced RXM50A5V1B8 profile. No reviewed pair column remains unpaired. Full per-column source locators and evidence boundaries are in [the batch review](terra-rxm-siesta-2026-11.md); hashes and source URLs are in [the receipt](../provenance/terra-rxm-siesta-source-receipt.md).

Uncertainties: exact FDXM60 and RXM20/42/60/71 suffix pairings lack exact columns; class pairings cannot certify them. Exact ATXM20 monosplit eligibility remains unknown although p.335 labels its class multi-only. The ATXM/2AMXM table establishes 28 particular two-head configurations, not arbitrary pairings; AMXM installation constraints remain unreviewed. ATXF-F and ATXP-N9 multisplit exact eligibility remain unresolved: the retrieved ATXF-G table has different references, and the attempted ATXP table pages contained no combination columns. The PDF's rendered p.28 is an installer ambient table with an indoor-manual caveat, not the footnoted drawing; ARXM50 cooling maximum and heating minimum remain null. RXM50A5V1B8 has its own footnoted alternative endpoints unresolved. Europe listing does not establish current sales or France availability.

Remaining later work: exact MXM eligibility for the five added head families, FHA60AVEB99's blank physical cells, Mitsubishi range and MXZ installation constraints (including the unpinned digital-only 5/6-head matrix), and exact 2022 historical suffix expansion. This is not a full catalogue completeness claim.

Validation for this batch: `python3 tests/catalogue.test.py` (55 passed), catalogue TypeScript compile and topology tests (10 passed), and `npx tsc --noEmit -p tsconfig.json` passed. The build was not run.

## Mitsubishi audit checkpoint — incomplete

No runtime change: Daikin remains 91 / 185 and Mitsubishi 25 / 45. The source-pinned checkpoint in `terra-mitsubishi-audit-checkpoint-2026-11.md` corrects the earlier omission of already accepted HR and lists additional table references. LN Hyper Heating, RW, RZ, multisplit-only 18-class finishes, full range reconciliation, MXZ manual/port/class rules and the digital-only 5/6-head combination table remain unfinished. RZ's R290 refrigerant is rejected by the current importer. This checkpoint does not satisfy the requested Mitsubishi batch.

## Mitsubishi R32 continuation — 2026-11-18

This batch follows the Mitsubishi audit checkpoint. Daikin remains **91 / 185**; Mitsubishi changes from **25 outdoor / 45 indoor to 31 / 55**. Six LN Hyper Heating and RW outdoors, three RW indoors and seven multisplit-only EF/LN size-18 finishes are promoted. Page-column readback, field boundaries, candidate and acceptance receipts are in `terra-mitsubishi-r32-2026-11.md`. This batch is recorded in the commit containing this review.

The size-18 exact MXZ eligibility is unknown: the table says multisplit only but does not identify combinations. Current stock is unverified. RZ R290 is outside this batch and awaits separately developed support; broader Mitsubishi family reconciliation, MXZ port/class rules and the digital-only 5/6-head combination table remain unresolved. The previous Daikin unresolved items remain as documented above and in the coverage ledger. This is not a full catalogue completeness claim.

Validation: candidate schema validation passed; `python3 tests/catalogue.test.py` passed 57 tests; catalogue TypeScript compilation and 10 topology tests passed; `npx tsc --noEmit -p tsconfig.json` passed. The build was not run.
