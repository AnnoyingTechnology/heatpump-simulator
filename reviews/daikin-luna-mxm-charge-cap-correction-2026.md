# MXM maximum-charge research correction

Second bounded research correction, 2026-10-11. The first corrected candidate and its ledger remain unchanged. The new candidate restores the seven maximum-total-charge constraints omitted from that version and corrects their source locator to installer guide 5C printed p.48, §8.4, table 8-1.

The pinned primary table associates 2.2 kg with 3MXM40 and 3MXM52; 2.4 kg with 3MXM68 and 2MXM68; 2.6 kg with 4MXM68; 3.2 kg with 4MXM80; and 3.3 kg with 5MXM90. These model-specific caps include any additional field charge and are not derived from factory charge.

Candidate: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-second-corrected-2026.json`  
SHA-256: `80a31e578d613756cf3c2316ef0272d88b394977d9046801a8055e47c1373217`

Source ledger: `research/catalogue/staging/luna-next-daikin-mxm-a8-a9-physical-and-constraints-second-corrected-2026.sha256`  
Ledger SHA-256: `7816734d72b8e6b8465a07d9e99c09ab3713ab822c4b7b98879667625a3279c0`

Primary guide pin: `research/sources/luna-next-daikin-mxm-a8-installer-guide-5c-2025.pdf`, SHA-256 `251062cd18f1b5859646af9a9ddaffa80ac738380feb0f5303c48a0248264c86`.

Validation passed for all 9 candidate units; `sha256sum -c` verified all 13 source snapshots plus the new candidate. No accepted catalogue, runtime, importer, tests, build output, or Git state was changed.
