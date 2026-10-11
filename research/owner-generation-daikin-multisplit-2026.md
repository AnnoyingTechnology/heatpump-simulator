# Daikin owner-generation multisplit outdoor research

Checked 2026-10-11. This is source staging for engineering review, not a catalogue acceptance decision or a performance model. Coverage is the documented N generation around the owner's declared `3MXM52N8`, separately checked N8 and N9 variants, and only exact full references printed in Daikin sources. Do not merge this with the A8/A9 candidates.

## Identity and generation boundaries

The owner's documented reference is the family string `3MXM52N8`. The related Daikin technical table and combination sheets name the full model `3MXM52N2V1B8`. The owner-installation note explicitly says the installed nameplate has not been inspected, so this research does not claim that full suffix as the installed unit.

Exact peer references found in Daikin product tables or engineering sheets:

| Port family | Exact source-listed outdoor reference | Evidence |
| --- | --- | --- |
| 2MXM-N | `2MXM40N2V1B`, `2MXM50N2V1B`, `2MXM68N2V1B` | Daikin 2MXM-N product table; 40/50/68 combination or electrical sheets |
| 3MXM-N8 | `3MXM40N2V1B8`, `3MXM52N2V1B8` | N8 product table and exact combination sheets |
| 3MXM-N | `3MXM40N2V1B`, `3MXM52N2V1B`, `3MXM68N2V1B` | Daikin N product technical table; these do not acquire an N8 or N9 suffix by family similarity |
| 4MXM-N9 | `4MXM68N2V1B9`, `4MXM80N2V1B9` | Daikin N9 product table and model-specific engineering sheets |
| 5MXM-N9 | `5MXM90N2V1B9` | Daikin N9 product table and combination sheets; those sheets also show the related but distinct `5MXM90N2V1B` |

N2V1B, N2V1B8 and N2V1B9 are preserved as separate identities. A family title is not full-SKU compatibility evidence. The checked PDFs were created in 2020 (metadata dates recorded in source ledger); Daikin hosts those files today, which does not establish current retail availability. The legacy A8/A9 candidates already in the project remain separate.

## Verified specification meaning

The official product pages state maximum connectable indoor-unit counts of two, three, four, and five for 2MXM-N, 3MXM, 4MXM-N9, and 5MXM-N9 respectively. These are maxima. They do not publish the minimum number of heads that must be operating or prove that every head count between one and the maximum is eligible for every exact model.

Daikin's combination PDFs give capacities per room plus total system capacity, electrical input, and total current at **50 Hz / 230 V**. Heating test point: indoor 20 °C DB; outdoor 7 °C DB / 6 °C WB. Cooling test point: indoor 27 °C DB / 19 °C WB; outdoor 35 °C DB. These are combination-specific steady rating points. They are not outdoor-only ratings or a continuous output map. Each indoor unit's nominal-size label is not its allocated capacity.

For exact `3MXM52N2V1B8`, the heating and cooling combination sheets both include the size combination 2.5 + 2.5 + 3.5 kW. Cooling on printed p.1: system minimum/nominal/maximum capacity 1.9/5.2/7.2 kW and electrical input 0.39/1.04/2.16 kW at the cooling point above. Heating on printed p.1: 1.5/6.8/8.1 kW and 0.32/1.35/2.09 kW at the heating point above. The row is selected by full outdoor reference plus the unordered indoor size set. The owner note describes the installed layout as these sizes, but the indoor full SKUs are unknown.

For `3MXM40N2V1B8`, printed p.1 of 3D105370D provides separate rows for exact full outdoor references `3MXM40N2V1B8`, `3MXM40N2V1B`, and `3MXM40N2V1B9`; their capacities and inputs differ. Never collapse these rows. For `2MXM40N2V1B`, the 2020 sheet explicitly names `2MXM40N2V1B` plus M2/M3/M4 variants; it gives combination tables for CTXM-M/FTXM-M size classes, not an outdoor-only rating. `2MXM50N` and `2MXM68N` have separate sheets. No complete rating matrix has been normalized into the candidate JSON.

The Daikin technical tables provide casing, charge, and line-limit values by exact model column. Dimensions are H×W×D; run is maximum outdoor-to-indoor length per room; total is the system maximum.

