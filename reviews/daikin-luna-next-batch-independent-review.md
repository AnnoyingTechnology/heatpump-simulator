# Independent acceptance proposal: next Daikin 2026 research batch

Reviewed 2026-10-11. **Accept the bounded identity/pairing/head-limit research fields described below; promote none of these records into the runtime yet.** The accepted publication catalogue of 36 Daikin outdoor and 79 indoor profiles remains byte-identical to commit `cf71dd4`. No importer, acceptance, application, build, tests or git mutation was made by this reviewer.

The candidate batch has **68 records: 54 full references and 14 published class references**. Its three candidates pass structural validation. All 41 ledger hashes match observed files: three JSON candidates, 36 HTML snapshots and two PDFs. An independent parser/readback checked 152 primary claims without mismatches: 80 reciprocal Stylish pair headers, 40 nominal cooling capacities, 14 Perfera class identity entries, nine full MXM identities and nine published maximum-head limits. Structural validation alone does not certify manufacturer truth.

Complete reference lists, per-field acceptance proposal, source/candidate hashes and check results are in [`daikin-luna-next-batch-independent-review.json`](daikin-luna-next-batch-independent-review.json). The original [research scope](daikin-luna-next-batch-2026.md) and [41-file hash ledger](../research/catalogue/staging/luna-next-daikin-2026-source-pins.sha256) remain unchanged.

## Stylish: 40 exact heads, five exact monosplit outdoor references

The 16 official France finish/size tables individually establish all 40 pair columns; there is no pairing inferred by colour similarity. The five sizes are 20/25/35/42/50. Finish groups are DG, DP, DL, DC, DY, CW, CS and CB. Full indoor suffixes are D2V1BG/BP/BL/BC/BY and C2V1BW/BS/BB. Published matching outdoors are:

| Size | Exact outdoor reference | Nominal matched-pair cooling |
|---|---|---:|
|20|RXA20A5V1B8|2.0 kW|
|25|RXA25A5V1B8|2.5 kW|
|35|RXA35A5V1B8|3.4 kW|
|42|RXA42B5V1B8|4.2 kW|
|50|RXA50B5V1B8|5.0 kW|

Accept research identity for all 45 full references; the 40 exact pair edges; and the 40 indoor nominal-pair cooling facts. The 35 class is **3.4 kW**, not an inferred 3.5 kW. Nominal cooling describes the evidenced pair at published conditions; it is not an outdoor standalone multi-system rating or an OEM performance curve. These current references stay distinct from the previously accepted dated Stylish A9/B references. The headers are not marked archived, and the 2026 catalogue publishes the C/D family classes. This supports current catalogue/technical-table presence, not a guarantee of France stock or every region's distribution.

**Runtime blockers:** the candidate deliberately omits casing and airflow, and outdoor R32/range fields. Do not claim those fields are unpublished merely because they are absent from this candidate. Current import requires published positive casing, cooling airflow or explicit genuinely-unpublished fallback, and reviewed R32/range fields for outdoors.

