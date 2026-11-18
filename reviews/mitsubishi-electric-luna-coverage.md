# Mitsubishi Electric residential split / multisplit coverage (Luna)

**Checked:** 2026-11-17. **Status: partial; reviewed references are listed below and outstanding evidence is explicit.** Scope is Mitsubishi Electric France/Europe consumer air-to-air equipment. Mitsubishi Heavy Industries, VRF/VRV, hydronic equipment and non-residential products are out of scope.

## Runtime coverage and history

The runtime importer now contains **59 Mitsubishi Electric outdoor and 86 indoor profiles** after the residential reconciliation. The accepted set is grounded in the pinned French 2026–2027 air-air catalogue and exact primary table review in `research/catalogue/equipment-acceptance.json`; the candidate/acceptance ledger does not yet establish that this set exhausts the current France/Europe range.

The accepted inventory includes source-reviewed MSZ/MUZ monosplit pairs across AP, AY, EF, FT and LN families, with explicit finish variants where the source identifies them. Exact source table pairings and published casing/airflow/range fields are retained by the acceptance list. MSZ-EF18 and MSZ-LN18 finish profiles are accepted as indoor-only because the source identifies them as multisplit-only. A current 2026/27 France range page also names HR, AY, AP, EF, FT, LN, RW, RZ, console, cassette and ducted product lines; this broader list has not been fully reconciled by exact reference against the accepted inventory.

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

Terra FFA/FNA physical-field follow-up: Mitsubishi remains 25 outdoor / 45 indoor; range and MXZ reconciliation remain open. Daikin now has 90 outdoor / 171 indoor.

Terra FBA/FCAG/FHA batch 2026-11-18: no Mitsubishi changes; runtime remains 25 outdoor / 45 indoor. Daikin runtime is 90 outdoor / 185 indoor. Mitsubishi range and MXZ reconciliation remain open.

Terra RXM and Siesta batch 2026-11-18: no Mitsubishi changes; runtime remains **25 outdoor / 45 indoor**. Daikin is now **91 / 185**. Mitsubishi current range reconciliation and MXZ constraints, including the digital-only 5/6-head table, remain open.

Terra audit checkpoint 2026-11-18: the 25 / 45 runtime inventory already includes six HR pairs. The exact omitted LN Hyper Heating outdoors, RW and RZ table identities and multisplit-only 18-class leads are listed in `terra-mitsubishi-audit-checkpoint-2026-11.md`. No new runtime profiles or MXZ rules have been accepted. Full range reconciliation and official manual review remain unfinished; the 5/6-head digital combination table is still unpinned. RZ uses R290, outside the importer's present R32-only boundary.

Terra R32 batch 2026-11-18: six LN Hyper Heating and RW outdoor references and ten indoor profiles (three RW, three EF18 finishes and four LN18 finishes) are accepted. The size-column pairings and fields are detailed in `terra-mitsubishi-r32-2026-11.md`; the 18s have no monosplit pair. Runtime is **31 outdoor / 55 indoor**. RZ R290 remains for separate importer support; range reconciliation, MXZ manual rules and the digital-only 5/6-head matrix remain unresolved.

RZ/MXZ research 2026-11-18: runtime remains **31 outdoor / 55 indoor**. Six R290 RZ indoor/outdoor candidates and twelve 2–4-head R32 MXZ candidates are staged but not independently accepted or imported. The primary row findings, 3 A current-sum restriction, validator limitations, and unresolved 5/6-head digital-only combinations are recorded in `terra-mitsubishi-rz-mxz-2026-11.md`. Class combinations in the booklet still need transcription and source review. Earlier statements that R290 remains unsupported are historical; the importer now recognizes R290.

Terra RZ acceptance 2026-11-18: three MSZ-RZ indoor and three MUZ-RZ R290 outdoor references are independently reviewed against PDF p.86 and imported, with exact same-column monosplit pairs. Runtime is **34 outdoor / 58 indoor**. Current stock remains unknown. The twelve staged MXZ 2–4-head candidates remain unaccepted; their combination tables, installation constraints and the digital-only 5/6-head combinations remain unresolved. Full range reconciliation remains open.

