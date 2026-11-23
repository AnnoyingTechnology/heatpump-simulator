# Terra catalogue continuation — final review, 2026-11-18

## Summary

All five brief items were worked in bounded batches. Each was reviewed at root (Claude), merged and published from `main`.

| Item | Batch commit | Root merge | Outcome |
| --- | --- | --- | --- |
| 1. Daikin FFA/FNA heads | `97c1e10` | `787db42` | 8 exact indoor physical profiles; MXM eligibility unknown |
| 1. Daikin FBA/FCAG/FHA heads | `cf2cdc6` | `7eb94d1` | 14 exact indoor physical profiles; FHA60AVEB99 cells blank |
| 2–3. RXM columns, Siesta, ARXM50 | `dbba209` | `d6b8069` | all 14 class and 33 exact RXM columns paired; RXM50A5V1B8 added; ATXM20/ATXF-F/ATXP-N9/ARXM50 unresolved |
| 4. Mitsubishi audit | `10c4f62` | `1675d23` | research checkpoint, no runtime change |
| 4. Mitsubishi R32 LN/RW/size 18 | `aff975e` | `fd75ac0` | 6 outdoor, 10 indoor |
| 4. Mitsubishi RZ (R290) | `4295704`, `6db13c9` | `34bb47e`, `631a890` | 3 R290 pairs |
| 4. Mitsubishi MXZ 2–4 heads | `bb47fd1`, `f81b837` | `e19193c`, `c4fa60d` | 12 multisplit outdoors with typed installation (head counts) |
| 4. Mitsubishi residential reconciliation | `5833ce6` | `1452772` | 13 outdoor, 28 indoor exact table pairs |
| 5. Daikin 2022 historical suffixes | this commit | — | no expansion possible: 159 abbreviated references unresolved |

Counts (runtime profiles, excluding owner and generic choices):

| Manufacturer | Before Terra | After Terra |
| --- | --- | --- |
| Daikin outdoor / indoor | 90 / 163 | 91 / 185 |
| Mitsubishi Electric outdoor / indoor | 25 / 45 | 59 / 86 |

Unresolved references with reasons are listed under "Other named unresolved references and boundaries" at the end of this file, in the 2022 inventory, and in the two coverage ledgers. The sections below are the per-batch log as written at each checkpoint; statements there that an item "has not been researched" were true at that checkpoint and are superseded by later sections.

## Batch log

### Initial checkpoint

This continuation is not complete. The requested visual reconciliation and later research batches have not been performed; their presence below is not a claim that they were researched or blocked by a source.

- `91d4b76` added the brief; `c1741f5` staged FFA/FNA candidates; `21a82d5` recorded the preceding checkpoint.
- `97c1e10` accepted the eight exact FFA/FNA indoor physical profiles. The FNA table labels 720 mm as including installation legs; 620 mm is used for casing without legs. No MXM compatibility was added. See `terra-daikin-heads-2026-11.md` and its source receipt.
- Runtime counts changed from Daikin 90 outdoor / 163 indoor to 90 / 171; Mitsubishi remains 25 / 45. France availability and exact full-SKU eligibility for the new heads remain unknown.
- Catalogue tests (52), topology tests (10), and both TypeScript checks passed after this batch; the build was intentionally skipped.

The p.329 pinned HTML loses cell positions. No ECPEN26-500 PDF snapshot is present in this workspace; the visual matrix check has not been completed, and no class connectivity is asserted. Finding an equivalent official position-preserving snapshot remains necessary. FBA-A(9), FCAG-B, FHA-A(9), remaining RXM columns, ATXM20, Siesta multisplit, ARXM50 drawing, Mitsubishi inventory and MXZ constraints, and 2022 historical suffixes have not been researched in this continuation. Their previous uncertainties remain in the coverage ledgers. This is a work checkpoint, not the requested final review.

### Bounded FBA/FCAG/FHA continuation — 2026-11-18

