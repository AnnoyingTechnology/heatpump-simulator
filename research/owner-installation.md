# Owner installation source and documented preset

Research snapshot: 2026-10-10. This is a source note for the initial simulator preset. It keeps the owner’s dated account separate from Daikin’s published limits and from measurements we have not independently made. The owner’s blog is first-party owner evidence, but its pre-install calculations and retrospective are not an instrumented manufacturer performance map.

## Source and access

Julien Arnaud, [“Sizing of my heat pump (Daikin 3MXM52)”](https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html), originally written around the 2023 installation and last updated 2024-06-15 (as stated on the page). Fetched on 2026-10-10 with Firefox-like user agent; response was HTTP 200. Treat the article’s time-specific facts as historical owner records unless Julien re-confirms them.

## Preset identity

| Item | Evidence and status |
|---|---|
| Outdoor unit | Owner article title and text identify **Daikin 3MXM52N8** (`declared` by owner; serial/nameplate not independently viewed). The 2019–20 Daikin Central Europe catalogue covers the 3MXM52N family and names a listed full outdoor variant **3MXM52N2V1B**. These suffixes should not be conflated without checking the installed unit nameplate. The opened 2019 installer guide cover also names N2V1B, so its circuit diagram is a close family reference rather than direct confirmation of the owner's later N8 revision. |
| Indoor units | Owner article’s intended and installed layout is 1 × FTXA25 at ground level, 1 × FTXA35 upstairs, and 1 × FTXA25 in the attic. Exact complete suffix, color and market code of each indoor unit are **unknown**. The article sometimes abbreviates these as FTX25/FTX35. |
| Combination support | Daikin’s 2019–20 Split catalogue lists 3MXM52N compatible combinations by indoor nominal size, including exactly 2.5 + 2.5 + 3.5. It provides cooling and heating rows for full outdoor variant 3MXM52N2V1B. This supports the size combination, but does not identify the owner’s indoor suffixes. |
| System refrigerant | Daikin catalog specifies R32 for the 3MXM52N family. The owner page also describes R32 charge. |

## Published equipment dimensions and data

Values below are manufacturer-published catalog data; they describe products/model families and are not tape measurements of the installed equipment.

- **Outdoor 3MXM52N:** Daikin Central Europe 2019–20 catalog p.43 (PDF p.42) gives dimensions H × W × D = **734 × 958 × 340 mm**, net mass **41 kg**, R32 factory charge **1.80 kg**, liquid/gas pipe outside diameters **6.35 / 9.5 mm**, and maximum branch length 25 m. It lists standard product data in a family table; use unit nameplate for installed factory charge and exact model suffix.
- **Indoor FTXA25/35 chassis:** same catalog p.33 (PDF p.32) groups FTXA 20/25/35/42/50 dimensions as H × W × D = **295 × 798 × 189 mm**, mass **12 kg**. Thus capacity-class 25 and 35 share nominal casing dimensions in this edition. It also lists different airflow ranges by size; those must not be copied from an FTXA mono-split row as actual owner multi-split airflow under every mode.
- The catalogue’s combination data are nominal allocations for test conditions, not fixed capacities each cassette always receives. For **3MXM52N2V1B + 2.5 + 2.5 + 3.5**, the heating table gives nominal indoor allocations **2.00 + 2.00 + 2.80 kW**, total 6.80 kW, electrical input 1.35 kW, COP 5.05; the cooling table gives **1.53 + 1.53 + 2.14 kW**, total 5.20 kW, input 1.04 kW, EER 5.02. Daikin’s printed headings explicitly separate per-room allocations, outdoor total capacity, input and COP/EER. Do not treat these figures as the unit’s actual current output or individual room capacity outside the rated test point. The catalogue table does not state those test conditions beside each row.
- The opened 2019 3MXM-N installer guide (cover variant 3MXM52N2V1B) says each branch may be up to 25 m, total system limit 50 m, shortest allowed room branch 3 m. Standard charge covers total one-way liquid-line length ≤30 m; above that, additional charge is `(total one-way liquid-line length − 30 m) × 0.020 kg/m`, rounded to 0.1 kg; maximum allowable total refrigerant charge for 3MXM52 group is 2.2 kg. Treat this as published N2-generation family evidence, not a verified N8-specific revision. See [`primary-source-register.md`](primary-source-register.md) for exact manual URL and sections.
- Daikin's currently opened 3MXM-N product documentation page lists that 2019 guide. A candidate 2020 guide indexed by Daikin with N8 in its title could not be retrieved from the official URL (HTTP 404), and no opened N8 service/circuit schematic was found in this pass. Therefore the internal topology and service-connection layout for the owner's exact N8 revision remain **unknown**; the 2019 N2 drawing is only family-level context.

## Owner’s piping account and comparison with Daikin limits

The blog lists three routes:

| Owner label | Reported line length | Reported vertical difference |
|---|---:|---:|
| Ground floor | 7.5 m | 2.1 m |
| First floor | 6.5 m | 5.1 m |
| Attic | 14.0 m | 7.85 m |
| **Sum as reported** | **28.0 m** | **15.05 m** |

