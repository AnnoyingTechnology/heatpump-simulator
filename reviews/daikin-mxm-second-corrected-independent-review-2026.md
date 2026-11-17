# Independent review of the second corrected MXM research candidate

2026-10-11. **Research only; no multisplit runtime acceptance.** This addendum preserves the first corrected candidate and its independent review. It verifies only the new seven charge-cap entries and that every other candidate field remains unchanged.

Candidate: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-second-corrected-2026.json`, SHA-256 `80a31e578d613756cf3c2316ef0272d88b394977d9046801a8055e47c1373217`. Ledger SHA-256: `7816734d72b8e6b8465a07d9e99c09ab3713ab822c4b7b98879667625a3279c0`. All 13 primary snapshots and the candidate hash match. The original first correction remains frozen at `95c0d8d6fa1e3cd13ffc935a7e47eec1587ccc34a016604b2eb3836fe36aa1f2`.

Seven model associations pass independent primary readback from guide 4P766272-5C (2025.05), **printed p.48, §8.4, table 8–1**:

| Exact outdoor | Maximum total charge |
| --- | --- |
| 2MXM68A2V1B8 | 2.4 kg |
| 3MXM40A2V1B8 | 2.2 kg |
| 3MXM52A2V1B8 | 2.2 kg |
| 3MXM68A2V1B8 | 2.4 kg |
| 4MXM68A2V1B8 | 2.6 kg |
| 4MXM80A2V1B8 | 3.2 kg |
| 5MXM90A2V1B8 | 3.3 kg |

PDF pin: `research/sources/luna-next-daikin-mxm-a8-installer-guide-5c-2025.pdf`, SHA-256 `251062cd18f1b5859646af9a9ddaffa80ac738380feb0f5303c48a0248264c86`. The cap is for total refrigerant including additional field charge; it is not inferred from factory charge.

Removing exactly those seven new entries reproduces the first corrected candidate as identical JSON values. Therefore the independently verified 28 ports/66 alternatives, class-42 accessory distinctions, local reducer drawing identifiers, p.39 port C locators, connected-versus-running semantics and separately preserved source conflicts remain unchanged. The first review's deletion regression is resolved in this second version.

One residual evidence-locator error remains: the 3MXM40/52 CVXM-A/FVXM-A restrictions still cite printed pp.32/47. Correct references are **p.34 §7.1.3** for the ≤30 m total liquid length and **p.48 §8.4** for no added charge and the A9 exceptions. Content remains correct; the preserved source locator needs a future producer-owned correction.

Typed port/connection-class alternatives, full-indoor-reference eligibility and combination-specific ratings remain unresolved. No blanket compatibility, OEM power map or airflow is established. The 5MXM90 75/80 m and 2MXM50 20/30 m source disagreements remain source-specific statements. This bounded nine-model research does not complete the Daikin consumer range.

Receipt: `reviews/daikin-mxm-second-corrected-independent-review-2026.json`; prior findings: `reviews/daikin-mxm-corrected-independent-review-2026.md` and its JSON receipt. Only these new review artifacts were written. No accepted ledger, runtime, source snapshot, build or git change was made.