This batch adds 14 exact indoor physical profiles: three FBA, three FCAG and eight FHA. It follows the eight FFA/FNA profiles already present on the reset base `787db42`. Daikin runtime counts move from 90 outdoor / 171 indoor to 90 / 185; Mitsubishi remains 25 / 45. Candidate files, independent acceptance JSON and SHA-256 source pins are detailed in `terra-daikin-fba-fcag-fha-2026-11.md` and `../provenance/terra-daikin-heads-source-receipt.md`. The batch commit contains this review and its evidence.

FHA60AVEB99 remains unresolved: the exact heading exists but its dimension and airflow cells are blank. France availability and current sales status of all 14 added heads are unknown. The FCAG unit dimensions exclude decorative panels. The larger commercial classes in these tables were not part of the residential 35/50/60 batch. No exact MXM pair was located in the official sources searched; the review records the URLs and limitations. All five head families remain unpaired. The 2026 flipbook now returns 404, and the pinned p.329 HTML loses matrix positions, so no matrix cell has been reconstructed. FFA/FNA installation-leg and panel boundaries remain as recorded above.

The other earlier outstanding items are unchanged: remaining RXM pair columns, ATXM20 monosplit and Siesta multisplit eligibility, the ARXM50 range drawing, Mitsubishi range reconciliation and MXZ constraints/digital 5/6-head table, and 2022 Daikin historical suffix expansion. See the two coverage ledgers for reference-level scope and reasons. VRV/VRF, hydronic equipment and Mitsubishi Heavy Industries remain excluded. This bounded checkpoint is not a full catalogue completion claim.

Validation for this batch: `python3 tests/catalogue.test.py` (53 passed); catalogue TypeScript compile and topology tests (10 passed); `npx tsc --noEmit -p tsconfig.json` passed. The requested build was not run.


### Bounded RXM and Siesta continuation — 2026-11-18

The batch in this commit follows `cf2cdc6` (merged as `7eb94d1`). Daikin runtime changes from **90 outdoor / 185 indoor to 91 / 185**; Mitsubishi stays **25 / 45**. The source-pinned audit accounts for all 14 published RXM class pair columns and all 33 exact A8/A9 table columns, adding 24 exact pairings including the separately sourced RXM50A5V1B8 profile. No reviewed pair column remains unpaired. Full per-column source locators and evidence boundaries are in [the batch review](terra-rxm-siesta-2026-11.md); hashes and source URLs are in [the receipt](../provenance/terra-rxm-siesta-source-receipt.md).

Uncertainties: exact FDXM60 and RXM20/42/60/71 suffix pairings lack exact columns; class pairings cannot certify them. Exact ATXM20 monosplit eligibility remains unknown although p.335 labels its class multi-only. The ATXM/2AMXM table establishes 28 particular two-head configurations, not arbitrary pairings; AMXM installation constraints remain unreviewed. ATXF-F and ATXP-N9 multisplit exact eligibility remain unresolved: the retrieved ATXF-G table has different references, and the attempted ATXP table pages contained no combination columns. The PDF's rendered p.28 is an installer ambient table with an indoor-manual caveat, not the footnoted drawing; ARXM50 cooling maximum and heating minimum remain null. RXM50A5V1B8 has its own footnoted alternative endpoints unresolved. Europe listing does not establish current sales or France availability.

Remaining later work: exact MXM eligibility for the five added head families, FHA60AVEB99's blank physical cells, Mitsubishi range and MXZ installation constraints (including the unpinned digital-only 5/6-head matrix), and exact 2022 historical suffix expansion. This is not a full catalogue completeness claim.

Validation for this batch: `python3 tests/catalogue.test.py` (55 passed), catalogue TypeScript compile and topology tests (10 passed), and `npx tsc --noEmit -p tsconfig.json` passed. The build was not run.

### Mitsubishi audit checkpoint — incomplete

No runtime change: Daikin remains 91 / 185 and Mitsubishi 25 / 45. The source-pinned checkpoint in `terra-mitsubishi-audit-checkpoint-2026-11.md` corrects the earlier omission of already accepted HR and lists additional table references. LN Hyper Heating, RW, RZ, multisplit-only 18-class finishes, full range reconciliation, MXZ manual/port/class rules and the digital-only 5/6-head combination table remain unfinished. RZ's R290 refrigerant is rejected by the current importer. This checkpoint does not satisfy the requested Mitsubishi batch.

