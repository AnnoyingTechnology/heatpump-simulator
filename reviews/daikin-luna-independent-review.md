# Independent review of the frozen Luna Daikin batch

Reviewed on 2026-10-11 against pinned official Daikin Europe ECPEN26-500 2026 and Daikin France technical-page snapshots. This review accepts bounded fields after the two corrections below. It does not establish a complete consumer range or an OEM simulation map.

## Findings and corrections

1. **Comfora FTXP50N9 casing:** the candidate originally assigned 295×990×263 mm. The rendered [2026 table, p.321](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/321/) merges **286×770×225 mm across FTXP20/25/35/50N9**; 295×990×263 mm applies only to FTXP60N/71N. The [France FTXP-N9 table](https://www.daikin.fr/fr_fr/products/product.table.html/FTXP-N9.html) independently confirms 286×770×225 mm for full FTXP50N5V1B9. Luna corrected only the bounded casing/source facts and candidate hash. The accepted paired identity stays **FTXP50N9 + RXP50N8** from the Europe table; a full-SKU pairing was not inferred from the separate indoor page.
2. **Ururu source pin:** accepted Ururu facts referenced Europe p.307, but the original acceptance registry omitted that snapshot. Luna added its SHA-256 to `additionalSourceSnapshots`. Its observed hash matches the pin. The hash was already in the narrative receipt; the registry now enforces it when the snapshot is present.

No unresolved scalar or pairing blocker was found in this reviewed batch after these corrections. The source-asset and coverage limitations below remain material.

## Verification

- **21 catalogue acceptance tests pass**, including the two targeted correction regressions added by Luna. The earlier frozen batch passed 19; these tests alone did not detect the original source/table error.
- Read-only `generate()` produces an exact string match to `src/equipment-data.ts`. No generator CLI, build, `dist` update or git mutation was performed by this reviewer.
- All **37 acceptance additional-source entries** exist locally and match SHA-256: 36 HTML snapshots and the dated 2022 Daikin PDF cache. Candidate hashes for all 12 accepted Luna documents match acceptance.
- **294 direct primary HTML comparisons pass**: exact full-reference table columns, casing scalars, cooling high-fan airflow conversions, operating-range values and per-head native pair headers. No scalar, pair-header or explicit archived-status mismatch was found. This automated comparison deliberately skips abbreviated Europe refs and non-table flipbook HTML; it is not an exhaustive acceptance proof on its own.
- Five remaining per-head evidence paths use flipbook prose rather than native HTML tables. They were independently checked manually: RXTM30A with FTXTM30A (p.348) and FVXTM30B (p.350); RXTM40A with FTXTM40A (p.348); RXTJ30A with FTXTJ30AW and FTXTJ30AB (p.344). Shared outdoor profiles offer alternative one-port pairings; this evidence does not permit connecting all compatible heads simultaneously.
- Manual Europe checks cover Ururu 25/35/50, Comfora 20–71 and Nepura table casing, cooling-high fan flow, exact pair columns and WB/DB range conditions. Comfora merged casing/range scopes were resolved using the rendered official table at 3× resolution, beyond the flattened HTML text. Published cooling m³/min values are converted exactly by ×60 to m³/h, then runtime profiles use ÷3600 to m³/s.
- Additional temporary negative fixtures prove that a null indoor fan-flow profile is rejected when its candidate actually supplies airflow, and that an unpublished indoor profile requires an explicit unpublished-airflow note. The existing test also rejects an absent acceptance flag. There are currently **no accepted null-flow indoor entries**; the contract prepares for a future genuinely unpublished value. `applyIndoorProfile` deletes the previous optional volumetric-flow field for a null/missing profile, allowing the existing manual mass-flow fallback.

## Source interpretation

- Europe p.321 outdoor casing is **556×740×343 mm for RXP20/25/35N9**, 610×923×367 mm for RXP50N8, and 734×954×401 mm for RXP60/71N9. The 20–35 value is also independently checked against full France SKU columns. France RXP50N5V1B9 is a different suffix from Europe RXP50N8 and was not substituted.
- Comfora p.321 cooling **−10..48 °CDB**, heating **−15..18 °CWB** and the alternate heating **−15..24 °CDB** each span all six outdoor columns. The imported heating condition correctly preserves the published WB interval; it does not mislabel it as DB.
- Ururu preserves cooling −10..43 °CDB and heating −20..18 °CWB. Nepura preserves its stated WB heating endpoints rather than replacing them with the marketing “down to −30 °C” dry-bulb wording. An operating-range interval is metadata, not a compressor map.
- Sensira FTXC 20–35 has a cooling minimum **+10 °CDB**; 50–71 has −10 °CDB. FTXF35 nominal cooling is **3.3 kW**, distinct from a Pdesign/size label. FTXF71 cooling-high airflow is **17.3 m³/min = 1,038 m³/h**.
- Emura A2/A5 finish-specific references are independently resolved from full France columns: all 15 AW9/AS9/AB options have their own exact native pair header. Current source values replace the unrelated preliminary blue 2022 table; the old preliminary status is not applied to this newly reviewed official data.
- Explicit archived France columns remain historical in candidate evidence: the 12 accepted FTXM-A wall SKUs; FTXF35/50/60; the five accepted RXF20–50 F-series full references; and FVXM35B2V1B. The FVXM table order is 25/50/archived35 and was read by full reference, not positional size assumptions. Current/legacy status is not yet exported in compact runtime data, so this batch must not be described as wholly current France availability.
- Shortened Europe technical references remain shortened wherever that is the published pair identity. Cross-referencing a full SKU for casing does not establish an unprinted suffix-specific compatibility. Neither France stock availability nor a complete full-SKU expansion follows merely from Europe catalogue presence.
- Published airflow and casing enter the existing generic R32 model. All reviewed Daikin outdoor flow values remain unknown/null and use explicit editable generic/manual airflow. Published capacity is informational where accepted. No OEM displacement, efficiency, UA, fan watts, factory charge or minimum electrical operating floor was invented. Cooling-high fan flow reused in heating remains an explicit assumption.

## Release provenance and remaining coverage

The complete per-path staging manifest and hashes are in [`daikin-luna-independent-review.json`](daikin-luna-independent-review.json). Stage the **12 accepted Luna candidate files**, corrected acceptance registry, importer/data/tests, coverage and provenance documents, plus the **36 acceptance-pinned HTML snapshots**. Only the listed accepted assets belong to this release; unaccepted Qwen staging and the subsequent RXF60/71 follow-up are excluded from this review.

The ignored cache requires targeted force-add for these ten EU HTML snapshots: **307, 320, 321, 322, 323, 325, 327, 344, 348, 350** under `research/catalogue/source-cache/daikin-eu-2026-split-page-N.html`. The other 26 accepted HTML snapshots are under `research/sources/`. The existing primary-PDF caches are optional research inputs to regeneration, not browser dependencies. The importer checks source hashes **only if local snapshot files exist**; a clean checkout without HTML provenance could regenerate from hash-pinned candidate excerpts while skipping primary-source hash checks. Keeping these bounded HTML assets in git is therefore needed for a reproducible independent audit. No broad `git add` of other research output is justified by this receipt.

Generated counts remain **36 Daikin outdoor /79 indoor**, plus **25 Mitsubishi Electric outdoor /45 indoor** catalogue profiles. Owner and generic presets are separate. Only 32 outdoor/63 indoor Daikin profiles come from this new Luna batch; four outdoor/16 indoor Stylish profiles were accepted previously from dated 2022 sources.

The [coverage ledger](daikin-luna-coverage.md) correctly states partial coverage. Remaining gaps include current complete Stylish colours/size refs, unpaired Perfera sizes and A8 alternatives, RXF60/71 exact pairs, other Nepura variants, Siesta, remaining ducted/cassette/ceiling heads and researched-but-unaccepted 2–5MXM/multi combinations. The acceptance boundary currently enforces monosplit one-port profiles; multiport reference import still needs a deliberate compatibility model. The ledger's prose that all FTXF heads use generic outdoor is outdated: **FTXF20–50 have accepted exact RXF pairs; FTXF60/71 remain generic**. FDXM outdoor profiles remain generic pending exact accepted matching outdoor references.

## Frozen artifact hashes

- `research/catalogue/equipment-acceptance.json`: `3731c83439bab0719f35667950ee0d635fa29773b714c8b1cfabfdacafc66c78`
- `tools/import-equipment.py`: `08acf2241c2ce93793db5deff60fd51197eea04ff8c504b15f0b4ebbf076ec2f`
- `tests/catalogue.test.py`: `46658134f2820a6b27c0982eaa6c5062b6012371d61bd3257a405d22a20315a5`
- `src/equipment.ts`: `91b9c6d89e35f2d2780121d68550110a9da506d3ad6a893adfc8a0a89992875e`
- `src/equipment-data.ts`: `6baef625654f165801eb0bb7ca46638557a2ddc72044cef9713d3275e297da19`
