# Reviewed Stylish-only integration handoff

45 profiles are ready in this isolated project:40 exact indoor finish references and five exact one-port RXA-A8/B8 references. Root publication files remain byte-identical to the accepted `cf71dd4` catalogue. Apply only after the parent agent completes its inverter publication gate.

## Artifacts

- `stylish-only-integration.patch`: changes only acceptance, generated equipment data, catalogue tests and a new derived reviewed candidate. The source of every field remains in the frozen original Luna candidates and pinned manufacturer snapshots.
- `project/`: complete isolated baseline plus the integration, with shared `node_modules` used read-only for TypeScript validation.
- `stylish-independent-acceptance-receipt.json`: original/derived candidate hashes, protected baseline hashes, patch hash, accepted fact keys, exact per-head pair evidence, 20 primary-source assets/hashes and independent field comparisons.
- `source-assets.sha256`:20 exact manufacturer snapshots needed alongside the integration. These exist in root already; preserve these specific versions rather than stage unrelated changing research output.

The derived candidate joins only records with matching full-reference identities. It preserves physical facts from the corrected supplement and nominal matched-pair cooling and all 40 exact per-finish pairing edges from the previously reviewed pair candidate. It introduces no new values or sources. The supplement's mistaken source IDs were corrected by Luna before this join: D-finish physical facts point to p.315; C-finish facts to p.317; outdoor casing facts to the exact France A8/B8 table.

## Verification and behavior

All 21 existing catalogue checks pass in isolation after scoping the historic Stylish regression to its original candidate filenames. That test previously selected all RXA/FTXA prefixes and would wrongly reject a future current FTXA20 model. Two new regressions check all 45 full references, eight exact finish pairings per outdoor, CTXA15 exclusion, direct source-group IDs and cooling-high row offsets. All 23 catalogue checks pass. The derived 45-record candidate passes structural validation; `npm run check` passes; regeneration matches the isolated equipment file exactly.

Independent primary readback verifies 200 applied physical fields and 120 exact pairing/nominal-capacity checks. Indoor case is 295×798×189 mm;20/25/35/42/50 cooling-high flows are 660/690/714/786/810 m³/h, converted to volume flow m³/s through the existing helper. Rated matched-pair cooling is 2.0/2.5/3.4/4.2/5.0 kW, informational. Heating reuses cooling airflow as the existing explicit assumption. Each outdoor supports one connected head, with eight individually proven finish alternatives; additional rooms remain in the existing inactive pool.

Exact full-SKU France RXA20/25/35A5V1B8 case is 550×840×350 mm; RXA42/50B5V1B8 is 734×954×401 mm. Both France tables publish cooling−10..46°CDB and heating−15..18°CWB. Outdoor fan flow is genuinely unpublished in those reviewed tables and remains null; selecting these models uses the editable generic/manual mass-flow setting. Factory charge and mass are not accepted/applied. Compressor, coils, fan watts and performance remain generic R32 assumptions.

## Primary-source discrepancy and scope

France exact full-SKU casing/ranges differ from the Europe 2026 abbreviated-class table. This integration deliberately retains the full-reference France rows; it does not treat the abbreviations as interchangeable with those rows or copy A9 performance. Published limits retain their DB/WB condition and are documentation, not validated OEM operating/performance maps. Source conflicts should remain visible in the acceptance receipt. Current means dated official catalogue/technical-table presence, not guaranteed France stock.

New full IDs remain distinct from earlier dated Stylish profiles and from owner-declared FTXA25/FTXA35 heads with unknown suffixes. CTXA15 and all multisplits remain excluded. This is one completed family subset; the full consumer-range request remains incomplete.

If applied, catalogue counts become 41 Daikin outdoor and 119 indoor profiles (plus 25 Mitsubishi Electric outdoor/45 indoor). Owner and generic presets are separate.

## Applying after the gate

Check protected baseline hashes before applying the patch. Preserve the two original Luna input candidates, their hash ledgers, the new derived candidate, the 20 listed primary snapshots and this receipt. The production importer itself is unchanged. No root application file, README, PROGRESS, build output, index or git state was changed by this reviewer. No root or isolated build was necessary; the parent should run its final browser/publication checks after applying onto its newer inverter code.

Acceptance serialization preserves UTF-8 (`ensure_ascii=False`). Every existing acceptance entry, source pin, and runtime profile is independently asserted unchanged as JSON values; see `baseline-preservation-check.json`. Only new entries and pins are appended.
