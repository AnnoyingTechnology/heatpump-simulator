# Frozen-frost nozzle numerical proposal (2026-10-10)

Status: implemented and independently reviewed in gated charge source. Frozen continuation validation remains open. Public conserved-charge admission remains gated. No full frost/melt/drain acceptance is claimed.

## Observed failure

The PH flash stores the supplied enthalpy as the conservative independent variable, while native HEOS returns temperature, entropy and density at a slightly different actual enthalpy. Independent inspection measured native PH h minus input h of −0.000130834 J/kg at the rejected Newton state. The current nozzle subtracts PS throat h from the supplied PH input h; that mixes references. Nearby backend thresholds also produce discontinuous PS h differences. The observed feed-flow noise exceeds the unchanged local mass allowance. Throat-pressure jitter in the viscous correction is secondary.

The geometric coarse-pressure grid has a separate numerical endpoint issue: `down*(up/down)^1` sometimes exceeds upstream pressure by one ULP. Explicit endpoints are necessary when replacing enthalpy subtraction with an integral.

## Exact proposal

Keep the existing HEM maximizer, finite-passage correction, conservative M/U storage, controller and original acceptance limits. Replace only the kinetic enthalpy difference by the thermodynamic identity

`h(up,s) − h(p,s) = ∫[p,up] 1/rho(P,s) dP`.

Use native HEOS PS density for single-phase and coexistence states; no ideal-gas or fitted surrogate. Remove the incompressible/direct and short-integral/direct switches entirely. Set coarse-grid first/last pressure exactly to downstream/upstream. Return zero kinetic flux exactly at upstream; reject genuinely out-of-bracket samples.

Split each integral at pure-fluid phase boundaries found from `s_sat,Q(P)=s_up`, using bracketed bisection capped at 48 iterations. Independent inspection of 161 logarithmically spaced pinned-R32 states in the declared 0.5–50 bar range found saturated-liquid entropy strictly increasing and vapor entropy strictly decreasing, supporting at most one bracketed crossing of each boundary in this service. Do not generalize this pure-R32 logic to another fluid.

Numerical integration uses Gauss orders 4/8. The conservative error estimate is the sum of absolute order differences over current panels. Refine the largest-error panel until the global budget passes. Splitting a global budget equally down every recursive branch was rejected: it wasted smooth-panel error allowance and forced a phase-crossing panel below native density noise.

Let `I` denote the current refined integral, `ideal = Cd*A*rho*sqrt(2I)`, `m` the existing corrected passage flow, `K = drop/ideal²`, and `beta = 2Km/(R+2Km)`. The exact local sensitivity of corrected flow to integral is `dm/dI = m*beta/(2I)`. Recompute the integral budget from the refined value:

`min(1e−8 J/kg + 1e−9*I, 2I * 4e−11 kg/s / max(m*beta,1e−30))`.

At a fixed throat pressure the estimated quadrature contribution is at most 1e−11 kg over the maximum quarter-second interval, under 10% of the smallest existing local mass allowance. This scalar budget does not bound the whole maximizer/corrector. An earlier unpartitioned integral changed a broad endpoint-throat result by 1.32e−10 kg/s when tightened; explicit phase partition reduced the largest difference over 24 tests to 2.06e−12 kg/s. Production additionally compares complete coarse/fine maximizations (32/48 golden refinements, fixed-throat flow budgets 4e−11/4e−12 kg/s) and rejects differences above 4e−11 kg/s. This is a convergence check, not a certified interval bound. This is an adaptive quadrature error estimate, not a rigorous interval-arithmetic bound on HEOS model error. The separate integral convergence test remains mandatory.

Check finite positive densities, integrals and budgets. Cap a flux evaluation at 8,192 density calls and panel depth 16; fail transactionally on unresolved error, work exhaustion, EOS failure or exhausted representable pressure subdivision. There is no tolerance relaxation or accepting a rejected candidate.

## Reviewable implementation and evidence

Production changes are restricted to `src/engine/charge.ts`: the nozzle and a bounded adaptive integral helper. A complete nozzle evaluation is capped at 65,536 density calls in addition to 8,192 per integral and panel depth 16. The existing exact-input cache stores only certified fine results; its key includes passage area, length and coefficient. There is no independent unbounded phase-boundary cache.

`tools/probe-frost-nozzle.mjs` compiles current source into a disposable scratch directory and saves full accepted candidates, local/global residuals, 24 inlet restrictions and injected PS outage rollback evidence to `research/frost-nozzle-validation.json`. It never restores or commits external state. Meaningful automated checks are in `tests/engine/charge-nozzle-numerics.test.mjs`.

The production implementation accepted the exact saved quarter-second step in three Newton iterations: aggregate mass 6.91e−14 kg and energy 1.29e−8 J. The eighth-second step also required three iterations: mass 3.80e−12 kg and energy 1.02e−6 J. Every original local mass/energy allowance and the header/global allowances was checked, rather than merely the reported total ledger. All 24 representative inlet tests passed: saved vapor, wet valve and wet accumulator upstream states, each with relative pressure spans from 1e−12 through 0.6, including vapor-to-wet paths. Zero flow, the Poiseuille limit, existing HEM choking behavior and injected low-side PS failure rollback passed. Positive but unresolved injected PS density noise also triggers bounded numerical rejection while leaving committed M/U unchanged. The Poiseuille checks include a single representable pressure ULP.

Observed saved-step cost remains approximately 3–4 seconds in Node. This remains a practical admission limitation; no unreviewed subsonic endpoint shortcut is included. Full frost/melt/drain and useful-heating acceptance remain open. The public charge model remains unavailable.

Historical rejected experiments, convergence comparisons and source variants are consolidated in `research/frost-nozzle-diagnostics.json`. Fixed-order short-span approaches and their formula seams are historical diagnostics, not proposed production methods.

Independent implementation review accepted charge source SHA-256 `0c9dd8050fab6b3bd16bcb881f59fc00debc2f85c774c2a1c2216d45d289e168` for frozen continuation validation and independently passed the original local/global saved-state checks, 24 spans and PS outage rollback. This release does not imply full frost or public admission.
