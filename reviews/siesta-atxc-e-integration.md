# Independently reviewed Siesta ATXC-E / ARXC-E pairs

Six exact European monosplit pairs are added: ATXC20/25/35/50/60/71EV1B with the corresponding ARXC20/25/35/50/60/71EV1B. The full-reference pair table establishes each association directly; no suffix is inferred from the class name. The original designated Luna mixed supplement remains immutable; its Siesta subset is converted to the existing strict candidate schema and independently checked against three complete primary HTML tables.

Published indoor cooling high-fan flows are 648, 648, 666, 750, 1224 and 1224 m³/h respectively. Outdoor airflow remains unpublished/manual. Cooling ambient minima are **+10 °CDB** for classes20/25/35 and **−10 °CDB** for50/60/71, with maximum46 °CDB. Heating range is −15…18 °CWB for all six. Casing sizes and R32 are source-bound. No thermal capacity, compressor minimum/maximum, UA, fan power or charge calibration is imported. Published ranges remain informational.

Source listing is European and current France retail availability is unverified. The model information now renders source scope dynamically, so European indoor heads are no longer described as France-table entries. English and French keep that distinction.

Reviewed candidate SHA-256: `56a1b987a691b8ef48658125b004232b566e08fc7fb09917ac0a3e6c7ed7086a`.
Independent receipt SHA-256: `0c8d7a1480c570267f99e65668a43c3f87a51d01608b61bb39e7432b2b4e6a7b`.
Receipt binds the designated Luna input, p338 catalogue context and all three exact European table snapshots. Pairing evidence cites the full-reference pair table, rather than claiming the p338 class-only header prints factory suffixes.

Validation: 37 catalogue tests, TypeScript/build, 33 isolated ATXC browser assertions and the existing 45 Siesta browser assertions (zero exceptions). All earlier268 acceptance records and86 outdoor/182 indoor runtime profiles are unchanged as JSON values. Result: 67 Daikin outdoors /143 indoors plus25 Mitsubishi outdoors /45 indoors. Perfera class integration remains a separate change; full consumer-range coverage remains incomplete.