### Mitsubishi R32 continuation — 2026-11-18

This batch follows the Mitsubishi audit checkpoint. Daikin remains **91 / 185**; Mitsubishi changes from **25 outdoor / 45 indoor to 31 / 55**. Six LN Hyper Heating and RW outdoors, three RW indoors and seven multisplit-only EF/LN size-18 finishes are promoted. Page-column readback, field boundaries, candidate and acceptance receipts are in `terra-mitsubishi-r32-2026-11.md`. This batch is recorded in the commit containing this review.

The size-18 exact MXZ eligibility is unknown: the table says multisplit only but does not identify combinations. Current stock is unverified. RZ R290 is outside this batch and awaits separately developed support; broader Mitsubishi family reconciliation, MXZ port/class rules and the digital-only 5/6-head combination table remain unresolved. The previous Daikin unresolved items remain as documented above and in the coverage ledger. This is not a full catalogue completeness claim.

Validation: candidate schema validation passed; `python3 tests/catalogue.test.py` passed 57 tests; catalogue TypeScript compilation and 10 topology tests passed; `npx tsc --noEmit -p tsconfig.json` passed. The build was not run.

### RZ and MXZ research — 2026-11-18

No profiles have been promoted in this work: counts remain Daikin **91 / 185** and Mitsubishi **31 / 55**. Six RZ and twelve MXZ candidates are staged from the pinned catalogue, with per-field excerpts; the 5/6-head digital-only combinations remain unresolved. The MXZ booklet class combinations still need transcription and independent review. The existing topology validator assumes Daikin and describes missing rules as legacy limitations; the published 3 A current-sum restriction is not representable in its current shape. No independent acceptance or importer integration was completed. See `terra-mitsubishi-rz-mxz-2026-11.md` and the source receipt for detailed uncertainty and source pins. Earlier R290 importer limitation is superseded by the current importer support.

### MXZ continuation — physical readback, import blocked

After the RZ import, counts are Daikin **91 / 185** and Mitsubishi **34 / 58**, unchanged by this continuation. The twelve staged MXZ 2–4-head models have a source-pinned independent physical and head-count readback in `terra-mitsubishi-mxz-physical-readback-2026.json`. Their model-specific booklet class combinations remain unreviewed. The required `topology: multisplit` invokes an importer that only accepts Daikin-format port/class/reducer rules and rejects the MXZ candidate; importer changes were explicitly excluded from this run. The requested acceptance and import therefore remain incomplete. See `terra-mitsubishi-rz-mxz-2026-11.md` for the reproduced error, why the 2MXF shortcut is unsuitable, the unrepresentable 3 A rule, and the unpinned 5/6-head combinations.

Validation of the unchanged runtime and partial readback: importer succeeded; catalogue tests passed (61), topology tests passed (10), and both TypeScript checks passed. The build was not run. This review and its accompanying commit record partial work, not completion of the requested MXZ batch.


### MXZ acceptance — 2026-11-18

The preceding import blocker is resolved by the explicit installation path. Twelve source-reviewed R32 MXZ 2–4-head outdoors were accepted and imported, changing Mitsubishi runtime coverage from **34 / 58 to 46 / 58**; Daikin remains **91 / 185**. The acceptance receipt binds the candidate, source snapshots and independent physical readback. It records the published two-head minimum and each model's maximum, with exact eligibility, named port rules, general class-sum limits and total charge unknown. The source's 3 A maximum sum of indoor maximum currents has no field in the typed installation, and booklet combination lists require separate independent transcription. HA's MSZ-HR VFK2 restriction does not establish arbitrary combinations. The digital-only 5/6-head combination tables are unpinned; full Mitsubishi range reconciliation remains open. Earlier Daikin uncertainties and exclusions remain in the coverage ledgers. Current stock is unverified.

