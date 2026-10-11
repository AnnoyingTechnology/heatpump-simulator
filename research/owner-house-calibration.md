# Owner house: provisional winter calibration

Read-only science review, 2026-10-11. This note recommends implementation; it does not
claim a measured fit or authorize manufacturer-performance or charge-model changes.

## New evidence, 2026-10-11

Current owner confirms roughly49 m² common footprint,4 m² open stairwell per
interface and120 mm glass wool between floors. These supersede the assumed
5/3 m² openings below when the simpler parallel-path editor is released.
See [current geometry and heating observations](owner-heating-calibration-points.md)
for the2024/2025 daily electrical means and thermostat-schedule distinctions.
The earlier benchmark below remains evidence for its explicitly older preset.

## Evidence and previous preset mismatch

- Current owner statement: ground-floor unit at **17 °C** as backup, upstairs unit
  at **21.5 °C** as primary heating, attic indoor unit **off** in winter.
- Current owner clarification ties those settings to the outdoor **1 °C / 500 W**
  benchmark: actual downstairs approximately **18 °C**, actual attic **17.5–19 °C**.
  The ground floor has the greatest losses, including an uninsulated floor; the
  remainder is well insulated. These statements supersede speculation from the
  building's partial underground position. The electricity meter boundary remains
  unconfirmed.
