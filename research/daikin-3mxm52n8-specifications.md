# Daikin 3MXM52N8 manufacturer specifications

Research checked 2026-10-11. Scope is the exact N8 outdoor unit, identified in Daikin technical drawings as **3MXM52N2V1B8**. Do not substitute 3MXM52N/ N9/ 3MXM52M2V1B. The stated indoor configuration is FTXA25 + FTXA35 + FTXA25; exact indoor suffixes have not been supplied.

## Model and published general data

Daikin's French 3MXM-N8 technical table lists the 52 model under `3MXM52N2V1B8`: 734 × 974 × 401 mm (H×W×D), 57 kg; hermetic swing compressor; R-32 charge 1.8 kg / 1.22 tCO2eq / GWP 675; outdoor supply 1~ 50 Hz, 220–240 V. The table states fan speed 420 rpm (extra-low cooling, very-low heating), sound pressure 46 dBA cooling / 47 dBA heating, cooling ambient range −10 to 46 °C DB; pipe run per indoor 25 m, system total 50 m, max height difference outdoor above indoor 15 m and indoor-to-indoor 7.5 m. With CVXM-A/FVXM-A combinations Daikin limits total piping to 30 m. The general table's “additional charge 0.02 kg/m above 30 m” is consistent with that condition; the installer guide says no additional charge is allowed for CVXM/FVXM combinations and total liquid piping must be ≤30 m. This installation has FTXA units, so do not apply the CVXM/FVXM special case unless its actual indoor units differ.

The installer guide gives generic N8/N family ambient limits: cooling −10…46 °C DB and heating −15…24 °C DB. The French product table itself publishes only cooling range. These are operating envelopes, not guarantees of rated capacity across the envelope.

## Capacity and electrical input (Daikin N8 combination tables)

Daikin provides separate **heating** and **cooling** combination tables for 3MXM52N8, explicitly identifying the model as `3MXM52N2V1B8`. Both are at 50 Hz / 230 V. The sheets give min/nominal/max system capacity and input for supported indoor unit classes. The nominal conditions are heating: indoor 20 °C DB, outdoor 7 °C DB / 6 °C WB; cooling: indoor 27 °C DB / 19 °C WB, outdoor 35 °C DB.

The exact unordered size combination 2.5 + 2.5 + 3.5 kW appears in both sheets (the displayed row ordering is class-sorted; it is equivalent in class sizes to the stated 2.5+3.5+2.5 setup):

| Mode | System capacity min / nominal / max | Electrical input min / nominal / max | Total current min / nominal / max |
|---|---:|---:|---:|
| Heating | 1.5 / 6.8 / 8.1 kW | 0.32 / 1.35 / 2.09 kW | 1.44 / 6.12 / 9.47 A |
| Cooling | 1.9 / 5.2 / 7.2 kW | 0.39 / 1.04 / 2.16 kW | 1.75 / 4.72 / 9.75 A |

Visual inspection of both one-page combination tables confirms the exact unordered class combination 2.5+2.5+3.5 and the figures above. Table notes name wall-mounted CTXM/FTXM classes, not FTXA explicitly. The 3MXM-N8 product page separately lists FTXA-BB/BS/BT/CB/CS/CW as compatible. The capacity/input rows are manufacturer data for these unit-size classes, but the exact FTXA suffix combination is not a distinct table row. Do not treat the combined heating/cooling min values as a universal instantaneous lower bound across all temperatures, defrost, standby, or all operating modes.

**Electrical input range distinction (owner report, 2026-10-11):** Julien confirms 2350 W as the system's upper power value; the measurement conditions were not supplied. Julien reports personally observing the complete system running steadily at 130 W when the temperature difference (delta-T) was low. This is owner-reported observed evidence, not a measurement independently made for this research. Daikin's published combination rows give minimum inputs of 320 W heating and 390 W cooling at their specified combination rating conditions. Those minima describe the published table points and are not hard instantaneous floors across other delta-T or operating conditions; they do not refute the 130 W observation. Do not use compressor revolutions, Hz, RPS, electrical input, and thermal output interchangeably.