A pinned [CW single-unit France table](https://www.daikin.fr/fr_fr/products/product.table.html/FTXA-CW.html) directly supplies five full CW references with 295×798×189 mm casing and cooling-high flow 20/25/35/42/50 of 11.0/11.5/11.9/13.1/13.5 m³/min = 660/690/714/786/810 m³/h. These facts are not yet in the frozen candidate. They can be added by the designated researcher with a new source/fact/candidate hash; the CW table alone must not supply facts for the other seven finishes.

The already pinned Europe [p.315](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/315/) and [p.317](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/317/) also explicitly publish grouped indoor columns DG/P/L/C/Y and CW/S/B. They include shared casing 295×798×189 mm and the same five high-fan cooling flows. Group scope is explicit primary evidence, so a subsequent aligned extraction can support all 40 finishes without assuming CW equivalence. **CTXA15 is a separate leading multi-only column:** guard that offset, and verify merged rows visually before freezing added fields. The 40 full references are monosplit pairs only; their compatibility with an MXM outdoor is not established by these pair tables. All eight CTXA15 finish classes remain outside the batch, with full suffixes and multi combinations unresolved.

## Perfera: seven current class-level pairs, 14 records

The pinned 2026 Europe p.320 explicitly publishes:

| Indoor class | Outdoor class |
|---|---|
|FTXM20A|RXM20A|
|FTXM25A|RXM25A9|
|FTXM35A|RXM35A9|
|FTXM42A|RXM42A|
|FTXM50A|RXM50A8|
|FTXM60A|RXM60A|
|FTXM71A|RXM71A|

Accept these 14 **class identities and seven class-pair links in research**. No full-SKU suffix is implied by an abbreviated class. The pinned France FTXM-A table explicitly marks all 12 known A2/A5 full indoor references archived. The candidate correctly retains this distinction; it does not relabel the previously accepted archived SKU rows current or attach their suffixes to these current class records. These class entries contain no operating profile facts; they do not yet satisfy runtime import requirements. Current full factory SKU mapping remains unresolved. CTXM15A is multi-only and absent from this candidate.

## Multisplit: nine full identities and published maximum head counts

| Full outdoor reference | Published maximum indoor units |
|---|---:|
|2MXM40A2V1B9|2|
|2MXM50A2V1B8|2|
|2MXM68A2V1B8|2|
|3MXM40A2V1B8|3|
|3MXM52A2V1B8|3|
|3MXM68A2V1B8|3|
|4MXM68A2V1B8|4|
|4MXM80A2V1B8|4|
|5MXM90A2V1B8|5|

Exact 2MXM40A2V1B9/2MXM50A2V1B8 identities are printed on the installer guide title page, document 4P766272-4C, 2025.05. The other seven exact A8 identities are printed in the primary BRP070A81 photo manual heading, document 4P807994A. The maximum counts are independently supported by official 2/3/4/5MXM product-page wording, not inferred from model digits. Europe 2026 p.329 lists the corresponding nine abbreviated outdoor classes. Accept those identities and head caps as **research metadata only**.

The pinned France multi technical tables publish **A9** full references. They are not proof of corresponding **A8** SKU casing, airflow, charge, range or pairing facts. The photo manual lists both A8 and A9 variants, which demonstrates distinct identities, not interchangeable profiles. Current France stock/distribution status for these A8 full SKUs is not established by these sources. The nine listed models cover this 2026 Europe catalogue MXM table, not every current France A9 variant, Sensira MXF or Multi+ unit.

The p.329 compatibility matrix names FTXJ-A9, C/FTXA-C/D, C/FTXM-A, FTXP-N9, FDXM-F9, FBA-A(9), C/FVXM-B, FCAG-B, FFA-A9, FHA-A(9) and FNA-A9 columns. Text extraction loses dot/checkbox alignment. A family header or product compatibility link does **not** prove every size, every full suffix or every simultaneous combination for every outdoor. This batch correctly refrains from asserting per-size eligibility, allowed combined capacities, minimum connected head counts or pipe restrictions. Do not infer outdoor standalone capacity from model digits or turn a pair rating into a multi-system capacity.

## Contract required for legitimate multisplit import

The current importer explicitly rejects `ports !=1`; `compatibleIndoorClasses` is a one-port alternative-head list. Removing that guard or assigning ports 1 to these MXM profiles would misrepresent their topology. A robust replacement needs:

1. **Explicit topology and proven hardware limits.** Distinguish monosplit from multisplit; source-pin maximum connected head count/ports and any published minimum connected count. Do not infer unknown minima or assume every physical port accepts every head size.
2. **Per-model eligible heads plus joint combination rules.** Pin exact full references or explicitly scoped class aliases and each eligibility edge. Validate the actual connected size multiset against source-defined combinations, capacity-index bounds, repeat limits or port restrictions. Independent membership of every head is insufficient to prove the complete combination. Apply only published rules; do not invent limits from digits or add standalone mono cooling ratings as a multi capacity constraint.
3. **Separate connected and enabled heads.** An installed but switched-off head remains part of the connected equipment combination; changing demand is not a topology change. Use the retained inactive room pool when changing hardware capacity, with a deliberate compatible configuration selection. Preserve the house and distinguish pooled/disconnected rooms from installed/off heads.
4. **Explicit compatibility assessment.** Validated, invalid and unknown combinations are different states. Unknown source eligibility must not be treated as OEM-approved. Either keep metadata-only profiles out of validated hardware selection until combinations are sourced, or explicitly offer a generic/manual sandbox configuration whose manufacturer compatibility is unchecked. Never silently fill the eligible list with all staged heads.
5. **Per-field provenance and physical assumptions.** Hash-pin identity, hardware and combination evidence independently. Keep unknown airflow/casing/ranges unknown, with any generic fallback explicitly represented as an assumption. The existing shared-compressor R32 solver can remain generic; matching hardware references does not establish OEM control maps, fan power, UA, compressor displacement, performance curves or an electrical minimum floor.
6. **Meaningful boundary checks before publication.** Exercise too many connected heads, wrong size/suffix, invalid repeated or combined-size configurations, unknown compatibility, switching a connected head off, and selection/pool preservation. Require every accepted head/combination rule to have complete source evidence. Test honest rejection of incomplete multisplit metadata rather than coercing it into the one-port format.

## Remaining coverage and exact freeze

None of these 68 records is promoted. Runtime counts remain 36/79 Daikin. The separate RXF60/71D9 follow-up remains outside this review. Missing coverage includes completed Stylish operating facts/full CTXA15 identities, current Perfera full-SKU mapping and physical profiles, all exact MXM size/combination matrices, additional France A9 multi variants, Sensira MXF, Siesta, Multi+, remaining floor/ducted/cassette/ceiling families and dated historical variants. A full current consumer-range claim remains unsupported.

All 41 candidate/source assets are in normally stageable project paths; `git check-ignore` found none ignored. Preserve the exact source ledger and these review receipts alongside a later accepted subset, and do not broadly stage unrelated changing research output. Runtime reproduction still succeeds using the immutable accepted data; next-batch schema validity alone must not alter publication.

| Candidate | SHA-256 |
|---|---|
|`luna-next-daikin-multisplit-a8-a9-2026.json`|`4394292245ffcfc7aa69808d35a8a3fbe487c67fd9b2798deb83d5a6d4c720e0`|
|`luna-next-daikin-perfera-ftxm-a-current-classes-2026.json`|`6c6a982f2e3b82cb388e5ee8f455085daf1ee2687b413e00859144b4314c9516`|
|`luna-next-daikin-stylish-cd-finish-pairs-2026.json`|`00a11c1fe4f8bc4a1948ee61bed3c106bda0f99b41d56bc38a26c3a316f1ef4e`|

Source ledger SHA-256: `ce5f5de9c1d39f49d9e90034968c7c6cebd0e4706be2a99bb101dc99982d7a43`. Exact source pins and protected accepted-artifact hashes appear in the JSON receipt.
