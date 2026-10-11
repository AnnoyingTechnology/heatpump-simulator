# Daikin consumer class and physical supplement (2026-10-11)

Bounded source pass for current Daikin Europe 2026 catalogue classes: Perfera wall FTXM-A + RXM-A, and Siesta ATXC-E + ARXC-E. This is not a complete Daikin range and does not establish current France retail availability.

The candidate JSON beside this note preserves seven Perfera current class pairs from printed catalogue p.320. Those names are `published-class` identities only. The exact full factory suffix is unpublished in p.320, and archived France A2/A5 full references are not aliases. The p.320 HTML snapshot flattened merged cells, so I did not assign its dimensions or fan-flow values to classes without page-image layout proof. The original Perfera candidate file remains unchanged.

Daikin Europe printed catalogue p.338 confirms Siesta class pairs 20E/20E, 25E/25E, 35E/35E, 50E/50E, 60E/60E and 71E/71E. Daikin Europe product tables publish exact references ATXC20/25/35/50/60/71EV1B and ARXC20/25/35/50/60/71EV1B. Their full-reference column headers are paired with the class columns in the official pair table. The pair and physical measurements below are from those source columns; no French availability claim is made.

| Class | Exact indoor / outdoor references | Indoor H×W×D mm | Indoor cooling high flow | Outdoor H×W×D mm | Cooling ambient DB range | Heating ambient WB range | Refrigerant |
|---|---|---:|---:|---:|---:|---:|---|
| 20 | ATXC20EV1B / ARXC20EV1B | 288×770×234 | 10.8 m³/min = 648 m³/h | 550×658×273 | 10 to 46 °CDB | −15 to 18 °CWB | R-32 |
| 25 | ATXC25EV1B / ARXC25EV1B | 288×770×234 | 10.8 m³/min = 648 m³/h | 550×658×273 | 10 to 46 °CDB | −15 to 18 °CWB | R-32 |
| 35 | ATXC35EV1B / ARXC35EV1B | 288×770×234 | 11.1 m³/min = 666 m³/h | 550×658×273 | 10 to 46 °CDB | −15 to 18 °CWB | R-32 |
| 50 | ATXC50EV1B / ARXC50EV1B | 288×770×234 | 12.5 m³/min = 750 m³/h | 615×845×300 | −10 to 46 °CDB | −15 to 18 °CWB | R-32 |
| 60 | ATXC60EV1B / ARXC60EV1B | 297×990×273 | 20.4 m³/min = 1,224 m³/h | 615×845×300 | −10 to 46 °CDB | −15 to 18 °CWB | R-32 |
| 71 | ATXC71EV1B / ARXC71EV1B | 297×990×273 | 20.4 m³/min = 1,224 m³/h | 695×930×350 | −10 to 46 °CDB | −15 to 18 °CWB | R-32 |

The source table publishes cooling high-fan indoor flow in m³/min; m³/h is the direct ×60 conversion. No outdoor airflow or heating airflow is published in the cited rows. Heating operation range is explicitly wet-bulb (°CWB); cooling range is dry-bulb (°CDB). Heating airflow is kept distinct and omitted.

Pinned source hashes are included per source in the JSON. In particular, p.320 SHA-256 is `2becf651c2619e2ced56510cb32ae4a2cc8eabec377eed75e6c716444676f918` and p.338 SHA-256 is `dc659f625d295b0e3f319fe785a73028530d77655338036978cf5a4a8a8f08e2`.
