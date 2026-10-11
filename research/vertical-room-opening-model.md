# Orientation-dependent room opening exchange: research proposal

Status: researched proposal, 2026-10-11. **No engine implementation or calibration is included in this pass.** The current engine still uses prescribed symmetric sensible conductance. Its frontend orientation changes layout and estimated exposed envelope area, not opening physics.

## Physical issue and terminology

The owner reports winter outdoor air around 0°C, upstairs L1 near 21.5°C with its head heating, ground L0 around 16°C with occasional heating, and attic L2 Off around 18–19°C. These are observations to test against, not parameters from which to manufacture compressor efficiency or refrigerant performance.

Be precise about orientation: a **vertical room link**, connecting floors, passes through a **horizontal opening** in the floor/ceiling. A **horizontal room link**, connecting adjacent rooms, normally passes through a **vertical opening** in a wall. The physics literature names the aperture plane, whereas the current UI names the room connection direction.

Cooper's horizontal-vent model addresses density instability: dense fluid above lighter fluid can produce simultaneous opposed streams even without imposed pressure difference. A standard one-direction orifice calculation misses that exchange. The stable arrangement does not generate this instability. [Cooper, NISTIR 89-4052 (1989)](https://www.nist.gov/publications/calculation-flow-through-horizontal-ceilingfloor-vent), [original report, §§2–3](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir89-4052.pdf).

For similar humidity and ordinary indoor temperatures, warm air is lighter. Thus L1 warm above colder L0 is stable across their horizontal opening; L1 warm below colder L2 is unstable. This explains the expected asymmetry of natural mixing. It does **not** mean all downward heat transfer stops: solid conduction, molecular transport, disturbance-induced mixing and pressure-driven circulation remain possible. Air density at the opening, rather than thermostat settings or outdoor temperature alone, determines the stability.