- Historical first-party [owner article](https://blog.julienarnaud.fr/thermal-dimensioning-of-a-heat-pump.html),
  reread from the fresh Firefox-UA fetch: 1947 house renovated in 2016, open
  stairwells, floor volumes **100 / 155 / 84 m³**, partial underground ground floor,
  balanced double-flow ventilation, significant solar gains. The post says
  approximately 200 W AV heat gain; earlier baseline consumption is 100–200 W.
- Historical retrospective: at outdoor 1 °C, approximately 500 W heat-pump
  electricity versus 2000 W resistance heating; the older resistance comparison's
  temperatures and exact meter boundary remain unspecified. The cold week averaged
  10 kWh/day; coldest-day range 380–610 W, daily mean 460 W. These are electrical
  observations, not measured delivered thermal powers or performance maps.
- Previous, pre-calibration source inspected on 2026-10-11: `src/state.ts` set
  envelope **70 / 85 / 60 W/K**, all units on at 21 °C. `src/runtime/config.ts`
  additionally inherited **0.25 ACH** from generic engine defaults. Internal gains
  and interzone transfer were absent.
  At roughly 20 °C indoors, total sensible conductance is about **243 W/K** and
  losses at outdoor 1 °C exceeded **4.6 kW**. Turning the attic unit off then
  left its volume isolated from the upstairs heat source. The new implementation
  supplies explicit interzone links and gains, with the provisional preset below.

## What the measurements identify

For steady whole-house sensible balance:

`Q_heaters + Q_internal + Q_solar = Σ H_i (T_i − T_out) + Q_other_boundaries`.

At non-steady state add `dE_storage/dt` on the loss side. Interzone exchanges
cancel in the sum. Resistance heating is the best available thermal anchor;
500 W electricity alone does not identify either house loss or COP.

If the 2000 W value is heater-only and internal gains are 100–200 W, a uniform
19–21.5 °C assumption gives approximately **102–122 W/K** at outdoor 1 °C.
If 2000 W includes the AV load, the equivalent result is approximately **98–111
W/K**. The older resistance comparison's floor temperatures weaken this reduction. Use
**90–130 W/K aggregate sensible loss** as an exploratory prior, not a confidence
interval; about **110 W/K** is a defensible starting point.

This identifies neither the per-floor split nor the stairwell conductances,
thermal capacity, actual air-change rate, or heat-recovery effectiveness. Do not
apply the pre-install polynomial, volume coefficient, or added sizing margins as
physical laws. Stored solar heat need not have disappeared by 04:00. Whole-building
heat-loss measurement research explicitly treats solar gains as a confounder:
[Jack et al., original research](https://discovery.ucl.ac.uk/id/eprint/1570483/).

## Smallest honest implementation

Keep three physical floor volumes and add optional **effective interzone sensible
conductances** plus explicit per-zone sensible gains. These are lumped conduction
and air-mixing surrogates, not a resolved stack-flow model. A connection uses
`q_ij = H_ij (T_i − T_j)` from the same accepted pre-step temperatures; subtract
`q_ij` from i and add exactly the same amount to j. It changes neither dry-air
mass nor humidity. State the sensible-only limitation. No one-way “heat rises”
source, temperature copying, attic thermostat bypass, or imposed watts on the
refrigerant circuit is justified.

For actual air exchange, a later paired dry-air flow must transfer both
`m_da (h_j − h_i)` and `m_da (w_j − w_i)` with opposite terms on the other zone.
EnergyPlus documents [cross-zone air exchange](https://energyplus.readthedocs.io/en/stable/guides/engineering-reference/8.4-air-exchange.html)
as affecting both zones' mass and energy balances. Its doorway density-driven
closure should not be transplanted to horizontal stairwell geometry. Unknown
opening areas, circulation, stratification and supply jets do not justify a
numerically specific buoyancy law here.

Combining upstairs and attic into one **239 m³** zone is an acceptable explicit
well-mixed approximation: sum their envelope, gains and storage. It would remove
independent attic temperature and off-unit dynamics. With a cooler passive attic,
forcing its temperature to upstairs' target overestimates its heat loss; this is
not a universal upper bound because supply plumes/stratification can make it
warmer. Preserving three zones with stated assumed links better matches the
existing product and the current owner instruction.

Owner-authorized link parameters can describe either an open passage/stairwell
or a solid partition using `H = area × effective coefficient`. Open **40 W/(m²·K)**
and solid **1.5 W/(m²·K)** are editable scenario defaults, not measured or
regulatory values. Open coefficients represent effective sensible mixing, not
surface-film coefficients; solid coefficients represent effective partition
transmittance. Areas **5 / 3 m²** with the open coefficient preserve the accepted
owner conductances **200 / 120 W/K**, but those areas are assumed. The implemented
orientation describes **connection direction**, not surface normal: stacked-floor
connections are vertical. It classifies/draws the link and does not invent
directional physics.

## Suggested provisional preset

| Parameter | Ground | Upstairs | Attic |
|---|---:|---:|---:|
| Volume, historical geometry | 100 m³ | 155 m³ | 84 m³ |
| Unit enabled / target, current owner | On / 17 °C | On / 21.5 °C | Off / retained target |
| Envelope, assumed starting split | 45 W/K | 25 W/K | 15 W/K |
| Unrecovered air-exchange surrogate | 0.25 ACH | 0.25 ACH | 0.25 ACH |
| Sensible internal gain, assumed allocation | 200 W | 0 W | 0 W |

Assumed ground↔upstairs **200 W/K**, upstairs↔attic **120 W/K**. These are a
provisional network consistent with current temperature observations, not uniquely
identified measurements. The post places a movie/audio room downstairs; assigning
all AV heat there is nevertheless an assumed allocation. Expose it and its
historical **100–200 W** range. Initial ground/upstairs/attic **18 / 21.5 / 18.3
°C** approximates the reported winter state. Outdoor **1 °C** is the reference
condition; outdoor **35% RH**, if retained, is an unmeasured dry scenario choice.
Keep all fabric capacities explicitly assumed;
retain generic 4 MJ/K per floor initially rather than pretending volume determines
wall/furniture thermal mass. Initialize fabric at the selected initial room
temperature, not at a secretly calibrated steady state.

At outdoor 1 °C and fixed upstairs 21.5 °C, a dry sensible calculation with
air density 1.2 kg/m³ and cp 1006 J/kg/K predicts ground **17.97 °C**, attic
**18.32 °C**, total loss **2067 W**, net heat-pump delivery **1867 W**, and an
idle ground unit because its 17 °C target is already exceeded. First→ground
transfer is **706 W**, first→attic **382 W**. At 100 W AV gain the ground falls
to **17.58 °C** and heat-pump demand rises to **1945 W**. These are analytical
scenario consequences consistent with, but not proving, the owner's temperatures.
The 200 W case would imply system COP 3.73 if simultaneous whole-system input were
500 W; do not impose that COP. Native moist-air properties will differ slightly.

The aggregate 85 W/K envelope plus about 28 W/K air exchange is about **113
W/K**. The retained ACH is an **assumed unrecovered exchange**, not a measured
fresh-air rate or a complete model of the double-flow unit. Avoid separately
adding all-inclusive empirically fitted 110 W/K and this exchange again. If actual
mechanical flow becomes available, separate infiltration and mechanical flow,
and use sensible heat recovery on supply temperature, while conserving humidity
exchange. [EnergyPlus heat-recovery equations](https://energyplus.readthedocs.io/en/stable/guides/engineering-reference/16.8-heat-exchangers.html)
distinguish sensible and latent effectiveness; reducing moisture flow by a
sensible-efficiency factor is not equivalent.

## Controller, data and acceptance

Generic public defaults keep zero gains and no links. Make owner assumptions
editable and identifiable independently of equipment selection. Preserve the
generic inverter/refrigerant equations, compressor bounds/protection, EOS
acceptance and disabled charge gate. No speed/efficiency/coil change follows
from this building review.

The inverter feed-forward request should include link loss at target against
current neighbor temperature, and subtract configured sensible gain. Its PI
correction continues normally. Off indoor units still receive gains and interzone
heat, retain air/fabric/metal storage, and never enter the active refrigerant
allocation. Internal sensible gains cross the whole-model boundary energy ledger;
they do not count as heat-pump electricity or useful coil delivery. Pairwise
links cancel and must not become an external boundary term.

Meaningful validation before release:

1. Isolated unequal-temperature zones with losses/gains/coils off: links equalize
   temperature, conserve total stored energy, preserve water and dry-air inventories;
   zero links reproduce existing behavior. Check equal-temperature zero flux.
2. Gains-only adiabatic room: storage increase equals `gain × time`, with no
   fabricated compressor/fan electricity. Link and gain edits preserve existing
   stored state and ledgers; test worker configuration and room-ID mapping.
3. Analytical dry fixed-temperature upstairs case: passive attic approaches the
   above network solution; ground backup requirement has the correct sign.
   Test off attic, mode changes, deleted/reordered rooms and missing link endpoints.
4. Owner inverter run: check target approach, below-minimum cycling, protection,
   residuals and timestep refinement through one informative transient. Report
   delivered heat and electricity separately; do not gate on exactly 500 W.
5. Further calibration requires simultaneous outdoor temperature, ground/upstairs/attic
   room temperatures, actual unit status/targets, whole-unit electricity boundary,
   baseline/AV placement, VMC state and representative nights. Fit aggregate loss
   first from resistance or measured thermal balance, then zone split/links from
   temperature differences and cooldowns. Hold out at least one independent night;
   compare time-integrated electricity only after equipment behavior is separately
   credible. Daily 10 kWh cannot be matched without weather and solar/occupancy.

Ground-coupled loss is another unresolved boundary: using outdoor air for the
partially buried floor is an effective approximation over the observed winter
range, not a validated year-round soil model.

## Implemented transient checkpoint

The reviewed 1200 s warm-start [engine benchmark](owner-house-engine-benchmark.json)
has final ground/upstairs/attic temperatures **18.024 / 21.622 / 18.335 °C**.
Only upstairs delivers active heating. Final 300 s mean net HVAC heat is **1925 W**,
mean system electricity **649 W**, energy-weighted COP **2.965**. The floor
temperature pattern is approximately reproduced; electricity remains about **30%
above** the owner observation. The owner accepts this ballpark as a provisional
starting point with tolerances. No house/equipment coefficient was changed to hide
that difference. The 20-minute run is a transient checkpoint, with continuing
fabric/storage evolution, not a measured steady-state calibration. See the
[independent science review](../reviews/owner-house-science-review.md).