Validation: catalogue acceptance tests, topology tests and both required TypeScript checks; no build. This batch's commit is identified by its `Accept reviewed Mitsubishi MXZ multisplit outdoors` subject.


### Mitsubishi residential reconciliation — 2026-11-18

The batch recorded by commit subject `Reconcile Mitsubishi residential table references` promotes 13 outdoor and 28 indoor exact references with physical fields and source-column pairings. Mitsubishi runtime moves from **46 outdoor / 58 indoor to 59 / 86**; Daikin remains **91 / 185**. The reference-by-reference ledger includes previous accepted identities, newly accepted identities, each unresolved named reference and its reason. The staging JSON and independent receipt pin the rendered tables. PDF pages 151 and 183 establish the three PUZ-ZM pairs in each table; p.157 adds PEAD size 71.

Uncertainties: `SLZ-M15FA3` and `MLZ-KY20VG` are caption-only without corresponding columns; `SFZ-M30VA2` is a caption/table conflict (the table explicitly says 35). The PUZ cooling −15 °C alternative is conditional on a protection guide; the default −5 °C is retained. Console recessed depth, SFZ feet, and cassette panels are excluded from casing. Current stock is unverified, and additional commercial-sized PEAD and PUZ variants are outside this batch. MXZ-5F102VF3 and MXZ-6F120VF3 lack pinned digital combination tables; other MXZ exact combinations and the 3 A restriction remain unresolved. Earlier Daikin and historical gaps remain in the respective ledgers. No overall catalogue completeness is claimed.

Validation: schema, importer, catalogue acceptance tests, topology tests, and both TypeScript checks; build omitted as instructed.

### 2022 historical reconciliation — 2026-11-18

The 2022 source review adds no profiles: Daikin remains 91 outdoor / 185 indoor, Mitsubishi remains 59 / 86. The 173 individual printed page/reference rows and 159 distinct abbreviated references are all unresolved for exact factory-suffix expansion; each row and its reason are in [the 2022 inventory](daikin-2022-historical-inventory-2026.md). The hydronic family is excluded. Specific uncertainties include the p.50 R/R9 header mismatch, p.41 blank airflow and preliminary cells, p.45 preliminary cells, and exact connectivity of the p.52 class matrix. The source establishes no 2026 availability. See [the batch review](terra-daikin-2022-historical-2026-11.md). No exact profile or accepted value changed.

## Individual unresolved 2022 references

