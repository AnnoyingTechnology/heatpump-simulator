# Daikin next-family acceptance plan

Reviewed 2026-10-11. This is an independent, read-only source review of completed
Qwen candidate families. No application data, importer, acceptance list or
production artifact was changed. Perfera and other actively written candidates
were not consumed.

Primary evidence: Daikin Europe, *Catalogue des produits pour installateurs
2022*, ECPFR-FR22-000, French, PDF pages 40–41 (printed pages 40–41).
Official URL: https://www.daikin.eu/content/dam/document-library/catalogues/ac/split/Split-Installer_Product%20catalogue_ECPFR-FR22-000_French.pdf
Cached PDF SHA-256:
`814243080bf6b8795adccb3f8c670a87d0b692d7c1c09ec32c306f04add187ad`.
Both cached text and 2400px primary page images were read. All 16 family candidate
files passed the existing structural validator; source acceptance is separate.
This dated catalogue establishes historical declarations, not the full current
2026 French range or present availability.

## Ururu Sarara: six candidates eligible for bounded historical acceptance

The p.40 title explicitly names FTXZ-N + RXZ-N. The efficiency table explicitly
pairs 25N + 25N, 35N + 35N and 50N + 50N; the physical-unit headers confirm the same exact
suffixes. Accept only these published monosplit combinations, each one indoor
head/one port. No multisplit eligibility is established.

| Outdoor reference | Matched indoor reference | Indoor high-fan cooling | Indoor high-fan heating | Nominal cooling of this combination |
|---|---|---:|---:|---:|
| RXZ25N | FTXZ25N | 10.7 m³/min = 642 m³/h | 11.7 m³/min = 702 m³/h | 2.5kW |
| RXZ35N | FTXZ35N | 12.1 m³/min = 726 m³/h | 13.3 m³/min = 798 m³/h | 3.5kW |
| RXZ50N | FTXZ50N | 15.0 m³/min = 900 m³/h | 14.4 m³/min = 864 m³/h | 5.0kW |

The flow row is **m³/min**, so conversion to m³/h is exactly× 60. Cooling and
heating are distinct rows. Qwen's converted values agree with all six published
indoor fan settings per size (three per mode). Selecting the numerical maximum
across modes would be wrong: for 25N / 35N it would substitute heating airflow for
cooling, while 50N has lower heating than cooling high-fan flow.

Verified shared physical fields and operating-range metadata:

- Indoor case H×W×D: 295×798×372 mm, merged across all three indoor columns.
- Outdoor case H×W×D: 693×795×300 mm, merged across all three outdoor columns.
- Refrigerant R-32 (normalize identifier to validated R32, preserve source spelling).
- Cooling range −10…43°C **outdoor dry bulb** (°CBS).
- Heating range −20…18°C **outdoor wet bulb** (°CBH).

Outdoor airflow is absent; keep an explicit editable generic outdoor mass-flow
fallback. Never substitute the indoor flow or derive airflow from casing, watts
or capacity. The heating range is wet-bulb metadata and cannot be directly used
as a dry-bulb outdoor slider or compressor cut-off limit.

The candidate records correctly keep nominal combination capacities in ratings,
rather than making “25” itself a kW fact. If the importer needs nominal cooling
for UI labels, promote the actual cooling rating's nominal 2.5 / 3.5 / 5.0 kW with
combination/condition evidence; do not derive it from the model name or use it to
infer compressor displacement, coil UA or a performance map. Published system
electrical min/nominal/max are rating-table values, not universal operating floors.

Implementation recommendation for a later authorized integration pass: use the
verified cooling high-fan volume-flow profiles and nullable/unpublished outdoor
flow support already added for Stylish. A small mode-aware indoor profile can
also use the explicitly published heating values. Until that path exists,
reusing cooling flow in heating must remain an explicit generic assumption, not
a claim that heating airflow was absent from this table. Preserve manual edits.

Ururu humidification, ventilation and specialized drying functions are named on
the page but their mechanisms are not modeled by the current generic reversible
air-air cycle. Published indoor fan flow is not an outdoor-ventilation ACH.
Additional unknowns: fan electrical power, dynamic fan map, internal exchanger
geometry/UA, compressor geometry/efficiency/maps and present availability.

## Emura: trustworthy printed identities and pairings; numerical fields preliminary

The p.41 title is FTXJ-AW/S/B + RXJ-A. Each efficiency column explicitly pairs
the corresponding size and outdoor A suffix. Exact colour references can be
expanded from the printed group notation: AW, AS and AB. Slash-group strings
are source-table identities, not individual selectable manufacturer references.

| Outdoor reference | Exact matched indoor references | Printed indoor H×W×D | Printed outdoor H×W×D | Printed nominal cooling |
|---|---|---|---|---:|
| RXJ20A | FTXJ20AW, FTXJ20AS, FTXJ20AB | 305×900×214mm | 552.7×840×350mm | 2.0kW |
| RXJ25A | FTXJ25AW, FTXJ25AS, FTXJ25AB | 305×900×214mm | 552.7×840×350mm | 2.5kW |
| RXJ35A | FTXJ35AW, FTXJ35AS, FTXJ35AB | 305×900×214mm | 552.7×840×350mm | **3.4kW** |
| RXJ42A | FTXJ42AW, FTXJ42AS, FTXJ42AB | 305×900×214mm | 734×954×408mm | 4.2kW |
| RXJ50A | FTXJ50AW, FTXJ50AS, FTXJ50AB | 305×900×214mm | 734×954×408mm | 5.0kW |

