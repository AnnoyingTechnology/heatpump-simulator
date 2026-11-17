# Terra catalogue continuation checkpoint — 2026-11-18

**Incomplete.** This is a checkpoint, not a catalogue-completion claim.

The workspace Git metadata was mounted read-only. The requested first commit was made in a separate Git metadata directory at `/tmp/terra-catalogue-git/.git`, using this workspace as its work tree. Commit `91d4b76` adds the brief with the requested co-author trailer. Commit `c1741f5` stages FFA/FNA exact indoor source candidates; they are not accepted or imported. The importer regenerated the same runtime data. Counts before and after: Daikin 90 outdoor / 163 indoor; Mitsubishi Electric 25 outdoor / 45 indoor.

The FFA and FNA exact table columns and source hashes are documented in `terra-daikin-heads-2026-11.md` and `provenance/terra-daikin-heads-source-receipt.md`. FNA height was uncertain because the table gives two values and a footnote; it is withheld. The MXM matrix has not been visually reconciled, so neither class connectivity nor exact full-SKU eligibility was asserted. France availability and sales status are unknown.

Remaining work, not yet researched in this continuation:

- FBA-A(9), FCAG-B, FHA-A(9) product tables; FFA/FNA matrix cells and runtime acceptance; all exact MXM combinations.
- The remaining RXM class pair columns.
- ATXM20 monosplit eligibility, Siesta multisplit eligibility, ARXM50 range drawing.
- Mitsubishi current 25/45 inventory reconciliation, missing MSZ/MUZ families, MXZ installation constraints and digital-only 5/6-head combination table.
- 2022 historical exact suffix expansion and reference-by-reference accounting.

The pre-existing coverage ledgers contain the earlier, more detailed known uncertainties; none of the outstanding items should be treated as researched or resolved by this checkpoint. The catalogue Python tests, topology tests and both TypeScript checks passed. The ordinary build failed when Vite attempted to write into the read-only linked `node_modules`; `npm run build -- --configLoader runner` passed.