MXZ physical readback 2026-11-18: all twelve 2–4-head staged physical columns and head/connection counts have been independently checked against the pinned rendered catalogue pages. Runtime remains **34 outdoor / 58 indoor**. Booklet class combinations still require independent review. The existing multisplit importer rejects the Mitsubishi candidates because it requires Daikin-specific port/class/reducer records; see `terra-mitsubishi-rz-mxz-2026-11.md`. The 5/6-head class combinations remain unpinned. No MXZ has been accepted or imported.


Terra MXZ acceptance 2026-11-18: twelve 2–4-head R32 outdoors are accepted and imported from the physical readback; runtime is **46 outdoor / 58 indoor**. Minimum two and model-specific maximum head counts are typed. Named port rules, class-sum limits and exact eligibility remain unknown; booklet combinations have not been independently transcribed and the 3 A indoor-current-sum rule cannot be expressed in the installation shape. The HA family restriction and digital-only 5/6-head tables remain as documented in `terra-mitsubishi-rz-mxz-2026-11.md`. Full range reconciliation remains open.

## Residential reference reconciliation — 2026-11-18

The table is the reference-by-reference reconciliation of the prior work-in-progress and the source-pinned residential columns. Each row is an exact runtime identity; “earlier” refers to the existing acceptance receipt, and “new” to the readback in [this receipt](terra-mitsubishi-residential-independent-acceptance-2026.json). Pairs are only those accepted in the outdoor column; absence is not proof of incompatibility. R32 and R290 stock is unverified. This is not an assertion that the entire catalogue has been inventoried.

