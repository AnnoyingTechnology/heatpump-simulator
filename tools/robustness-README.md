# Reproducible engine robustness campaigns

Run from the project root with the installed TypeScript compiler:

```sh
node tools/robustness-campaign.mjs --preset smoke --workers 8
node tools/robustness-campaign.mjs --preset quick --workers 12 --seed 20261011
node tools/robustness-campaign.mjs --preset endurance --workers 12 --seed 20261012 --timeout 1800
```

Every campaign copies and hashes the engine source and production guarded HEOS
backend before compiling. Other agents can edit the live checkout without
changing a running campaign. Native exceptions, process exits and timeouts stay
inside their scenario process. The coordinator keeps running and records each
failure. Twelve workers is the hard cap; leave resources for the browser and
other verification on a sixteen-core machine.

The output directory defaults to `/tmp/heatpump-robustness-PRESET-SEED` and must
not exist. Use `--output PATH` for a distinct repeat. Retain the manifest,
summary, failed inputs/results and logs when recording a review; the full
snapshot and repeated progress files are large and are not intended for Git.

Replay an exact retained sequence on the current engine:

```sh
node tools/robustness-campaign.mjs --replay tests/engine/fixtures/robustness-20261011/sequence-1.json --workers 1 --output /tmp/heatpump-robustness-replay-1
node tools/robustness-campaign.mjs --replay tests/engine/fixtures/robustness-recovery-20261014 --workers 8 --timeout 1200 --output /tmp/heatpump-recovery-replay
```

The recovery fixtures retain twenty bounded schedules and their exact recorded
configuration patches: owner heating/cooling reversals in both directions,
the reconstructed friend case, frost and wet-cooling endurance, the house's
0.5 ACH/75% sensible recovery/95% clear-coil preset, and seeded one/three/five/eight
head cold/hot saturated reversals at effectiveness 0/0.8/1. The portable
`tools/robustness-recovery-inputs.mjs` generates this family from a completed
immutable campaign supplied through `--baseline PATH`; original inputs are
retained so replays do not require a surviving temporary baseline snapshot.

Use `--only TEXT` to select a scenario family without changing the generated
seeded values. `--replay` also accepts a directory of saved inputs or
comma-separated directories. `--duration-cap SECONDS` deliberately shortens
each segment and records that change in the manifest; it is useful for a
bounded frost/defrost acceptance pass while a longer campaign continues.
`--extended` adds twelve advanced component/physical field-line cases, with
coherent control speeds. `smoke` uses short sequences suitable for deterministic CI;
`quick` includes the reconstructed friend crash through 1,100 seconds and two
strong-heating to 42°C cooling reversals through 1,200 seconds. `endurance`
extends generated sequences to fourteen simulated minutes, outdoor grids to
two minutes, and includes two-hour frost/defrost and one-hour wet cooling runs.
Requested UI time multipliers change pacing only, so these all exercise the
actual quarter-second engine steps.

The worker persists the complete accepted checkpoint, configuration, output and
next operation before each step. This includes a reversible representation of
the legitimate infinite initial off timer. A native abort can therefore be
located to the exact attempted step. It observes `advance()` exceptions solely
to preserve the original stack before the public `step()` API catches them;
the observer does not change arguments, return values or exception decisions.

Checks cover finite accepted outputs, exact accepted clock advance, energy and
water conservation, equal/opposite room exchange, nondecreasing electricity
and drained-water histories, useful service integration and preservation of
session history through edits. A physical fault must restore the whole prior
thermal/control/energy transaction; intentional fault-state/cycle/output
diagnostics are excluded from that physical rollback comparison. Compressor
protection holds are valid accepted outcomes and are counted separately.
State entry counts, completed defrost transitions and the slowest accepted
step are recorded. Wall times include concurrent CPU contention and checkpoint
instrumentation; they are evidence of this run, not a clean performance benchmark.

The shared branch-flow sum must close exactly within floating-point tolerance.
Compressor/coil matching instead uses the engine's declared pressure-solve
tolerance and its 250 kJ/kg residual scale; at the default 0.1 W tolerance this
allows 4×10⁻⁷ kg/s. Tightening that test independently would report valid accepted
states as engine failures. Actual compressor discharge temperature and pressure
ratio must remain within their configured envelopes.

The campaign targets the released R32 reference circuit and the public control
domain: −25…45°C outdoors, 0…100% humidity, 17…26°C targets, one/three/five/eight
rooms within declared port capacity, 10…100% clear passage, room geometry,
envelope/gains/ventilation, room links and mode/target/weather/on/off edits.
The unreleased charge model is not silently substituted. Finite coverage is
evidence of robustness within these scenarios, not proof or OEM calibration.
