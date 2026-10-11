# Inventory numerical checkpoint, 2026-10-11

This is a retained research checkpoint, **not a released charge engine**.
The original local/global mass and energy acceptance budgets, finite physical
cells, accumulator pickup events, thermal/water conservation and transaction
ownership remain. Neither sustained owner operation, a natural complete frost
cycle nor practical browser throughput has been established.

Base: `8a3203c`. Parent-provided inventory displacement ramp is separately
committed as `b594c4b`; it is not part of the numerical-core commit. Isolated
worktree: `/tmp/heatpump-charge-release`, branch `charge-physical-release`.

## Retained changes

- Reuse a phase-partitioned adaptive Chebyshev specific-volume primitive during
  each real-EOS HEM throat search. Retain independent coarse/fine corrected-flow
  comparison (4e-11 kg/s), phase knots, bounded work and failure propagation.
  Public PS flashes still preflight the native domain/error boundary. Pure wet
  entropy uses the exact R32 lever rule; single-phase PS temperature is refined
  through cp/T before PT density evaluation to remove native inversion noise.
- Retain exact storage Jacobian and use refreshable Broyden updates for the
  nonlinear iteration. Every accepted trial is still checked with the original
  nonlinear face laws and original local/global balances.
- Opt-in `storageCoordinates:'density'` uses p/rho solver coordinates with exact
  M=V*rho and U=M*h-p*V. Saved/authoritative M/U is never reconstructed, changed,
  mapped to another cell, or used to forgive an old residual. Public snapshots
  retain original absolute p/h coordinates and physical identity.
- Opt-in `analyticFluxJacobian:true` differentiates actual compressor, header,
  advective and thermal laws; nozzle partials remain local numerical derivatives
  in common-pressure/drop coordinates. Interior choked downstream derivative is
  exactly zero. Derivative scalar values independently match original laws.
- A topology change uses a continuity-consistent initial flow guess. This changes
  only the Newton guess, not the retained physical stores or solved allocation.
- Experimental `predictTurnover:true` estimates a trial step from finite local
  inventory turnover. It remains **off by default**: enabling it changed adaptive
  subdivisions enough to fail the existing startup timestep-refinement ratio.
  No conservation threshold was relaxed to compensate.

## Reproduction

```
npx tsc -p tests/engine/tsconfig.json
HEATPUMP_TEST_BACKEND=guarded node --test \
  tests/engine/charge-core.test.mjs \
  tests/engine/charge-integration.test.mjs \
  tests/engine/charge-sensitivity.test.mjs \
  tests/engine/charge-density.test.mjs \
  tests/engine/charge-nozzle-numerics.test.mjs \
  tests/engine/drive.test.mjs
```

`charge-density.test.mjs` independently evaluates original local mass/energy rows,
aggregate mass/energy/header balances and saved residual retention at 11 s and
48.5 s, for heating and reversed passive cooling. It does not import a snapshot
through public restore or mutate current/input state. It also compares complete
physical flux finite differences against the sparse derivative matrix in both
directions and injects a PD outage to verify rollback and snapshot ownership.

For the derivative comparison only, the nozzle's declared constitutive
4e-11 kg/s comparison allowance is propagated through finite differences. This
allows unavoidable flat-throat search roundoff and does not affect fluid balance
acceptance. Derivative comparisons cannot certify a noisy matrix beyond that
allowance, so resolved original-balance acceptance remains authoritative.

The focused pre-final run passed 13/13 tests including all six drive tests.
The first full default inventory regression passed 22/23; the failing startup
refinement test passed after making turnover prediction opt-in. The final combined
run passed **36/36 in 59.04 s**. Source/backend hashes and saved-state timings are
retained in [charge-numerical-coordinate-results.json](charge-numerical-coordinate-results.json).
The full natural frost/reversal matrix is still open.

## Measured limits

Focused saved-state single-step diagnostics on this machine, guarded real HEOS:

| Saved time | Orientation | dt | Iterations | Approximate wall time |
| --- | --- | ---: | ---: | ---: |
| 11 s | Heating | 0.25 s | 4 | 0.25 s |
| 11 s | Passive reversed cooling | 0.003 s | 7 | 0.31 s |
| 48.5 s | Heating | 0.25 s | 3 | 0.38 s |
| 48.5 s | Passive reversed cooling | 0.003 s | 9 | 3.42 s |

Timings are diagnostics, not portable performance guarantees. The late reversal
is substantially cheaper than the earlier PH attempt (~100 s for a ~0.003 s
piece, measured separately under contention), but still unusable for an interactive browser. Its retained mass residual
is the saved ~1.037e-10 kg, its energy residual ~7.185e-5 J; no residual rebasing
is performed. A complete outer 0.25 s reversal was not demonstrated.

Exploratory owner comparisons showed first sampled carryover hold at 12.25 s
with the actual startup ramp versus 9.25 s with the prior immediate-minimum
policy; both ended near 0.622 kg in the accumulator and zero admitted compressor
work by 20 s. An initially dry outdoor gas-end cell, conservatively redistributed
at the same saturation pressure/temperature, rewetted within 0.25 s even with
EEV initially zero. These probes motivate a spatial-closure investigation; they
do not validate the startup/phase distribution of Julien's physical appliance.
They predate this final source checkpoint and are not regression baselines.

## Release disposition

Keep inventory gated. A uniform 7 °C mixed inventory can legitimately trigger
carryover protection, and improving its solver does not establish an OEM startup
distribution. Do not install fictitious terminal separators, remove pickup
guards, assign ideal dry ports, retune charge/volume to observed watts, or swap
pressure-region membership without conservative redistribution.

The next proposed experiment is documented in
[charge-profile-reduction-proposal.md](../research/charge-profile-reduction-proposal.md).
It retains physical axial endpoints and exact spatial inventories, with a
reference-invariant energy moment derived using pointwise mass continuity.
