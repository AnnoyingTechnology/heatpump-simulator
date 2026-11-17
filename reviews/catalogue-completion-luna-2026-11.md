# Luna catalogue completion checkpoint — 2026-11

## Result

The requested exact-reference catalogue completion is **not complete**. The isolated branch contains the verified data and review batches listed below, plus source-backed unresolved family accounting. No commit was created: every `git add`/`git commit` attempt failed because Git could not create `index.lock` at `/home/julien/Documents/Scripts/Agent/heatpump-simulator/.git/worktrees/hp-catalogue/index.lock` (`Read-only file system`). The workspace branch is `catalogue-luna`; nothing was pushed or deployed.

## Verified batches and profile counts

| Batch | Daikin outdoor / indoor before → after | Mitsubishi Electric outdoor / indoor before → after | Result |
|---|---:|---:|---|
| Initial isolated runtime baseline | 84 / 150 | 25 / 45 | Prior accepted records; no new commit in this run. |
| Perfera floor / duct published classes | 84/150 → 84/157 | 25/45 → 25/45 | Seven exact class records with source-listed RXM class partners. Candidate, independent review, receipt and source acceptance checks staged. |
| Nepura FTXTP-A p.349 classes | 84/157 → 86/159 | 25/45 → 25/45 | Four class records for sizes 25/35 and exact class-level RXTP partners. |
| Nepura FTXTA-D exact refs | 86/159 → 86/163 | 25/45 → 25/45 | Four exact France indoor refs with RXTA30C2V1B partner evidence; shared p.345 physical cells remain marked preliminary. |
| Sensira 3MXF-A9 | 86/163 → 88/163 | 25/45 → 25/45 | Two exact outdoor refs with typed port/class/reducer rules and documented unknown minimum count and full-SKU eligibility. |
| Sensira 2MXF-A | 88/163 → 90/163 | 25/45 → 25/45 | Two exact outdoor refs with typed port/class/reducer rules, 6.0/8.5 kW class caps and unknown minimum count/broad eligibility. |
| Siesta ATXP-N9 exact pairs | 90/163 → 90/163 | 25/45 → 25/45 | ATXP20/25/35N5V1B9 now list only ARXP20/25/35N5V1B9 in source-pinned runtime metadata. |
| ARXM50 source investigation | 90/163 → 90/163 | 25/45 → 25/45 | Exact product table and current guide reviewed; two ambiguous endpoints remain null. |
| Daikin 2022 historical inventory | 90/163 → 90/163 | 25/45 → 25/45 | 2022 family/page inventory and out-of-scope hydronic exclusion recorded; full historical suffix inventory remains unresolved. |
| Mitsubishi current-range checkpoint | 90/163 → 90/163 | 25/45 → 25/45 | Current 2026/27 France residential lines and named MXZ models recorded; full exact-reference reconciliation remains open. |

Commit subjects attempted or prepared: `Add reviewed Daikin 2MXF multisplit catalogue` and `Add source reviewed Siesta ATXP pairings`. Neither was committed. Earlier catalogue batches also remain uncommitted in this worktree because the same Git metadata path is read-only.

## Verification

The 2MXF batch and final aggregate state passed:

- `python3 tools/validate-catalogue.py research/catalogue/staging/luna-daikin-2mxf-a-2026.json`
- `python3 tests/catalogue.test.py` — 50 tests passed
- `npx tsc -p tests/catalogue/tsconfig.json`
- `node --test tests/catalogue/topology.test.mjs` — 10 tests passed
- Production build — passed using `npm run build -- --configLoader runner`

The brief's plain `npm run build` was attempted earlier but Vite could not write its config-loader temp file through the pre-existing read-only `node_modules` symlink. The runner config loader avoids that path and completed the production build.

## Remaining unresolved or excluded scope

- **Daikin Siesta:** ATXM20A2V1B and ATXM20A5V1B monosplit outdoor pairing remains unidentified in the reviewed exact tables. ATXP pair eligibility is resolved only for the three exact N5V1B9 pairs recorded above. Siesta multi combinations remain unresolved.
- **ARXM50A5V1B:** exact table cell `50 (1), 46 (1)` cooling maximum and `−21 (1), −15 (1)` heating minimum still point to a separate drawing that was not listed in the reviewed product-page documents. Installer guide 4PFR766272-2F gives broader group ambient limits on a different basis and cannot select either exact cell. The two runtime endpoints remain null.
- **Daikin current compatibility families:** FBA-A(9), FCAG-B, FFA-A9, FHA-A(9), and FNA-A9 are named in the ECPEN26-500 p.329 MXM class matrix. Exact 2026 model references, current product fields, and accepted source-bound partner rows are not staged. Remaining RXM class pair columns also need review. Exact eligibility for current/legacy MXM and 3MXF/2MXF port rules remains unknown where only class or connection constraints are published.
- **Daikin historical 2022:** the source-backed family/page inventory is in `reviews/daikin-2022-historical-inventory-2026.md`. Exact colour suffix, model reference and pairing reconciliation for the dated edition is incomplete; CHYHBH/EHYKOMB is explicitly excluded as hydronic.
- **Mitsubishi Electric:** the accepted inventory remains 25 outdoor / 45 indoor and is not proven exhaustive. The official 2026/27 France page names additional wall, console, cassette, ducted and multisplit lines. The 2026/27 booklet identifies MXZ-2HA40VF3, MXZ-2HA50VF3, MXZ-3HA50VF3, MXZ-2F33VF5, MXZ-2F42VF5, MXZ-2F53VF5, MXZ-3F54VF5, MXZ-3F68VF5, MXZ-4F72VF5, MXZ-4F80VF5, MXZ-2F53VFHZ3, MXZ-4F83VFHZ3, MXZ-5F102VF3 and MXZ-6F120VF3. The minimum two-head rule is published, but exact family port/reducer/capacity constraints and combinations remain unresolved; the 5/6-head combination table is digital-only and was not acquired. Exact missing model references across the broader current lines also remain to be reconciled.
- **Availability and performance:** Europe/France source scope and current availability remain unknown where marked; no performance map, compressor, exchanger, OEM nominal pair performance, or inferred pair was added.

These are unresolved items, not evidence that the covered product families are complete. The count is runtime profile count, not a current France sales count or a full manufacturer lineup claim.
