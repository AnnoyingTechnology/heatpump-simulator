# Luna Daikin FTXTP-A source receipt

Retrieved/reviewed 2026-11-17. Manufacturer source: Daikin Europe, *General Catalogue 2026 Split*, ECPEN26-500 (02/2026), printed p.349, [official page](https://catalogues.daikin.eu/flipbooks/EN/General_catalogue/04split/349/). The source page and renderer assets are kept under `research/sources/`.

| Snapshot | SHA-256 | Use |
|---|---|---|
| `research/sources/luna-next-daikin-2026-catalogue-p349.html` | `812b43607aa93e6d0ab6ad26591e354a2b4907eb8ea3f24d79eed996f27385c7` | Primary table text; class identities and size-specific pair columns. |
| `research/sources/luna-daikin-2026-p349-layout.svg` | `190853bee6507bed9656658f8419abd707be3cac4a676700b4cf749069143532` | Positioned text used to align the pair table and merged cells. |
| `research/sources/luna-daikin-2026-p349-background.webp` | `17d8b56d850b1cd5224b8ac095d7348053616ace7ad45f5386b15c3126ab4d2a` | Page background and table cell geometry. |

The class pair columns read `25A + 25A` and `35A + 35A`. The indoor flow row is 11 m³/min cooling high, converted exactly to 660 m³/h; dimensions are 286 × 770 × 225 mm. The matching outdoor table cells publish 605 × 930 × 376 mm, R-32, cooling −10…46 °C dry-bulb and heating −31…18 °C wet-bulb. The separate heating dry-bulb range is preserved in the candidate source excerpt but omitted from runtime range metadata, which stores wet-bulb heating limits. No outdoor flow or performance data is inferred.

The candidate is `research/catalogue/staging/luna-daikin-nepura-ftxtp-classes-2026.json` (SHA-256 `a6e66210fc9d01bbbd7c9beadb75dece235f78f3cde7d126c5f01f612211c4f9`). Independent applied-field and identity review is `reviews/nepura-ftxtp-classes-independent-acceptance-2026.json`; its hash is pinned by `research/catalogue/equipment-acceptance.json`.
