# Quasi-steady charge-balanced Reference closure

Status 2026-11-17: implemented in `src/engine/charge-balance.ts` and `src/engine/cycle-charge.ts`, selectable in the UI as circuit model **Charge**. The default remains the fixed-subcooling Reference (**Fixed**). Everything below is a declared generic model. None of it is fitted to OEM performance or factory charge.

## What it adds

The fixed-subcooling Reference holds 1 K condenser subcooling and has no refrigerant inventory. The charge-balanced closure removes that fixed subcooling. Instead, the refrigerant mass stored in the solved cycle must equal the specified charge. Charge therefore sets condensing pressure, subcooling (or flash gas at the EEV inlet), superheat and, when the controller saturates, liquid parked in the accumulator. This is the "charge-balanced" mode described in the ORNL HPDM input guide ([charge sections](https://web.ornl.gov/~jacksonwl/purez/hpdata.html)). The extra equation comes with an extra unknown, the condenser outlet state, so SH and SC are never both held.

The closure is **quasi-steady**:

- Every step solves an equilibrium distribution of the given charge.
- Redistribution after a room switch, reversal or defrost is instantaneous.
- No refrigerant mass or internal energy is integrated in time.

The transient conserved Inventory model in `research/refrigerant-charge-model-design.md` remains separately gated.

## Inventory

- **Coils.** Each coil uses finite-UA integration with uniform conductance per unit length. Position along the coil follows cumulative conductance, `dz = (ṁ/UA)·dh/|T(h) − T_metal|`.
  - Two-phase zones use the exact integral of the Zivi (1964) void fraction, slip `S = (ρL/ρV)^(1/3)`.
  - Single-phase zones use a 4-point Gauss rule on a fixed 0.5 grid in `log|T − T_metal|`, so the inventory stays continuous for the solver.
  - Coil length not covered by the heat-exchange profile holds the outlet state (pinched approach).
  - The outdoor coil is integrated along the path on which it was solved.
- **Accumulator.** It holds suction vapour plus any parked saturated liquid. Parked liquid is limited to 90 % of the vessel volume.
- **Field lines.** They store their **physical** volume (configured length × inside bore) at the adjacent component state:
  - Heating: the gas line carries discharge; the small line carries branch condensate.
  - Cooling: the small line carries flashed two-phase from the outdoor-unit EEV.
  - Line transport stays idealized: no pressure drop, heat exchange or elevation. Physical line transport is unavailable with this closure.
- **Off branches.** Heating: saturated vapour at high pressure. Cooling: low-pressure vapour at the stopped coil's metal temperature.
- **Not modelled:** compressor shell, oil solubility and outdoor-unit internal piping.

Default generic volumes:

| Component | Default volume |
| --- | --- |
| Outdoor coil | 40 m of 6 mm bore |
| Each indoor coil | 10 m of 6 mm bore |
| Accumulator | 0.6 L |

All of them can be edited and apply live.

## Nominal charge

The nominal charge is generic, not the factory charge. It is the larger of two fixed-subcooling Reference inventories:

| Rating point | Indoor metal | Outdoor metal |
| --- | --- | --- |
| Heating | 35 °C | 0 °C |
| Cooling | 12 °C | 42 °C |

Both points use all branches on and the midpoint compressor speed. Neither mode therefore starts undercharged, and the other mode stores the excess as subcooling or accumulator liquid. The nominal depends on the volumes and on each line's length and bores, so it is recomputed per installation. The UI charge is a percentage of it, from 20 to 200 %, and applies live.

## Controller regimes (complementarity)

The generic EEV holds superheat at the compressor target. When a controlled quantity reaches its limit, a different quantity is held instead:

| Regime | Held | Released |
| --- | --- | --- |
| `superheat` | SH = target | Tc, Te from charge and evaporator closure |
| `valve-limit` | EEV fully open (generic area 1.5 mm², Cd 0.65 per branch) | SH above target; discharge free, only the engine's discharge protection applies |
| `minimum-lift` | Tc − Te = 1 K heating / 8 K cooling | SH |
| `discharge-limit` / `accumulator` | discharge = max − 20 K (125 °C) | one continuous EEV variable: SH > 0, then parked liquid at 0.02 kg/K |
| `condensing-limit` | Tc = 58 °C (5 K below the 63 °C trip), capped inside the fluid domain | the same continuous EEV variable |

Both ceilings act on the same EEV. The more restrictive one governs. Once liquid is parked, the suction is saturated and opening further cannot cool the discharge.

A solved regime is rejected when a released quantity crosses its bound, and the rejection names the neighbouring regime. A failed solve also points to the next regime through the limit its closest trial violates.

## Protections

- **High-side flooding.** The charge exceeds what the circuit can hold below the 63 °C trip, even with the accumulator at its limit. The compressor pauses under the condensing-temperature protection.
  - On a cold start the decision is one bound: the most charge any controlled regime can hold, with condensing at the 58 °C ceiling, saturated suction and a full accumulator.
  - A successful retry at the ceiling releases the latch, because 58 °C sits 1 K below the drive's 59 °C release threshold.
- **Refrigerant shortage.** The charge is below the inventory at the onset of condensation (condenser outlet at quality 0.999 with superheat held, or with the EEV fully open if it saturates first). No liquid reaches the EEVs, so a generic low-charge supervisor stops the compressor.
- **Retries.** Both stops are retried on the minimum off time, as a supervisor's restart attempt; the stopped circuit is not re-solved between attempts. Editing the charge retries at once.

## Numerics

- **Newton.** Damped finite-difference Newton on scaled residuals, where 1 mg of inventory is comparable to 0.1 W of coil heat.
  - Steps that exceed a per-unknown limit are scaled uniformly. Clamping components separately would change the step direction, which then need not descend at any length.
  - If a full step overshoots, a Newton step is tried from the overshoot point with that side's Jacobian before step halving. This handles the inventory slope kink where a coil outlet crosses saturation, because Zivi holdup falls steeply just inside the dome.
  - Four consecutive gains below 10 % count as stagnation.
- **Nested solve.** It solves the mass equation by Illinois bracketing on one unknown, with the other equations solved by Newton at each trial. It is the first method for `condensing-limit`: with Tc held, the evaporator closure is a 1-D problem in Te that pinches sharply near the outdoor metal temperature, and mass is nearly linear in the EEV variable. It is also the first method for a cold `superheat` start from generic seeds, where the same pinch appears as Te approaches the outdoor metal temperature less the superheat target. Warm steps use plain Newton, with the nested solve as a fallback in the thorough pass.
- **Regime walk.** Pass 1 uses warm and neighbour seeds ordered by initial residual, with plain Newton. Pass 2 adds generic seeds and the nested fallback.
- **Cold start.** Superheat inventory at the 58 °C ceiling is checked first. If it is below the charge, the solve goes straight to `condensing-limit`, seeded with the missing mass as parked liquid.
- **Cost (2026-11-17, one desktop core, guarded backend).** Warm steps take tens to ~150 ms. Cold starts take 50–160 ms at the condensing limit and 0.2–0.5 s in superheat; a flooded start is decided in ~50 ms.

## Qualification and limits

- **Fluids.** Pure fluids qualified by the Reference engine (R32, R22, R290, R134a, R1234yf). The pseudo-pure mixtures R410A and R407C are excluded because the slip closure assumes a single saturation temperature at each pressure.
- **Evidence.** `tests/engine/charge-balance.test.mjs` covers:
  - exact Zivi integration and inventory smoothness;
  - nominal reproduction of the Reference;
  - monotone heating response;
  - every regime, flooding and shortage;
  - a multi-split with one of three rooms;
  - a live 70 → 110 % edit inside the engine.

  The scenario runner `tests/engine/charge-balance-scenario.mjs` reproduces longer runs with energy residuals of order 1e-6 J. Examples: three rooms with natural defrost, a 40 %-charge cooling case on valve limit, a one-of-three heating case on condensing limit.
- **Unknown.** The installed charge response of any specific appliance. The generic EEV, volumes, ceilings and nominal definition are assumptions. Charge transients, oil, the compressor shell and line transport are outside this closure.