| Reference | Status and source-supported partners |
|---|---|
| `MUZ-AP60VG2` | Accepted (earlier); paired with `MSZ-AP60VG2` |
| `MUZ-AP71VG3` | Accepted (earlier); paired with `MSZ-AP71VG2` |
| `MUZ-AY15VG2` | Accepted (earlier); paired with `MSZ-AY15VGK2` |
| `MUZ-AY20VG2` | Accepted (earlier); paired with `MSZ-AY20VGK2` |
| `MUZ-AY25VG2` | Accepted (earlier); paired with `MSZ-AY25VGK2` |
| `MUZ-AY35VG2` | Accepted (earlier); paired with `MSZ-AY35VGK2` |
| `MUZ-AY42VG2` | Accepted (earlier); paired with `MSZ-AY42VGK2` |
| `MUZ-AY50VG2` | Accepted (earlier); paired with `MSZ-AY50VGK2` |
| `MUZ-EF25VG2` | Accepted (earlier); paired with `MSZ-EF25VGK2B`, `MSZ-EF25VGK2W`, `MSZ-EF25VGK2S` |
| `MUZ-EF35VG2` | Accepted (earlier); paired with `MSZ-EF35VGK2B`, `MSZ-EF35VGK2W`, `MSZ-EF35VGK2S` |
| `MUZ-EF42VG2` | Accepted (earlier); paired with `MSZ-EF42VGK2B`, `MSZ-EF42VGK2W`, `MSZ-EF42VGK2S` |
| `MUZ-EF50VG2` | Accepted (earlier); paired with `MSZ-EF50VGK2B`, `MSZ-EF50VGK2W`, `MSZ-EF50VGK2S` |
| `MUZ-HR25VF2` | Accepted (earlier); paired with `MSZ-HR25VFK2` |
| `MUZ-HR35VF2` | Accepted (earlier); paired with `MSZ-HR35VFK2` |
| `MUZ-HR42VF2` | Accepted (earlier); paired with `MSZ-HR42VFK2` |
| `MUZ-HR50VF2` | Accepted (earlier); paired with `MSZ-HR50VFK2` |
| `MUZ-HR60VF2` | Accepted (earlier); paired with `MSZ-HR60VF2` |
| `MUZ-HR71VF2` | Accepted (earlier); paired with `MSZ-HR71VF2` |
| `MSZ-AP60VG2` | Accepted (earlier) |
| `MSZ-AP71VG2` | Accepted (earlier) |
| `MSZ-AY15VGK2` | Accepted (earlier) |
| `MSZ-AY20VGK2` | Accepted (earlier) |
| `MSZ-AY25VGK2` | Accepted (earlier) |
| `MSZ-AY35VGK2` | Accepted (earlier) |
| `MSZ-AY42VGK2` | Accepted (earlier) |
| `MSZ-AY50VGK2` | Accepted (earlier) |
| `MSZ-EF25VGK2B` | Accepted (earlier) |
| `MSZ-EF25VGK2W` | Accepted (earlier) |
| `MSZ-EF25VGK2S` | Accepted (earlier) |
| `MSZ-EF35VGK2B` | Accepted (earlier) |
| `MSZ-EF35VGK2W` | Accepted (earlier) |
| `MSZ-EF35VGK2S` | Accepted (earlier) |
| `MSZ-EF42VGK2B` | Accepted (earlier) |
| `MSZ-EF42VGK2W` | Accepted (earlier) |
| `MSZ-EF42VGK2S` | Accepted (earlier) |
| `MSZ-EF50VGK2B` | Accepted (earlier) |
| `MSZ-EF50VGK2W` | Accepted (earlier) |
| `MSZ-EF50VGK2S` | Accepted (earlier) |
| `MSZ-HR25VFK2` | Accepted (earlier) |
| `MSZ-HR35VFK2` | Accepted (earlier) |
| `MSZ-HR42VFK2` | Accepted (earlier) |
| `MSZ-HR50VFK2` | Accepted (earlier) |
| `MSZ-HR60VF2` | Accepted (earlier) |
| `MSZ-HR71VF2` | Accepted (earlier) |
| `MSZ-LN25VG3R` | Accepted (earlier) |
| `MSZ-LN25VG3B` | Accepted (earlier) |
| `MSZ-LN25VG3V` | Accepted (earlier) |
| `MSZ-LN25VG3W` | Accepted (earlier) |
| `MSZ-LN35VG3R` | Accepted (earlier) |
| `MSZ-LN35VG3B` | Accepted (earlier) |
| `MSZ-LN35VG3V` | Accepted (earlier) |
| `MSZ-LN35VG3W` | Accepted (earlier) |
| `MSZ-LN50VG3R` | Accepted (earlier) |
| `MSZ-LN50VG3B` | Accepted (earlier) |
| `MSZ-LN50VG3V` | Accepted (earlier) |
| `MSZ-LN50VG3W` | Accepted (earlier) |
| `MSZ-LN60VG3R` | Accepted (earlier) |
| `MSZ-LN60VG3B` | Accepted (earlier) |
| `MSZ-LN60VG3V` | Accepted (earlier) |
| `MSZ-LN60VG3W` | Accepted (earlier) |
| `MUZ-LN25VG3` | Accepted (earlier); paired with `MSZ-LN25VG3R`, `MSZ-LN25VG3B`, `MSZ-LN25VG3V`, `MSZ-LN25VG3W` |
| `MUZ-LN35VG3` | Accepted (earlier); paired with `MSZ-LN35VG3R`, `MSZ-LN35VG3B`, `MSZ-LN35VG3V`, `MSZ-LN35VG3W` |
| `MUZ-LN50VG3` | Accepted (earlier); paired with `MSZ-LN50VG3R`, `MSZ-LN50VG3B`, `MSZ-LN50VG3V`, `MSZ-LN50VG3W` |
| `MUZ-LN60VG3` | Accepted (earlier); paired with `MSZ-LN60VG3R`, `MSZ-LN60VG3B`, `MSZ-LN60VG3V`, `MSZ-LN60VG3W` |
| `MSZ-FT25VGK2` | Accepted (earlier) |
| `MSZ-FT35VGK2` | Accepted (earlier) |
| `MSZ-FT50VGK2` | Accepted (earlier) |
| `MUZ-FT25VGHZ2` | Accepted (earlier); paired with `MSZ-FT25VGK2` |
| `MUZ-FT35VGHZ2` | Accepted (earlier); paired with `MSZ-FT35VGK2` |
| `MUZ-FT50VGHZ2` | Accepted (earlier); paired with `MSZ-FT50VGK2` |
| `MSZ-EF18VGK2B` | Accepted (earlier) |
| `MSZ-EF18VGK2W` | Accepted (earlier) |
| `MSZ-EF18VGK2S` | Accepted (earlier) |
| `MSZ-LN18VG3R` | Accepted (earlier) |
| `MSZ-LN18VG3B` | Accepted (earlier) |
| `MSZ-LN18VG3V` | Accepted (earlier) |
| `MSZ-LN18VG3W` | Accepted (earlier) |
| `MSZ-RW25VG2` | Accepted (earlier) |
| `MSZ-RW35VG2` | Accepted (earlier) |
| `MSZ-RW50VG2` | Accepted (earlier) |
| `MUZ-LN25VGHZ3` | Accepted (earlier); paired with `MSZ-LN25VG3R`, `MSZ-LN25VG3B`, `MSZ-LN25VG3V`, `MSZ-LN25VG3W` |
| `MUZ-LN35VGHZ3` | Accepted (earlier); paired with `MSZ-LN35VG3R`, `MSZ-LN35VG3B`, `MSZ-LN35VG3V`, `MSZ-LN35VG3W` |
| `MUZ-LN50VGHZ3` | Accepted (earlier); paired with `MSZ-LN50VG3R`, `MSZ-LN50VG3B`, `MSZ-LN50VG3V`, `MSZ-LN50VG3W` |
| `MUZ-RW25VGHZ2` | Accepted (earlier); paired with `MSZ-RW25VG2` |
| `MUZ-RW35VGHZ2` | Accepted (earlier); paired with `MSZ-RW35VG2` |
| `MUZ-RW50VGHZ2` | Accepted (earlier); paired with `MSZ-RW50VG2` |
| `MSZ-RZ25VU` | Accepted (earlier) |
| `MUZ-RZ25VUHZ` | Accepted (earlier); paired with `MSZ-RZ25VU` |
| `MSZ-RZ35VU` | Accepted (earlier) |
| `MUZ-RZ35VUHZ` | Accepted (earlier); paired with `MSZ-RZ35VU` |
| `MSZ-RZ50VU` | Accepted (earlier) |
| `MUZ-RZ50VUHZ` | Accepted (earlier); paired with `MSZ-RZ50VU` |
| `MXZ-2HA40VF3` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-2HA50VF3` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-3HA50VF3` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-2F33VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-2F42VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-2F53VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-3F54VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-3F68VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-4F72VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-4F80VF5` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-2F53VFHZ3` | Accepted (earlier); multisplit eligibility unknown |
| `MXZ-4F83VFHZ3` | Accepted (earlier); multisplit eligibility unknown |
| `MFZ-KT25VGK` | Accepted (new) |
| `MFZ-KT35VGK` | Accepted (new) |
| `MFZ-KT50VGK` | Accepted (new) |
| `MFZ-KT60VGK` | Accepted (new) |
| `MFZ-KW25VGK` | Accepted (new) |
| `MFZ-KW35VGK` | Accepted (new) |
| `MFZ-KW50VGK` | Accepted (new) |
| `MFZ-KW60VGK` | Accepted (new) |
| `SEZ-M25DA3` | Accepted (new) |
| `SEZ-M35DA3` | Accepted (new) |
| `SEZ-M50DA3` | Accepted (new) |
| `SEZ-M60DA3` | Accepted (new) |
| `SLZ-M25FA3` | Accepted (new) |
| `SLZ-M35FA3` | Accepted (new) |
| `SLZ-M50FA3` | Accepted (new) |
| `SLZ-M60FA3` | Accepted (new) |
| `SFZ-M25VA2` | Accepted (new) |
| `SFZ-M35VA2` | Accepted (new) |
| `SFZ-M50VA2` | Accepted (new) |
| `SFZ-M60VA2` | Accepted (new) |
| `SFZ-M71VA2` | Accepted (new) |
| `PEAD-M35JA3` | Accepted (new) |
| `PEAD-M50JA3` | Accepted (new) |
| `PEAD-M60JA3` | Accepted (new) |
| `PEAD-M71JA3` | Accepted (new) |
| `MLZ-KP25VG` | Accepted (new) |
| `MLZ-KP35VG` | Accepted (new) |
| `MLZ-KP50VG` | Accepted (new) |
| `SUZ-M25VA2` | Accepted (new); paired with `MFZ-KT25VGK`, `SEZ-M25DA3`, `SLZ-M25FA3`, `SFZ-M25VA2`, `MLZ-KP25VG` |
| `MUFZ-KW25VGHZ2` | Accepted (new); paired with `MFZ-KW25VGK` |
| `SUZ-M35VA2` | Accepted (new); paired with `MFZ-KT35VGK`, `SEZ-M35DA3`, `SLZ-M35FA3`, `SFZ-M35VA2`, `PEAD-M35JA3`, `MLZ-KP35VG` |
| `MUFZ-KW35VGHZ2` | Accepted (new); paired with `MFZ-KW35VGK` |
| `SUZ-M50VA2` | Accepted (new); paired with `MFZ-KT50VGK`, `SEZ-M50DA3`, `SLZ-M50FA3`, `SFZ-M50VA2`, `PEAD-M50JA3`, `MLZ-KP50VG` |
| `MUFZ-KW50VGHZ2` | Accepted (new); paired with `MFZ-KW50VGK` |
| `SUZ-M60VA2` | Accepted (new); paired with `MFZ-KT60VGK`, `SEZ-M60DA3`, `SLZ-M60FA3`, `SFZ-M60VA2`, `PEAD-M60JA3` |
| `MUFZ-KW60VGHZ2` | Accepted (new); paired with `MFZ-KW60VGK` |
| `SUZ-M71VA2` | Accepted (new); paired with `SFZ-M71VA2`, `PEAD-M71JA3` |
| `PUZ-ZM35VKA3` | Accepted (new); paired with `SEZ-M35DA3`, `SLZ-M35FA3`, `PEAD-M35JA3` |
| `PUZ-ZM50VKA3` | Accepted (new); paired with `SEZ-M50DA3`, `SLZ-M50FA3`, `PEAD-M50JA3` |
| `PUZ-ZM60VHA3` | Accepted (new); paired with `SEZ-M60DA3`, `SLZ-M60FA3`, `PEAD-M60JA3` |
| `PUZ-ZM71VHA3` | Accepted (new); paired with `PEAD-M71JA3` |

