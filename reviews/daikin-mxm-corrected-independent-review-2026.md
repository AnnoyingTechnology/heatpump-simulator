# Independent review of the first corrected MXM research candidate

2026-10-11. **Research only; not accepted runtime equipment.** Review limited to the nine-model corrections against the prior independent readback and the same pinned primary sources. No production code, accepted ledger, source snapshot, build or git changes.

Reviewed candidate SHA-256: `95c0d8d6fa1e3cd13ffc935a7e47eec1587ccc34a016604b2eb3836fe36aa1f2` (`research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-corrected-2026.json`). Its ledger SHA-256 is `fa3d842c0024e6cc4a95de5e05c88840475be832feee4883d61fa8d05baf71dc`. All 13 primary source pins plus the candidate hash pass. The old frozen candidate remains `bb4de884cb03189bf623eef8643cab554db319a1d9219d42ad7bc86ad71d10a2`.

The JSON receipt beside this note records **51 focused checks, 28 named ports and 66 exact class/reducer alternatives**. Existing physical facts, full-reference identities, rated-data unknowns and source-bound dry-/wet-bulb operating envelopes remain unchanged. This correction does not substitute A9 facts onto A8 models.

## Verified improvements

The first correction resolves the three port extraction issues found previously:

- 2MXM50A2V1B8 port A now distinguishes ordinary class 42 requiring `OPTIONAL ACCESSORY` from the footnoted class 42/no-reducer alternative restricted to FTXM42R, FTXM42A or FTXA42C. The accessory identity remains unpublished in that table.
- Guide 4C reducer `1+2` and guide 5C reducers `2+4`, `5+6`, `1+3`, plus no-reducer alternatives, are tied to their exact rows. Ordinary class 42 on applicable larger ports is retained separately from the footnoted 42 alternative. Reducer numbers remain local drawing identifiers, not manufacturer part references.
- Guide 5C detailed port rows now correctly cite printed p.39; capacity-class ceilings and minimum connected-head notes cite p.38. Guide 4C port rows cite p.37. Every port C entry names port C in its locator; the diameter and reducer associations agree with the primary table.

Minimum two heads means physically **connected**, not enabled or running. Exact eligible indoor full-reference combinations remain unknown. Satisfying these necessary port/class constraints cannot certify an OEM combination.

The source disagreements are retained separately: 2MXM50's exact table/guide 20 m extra-charge threshold versus p.329's shared 30 m catalogue threshold; 5MXM90's technical-table “Actual 75 m” versus the guide installation limit ≤80 m. Facts retain their sources and conditions. Source-specific envelope limits retain DB/WB conditions; no universal charge, line or performance rule has been inferred.

## Regression blocking complete research acceptance

The correction **deletes seven previously recorded maximum-total-charge limits**, with no replacement facts. Restore these in a new producer-owned research version, preserving this reviewed version and its hashes:

| Exact full outdoor reference | Maximum total refrigerant charge |
| --- | --- |
| 2MXM68A2V1B8 | 2.4 kg |
| 3MXM40A2V1B8 | 2.2 kg |
| 3MXM52A2V1B8 | 2.2 kg |
| 3MXM68A2V1B8 | 2.4 kg |
| 4MXM68A2V1B8 | 2.6 kg |
| 4MXM80A2V1B8 | 3.2 kg |
| 5MXM90A2V1B8 | 3.3 kg |

Primary locator: **guide 4P766272-5C (2025.05), printed p.48, §8.4, table 8–1 “Maximum allowable refrigerant charge amount”**. Pinned PDF: `research/sources/luna-next-daikin-mxm-a8-installer-guide-5c-2025.pdf`, SHA-256 `251062cd18f1b5859646af9a9ddaffa80ac738380feb0f5303c48a0248264c86`.

The original candidate and my earlier temporary review retained the incorrect p.47 locator. Direct rendering of the pinned PDF establishes p.48; this note corrects that earlier locator. The numbers and exact model associations are unchanged. The cap applies to total refrigerant including additional charge, not merely factory charge. It must not be derived from model digits or automatically applied to the generic engine.

The preserved CVXM-A/FVXM-A restrictions for 3MXM40/52 also retain an incorrect **pp.32/47** locator. Correct to guide 5C **p.34 §7.1.3** for total liquid piping ≤30 m and **p.48 §8.4** for no additional charge and the CVXM-A9/FVXM-A9 exception. The restriction's content remains correct and is not extended to C/FVXM-B.

## Remaining limitations

This batch still requires typed independent port alternatives, conditions, installed connections and source-verified full-SKU eligibility. Connection-capacity class is separate from nominal cooling output; the 35 class must not be silently replaced by a 3.4 kW rated pair value. Outdoor airflow and OEM performance/control maps remain unknown. Unknown exact combinations need an explicit unknown result, not an unrestricted manufacturer compatibility list. Nine references do not complete the current Daikin consumer range.

**Disposition:** corrected port extraction and preserved source conflicts verified; first corrected batch is still blocked by lost charge limits and retained restriction locators. No multisplit runtime profiles accepted. A later corrected-v2 candidate has not been inspected or accepted by this receipt.
