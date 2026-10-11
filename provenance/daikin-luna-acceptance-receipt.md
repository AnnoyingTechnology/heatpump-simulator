# Daikin Luna source acceptance receipt

**Review date:** 2026-10-11. **Accepted status:** scoped model fields in the local `equipment-acceptance.json`; not a full catalogue acceptance. Runtime generation remains source-hash pinned. Official source rows document manufacturer data; the simulator still uses its generic/manual behavior where no validated compressor map is available.

## Accepted candidate hashes

| Family | Candidate SHA-256 | Accepted scope |
|---|---|---|
| Ururu Sarara FTXZ-N + RXZ-N | `f72d7fd221b5428e1f762db07f7120a94dd317f7a7ec3a83d587b10f038e8cc7` | 25/35/50 exact pairs; indoor case/cooling high flow/class; outdoor case/R-32/ranges. |
| Emura FTXJ-AW9/AS9/AB + RXJ-A9 | `9ec9f65d33e65cdeb3abe760118b81b47b0360de53eff69cad110a62ba2b0443` | 15 finish/size-specific indoor references; five RXJ-A9 outdoor references; all 15 exact color pairings have separate official table evidence. |
| Comfora FTXP-N + RXP-N | `dc5850ce871e55c81d1679ac848bfa04bfc0d49c3e694ff5ea38cdc452a7bf04` | Six catalogue size-class pairs. FTXP50 remains the published FTXP50N9 pairing class; the exact France SKU FTXP50N5V1B9 cross-checks its 286×770×225 mm casing. Outdoor flow unpublished; other accepted fields remain source-bounded. |
| Sensira FTXF-F + legacy RXF-F | `849da6f9b6e6af3afdeccad098d7fffb104c51b68c644f94ffc6f89d8a6d68b2` | Seven full indoor references with exact casing/flow/class; France table marks FTXF35/50/60 archived and confirms FTXF71 cooling-high airflow. Five exact RXF20/25/35/42/50 outdoor refs are explicitly archived in France and retained historically with exact catalogue class pairs; RXF60/71 pairing/outdoor facts remain unaccepted. |
| Sensira FTXC-E + RXC-E | `def85631d3eff0c8798af9771aa1dd9df1f8333c2b91329ab6c58b030eb7b0ea` | All six full EV1B indoor/outdoor pairs; exact indoor flow/casing and outdoor casing/R-32/size-specific limits. No capacity-class inference; outdoor airflow unpublished. |
| FDXM-F9 current concealed-duct indoor heads | `f854a90de2f82e23454613cb3d339d3b9069ed4e9574fc151988a4598070cf4a` | Full 25/35/50/60F3V1B9 heads with exact dimensions/cooling-high flow; RXM family classes are recorded, but outdoor profiles are still generic pending accepted RXM outdoor facts. |
| Historical Perfera FTXM-A indoor heads | `e8e20d7df6aacae1819631e55dcea85423f55e2ea4f2854b5a8dd6eff53c399b` | Twelve distinct full archived indoor SKUs with casing/cooling-high flow; no suffix-specific pairing or class asserted. |
| Perfera FTXM-A + RXM-A9 exact legacy pairs | `cce2c446cbf32f75b140670bf608d33d0076dbe208dcd6234da1ef3109f07fa2` | Three RXM-A9 full refs with exact per-indoor FTXM A2/A5 and FVXM-B pair evidence; RXM20/42/60/71, RXM-A8 and FTXM20/42/60/71 pairings remain unresolved. |
| Perfera floor FVXM-B + RXM-A9 | `b86be0da91044af68f96adf02aac3122f772f2c589e0dea53d7a17afd671054e` | Three full indoor refs (25/35/50), exact casing and high-cooling airflow; FVXM35 is marked archived in Daikin France. Exact RXM25/35/50 A5V1B9 pairings are accepted individually. |
| Shared Perfera RXM-A9 wall/floor pair maps | `cce2c446cbf32f75b140670bf608d33d0076dbe208dcd6234da1ef3109f07fa2` | RXM25/35/50 A5V1B9 pair maps cover the accepted FTXM-A wall heads and FVXM-B floor head of the corresponding size, with source evidence for each exact indoor SKU. |
| Stylish Nepura CW/CB + RXTA-C | `7680ed38ac701aaca5bc43b785111ec3e58ce5dad6835cf9e585c09583a9b4c9` | Exact CW and CB 30-size variants; RXTA30C2V1B pairing evidence separately per indoor. |
| Nepura FTXTJ-A + RXTJ-A | `4a38010a6b590141fe12e275b8ffc96851c68ecc55fbbfaed2414800e1c4c134` | AW/AB 30-size variants; RXTJ30A evidence separately per indoor. |
| Nepura FTXTM-A / FVXTM-B + RXTM-A | `014b921898cd8ad0edcdea8bdd51eccbdfeafe927b1f1dd21cb225e64da71750` | FTXTM30/40A and FVXTM30B; RXTM30A exact pair map covers both wall and floor references. |