Blomqvist and Sandberg measured square horizontal openings in a salt-water scale model. Their exchange law is `q = C A^(5/4) sqrt(g′)` for each direction, with measured C = 0.063 for the unobstructed case. Adding a 36° sloping plane increased the initial exchange by about 13% in that experiment. They observed internal stratification and warned that model-scale and full-scale patterns can differ. These are geometry-dependent experiments, not a universal stairwell coefficient. [Author-uploaded original paper, §§2.1, 3.1–3.3 (2004)](https://www.researchgate.net/publication/287666373_Air_Movements_through_Horizontal_Openings_in_Buildings_-_A_Model_Study), [publication DOI](https://doi.org/10.1080/14733315.2004.11683898).

## Candidate A: conservative sensible equivalent, recommended first implementation

This extends the present two-node thermal model. It computes a buoyancy-informed **effective sensible exchange**, without claiming that the engine now transports air or humidity between rooms. This is a purposeful scope limit; full moist-air counterflow is a different model extension.

Keep two independent parallel paths:

`Qsolid,A→B = Hsolid × (TA − TB)`

`Hsolid = Asolid / (Rfilm + thickness / lambda)`

The existing declared values Asolid = 45 m², thickness = 0.120 m, lambda = 0.040 W/(m K), Rfilm = 0.26 m² K/W give Hsolid = 13.8036809815951 W/K. This conduction remains bidirectional. Constant film resistance is still an approximation; it must not acquire an artificial sign gate.

For a vertical room link, identify lower and upper physical nodes explicitly. In a temperature-only, Boussinesq approximation:

`TmeanK = 273.15 + (TlowerC + TupperC)/2`

`g′unstable = g × max(TlowerC − TupperC, 0) / TmeanK`  [m/s²]

For a square floor opening:

`qbuoy = Cfloor × Aopen^(5/4) × sqrt(g′unstable)`  [m³/s **in each direction**]

`Hbuoy = rhoreference × cpreference × qbuoy`  [W/K]

`Qopening,A→B = (Hbackground + Hbuoy) × (TA − TB)`  [W]

`Qtotal,A→B = Qsolid,A→B + Qopening,A→B`

Density ρ [kg/m³] and specific heat cp [J/(kg K)] must be declared reference assumptions or consistently obtained from the existing air model. Use one common coefficient per paired transfer, not a separate coefficient at each room endpoint. The nonlinear floor exchange scales as positive temperature contrast to power 3/2 in Q, and is continuous at zero contrast. Its derivative as a heat flux also tends to zero there; a switching timer or arbitrary thermostat-like deadband is unnecessary.

EnergyPlus's zero-imposed-pressure horizontal-opening branch uses `mdot = rhobar × 0.055 × sqrt(g × abs(Δrho) × DH^5 / rhobar)` only when the upper air is denser. DH is hydraulic diameter; its documented staircase correction requires stair angle. Its full model also treats pressure-driven flow and exchange suppression near purge conditions. For the known square aperture, DH = sqrt(A), making the corresponding temperature-only Cfloor = 0.055 candidate directly usable. This is a reduced zero-pressure branch, not the complete AirflowNetwork. [EnergyPlus Engineering Reference, horizontal openings, equations 13.38–13.51](https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/13.1-airflownetwork-model.html).

**Recommendation:** default to this published 0.055 square-opening branch, retain Cfloor as an advanced effective coefficient, and document 0.063 as a relevant alternative experiment rather than a confidence bound. Do not average these values or attach a universal error bar. Opening aspect ratio, thickness, obstruction and stair angle are not known well enough to justify a more precise owner coefficient.

Hbackground represents residual sensible mixing not resolved by the buoyancy branch. Keep it finite, nonnegative, independently editable and separately reported. A physically explicit unforced idealization can default it to zero; an owner-specific nonzero value must be labelled an assumption or calibrated from independent temperature-response measurements. **Do not carry the current 40 W/(m² K) over as background mixing:** for a 4 m² opening this supplies 160 W/K even in a stable arrangement and preserves the very error under examination. Do not convert an indoor fan's recirculation flow into inter-floor mixing without an actual coupling fraction and geometry evidence.

This is not a heat diode. Each unstable exchange contains a rising warm stream and a descending cool stream; its net sensible transfer is hot-to-cold. Stable downward heat still uses solid conduction and any declared background mixing. Reversing the temperatures of fixed lower/upper nodes changes the buoyancy branch because gravitational stability has changed, not because the A/B naming has changed. Swapping A/B labels while preserving physical elevation must only reverse the reported power sign.

### Horizontal room connections / wall openings

For a rectangular vertical wall opening with width w, height hopen and no imposed pressure, a simple Boussinesq orifice integration places the neutral plane at half opening height. Integrating one half of the opening gives the proposed one-direction exchange:

`qbuoy,wall = (Cd/3) × Aopen × sqrt(g × hopen × abs(TA − TB)/TmeanK)`

This is a derived approximation, valid for the stated equal-pressure, well-mixed two-room assumptions. It allows counterflow for either sign of the thermal contrast: warm air passes through the upper portion and cool air returns through the lower portion. Cd is a discharge coefficient, not Cfloor; the values cannot be interchanged. Narrow apertures, boundary contractions, a displaced neutral plane, obstructions and unequal pressures need a different coefficient or pressure-network treatment.

Area alone does not determine wall-opening flow: **opening height is required**. Do not substitute room ceiling height for opening height unnoticed. A future default door-height guess would need to be explicit; it is unnecessary for the owner's floor-opening setup. The existing prescribed-H mode remains useful for arbitrary links whose aperture geometry is unknown.

## Candidate B: explicit reciprocal moist-air exchange, later

The sensible equivalent does not redistribute humidity, contaminants or dry air. If actual air exchange is added, define equal **dry-air mass** rates m in both directions, rather than adding heat while silently leaving transported moisture behind:

`dmwater,A/dt = m × (wB − wA)`; `dmwater,B/dt = −dmwater,A/dt`

`dEair,A/dt = m × (hB − hA)`; `dEair,B/dt = −dEair,A/dt`

Here w is humidity ratio [kg water/kg dry air], h is specific moist-air enthalpy [J/kg dry air], and m is one-way dry-air exchange [kg dry air/s]. Net dry-air mass is zero for each room. Room phase equilibration then conserves any resulting condensate/ice and energy. Do not also add `Hbuoy × ΔT`: that would double-count sensible transport. Distinguish approximately equal volumes under Boussinesq assumptions from exactly paired dry-air masses in a conservative implementation.

A net one-way ventilation stream requires compensating paths and pressure/mass balances. A stairwell plus another opening, wind or ventilation pressure can create an unbalanced exchange and suppress a return stream. Wise and Hunt analyze this transition; simply summing an imposed one-way flow and an undisturbed balanced exchange is not generally valid. [Wise and Hunt, Journal of Fluid Mechanics 888 A22 (2020), original author manuscript](https://www.repository.cam.ac.uk/items/54a5722b-a4f5-4d12-a8ba-7e3f512d4a05).

Do not infer inter-floor forced pressure from global single/dual-flow ventilation mode: the present inputs do not specify room supply/extract locations, leakage paths or door states. Candidate B is useful when humidity transfer itself becomes a requested feature, but is not needed to correct the first conservative thermal approximation.

## Minimal schema and default geometry proposal

Retain legacy `{roomA, roomB, conductanceWK}` links as the existing prescribed-H mode. Add an explicit opening-exchange mode, with separate `solidConductanceWK`, nonnegative `backgroundConductanceWK`, opening area and physical aperture kind. A floor-opening link requires `lowerRoomId` (one endpoint) so its orientation survives room order changes. A wall-opening link needs opening height. Validate geometry, temperatures, coefficients and endpoint IDs before accepting configuration.

Frontend geometry already supplies opening area 4 m² and solid area 45 m² with 120 mm insulation for both owner floor pairs. The stated 2 × 2 m aperture permits a square-opening approximation without another question. Existing room mean heights provide volumes/storage and room elevations if later needed; they are **not** the aperture hydraulic length or floor slab thickness. The 120 mm glass wool is also not automatically the opening passage thickness. Stair angle and total floor construction thickness remain unknown: do not invent a sloping-plane multiplier or a long-shaft correction.

Live diagnostics should separate Qsolid, Qbackground and Qbuoy, plus stable/unstable state. Report any displayed q as an **equivalent exchange estimate** in Candidate A. A direct whole-link H override must explicitly select prescribed-H mode; otherwise it would conceal a nonlinear model behind an unrelated H cache. The whole-house envelope ruler remains external loss only: do not add internal opening transfer to it.

## Conservation, control and numerical acceptance

Evaluate every edge from one common accepted pre-step state. Subtract Qtotal × dt from A and add the identical quantity to B before any candidate room mutation. Internal transfer sums to zero and changes neither whole-house external energy nor service-heat/COP accounting. Off heads remain physical room nodes.

Use the same pure edge law for instantaneous diagnostics and controller feedforward. To estimate loss at a room's target, substitute **only that room's** target into the nonlinear edge calculation, while retaining the neighbour's actual accepted temperature and fixed physical lower/upper identity. A disabled neighbour's target is never a boundary condition. Do not freeze Hbuoy calculated at the old temperature contrast when evaluating a target loss.

For two sensible storage nodes with capacities CA and CB, the local temperature-difference relaxation rate is proportional to H × (1/CA + 1/CB). A large explicit step can overmix or invert a gradient even when energy is conserved. Either substep against this timescale using the nonlinear law's local slope, or solve the pair exchange implicitly with a bounded scalar root. Use shared substeps for the complete room network, not sequential edges with unrelated updated endpoint temperatures. Existing energy/phase rollback must cover any failed candidate step. Time acceleration should request more physical steps, never loosen conservation or stability guards.

Acceptance must cover: stable upper-warm floor pair; unstable lower-warm floor pair; thermal reversal/cooling; A/B rename invariance; zero area; disabled-head warming; solid conduction with either sign; timestep refinement; network energy sum zero; target feedforward against actual Off neighbours; bounded equilibration without overshoot; and conservation/phase rollback if moist-air exchange is implemented. No house-specific assertion should demand 500 W electrical input.

## What this can and cannot establish

The reduced floor-opening model gives a defensible reason why warm L1 should exchange more naturally with a colder attic above than with a colder ground floor below. It cannot prove the reported steady room temperatures or electrical input: a single well-mixed node misses temperature gradients at the stair head, ceiling plumes, doors, stair obstructions, pressure paths, solar/occupant gains and fabric storage. Ground/foundation heat loss is still an effective envelope term. A full-house steady-state comparison also requires much longer than a short visual demonstration of these large thermal masses.

Proceed with Candidate A only after the current indoor-control release is stable, then review it independently and compare owner scenarios with frozen assumptions. Keep measured performance validation distinct from adjusting envelope U or background mixing. The refrigerant and OEM performance model must remain unchanged by this opening correction.
