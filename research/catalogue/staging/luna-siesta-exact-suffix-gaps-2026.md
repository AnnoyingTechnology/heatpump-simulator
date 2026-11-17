# Siesta exact-reference source pass (2026-10-11)

This bounded extraction pins exact indoor references and dimensions for the Daikin France technical tables ATXM-A, ATXP-N9 and ATXF-F. The source status is date-bounded: the live technical tables do not independently prove current retail availability of every listed exact suffix. All candidate records therefore use status `unknown`. No factory nominal cooling capacity or unsupported fan-flow value is added.

Exact pairing evidence is narrower than family names imply:

- ATXM-A/ARXM-A exact table columns establish documented monosplit pairs for ATXM25A2/A5V1B with ARXM25A5V1B, ATXM35A2/A5V1B with ARXM35A5V1B, and ATXM50A2/A5V1B with ARXM50A5V1B. ATXM20 columns have no pair evidence in this table. These statements are monosplit only.
- ATXF-F/ARXF-A9 exact table columns establish the 60 and 71 full-reference pairs only. This does not establish any other outdoor match or France sales status.
- ATXP-N9 technical table lists the exact 20/25/35 indoor SKUs. The attempted ATXP/ARXP pair-table endpoints returned non-table/empty shells; no compatibility is asserted. ARXP-N9 technical search evidence lists outdoor refs ARXP20N5V1B9/25/35N5V1B9, but exact matched columns remain unverified in this pass.
- Daikin Europe General Catalogue ECPEN26-500, printed p.338, identifies current Siesta class range ATXC-E / ARXC-E (classes 20, 25, 35, 50, 60, 71); it does not publish exact factory suffixes there. The exact France ATXC-E reference table was not found. No suffixes are invented, and the older ATXC-C/D docs are not substituted.

The exact-SKU extraction candidates are `luna-siesta-atxm-a-exact-indoor-2026.json`, `luna-siesta-atxp-n9-exact-indoor-2026.json`, and `luna-siesta-atxf-f-exact-indoor-2026.json`. Class-level ATXC-E/ARXC-E remains unresolved pending an official exact-reference table and exact pair columns. The current-range catalogue pages establish family/class context only.

Pinned HTML is stored in `research/sources/luna-siesta-*`. Hashes are in the adjacent `luna-siesta-source-sha256-2026.txt`; printed-page locators refer to ECPEN26-500 p.338 where noted. Candidate tables use exact full model-reference headers and row labels. Review pinned cells before any promotion.
