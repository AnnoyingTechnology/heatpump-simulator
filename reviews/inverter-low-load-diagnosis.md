# Inverter low-load diagnosis

Read-only review, 2026-10-11. Production source, accepted catalogue and acceptance
hashes were not changed. This diagnosis is independent of the pending release's
117 checks / 52 robustness schedules; those receipts are not extended by this work.

**The reproduced default stop is discharge-temperature protection while the
upstairs thermostat still calls, not reaching the thermostat's upper off bound.**
The generic 18 rps compressor floor delivers substantially more heat than the
controller requests. As the room approaches target, its fan command declines;
the coil heats until the envelope supervisor cannot admit that minimum speed.
An otherwise identical run with an explicitly assumed 8 rps minimum maintains
continuous service and follows the requested capacity. This establishes a model
actuator-range problem without changing house losses or forcing electrical watts.

## Evidence and method

[Source-pinned receipt](inverter-low-load-diagnosis.json) retains the complete
configuration, engine-source / compiled / guarded-backend SHA256 fingerprints,
native replay samples and both fixed-boundary sweeps. Each replay used its own
process, a fresh isolated compilation and the production guarded HEOS backend.
Accepted requests were 0.25 s. The owner fixture matches the current default:
1°C / 35% RH, Ground17°C, Upstairs21.5°C, Attic Off, H45/25/15 W/K,
200 W ground gain, gross0.5 ACH / sensible75% recovery and95% clear coils.
Both current geometry-based interzone links are included. Pipes are idealized,
as in the actual default. Room/fabric warm initial conditions remain assumptions.

Replays were deliberately interrupted after the conclusion was established.
The receipt reports only complete persisted windows: **2100 s default and2700 s
8 rps sensitivity**, not the originally requested3600 s. Additional unpersisted
tails are excluded. Neither retained window contains a native/physics fault.

| Accepted time | Default18 rps | Identical house, minimum8 rps |
|---|---|---|
| 0.25 s | 18 rps; condenser2058 W vs request1124 W; system441 W | 8 rps; condenser917 W; system241 W; demand9.80 rps |
| 300 s | 18 rps; condenser1878 W vs request1194 W; system672 W | 13.359 rps; condenser1431 W vs request1431 W; system469 W |
| 600 s | Compressor stopped by discharge protection; call still true | 12.166 rps; condenser1302 W vs request1302 W; system458 W |
| 1200 s | 18 rps; condenser1868 W vs request768 W; system714 W | 10.636 rps; condenser1143 W vs request1143 W; system417 W |
| 2100 s | Compressor stopped by discharge protection; call still true | 10.098 rps; condenser1091 W vs request1091 W; system392 W |
| 2700 s | Outside retained comparison window | 15.607 rps; system539 W; both enabled heads calling; no stop |

Default stops occur at **579,948.75,1316.25,1683 and2049 s**, with restarts at
700.5,1072.5,1440.5 and1807.5 s. At the first stop upstairs is21.878°C,
its coil53.420°C and its fan fraction0.483 approximately. Its21.5°C target
would require22.5°C for the thermostat to stop. Every recorded default stop
retains `[false,true,false]` comfort calls. The command remains18 rps while
the actual compressor becomes0: protection, not thermostat shutdown.

The default compressor spends1554.75/2100 s running and545.25 s in discharge
protection. Every running sample remains18 rps. The8 rps sensitivity runs
2700/2700 s with one start and no protection. Its ground call joins at2391.25 s
without interrupting the compressor. At600 s upstairs air/coil are21.454/40.906°C,
instead of default21.893/50.937°C during its protection hold. The maximum energy
residuals are1.293e-6 /6.799e-7 J; water residuals5.066e-15 kg in both runs.
These are accepted transient runs, not settled whole-building equilibria.

## Source diagnosis

- `src/engine/engine.ts:343–346` converts heat request to speed from the previous
  accepted cycle's capacity, then clamps to `speedMinRps`. With18 rps producing
  roughly1.9 kW against0.8–1.2 kW requests, the PI controller has no downward
  actuator authority. Its unclamped initial requested speed is approximately
  `18 ×1124/2058 =9.84 rps`, already below the inherited floor.
- `src/engine/thermostat.ts` correctly preserves the existing call across±1 K.
  `thermostatFanFraction` reduces fan flow toward target and beyond; the engine
  scales air-side UA linearly and fan electricity cubically. Excess refrigerant
  heat therefore accumulates in coil metal as air-side heat rejection falls.
  The conservative discharge supervisor then derates the admissible maximum
  below18 rps and stops. Its decision remains valid and must be retained.
