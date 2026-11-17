# Mitsubishi Electric residential split / multisplit coverage (Luna)

**Checked:** 2026-11-17. **Status: partial; current-lineup audit still open.** Scope is Mitsubishi Electric France/Europe consumer air-to-air equipment. Mitsubishi Heavy Industries, VRF/VRV, hydronic equipment and non-residential products are out of scope.

## Runtime coverage after Daikin FTXTP batch

The runtime importer contains **25 Mitsubishi Electric outdoor and 45 indoor profiles**. These records remain unchanged in this batch. The accepted set is grounded in the pinned French 2026–2027 air-air catalogue and exact primary table review in `research/catalogue/equipment-acceptance.json`; the candidate/acceptance ledger does not yet establish that this set exhausts the current France/Europe range.

The accepted inventory includes source-reviewed MSZ/MUZ monosplit pairs across AP, AY, EF, FT and LN families, with explicit finish variants where the source identifies them. Exact source table pairings and published casing/airflow/range fields are retained by the acceptance list. MSZ-EF18 and MSZ-LN18 are excluded from monosplit acceptance because the source identifies them as multisplit-only. A current 2026/27 France range page also names HR, AY, AP, EF, FT, LN, RW, RZ, console, cassette and ducted product lines; this broader list has not been reconciled by exact reference against the 25/45 accepted inventory.

## Remaining work

- Re-check the accepted 25 outdoor / 45 indoor identities against current Mitsubishi Electric France and Europe consumer range indexes, recording current, discontinued, or unresolved status per named reference.
- Find missing current wall families and exact MUZ monosplit partners from primary product pages, technical documents and combination tables.
- Research the 2026/27 MXZ families 2HA40VF3, 2HA50VF3, 3HA50VF3, 2F33VF5, 2F42VF5, 2F53VF5, 3F54VF5, 3F68VF5, 4F72VF5, 4F80VF5, 2F53VFHZ3, 4F83VFHZ3, 5F102VF3 and 6F120VF3 against the current accepted set. The published France booklet confirms two heads minimum and says combination matrices for 5/6-post models are digital-only; exact family-specific port/reducer/capacity rules and current exact full-SKU eligibility are unresolved.
- Account for named colour variants and market-specific suffix differences separately. Do not treat a family title or matching capacity digits as a pairing.

There are no new Mitsubishi Electric records in the FTXTP batch; count remains **25 outdoor / 45 indoor**. The current product-range sources and exact named MXZ families are pinned in `provenance/luna-mitsubishi-current-range-2026-source-receipt.md`; every remaining exact identity must be marked researched, unresolved or excluded before a completeness claim.

Daikin floor/duct class batch (2026-11-17) makes no Mitsubishi Electric data change. Runtime coverage remains **25 outdoor / 45 indoor**; current MXZ multisplit and current range-completeness checks remain open.

Daikin exact FTXTA-D batch (2026-11-17) makes no Mitsubishi Electric data change. Runtime coverage remains **25 outdoor / 45 indoor**; current MXZ multisplit and current range-completeness checks remain open.

Daikin Sensira 3MXF batch (2026-11-17) makes no Mitsubishi Electric data change. Runtime coverage remains **25 outdoor / 45 indoor**; current MXZ multisplit and current range-completeness checks remain open.

Daikin Sensira 2MXF batch (2026-11-17) makes no Mitsubishi Electric data change. Runtime coverage remains **25 outdoor / 45 indoor**; current MXZ multisplit and current range-completeness checks remain open.

Daikin Siesta ATXP-N9 pairing review (2026-11-17) makes no Mitsubishi Electric data change. Runtime coverage remains **25 outdoor / 45 indoor**; current MXZ multisplit and current range-completeness checks remain open.

Daikin ARXM50 range investigation (2026-11-17) makes no Mitsubishi Electric data change. Runtime coverage remains **25 outdoor / 45 indoor**; current MXZ multisplit and current range-completeness checks remain open.

## Current official family checkpoint

The 2026/27 France residential range snapshot is pinned in `provenance/luna-mitsubishi-current-range-2026-source-receipt.md`. It names these consumer product lines; the 25 outdoor / 45 indoor accepted set has not been reconciled line-by-line against them, so identities beyond the reviewed set remain unresolved until exact reference and pairing fields are checked:

- Wall mounted: MSZ-HR-VFK2/VF2/VF; MSZ-AY-VGK2/VGK; MSZ-AP-VG2/VG; MSZ-EF-VGK2/VGK; MSZ-LN-VG3/VG2; MSZ-FT-VGK2/VGK; MSZ-LN-VGHZ3/VGHZ2; MSZ-RW-VG2/VG; MSZ-RZ-VU.
- Console: MFZ-KT-VGK/VG, SFZ-M-VA2/VA, MFZ-KW-VGK/VG.
- Ducted: SEZ-M-DA3/DA2 and PEAD-M-JA3/JA2.
- Cassette: MLZ-KP-VG and SLZ-M-FA3/FA2.
- Multisplit: MXZ-H VF2/VF3, MXZ-F VF2/VF3/VF4/VF5/VFHZ2/VFHZ3, plus PXZ-F VG2. The 2026/27 combination booklet enumerates exact current 2–4-post model references and states that 5/6-post tables are digital-only; that digital-only table has not been acquired. Current family and exact partner completeness therefore remain open.

Commercial/product-professional PEA/PKA/PCA/PLA/PSA/PSA and Mini-DRV product lines are outside this consumer air-to-air catalogue scope; the category listing is not used as evidence to import them.

Terra Daikin head source checkpoint 2026-11-18: no Mitsubishi change; runtime remains 25 outdoor / 45 indoor. The current range and MXZ reconciliation remain open.