Each candidate also remains in `research/catalogue/staging/`. Other `luna-daikin-*.json` files are research candidates only and are not included in runtime acceptance.

## Primary source snapshots

All HTML files below are local retrieval snapshots of official Daikin Europe or Daikin France primary pages. Hashes pin the exact reviewed content; route number and printed catalogue heading are recorded in the candidate facts.

| Source snapshot | SHA-256 |
|---|---|
| `research/catalogue/source-cache/daikin-eu-2026-split-page-307.html` | `6ed56c9960c23278782b8416ea2b32afa7aa28a3199c5b0a88d784efeb1a8dd0` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-311.html` | `f82f1797b0042010e6968bb8dc6d5446fe7c1d39abcba3fb1a39ed59854fbf03` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-315.html` | `78dc59876286ee6e8536bbf168e61cc556f7bcba0b8545b53c05f13182727be4` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-317.html` | `edb62277030ef27c3bc11483ad7c4f382f5eadf0c09bad37af84f64d3ca5112c` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-320.html` | `2becf651c2619e2ced56510cb32ae4a2cc8eabec377eed75e6c716444676f918` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-321.html` | `0a15650ca7d3b2e50f1d050dfa17000242040572dc2230bf40500b77543dd4d7` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-322.html` | `b64a02f21c99daf9f3b6777330715014cd9217fac753594fb8b6550a797f6817` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-323.html` | `de459846df88b583911ad0125bb0d547a275813573464e5f2524e97e67ff67b9` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-324.html` | `290bc3283c05ca6a6b8c7e34e0a27aba93024338b4bd72359315b5d9a6f00e49` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-325.html` | `227c32e9dd938d780567ddbda22105ec6910313701b057a0933bbae38ddd6b56` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-327.html` | `8cde915bfffbf9a83c63eaa4b030f0848fc5c82c5e67ddc6e2855353c7b38be0` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-328.html` | `486a964c7a8d77e01d904ef8cc07a0ff9f8d06bd636a22839cc14343cefff9a1` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-329.html` | `ed7ce858b700324b0cdea0c21b967b42fa8ad9ceade9848154d40533445567f5` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-332.html` | `2a741fb446e8cb78f08a509a3998b4c55ebf9c74ffa2f2040fd56e6c85f0aae8` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-344.html` | `dbfc8d2f146a95453173f586ca1879906b718d47d38f6a3e1eed8b96b7e33f9e` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-345.html` | `0f7b3b226c196ef604fd58d73d7a460c947d60cdbbae9db459f63dc366ed7cfa` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-347.html` | `5e0871724f8d79dd69c168427b74e621d2f5b326148295657118773ef8e1e253` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-348.html` | `ed5ca26baeeb5bcb3dfd81318ec1295d71940d67e505e4b2d714d31e4b792d82` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-349.html` | `812b43607aa93e6d0ab6ad26591e354a2b4907eb8ea3f24d79eed996f27385c7` |
| `research/catalogue/source-cache/daikin-eu-2026-split-page-350.html` | `3608e35939dce9227998680ed3d5f205d472bc5439d09bc6f8c20a7392e5e47c` |
| `research/sources/luna-daikin-ftxp-n9-table.html` | `5e1ec7e8c40b006db05f7b0f9e9dd9da0f00cec660e8d5e688812367e9db3eab` |
| `research/sources/luna-daikin-rxp-n9-table.html` | `d0a4eb5dd3567a94b76c30fc3ab16ee28b4af04bf934d49a9a47712d43449d4e` |
| `research/sources/luna-daikin-current-air-air-range.html` | `1692c16708884096e9bd1b28a5ca8993d83d1ecaa3271f2355823568d55109fe` |
| `research/sources/luna-daikin-ftxta-cw-pair-table.html` | `1a196f03789ef388c9ce0fac0c861da245d8988274fba035bcd3efe522e2b854` |
| `research/sources/luna-daikin-ftxta-cb-pair-table.html` | `a529c233304785e487fcb99b593e92040d5cd2ee7169bf02cd87a309c7ae424b` |
| `research/sources/luna-daikin-ftxta-cw-single-table.html` | `8b53c1a1ecd30a043e3a2a7819d4bcb7c60d1803ce1e1118818981771b33379d` |
| `research/sources/luna-daikin-ftxta-cb-single-table.html` | `47a34ba4616b85b20c837b2b5d32b9761ab386b461b3b03524966b9d4d1076e2` |
| `research/sources/luna-daikin-rxta-c-table.html` | `0516df40ef6b087585546a6dd5a761dadd25162324e11d026de87038765e8f94` |
| `research/sources/luna-daikin-ftxm-a-table.html` | `e6ab92a63f05386179d79ab4373b22774b40646634f0eca10f9ffe39063603d4` |
| `research/sources/luna-daikin-ftxm-a-pair-rxm-a9.html` | `69a9264119cc37eba9e2bb3d60daaf59ee691bacd53080ea73b416b34840858b` |
| `research/sources/luna-daikin-rxm-a9.html` | `beafecde9d6c056fa088c70bd3f7702f489d92b0c72960638dfc8a8cc90d4af8` |
| `research/sources/luna-daikin-fvxm-b.html` | `80f531eff9a553969c86ac8bad8dad8cb59225736d5e71d238f554fd9868f5dc` |
| `research/sources/luna-daikin-fvxm-b-pair-rxm-a9.html` | `f70af7c7a261b07ce6c3f68bfd8ff562b97adf95414c139f43ee5ab5c70b64f4` |
| `research/sources/luna-daikin-fdxm-f9-table.html` | `0aab88e4d862274a178a230c968b82d1e044a39c76a6c8f9ef84e6bb5bb9ae24` |
| `research/sources/luna-daikin-rxf-f-table.html` | `083fd8ed38052874ba87df4dab26607835bf66933dfa3b6a269262477b30736e` |
| `research/sources/luna-daikin-ftxf-f-table-2026.html` | `0e4002cc0957a600116dcb7ede34c3924a4796ee95ee6ef1975951e0d7d643be` |
| `research/sources/luna-daikin-rxc-e.html` | `4a30265f8b3f852a898c694d870b93711d889c8981d50b0f765900fc5c6613c3` |
| `research/sources/luna-daikin-ftxc-e-pair-rxc-e.html` | `e0619231c9bbafa997eeb52615e76795361c5cdd1156a01a426a9d4ec124ecdf` |
| `research/sources/luna-daikin-ftxc-e.html` | `3d544f531665983471bb339afff8855057aac801164f16436f844b59adab62c0` |
| `research/sources/luna-daikin-emura-ftxj-aw9---rxj-a9.html` | `3bedd89cd9a827f4ca55f9019cc8a776b82f007fd2b71339d634c72f401592fa` |
| `research/sources/luna-daikin-emura-ftxj-as9---rxj-a9.html` | `fc5b3674f6ad4bdcbf6dedd664f3297f475a7a9cac7809c97f03be8cc6cc0a62` |
| `research/sources/luna-daikin-emura-ftxj-ab---rxj-a9.html` | `66158daa2f22c52a465885a1b7afa9e719ec9d746ce617ec6f0ce0bfc0e2c5f2` |
| `research/sources/luna-daikin-emura-ftxj-aw9.html` | `7d1b3793ecb8b856bc04d84ff7af214f9b84197c4321b3c73daf8e4e1e5f030b` |
| `research/sources/luna-daikin-emura-ftxj-as9.html` | `1f3913e7c484f04d259f9c058547d5c8ddd3d35e77b70427d9fc86224b82f1bb` |
| `research/sources/luna-daikin-emura-ftxj-ab.html` | `37aa9dbf30f4956a7c1cae03dd432325868b0b2ccb65c36e30086a67afb3866b` |
| `research/sources/luna-daikin-emura-rxj-a9.html` | `70c6b5a3100869dfe605bb4923481d19a0b9292847cc724ca1addfcf2b4c8cc1` |

Comfora also uses the Europe p.321 catalogue page and official France RXP technical page snapshot; both hashes are pinned in `equipment-acceptance.json` under `additionalSourceSnapshots`.

## Conditions and unresolved data

Ururu cooling limits are outdoor dry-bulb (`-10..43 °CDB`); heating limits are outdoor wet-bulb (`-20..18 °CWB`). Nepura cold-climate cooling limits and heating limits are retained with their published dry-/wet-bulb condition. These are manufacturer operation-range metadata, not validated compressor maps. Outdoor fan airflow is unpublished for all accepted Daikin profiles and is intentionally represented as unknown. The Daikin 2026 catalogue lists the families in Europe; local France availability remains family/model dependent and is tracked separately in the coverage review.
