# Independently reviewed Siesta exact indoor supplement

18 exact Daikin France technical-table heads are added: ATXM20/25/35/50A2V1B and A5V1B (eight), ATXP20/25/35N5V1B9 (three), ATXF20/25/35/42/50F5V1B and ATXF60/71F2V1B (seven). Manufacturer reference and casing extraction came from designated Luna research; independent review preserved those values and supplied the published high-fan airflow cells. Original candidates remain immutable and hash-pinned by the receipt.

All three indoor tables publish cooling/heating high-fan m³/min values. Applied cooling values are converted ×60 to m³/h; heating flow remains documentary because the current engine explicitly reuses cooling airflow in heating. No capacity is inferred from model digits, and no compressor, coil conductance, fan power or charge calibration is imported. ATXF header order is 71/20/25/35/50/42/60; the readback binds each exact full reference rather than sorting numeric classes.

The candidate status is unknown and runtime notes keep France current retail availability unverified. These heads are choices for the generic sandbox and unverified Daikin multisplit installations. Eight exact ARXM/ARXF monosplit pair columns remain documentary: the corresponding distinct outdoor physical profiles have not been promoted. ATXP pairing remains unknown. ATX is never aliased to FTX; ARX is never aliased to RX. Existing RXF60D5V1B9 still matches only FTXF60F2V1B.

Reviewed candidate SHA-256: `0d2bc595d99bf92023777a67aaad6c17a9eb8662ac8d747963b7242806441e9f`.
Independent receipt SHA-256: `771d782bbb4d2d5f94adf04ed0017d745d1fd0a4167d6cfd0e2b08349f5196ea`.
The receipt requires five exact primary HTML snapshots, all three designated Luna candidates and the independent primary-cell readback. Missing/changed pins, cooling/heating substitution, field/value changes, reference aliases and unauthorized topology claims are rejected by the importer.

Validation: 36 catalogue tests; TypeScript/build; 45 isolated-browser assertions with zero browser exceptions, including all 18 native selectors, preserved room/pool/history/manual settings, French availability markers, strict RXF distinction and a completed physical worker step. All 250 earlier accepted records and all 86 outdoor / 164 indoor profiles are unchanged as JSON values. Result: 61 Daikin outdoors / 137 indoors plus 25 Mitsubishi outdoors / 45 indoors. No family-class identities are promoted in this commit. Complete current manufacturer range coverage remains pending.
