# Independently reviewed RXF-D9 supplement

The exact Europe technical-table outdoor references RXF60D5V1B9 and RXF71D5V1B9 are added, each with only its independently verified FTXF60F2V1B or FTXF71F2V1B monosplit pairing. Both publish 734 × 870 × 373 mm casing, R32 and cooling −10…48 °C dry-bulb / heating −15…18 °C wet-bulb ranges. These ranges are informational. Outdoor airflow is unpublished in the pinned table, so manual generic mass flow remains in use. No output map, electrical minimum, coil conductance or charge calibration is imported.

Europe technical-table presence establishes neither current sales nor France availability. Runtime profiles carry `sourceStatus: availability-unknown` and `marketScope: Europe; France availability unverified`. Existing France indoor acceptance/status records remain unchanged (including the archived FTXF60 row); no current-sales assertion is made for either head.

Candidate SHA-256: `4f3f19b2dcb2657a616dec57f930bb9ae73897566c36a36cbfefdc2376b84658`.
Independent acceptance receipt SHA-256: `754d417083cf12aa36caf52029f22c7ac61cbcfc24a6a4dddd263772065b0652`.
The receipt binds exact source bytes, full reference columns, status, facts/DB-WB conditions, one-to-one pairings and market metadata. The importer rejects changed receipts, missing primary snapshots and changes to these reviewed facts/claims.

Validation: 32 catalogue tests; TypeScript check; 19 isolated-browser assertions with zero browser exceptions. The browser tool starts and closes its own immutable dev snapshot. All 248 previously accepted records and all 84 outdoor / 164 indoor generated profiles remain unchanged as JSON values. Result: 61 Daikin outdoors / 119 indoors, plus 25 Mitsubishi outdoors / 45 indoors; generic and owner references remain separate. This is bounded coverage, not a complete current manufacturer range.