- The inherited `22 cm³/rev ×18 rps ×0.80` swept-volume assumption is the primary
  floor source. Generic compressor/coil/fan values are used for the owner
  selection; catalogue identity supplies no qualified compressor speed map.
  Fixed85 W outdoor fan plus15 W controls is also a substantial assumed
  electrical overhead. Neither field is an observed Daikin parameter.
- Branch allocation is not the cause of the first failures: only upstairs is
  calling, so100% of refrigerant flow enters it. The5% calling-branch UA reserve
  cannot cause that one-branch excess. After the ground call joins, the8 rps
  run remains uninterrupted, showing current allocation can handle this case.
- `engine.ts:466–468` checks upper saturation/protection and commits the PI
  integral only after the startup interval. It does not preserve the unclamped
  speed request to identify minimum-speed saturation. `demand.ts:33` permits
  negative correction there: the default upstairs integral winds negative
  while capacity remains excessive. This is a secondary controller defect;
  directional lower-limit antiwindup improves recovery but cannot make an
  oversized floor deliver less heat.

## Lower-speed applicability and limits

The bounded sweep uses fresh closed cycles with declared metal temperatures,
not steady rooms or a calibrated equipment map. The physical branch is upstairs,
6.5 m, gas ID11.1 mm / small-line ID4.75 mm, zero elevation and inherited
0.05 W/(m·K) line conductance. Those pipe dimensions are a declared comparison.
The quoted total adds85 W outdoor fan,15 W controls and6.104 W indoor fan;
it is a fixed fan-command comparison, not a full thermal trajectory.

| Boundary | Idealized18 rps: capacity / total W | Idealized8 rps: capacity / total W | Physical8 rps |
|---|---|---|---|
| Heating, outdoor8°C / coil40°C | 2396 /658 | 1072 /333 | 1047 W /333 W; closes |
| Heating, outdoor12°C / coil40°C | 2640 /664 | 1183 /332 | 1161 W /332 W; closes |
| Cooling, outdoor35°C / coil10°C | 1983 /547 | 968 /292 | Closure fails |
| Cooling, outdoor39°C / coil10°C | 1929 /598 | 937 /316 | Closure fails |

Heating6/4 rps also closes at both warm-coil boundaries, with approximately
274/216 W total at8°C and272/214 W at12°C. At cold winter startup1°C/21.5°C,
physical8/6/4 rps closes at241/205/170 W total;2 rps fails. In idealized low-delta
cooling26°C/24°C,8/4/2 rps closes at175/142/124 W total. These results are useful
domain evidence, not qualified minimum speeds or a universal200/130 W floor.

Physical cooling18 rps closes, while8/6/4 rps fail at both35/39°C boundaries.
At39°C and8 rps the original fixed-target branch residual is127.6 W, far beyond
the unchanged0.1 W acceptance limit. Physical lines use a different branch
formulation: shared suction-superheat targeting, finite-UA terminal constraints
and gas-line heat pickup must all close. The failure does not establish that
real equipment cannot run there. Separate source analysis is needed to determine
whether the declared control regime or numerical boundary treatment is the
limitation. Never suppress that error, widen closure limits or call it an OEM
minimum. A universal8 rps change is not accepted for physical cooling by this
review. The actual owner's idealized default has independent positive evidence.

## Proposed clean change

1. Make the lower speed an explicit generic component/control assumption. An
   **8 rps minimum is a defensible candidate for the default idealized Reference
   inverter**, because it independently closes and gives this house enough
   downward capacity authority. Do not label it a measured owner speed. Keep
   house loss/gain/link inputs and electrical equations unchanged. Physical
   piping needs its own qualified low-load regime; do not silently change its
   floor or substitute idealized transport.
2. Preserve the unclamped thermal-to-speed request and carry explicit lower/
   upper saturation into directional antiwindup. At lower saturation block
   integral movement requesting still less output, allow recovery movement,
   and retain per-room zero-output handling. Commit only accepted ordinary
   operation; preserve exact rollback, defrost, reversal and protection behavior.
3. Replace the arbitrary10 s startup plateau and hard-coded slew with a small
   explicit inverter actuator policy. Start at the **admissible minimum**, then
   move toward demand with a finite configured rate; a2 rps/s upward candidate
   would cover8→14 rps in3 s. This rate is an assumption requiring transient
   verification, not an owner measurement. Follow the resulting actual speed
   with fresh EOS/UA heat/work and the real room/metal/energy integration.
   Keep fixed-speed startup and dedicated defrost commands separately correct.