Shared casing cells are correctly resolved: indoor all five sizes; outdoor
20 / 25 / 35 together and 42 / 50 together. The printed range is −10…50°C cooling
dry bulb and −20…24°C heating wet bulb. R-32/675 is printed. Each explicitly
listed pairing is monosplit, one head/one port; exact multisplit eligibility
is not established by this page.

**Source-quality issue:** essentially the entire numerical specification table
is light blue, including dimensions, range endpoints, capacities, refrigerant
rows and acoustic numbers. The footnote says blue cells contain preliminary
data. This qualification applies to printed numerical values, not only to dash
cells. The Emura manifest and candidate unknowns presently narrow that caveat
to missing dash cells; this is an error requiring a corrective Qwen pass before
ordinary verified-field promotion.

The printed dash cells genuinely contain no indoor cooling or heating airflow,
no nominal electrical input, and no indoor heating sound-power values. Outdoor
airflow is also absent. Explicit generic mass-flow fallback must work for **both
indoor and outdoor** units, preserving editable generic settings and showing
neither 0 m³/h nor an invented volume flow. Current importer support for unknown
outdoor flow alone is insufficient for this family.

Two honest integration options after that correction:

1. Accept historical exact identities and printed mono pairings, with numerical
   physical inputs left generic until final primary data is obtained.
2. Offer the historical Emura profiles with explicit “2022 preliminary” source
   status on their printed casing/range/rating metadata, while both airflows
   remain manual generic assumptions. Do not label those numerical values as
   final OEM specifications or silently map them into performance calibration.

Option 1 is preferable if the interface cannot clearly express preliminary
status. The existing `reviewed-fields` label alone loses this material source
qualification. A newer finalized official technical table would also resolve
this gap, but source discovery/population remains assigned to Qwen.

Other candidate caveats: three sound-pressure speed labels accompany four
descending slash values; Qwen preserves order rather than assigning invented
speeds, which is appropriate. Nominal35 size cooling capacity is printed 3.4 kW,
not 3.5 kW. No reported EER/COP or system power rating may be converted into an
OEM map, universal electrical floor or guessed compressor/coil properties.

## Corrective Qwen work before subsequent promotion

- Amend Emura family/candidate provenance so every printed blue numerical cell
  carries the 2022 preliminary-data caveat, not merely absent airflow/input rows.
- Stylish20 remains withheld from the current root pass: the shared 15 / 20 high
  cooling-flow cell is 11.0 m³/min = 660 m³/h; its current Qwen FTXA20 candidate says
  690 m³/h. Ask Qwen to correct the candidate against the original merged cell;
  do not silently populate different source facts from root code.
- Maintain historical 2022 coverage and unknown present availability explicitly.
  Neither these families nor the completed Stylish batch establish full 2026
  Daikin coverage.

## Frozen candidate and manifest hashes

Files below are relative to `research/catalogue/staging/`. Hashes identify the
reviewed snapshots; any content change requires renewed source acceptance.

| File | SHA-256 |
|---|---|
| daikin-emura.manifest.json | `09a09420804bf372a2e3ff5e6da840b35b3554ead2eb3af15f0856ca373206e8` |
| daikin-ftxj20-indoor.json | `daff2fad87e65aab6db48ec924269f53fd95474a62e6ff46df222687fad48332` |
| daikin-ftxj25-indoor.json | `76b8843c2cf004c7650723dc64d618628de870b2332eec0f368b8d0c12f8b584` |
| daikin-ftxj35-indoor.json | `a173f003d571d8194a2398bcf0d2d452d3c8e04d9b97d2c25205b4de0a41c681` |
| daikin-ftxj42-indoor.json | `d4c95b2ecb84490bc802829fd58c0bf9997b93b7060e08dea07725eefb899553` |
| daikin-ftxj50-indoor.json | `4678f131e67af75a16e73941a82aa7024d2bf1d839301314a9c7083d5ddff919` |
| daikin-ftxz25n-indoor.json | `1592b4bccceab576511858e2088f86165503db759283adc35acd660cd91b0d4c` |
| daikin-ftxz35n-indoor.json | `69818189b0e8af979a5f03abb81cc4b67295a2d9dff4f751a1633eb712c76d8a` |
| daikin-ftxz50n-indoor.json | `078285a56e75ab0950ddbcb4864d06079324a8c52f21c585ef870702007670a0` |
| daikin-rxj20a-outdoor.json | `eac9d54653e55976a19d86c82fcf50e804b96d1351171d77b30c6506c3b70fbd` |
| daikin-rxj25a-outdoor.json | `31bf7e65b059d746dd3488a662a46c93c23878d28ec9955f71211da60593f089` |
| daikin-rxj35a-outdoor.json | `4ee5978171bc3476b189bc24ededdbb8c53a7546bb1a900c4dfcf9d93fc6af8c` |
| daikin-rxj42a-outdoor.json | `ed7e541e747094e4a59e10e529dded911a0755c5f0fa3d3d9f29bc90d22bb827` |
| daikin-rxj50a-outdoor.json | `7b4ef60ae246e6b92ff2118d0f66cfe208b2dfd813b69b9244b72bb593f3695c` |
| daikin-rxz25n-outdoor.json | `f2eb6df1b82488365127a05c257f80a757d6661565d9385af17c940f98002fb6` |
| daikin-rxz35n-outdoor.json | `0af12cdc0276a7de72762ddc20ae11493e9d41a16bc426b7230012a48b2b890c` |
| daikin-rxz50n-outdoor.json | `8182f2bc6db0f5ca8a6ffec1593a0e55d95d92aa887b6653684db748b24379b7` |
| daikin-ururu-sarara.manifest.json | `3d1608f82d44fe083fa7991ea69d42781e3169569cae498eb7842af6b34ced16` |
