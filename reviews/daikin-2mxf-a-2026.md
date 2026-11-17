# Daikin 2MXF-A source review — 2026-11-17

Candidate `research/catalogue/staging/luna-daikin-2mxf-a-2026.json` SHA-256 `34e2e8cb402057473dc5c149bf8271dc2454cab4766f2295755c461e4edbf2cf`.

Primary sources are the Daikin Europe 2MXF-A product table, CTXF-F/2MXF-A system table, and current Daikin France guide 4PFR600463-3K (2026.04).

The guide prints two ports A/B; 2MXF40 ports A/B both use gas Ø9.5 mm, classes 20/25/35 without reducers, maximum total class 6.0 kW. 2MXF50 port A is Ø9.5 mm classes 20/25/35/42 without reducers; port B is Ø12.7 mm, same classes with reducers 1+2; maximum total class 8.5 kW. The exact CTXF-F table columns show two CTXF20F5V1B heads with 2MXF40A2V1B and two CTXF25F5V1B heads with 2MXF50A2V1B.

The minimum connected head count is unpublished. Exact eligibility beyond those stated combination columns, other full-SKU maps, system performance and outdoor airflow remain unknown. France retail availability is unverified. No compressor map or performance was inferred.

## Independent acceptance

Receipt: `reviews/daikin-2mxf-a-independent-acceptance-2026.json` SHA-256 `b2ed315cfecf201323b96df65d7102b5bdf25b10a324c41ef05745a2cfeffe60`.

| Outdoor reference | Total capacity class cap | Maximum heads | Port class/reducer rules |
|---|---:|---:|---|
| 2MXF40A2V1B | 6.0 kW | 2 | A/B Ø9.5: 20/25/35, none |
| 2MXF50A2V1B | 8.5 kW | 2 | A Ø9.5: 20/25/35/42, none; B Ø12.7: same classes, 1+2 |