4. Keep conservative protection authoritative. If thermal matching at the
   selected minimum genuinely remains impossible, coordinate fan heat rejection
   and capacity before approaching the envelope, or report the declared
   equipment's limit. Do not hold the compressor always on or override all-calls
   Off. A broader fan-capacity policy is not required to explain this default:
   changing only the explicit floor already prevents its protection cycling.

The existing startup jumps0→minimum on the first accepted interval, holds10 s,
then rises0.5 rps/s and falls1 rps/s. A restart at700.5 s immediately draws649 W
because the retained coil is hot. Starting at8 rps lowers the cold first sample
to241 W, but still has an admissible-minimum jump. A few-second rise from that
first valid operating point is an honest improvement; a perfectly smooth0→8 rps
curve is not established by the present quasi-steady engine. Arbitrary positive
subminimum speeds are not universally solvable, particularly with physical pipes.

A compressor-off spinup dwell with real fans/controls conserved in the ledger
is a possible startup-control phase **only if explicitly justified as that
phase**. It has no rotor inertia/electrical motor model and cannot represent the
energy of a rotating compressor. Adding it merely to conceal the speed/power
jump would be cosmetic and would not solve the requested transient behavior.
For a true zero-speed motor acceleration trace, add an explicitly scoped rotor/
drive model and qualify its coupled refrigerant domain; do not interpolate the
displayed watts or silently reuse a full-speed cycle with partial work.

## Regression requirements

- Keep this exact owner preset, unchanged room coefficients and current links,
  native backend and at least1200 s accepted duration. Assert actual compressor
  continuity after startup, no protection/fault/clock reset, speed modulation
  below18 rps while enabled calls survive across target, and unchanged hard
  cycle/energy/water limits. A longer~2700 s case covers the second branch
  joining without a restart. Assert physical behavior, not exact measured watts.
- Retain independent above-minimum continuous control and genuine below-minimum
  thermostat stop/restart fixtures. Explicit all-calls Off must still stop the
  ordinary compressor immediately; restart dwell, reversals, antifreeze and
  natural frost/defrost retain their existing tests.
- Test lower saturation and its recovery direction, live minimum edits and
  exact rollback of speed, integral and thermal state. Include actual pressure/
  discharge-envelope intervention rather than only unrestricted actuator slew.
- At cold and retained-hot-coil startup, verify admitted speed and actual energy
  increments match the declared ramp. Check finite positive cycle/work and
  original closure tolerance at every accepted speed. Timestep refinement must
  preserve the startup behavior; a plotted electrical ramp alone is insufficient.
- Any expansion to physical lines must reproduce these failed cooling boundaries
  and resolve their actual source cause before claiming support at8 rps. Preserve
  the original rejection as evidence until the new regime independently closes.

## Owner evidence versus calibration

The current owner statement supersedes the earlier130 W in both modes:
**approximately200 W minimum heating and130 W cooling**. At1°C the owner reports
continuous~500 W, except reversal/defrost. That is evidence against unwanted
ordinary stops in this case, not a command to output500 W or adjust house losses.
Neither an electrical minimum nor one continuous point identifies displacement,
rps, volumetric efficiency, fan map, coil UA or delivered heat individually.

Above12°C the owner does not heat;8–12°C uses1 h morning plus1.5 h evening;
below8°C uses18°C at night and21°C morning recovery in less than45 min. Daily
whole-system averages12°C70 W (Nov28),8°C150 W (Dec9),4°C300 W (Dec13) and4°C325 W
(Dec29) include these schedules. They are energy/schedule comparison points,
not steady compressor floors. Compare them only with reconstructed weather,
setback/recovery and fabric history; do not force them into a continuous map.

The retained diagnostic scripts are read-only with respect to production. To
reproduce on current source, first compile to `/tmp/heatpump-inverter-low-load-build`
using `node_modules/.bin/tsc -p tests/engine/tsconfig.json --outDir
/tmp/heatpump-inverter-low-load-build`, then run
`node reviews/inverter-low-load-replay.mjs 1200 18` and
`node reviews/inverter-low-load-replay.mjs 1200 8`. The scripts write only temporary
diagnostic results. `node reviews/inverter-low-load-sweep.mjs` runs the32 bounded
fixed-metal comparisons. Reproduction on later source is a new experiment;
the retained JSON fingerprints identify this review's exact compiled model.
