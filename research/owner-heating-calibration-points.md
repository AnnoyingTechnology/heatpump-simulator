# Owner heating observations and house geometry

Read on 2026-10-11 from the first-party articles using a Firefox user agent.
These are historical observations, not an OEM performance map. Current owner
statements take precedence over historical thermostat schedules.

## Adopted geometry, confirmed by the owner today

Keep the supplied floor areas/volumes: Ground 45.4 m²/100 m³, Upstairs
54.5 m²/155 m³, Attic 26 m²/84 m³. The approximate common footprint is
7 × 7 m, with a 2 × 2 m open stairwell between each adjacent pair of floors.
Use **4 m² opening plus 45 m² solid contact** per interface as the initial
49 m² partition of that approximate footprint. This is interface geometry,
not a replacement for the measured floor areas (including attic usable area).
Between-floor insulation is **120 mm glass wool**, confirmed explicitly;
the sizing article's exterior-wall and roof insulation does not specify it.

Opening and solid paths act in parallel. With the existing assumed sensible
mixing coefficient 40 W/(m²·K), representative wool conductivity 0.040 W/(m·K)
and assumed combined indoor film resistance 0.26 m²·K/W:

`H = 40 × A_open + A_solid / (0.26 + thickness_m / 0.040)`.

This gives **173.80 W/K** for each default interface. Areas/thickness remain
editable independently. The earlier 5/3 m² openings and 200/120 W/K links
were assumed calibration values and are superseded by the new geometry when
the connection interface is released. The 40 coefficient, surface films and
material conductivity remain assumptions; joists, other layers, thermal
bridges, stratification and moisture exchange are unresolved. Published
[Isover IBR Nu](https://www.isover.fr/produits/laine-de-verre/ibr-nu) and
[GR32 Nu](https://www.isover.fr/produits/laine-de-verre/gr-32-nu) illustrate
different wool conductivities (0.040 and 0.032); neither identifies the installed product.

## Historical calibration references

| Source | Outdoor condition | Heat-pump electrical observation | Schedule/context |
|---|---|---|---|
| [Sizing retrospective](https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html) | 1°C | About 500 W continuous | Owner confirms Ground17°C/Upstairs21.5°C/Attic Off; Ground~18°C, Attic17.5–19°C |
| Same article, coldest winter day | Day climate not numerically specified | 380–610 W range, 460 W daily mean | Do not pair with an invented constant outdoor temperature |
| [2024 retrospective](https://blog.julienarnaud.fr/2024-energy-restrospective.html), Nov28 | 12°C | 70 W daily mean =1.68 kWh/day | Brief morning/evening heating |
| Same, Dec9 | 8°C | 150 W daily mean =3.60 kWh/day | Timing changes around8°C |
| Same, Dec13 | 4°C | 300 W daily mean =7.20 kWh/day | Night reserve about18°C, daytime21–22°C |
| Same, Dec29 | 4°C | 325 W daily mean =7.80 kWh/day | Same broad winter description; actual hourly schedule unknown |
| [2025 retrospective](https://blog.julienarnaud.fr/2025-energy-retrospective.html), Jan2026 cold days | 0°C daily mean, dips−2°C | 450 W daily mean =10.80 kWh/day | Night reserve about14°C; most nights do not require heating |

The 2024 article reports **507 kWh heating** and **200 kWh cooling** for the
year, with707 kWh heat-pump total. The 2025 article reports **475 kWh heating**,
**430 kWh cooling** and907 kWh heat-pump total; the2 kWh discrepancy is retained
as reported rounding/aggregation uncertainty, not allocated to a mode.
Annual totals require actual weather and schedules before model comparison.

## How to use these observations

Keep present-day default winter targets17°C/21.5°C/Attic Off. A steady
continuous-heating benchmark can be checked against the~500 W observation.
The daily means require the reported setback and recovery schedules plus
time-varying weather; they are not steady points at the daytime targets.
An article's assumed COP is not a measurement of delivered heat.

Tune explicit room envelope losses, gains and declared mixing assumptions
within the physical model. Keep the equipment equations, efficiency bounds,
conservation tests and protection limits independent of these observations.
Do not invent annual climate, infer electrical input from grid import after
solar/battery offsets, or force the engine to output measured watts. The
existing649 W warm-start benchmark is a provisional20-minute comparison,
not a whole-house equilibrium or daily-average fit.