The article states factory charge 1.8 kg, no top-up at 28 m because extra charge begins only above 30 m, and calls the sum of vertical differences “pretty much within” a 15 m maximum. The model-specific Daikin guide independently supports a 30 m charge threshold and 20 g/m beyond it. On the documented route lengths, total is 28 m and each branch is below 25 m, so the **reported lengths** fit those two guide limits and imply zero extra charge. This is a comparison of the owner-reported lengths to the guide, not a verified as-built survey or refrigerant-charge inspection.

The **15.05 m sum of three branch elevation differences is not the manufacturer’s height-difference criterion**. Daikin specifies separate maximum outdoor-to-indoor and indoor-to-indoor vertical differences, with limits that depend on whether the outdoor unit is above or below indoor equipment: outdoor above: ≤15 m outdoor–indoor and ≤7.5 m indoor–indoor; outdoor below at least one indoor: ≤7.5 m outdoor–indoor and ≤15 m indoor–indoor. The outdoor unit’s exact elevation relative to the three units, and precise indoor-to-indoor differences, are not established in the blog text extracted for this note. In particular, the attic’s individually reported 7.85 m difference would exceed a 7.5 m per-unit limit if the outdoor unit is lower than that attic indoor unit. Therefore height-limit compliance is **unknown**, and the vertical values must not be summed to claim pass/fail.

## Owner-reported design assumptions and retrospective observations

The pre-install portion reports the following (`historical`, owner-written): house built in 1947, renovated to RT2012 in 2016; 125.9 m² floor area and 339 m³ total volume, of which 220 m³ described as actually heated; intended units at ground/upstairs/attic; attic head intended primarily for cooling. It estimates a heating load from winter 2022–23 Linky data and regression, and separately uses a volume × assumed coefficient × temperature-difference rule. The article describes these as approximations and reports substantial solar gain, internal electric loads, and uncertainty; these are contextual inputs, not verified current building fabric or a standardized heat-loss calculation.

The article reports that after installation the three heads were installed in the intended locations, and that winter 2023–24 was very mild. Owner observations include 500 W electrical operation at an outdoor temperature around +1°C while maintaining indoor temperature, a cold-week average around 410 W, and about 460 W average electrical power over a reported coldest day. These are reported electrical measurements/observations, not direct heat-output or COP measurements. The blog expressly says actual COP could not be determined precisely. Its yearly/seasonal behavior cannot validate the simulator’s cycle model.

Installation notes in the article: outdoor unit is under a shelter closed on two sides; owner believes airflow may be restricted. The article reports installers used a vacuum process and raised two caveats: no torque wrench was used, and installers were not Daikin approved. Retain these as owner narrative, not as a present-day safety assessment.

## Modeling implications and open points

- Start the visual preset with one outdoor chassis and three independently controlled indoor fan-coils/rooms, while labeling exact indoor suffixes and geometry as unknown.
- Keep actual physical pipe lengths as owner-reported initial values (7.5/6.5/14 m) with a visible “owner-reported” provenance tag and editable defaults. Diagram routing length should remain independent of those physical values.
- Do not configure vertical differences as their sum. Either store the individual owner reports and derive pairwise elevations only when geometry is known, or leave the relevant comparisons unknown.
- Offer manufacturer catalogue nominal split capacity allocations only as explicitly rated reference data; do not insert them as live current output values or claim owner field validation.
- Do not infer refrigerant pressure from the owner’s charge value; pressure depends on operating state and the heat exchanger/control model.
- Still unknown: installed complete model suffixes/nameplates; exact indoor/outdoor elevations; exact as-built line survey and tubing diameters by branch; charge actually on nameplate/field-added amount; indoor and outdoor installation clearances/airflow; current connected-unit communications/control behavior; measured sensible/latent outputs and mode-specific capacity at given ambient conditions.

## Source links for validation

- Owner article: https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html
- Daikin Central Europe 2019–20 Split catalogue (combination, dimensions, charge): https://my.daikin.eu/content/dam/dace-hr/literature/Katalog_Split_2019-2020.pdf
- Daikin 3MXM-N Installer Reference Guide 4P600463-1 (2019; variant cover includes 3MXM52N2V1B; line, height, charge, service-port and schematic rules): https://www.daikin.eu/content/dam/document-library/Installer-reference-guide/ac/split/3MXM-N%2C%203AMXM-M%2C%203AMXF-A%2C%203MXF-A%2C%204MXM-N%2C%205MXM-N_4PEN600463-1_2019_10_Installer%20reference%20guide_English.pdf
- Local reference copy and printed-p29 circuit diagram: [`sources/daikin-3mxm-n-installer-reference-guide-2019.pdf`](sources/daikin-3mxm-n-installer-reference-guide-2019.pdf), [`sources/daikin-3mxm-n-schematic-page29-29.png`](sources/daikin-3mxm-n-schematic-page29-29.png). These are unmodified excerpts from the public official PDF for ease of scientific review.
