# MXM restriction locator correction

Third bounded, research-only correction on 2026-10-11. It changes only the evidence locator for the existing 3MXM40/3MXM52 CVXM-A/FVXM-A restriction. Content and all other candidate fields are identical to v2.

The pinned Daikin guide 5C (PDF SHA-256 `251062cd18f1b5859646af9a9ddaffa80ac738380feb0f5303c48a0248264c86`) places the ≤30 m total liquid piping restriction at printed p.34, §7.1.3. It places the no-additional-charge rule and CVXM-A9/FVXM-A9 exemption at printed p.48, §8.4. The updated locator cites both pages; restriction scope and wording are unchanged.

Candidate: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-third-corrected-2026.json`  
SHA-256: `47439a0335128d2abf0e344961a50e0c2b8894cbc97cd882e59a5627bb38e015`

Source ledger: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-third-corrected-2026.sha256`  
Ledger SHA-256: `2d20e0115ebb75259b404a5527272a9e6243bd653289cbaf9f25c637d046bd22`

Structural delta proof: parsing v2 and v3 as JSON and recursively comparing values found exactly two changed paths: `$.units[3].compatibility[3].evidence.locator` and `$.units[4].compatibility[3].evidence.locator` (3MXM40A2V1B8 and 3MXM52A2V1B8). No other values, keys, or array lengths changed. Candidate validation passed for all 9 units; all 13 source snapshots and the candidate passed ledger verification. Earlier candidate versions and source snapshots remain untouched.