| Reference | Not promoted: reason |
|---|---|
| `SLZ-M15FA3` | PDF p.182 caption names size 15, but the table has no size-15 physical or pairing column. |
| `MLZ-KY20VG` | PDF p.180 caption names it, but the table has no size-20 physical or pairing column. |
| `SFZ-M30VA2` | PDF p.102 caption says 30; the explicit table says 35. No physical or pairing column establishes a size-30 reference. |
| `MXZ-5F102VF3` | Digital-only combination matrix not pinned; physical fields and typed installation not independently accepted. |
| `MXZ-6F120VF3` | Digital-only combination matrix not pinned; physical fields and typed installation not independently accepted. |

PDF p.102 also names the size-35 SFZ explicitly in its table despite the caption's size-30 discrepancy. Console dimensions exclude recessed depth and SFZ height excludes feet; SLZ and MLZ dimensions are the body without separate decorative panel. PEAD/SEZ/SFZ airflow is GV, the highest published speed, while MFZ/SLZ use SGV. PUZ cooling minimum −5 °C is the default; the −15 °C alternative requires an air protection guide. Additional PEAD 100/125/140 and PUZ-M variants on p.155 are outside this residential-sized batch; the other PEAD pages contain additional commercial variants and have not been reconciled. Earlier claims of open general family reconciliation continue to apply beyond the exact references above. MXZ exact combinations, port rules and the 3 A current sum remain unresolved as described in the MXZ review.