The outdoor electrical data sheet reports minimum circuit ampacity (MCA) 14.59 A for N2V1B8, max fuse 20 A for one indoor-unit class column, and the outdoor fan motor output 0.056 kW / full-load current 0.37 A. It does not provide compressor frequency/RPS limits or compressor-only electrical input. Fan speed in rpm is not a complete outdoor airflow/exhaust specification; an airflow value was not established in the source set.

## Connections and geometry

Visual inspection of Daikin piping drawing 3D097989C confirms three refrigerant branch ports. Each room liquid pipe is 6.4 mm CuT (1/4 in). Gas pipe sizes are Room A 9.5 mm CuT (3/8 in), Room B 12.7 mm CuT (1/2 in), Room C 12.7 mm CuT (1/2 in). These are field-piping diameters shown beside each room connection. Internal schematic tubing includes other sizes and must not be mistaken for field connections.

## Source register (Daikin primary sources)

1. [Daikin France 3MXM-N8 technical table](https://www.daikin.fr/fr_fr/products/product.table.html/3mxm-n8.html) — product-table entry and general specifications.
2. [Daikin Spain 3MXM-N8 product page](https://www.daikin.es/es_es/productos/product.html/3MXM-N8.html) — supported indoor families; links technical drawings and manuals.
3. [Heating combinations, 3D105372E EN](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/Split/3MXM-N8/EN/3MXM52N8_comb_3D105372E_EN.pdf) — 1 page; exact model row and operating conditions, p.1. Table class-size rows, capacities, inputs, current.
4. [Cooling combinations, 3D105371B EN](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/Split/3MXM-N8/EN/3MXM52N8_comb_3D105371B_EN.pdf) — 1 page; exact model row and operating conditions, p.1.
5. [Electrical data, 3D129421B EN](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/Split/3MXM-N8/EN/3MXM-N8_eldata_3D129421B_EN.pdf) — outdoor electrical ratings and motor details, p.1.
6. [Refrigerant piping drawing, 3D097989C EN](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/Split/3MXM-N8/EN/3MXM-N8_pip_3d097989c_EN.pdf) — visual inspection of p.1 confirms three branches and per-room field tube sizes listed above.
7. [Daikin France installer reference guide 4PFR600463-1C](https://www.daikin.fr/content/dam/document-library/Installer-reference-guide/ac/split/2MXM-N%2C3MXM-N9%2C3MXM-N8%2C3AMXM-N9%2C4MXM-N9%2C5MXM-N9_4PFR600463-1C_Installer%20reference%20guide_French.pdf) — pages 37–38 piping/height rules, p.51 additional charge, p.29 operation envelope. It is a shared-family guide and should be used for the N8-specific statements only where it explicitly names 3MXM40N8/52N8.
8. [Daikin N8 operation range drawing, 3D109333 EN](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/Split/3MXM-N8/EN/3MXM52N8_operange_3D109333_EN.pdf) — primarily hybrid-for-multi envelope; not the normal air-conditioning capacity map. Do not interpret its graphic as ordinary FTXA heating limits.

The N8 tables/docs above supersede generic or reseller N/N9 material for this task. The exact indoor suffixes and compressor internal speed limits remain unknown.

## Later owner clarification, 2026-10-11

Julien distinguishes observed low-load limits of approximately200W in heating and130W in cooling. At1°C outdoors he observes continuous~500W system input except reversal/defrost. Starts ramp over several seconds. These are owner observations, not published compressor-speed limits or a request to force the engine's electrical output. Daily averages70W at12°C,150W at8°C and300–325W at4°C include seasonal heating schedules and cannot be treated as continuous operating floors. The initial universal130W interpretation above is superseded by this mode-specific clarification.
