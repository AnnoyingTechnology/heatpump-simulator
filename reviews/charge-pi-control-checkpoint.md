# Generic inventory EEV PI experiment — 2026-10-11

This is a separately qualified controller experiment; complete charge release gates remain unmet. The optional `ChargeGeometry.eevController` declares normalized effective-area Kp/Ki and actuator slew, without OEM calibration or electrical-output targets. Legacy control is retained for explicit comparison.

Positional command is `I + Kp*(SH−SHtarget)`, bounded0…1 and limited by physical opening slew. I is a signed bias, not the actuator opening. Each accepted interval admits only the part of integral action that remains feasible under that interval's position/slew bounds. A previously infeasible bias may integrate toward feasibility; it is never blindly clipped0…1. Per-branch biases live in immutable fluid snapshots, are advanced only with accepted substeps, and roll back with fluid/parent thermal state. Off, disabled branch and carryover hold close at declared slew and track bias to the current sensor/actuator; reversal tracks only as a declared control transition. Normal running preserves integral memory. PI has no zero-opening kick ahead of protection. Missing retained PI state rejects rather than inventing controller history.

Sensing remains the actual outdoor gas terminal in heating and actual branch gas terminal in cooling. Wet SH=0 remains a limited measurement; PI alone is not proof against every flooding scenario. The first declared candidate is Kp0.03 opening/K, Ki0.001 opening/K/s (Ti30s), slew0.1 opening/s. Gain/time decades and independent timestep refinement remain required.

The source-pinned old-control warm history identifies excessive EEV opening after an initial dry-out excursion, then slow0.015/s closure at−3 K while feeding more mass than vapor extraction. A matched120-second conservative Off history with initially closed actuators retains the same local M/U at restart. The first PI trajectory continues heating beyond100 seconds with dry evaporator terminal and falling accumulator inventory, instead of old-control flooding/protection. This evidence precedes the final proposed-increment antiwindup refinement; its saved hashes identify that historical code. It is not a complete final-controller frost or browser qualification.

The revised controller tests5/5 pass, including proposed upper/lower position/slew crossings, signed bias, inactive/reversal tracking, refinement, actual backend rejection and parent thermal rollback. Independent review copied source into its own build and independently passed5/5 plus5000 randomized controller checks; an actual native On→Off edit retains inventory, slews valve physically, and subsequent bad-room thermal rejection restores fluid/controller/thermal/clock/drive/ledgers.

Primary controller precedent: [Danfoss EKD316](https://assets.danfoss.com/documents/latest/86455/AI215386429656en-000201.pdf) documents PI, integral response and low-superheat/startup policies. Its percentage gains are not transplanted into this normalized-area model. These generic gains are declared assumptions, not measured manufacturer tuning.

Reproduce the controller/rollback checks with:

```sh
npx tsc -p tests/engine/tsconfig.json
HEATPUMP_TEST_BACKEND=guarded node --test tests/engine/charge-valve.test.mjs
```

The long history qualifier uses the same public engine code, retained On/Off config edits, explicit generic geometry and source/backend hashes:

```sh
HEATPUMP_TEST_BACKEND=guarded node tests/engine/charge-owner-history.mjs --run=900 --output=/tmp/charge-owner-history-results.json
```

Use `--controller=integral` for the original control, `--mass`, `--cells`, `--dt`, `--kp`, `--ki`, and `--mode=cooling` for independent variations. Aggregate and selected complete accepted checkpoints are auditable; serialized checkpoints are not a public restore capability. The warm20 C assembly/Off soak is an explicit history, not inferred observed owner idle allocation. Adiabatic field lines/accumulator, hydraulic idealization and valve topology remain stated limits; no shell heat or fictitious separator was added.