- `FTXZ25N`: p. 40: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXZ35N`: p. 40: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXZ50N`: p. 40: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXZ25N`: p. 40: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXZ35N`: p. 40: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXZ50N`: p. 40: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXJ20AW`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ20AS`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ20AB`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ25AW`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ25AS`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ25AB`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ35AW`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ35AS`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ35AB`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ42AW`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ42AS`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ42AB`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ50AW`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ50AS`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXJ50AB`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `RXJ20A`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `RXJ25A`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `RXJ35A`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `RXJ42A`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `RXJ50A`: p. 41: Factory suffix is not printed; blue cells are preliminary and indoor airflow is blank.
- `FTXA20AW`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA20AS`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA20AT`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA20AB`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA25AW`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA25AS`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA25AT`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA25AB`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA35AW`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA35AS`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA35AT`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA35AB`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA42AW`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA42AS`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA42AT`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA42AB`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA50AW`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA50AS`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA50AT`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXA50AB`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `CTXA15AW`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `CTXA15AS`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `CTXA15AT`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `CTXA15AB`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXA20A9`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXA25A9`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXA35A9`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXA42B`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXA50B`: p. 42: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `CTXM15R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM20R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM25R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM35R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM42R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM50R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM60R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXM71R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXM20R9`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXM25R9`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 49: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `RXM35R9`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 49: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `RXM42R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXM50R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 49: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `RXM60R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `RXM71R`: p. 43: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXP20M9`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXP25M9`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXP35M9`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXP50M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXP60M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXP71M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXP20M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXP25M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXP35M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXP50M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXP60M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXP71M`: p. 44: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXF20D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXF25D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXF35D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXF42D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXF50D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXF60D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXF71D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF20D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF25D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF35D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF42D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF50D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF60D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `RXF71D`: p. 45: Factory suffix is not printed; blue cells are preliminary.
- `FTXC20C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXC25C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXC35C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXC50C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXC60C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXC71C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXC20C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXC25C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXC35C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXC50C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXC60C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXC71C`: p. 46: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXQ25A`: p. 47: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXQ35A`: p. 47: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXQ25A`: p. 47: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXQ35A`: p. 47: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `CVXM20A`: p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FVXM25A`: p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 59: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FVXM35A`: p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 59: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FVXM50A`: p. 48: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FVXM25F`: p. 49: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FVXM35F`: p. 49: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FVXM50F`: p. 49: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FDXM25F9`: p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `FDXM35F9`: p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `FDXM50F9`: p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `FDXM60F9`: p. 50: Factory suffix is not printed; some cells are shared across columns and p.50 pair header abbreviates the 25/35 outdoor suffix although the outdoor row says R9.
- `2MXM40A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `2MXM50A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `2MXM68A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `3MXM40A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `3MXM52A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `3MXM68A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `4MXM68A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `4MXM80A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `5MXM90A`: p. 52: Factory suffix is not printed; the class matrix alone cannot certify exact full-SKU combinations.
- `FBA35A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FBA50A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FBA60A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FCAG35B`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FCAG50B`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FFA25A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FFA35A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FFA50A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FFA60A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FHA35A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FHA50A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FHA60A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FNA25A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FNA35A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FNA50A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FNA60A9`: p. 52: Matrix prints class only, with no factory suffix or physical specification column; exact full-SKU connectivity is unresolved.
- `FTXTA30BB`: p. 56: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXTA30BW`: p. 56: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXTA30B`: p. 56: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXTM30R`: p. 57: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXTM40R`: p. 57: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXTM30R`: p. 57: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXTM40R`: p. 57: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXTP25M`: p. 58: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `FTXTP35M`: p. 58: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXTP25R`: p. 58: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 59: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.
- `RXTP35R`: p. 58: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.; p. 59: Factory suffix is not printed in the 2022 table; exact SKU and exact-SKU pair cannot be established.

## Other named unresolved references and boundaries

- `FHA60AVEB99`: manufacturer physical table has blank dimensions and airflow.
- `FDXM60` exact RXM pairing and `RXM20/42/60/71` full suffix pairings: no exact source columns.
- `ATXM20`: class shown multi-only; exact monosplit eligibility not established. `ATXF-F` and `ATXP-N9`: exact multisplit eligibility not established by the retrieved tables. `ARXM50A5V1B` and `RXM50A5V1B8`: source footnotes point to ambiguous alternative operating endpoints.
- `SLZ-M15FA3`, `MLZ-KY20VG`: captions without corresponding specification columns. `SFZ-M30VA2`: caption says 30 while table says 35.
- `MXZ-5F102VF3`, `MXZ-6F120VF3`: digital-only combination tables were not pinned; their physical profiles and typed installation were not independently accepted. Other MXZ exact combination and port rules and the 3 A restriction remain unresolved.
- The five residential-compatible Daikin head families' MXM class positions and exact eligibility remain unresolved because the 2026 pinned HTML loses position and the flipbook was unavailable. The 2022 class matrix does not establish 2026 exact-SKU compatibility. Sales and France availability remain unverified; all other source-specific uncertainties are preserved in the linked batch reviews above.

Validation for the 2022 batch: importer, 65 Python catalogue tests, catalogue TypeScript compile with 12 topology tests, and the project TypeScript no-emit check passed. Terra could not commit from its sandbox; root committed this batch after review.

## Follow-up (2026-11-23)

Panasonic (France 2026) and Mitsubishi Heavy Industries (Europe 2026) were added in a separate batch. Daikin and Mitsubishi Electric counts are unchanged; the runtime total is now 226 outdoor / 391 indoor. See `reviews/catalogue-panasonic-mhi-2026-11.md`.
