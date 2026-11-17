# Daikin MXM A8/A9 research candidate correction

Reviewed 2026-10-11 against the pinned Daikin technical tables, installer guides 4C/5C and Europe catalogue p.329. This is a research-only correction to the independently reviewed nine-model MXM candidate. The frozen candidate and its ledger remain unchanged.

Corrected candidate: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-corrected-2026.json`  
SHA-256: `95c0d8d6fa1e3cd13ffc935a7e47eec1587ccc34a016604b2eb3836fe36aa1f2`

Source ledger: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-corrected-2026.sha256`  
Ledger SHA-256: `fa3d842c0024e6cc4a95de5e05c88840475be832feee4883d61fa8d05baf71dc`

The corrected candidate retains nine exact multisplit outdoor references, with no full-SKU indoor eligibility inferred. It records explicit port-by-port class alternatives, reducer drawing IDs, source pages, and the separate class-42 footnote scope. For 2MXM50A2V1B8 port A, footnoted class 42 without a reducer is distinct from the ordinary class-42 row marked `OPTIONAL ACCESSORY`. For ports with multiple rows, reducer codes remain tied to each exact class alternative: none, 1+2, 2+4, 5+6, or 1+3.

The 5C evidence now distinguishes the connected capacity/minimum-head table on printed p.38 from the detailed port/reducer table on printed p.39. The 4C 2MXM40/50 tables are on printed p.37. Connection-class ceilings are explicitly labeled as installed-combination limits, not delivered output or nominal cooling capacity. Minimum heads means physically connected heads; a disabled head still occupies a port and does not need to run.

Two disagreements stay explicit. For 2MXM50A2V1B8, the exact model table and 4C guide report the 20 m no-charge threshold, while the p.329 catalogue’s shared A8 row reports 30 m. For 5MXM90A2V1B8, its exact technical table labels total piping length “Actual 75 m,” while guide 5C gives an installation limit of ≤80 m. The candidate retains source-specific statements rather than collapsing either disagreement into a universal engine rule.

Validation passed: the candidate validator reports 9 structurally valid units, and `sha256sum -c` verifies all 13 pinned source snapshots plus the corrected candidate. No accepted catalogue, importer, runtime, tests, build output, or Git state was changed. This bounded batch does not complete the full Daikin consumer lineup and is not runtime-ready multisplit data.