| Exact full model | Dimensions / mass | Factory charge | Max run / total | Additional charge condition |
| --- | --- | --- | --- | --- |
| `2MXM40N2V1B` | 550×765×285 mm / 36 kg | 0.88 kg | 20 / 30 m | 0.02 kg/m above 20 m |
| `2MXM50N2V1B` | 550×765×285 mm / 41 kg | 1.15 kg | 20 / 30 m | 0.02 kg/m above 20 m |
| `2MXM68N2V1B` | 734×958×340 mm / 60 kg | 2.0 kg | 25 / 50 m | 0.02 kg/m above 30 m |
| `3MXM40N2V1B8` | 734×974×401 mm / 57 kg | 1.8 kg | 25 / 50 m | 0.02 kg/m above 30 m |
| `3MXM52N2V1B8` | 734×974×401 mm / 57 kg | 1.8 kg | 25 / 50 m | 0.02 kg/m above 30 m |
| `3MXM68N2V1B` | 734×958×340 mm / 62 kg | 2.0 kg | 25 / 50 m | 0.02 kg/m above 30 m |
| `4MXM68N2V1B9` | 734×958×340 mm / 63 kg | 2.0 kg | 25 / 60 m | 0.02 kg/m above 30 m |
| `4MXM80N2V1B9` | 734×974×401 mm / 67 kg | 2.4 kg | 25 / 70 m | 0.02 kg/m above 30 m |
| `5MXM90N2V1B9` | 734×974×401 mm / 68 kg | 2.4 kg | 25 / 75 m | 0.02 kg/m above 30 m |

Each listed unit table specifies R-32. N-family piping-height rows report 15 m outdoor-to-indoor and 7.5 m indoor-to-indoor. The standard 3MXM-N table lists a heating envelope of −15 to 18 °C WB; the retrieved N8 and N9 tables list cooling −10 to 46 °C DB but do not expose a heating envelope. The standard N 3MXM table reports outdoor airflow 24 m³/min for 40/52 and 24.1 m³/min for 68, at super-low fan speed in both cooling and heating rows. This is not assigned to N8 or N9. The other reviewed tables do not publish outdoor airflow.

The exact 3MXM52N8 piping diagram 3D097989C is a family drawing with field line sizes per branch: liquid A/B/C 6.4CuT; gas A 9.5CuT; gas B/C 12.7CuT. Internal schematic tubing sizes differ. The technical table lists one reducer assembly, but the diagram does not map reducer identity to a port; full-SKU applicability of this family schematic and reducer mapping remain unknown.

## Evidence gaps kept explicit

The candidate contains exact identities and verified maximum head counts. It intentionally leaves detailed facts and performance ratings out where this pass did not normalize each source row. In particular:

- Casing, factory charge, main line limits, and height limits are transcribed per model from the model-column tables in the candidate. Exact port OD/reducers are still incomplete outside the N8 family drawing. Do not copy 3MXM52N8 values across all N/N9 models.
- 2MXM-N does not publish airflow in the retrieved technical table. Standard 3MXM-N reports 24/24.1 m³/min at super-low fan speed, in both cooling and heating; it remains separate from N8. Numeric airflow for the reviewed N8 and N9 models is not established.
- Combination table size classes and CTXM/FTXM family names are not a full indoor-SKU matrix. A row in a thermal table proves the shown size combination at its rating point, not every exact indoor reference in that class. Exact valid and invalid indoor SKU combinations remain unknown for this staging pass.
- Separate 2MXM, 3MXM40, 3MXM52, 4MXM68, 4MXM80 and 5MXM tables are not one shared curve. The visible 5MXM tables sometimes name B and B9 variants together but still give combination-specific values; retain the exact row identity.
- The official sources retrieved here do not establish a complete `M/N/N2/N8/N9` historical catalogue. This is a bounded family discovery, not full-range coverage.

## Pinned primary-source files

Files are stored under [`sources/luna-owner-generation`](sources/luna-owner-generation). Their retrieval URLs and SHA-256 digests are in [`sources/luna-owner-generation.sha256`](sources/luna-owner-generation.sha256). HTML snapshots were fetched from Daikin Europe product/technical-table pages. PDFs are Daikin engineering combination sheets; their printed page locator is p.1. PDF creation timestamps are document metadata, not proof of issue date.

Key table locators: `2MXM40N` 3D102222E p.1 names exact B/M variants and separates heating/cooling; `2MXM50N` 3D102231F p.1; `3MXM40N8` 3D105370D p.1 names B, B9, and B8 variants; `3MXM52N8` 3D105371B cooling p.1 and 3D105372E heating p.1; `4MXM68N9` 3D105394C p.1; `5MXM-N9` 3D105425A cooling and 3D105436B heating p.1; the N8 field piping ports are on 3D097989C p.1. Each PDF footer identifies its drawing revision. The saved bytes, not search snippets, are the evidence copies.

## Integration boundary

Candidate: [`catalogue/staging/luna-owner-generation-daikin-multisplit-2026.json`](catalogue/staging/luna-owner-generation-daikin-multisplit-2026.json). It is source staging only. No production `src`, build output, root git metadata, fluid curves, or runtime performance behavior was changed. Parent review and separate source validation are required before import.
