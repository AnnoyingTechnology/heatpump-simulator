# R407C bounded Reference comparator — 2026-10-11

The generic idealized Reference circuit now uses the published R407C pseudo-pure
EOS, not a pure-fluid zero-glide substitute. Its nominal composition is
R32/R125/R134a = 23/25/52 by mass. Physical field lines, conserved inventory,
phase-component transport and fractionation remain gated. This compares generic
compatible hardware; it predicts neither an OEM retrofit nor an OEM performance map.

## Source and approximation

[Lemmon 2003](https://trc.nist.gov/refprop/Documents/Pseudo.pdf) gives a Helmholtz
pseudo-pure EOS fitted to a full mixture model, plus separate bubble/dew ancillary
curves. The paper's single-phase accuracy statements do not establish interior
two-phase mixture accuracy. [CoolProp's R407C documentation](https://coolprop.org/fluid_properties/fluids/R407C.html)
identifies this EOS and its transport sources. The selected implementation is
CoolProp v8.0.0, commit `ae81610e7d23efc57f9d051c8e70a4d66e87537f`.

The chosen CoolProp PPF closure interpolates two-phase temperature linearly in
enthalpy between bubble and dew endpoints. Off-grid native PH tests establish this
behavior for both qualified PPF identifiers, R407C and R410A. Their latent
conductance integral is consequently evaluated with its exact logarithmic formula,
including near-pinches. Full mixtures retain nonlinear native PH quadrature.
The pure R32 latent branch is unchanged. This improves integration of the declared
approximation; it adds no EOS, heat-transfer or COP correction.

R407C's native PPF `Q` is an internal surrogate, **not resolved mixture mass quality**.
`RefrigerantState.qualityMass` is null even in its two-phase states; explicit `Qmass`
queries reject with the unavailable reason. Phase classification remains available.
R410A's existing approximate-quality behavior remains unchanged and is explicitly
identified by registry metadata. The full benchmark remains accessible through
`new Properties(module, 'R407C', 'full-mixture')`; it retains native `Qmass`, nominal
mass fractions converted by the backend, and a gated coupled-circuit qualification.

## Quantified comparison with the current full mixture

The [reproducible probe](../tools/probe-r407c-properties.mjs) records
[124 comparisons](../reviews/r407c-properties-probe.json): 56 two-phase states,
46 single-phase states and 22 isentropic compressions. Pressures span 0.501–39.5 bar
absolute, including bubble temperatures −40, −20, 0, 20, 40 and 65°C. Single-phase
states include near-boundary liquid/vapor and hot vapor through 159.999°C.
Two-phase molar input qualities are 0, .05, .25, .5, .75, .95 and 1.

H/S references are aligned once at the same homogeneous state, 1 bar/300 K:
add 936.354033 J/kg and 101.226971 J/kg/K to PPF H/S for the comparison.
These are reference alignment constants, not production property corrections.
Each production cycle uses one EOS consistently.

| Comparison | Maximum sampled deviation |
| --- | ---: |
| Single-phase density at the same PT | 0.0321% |
| Single-phase enthalpy at the same PT, aligned reference | 99.221 J/kg |
| Single-phase entropy at the same PT, aligned reference | 0.317 J/kg/K |
| Single-phase temperature at the same aligned PH | 0.0765 K |
| Isentropic compressor work | 0.0241% |
| Two-phase temperature at the same aligned PH | 0.2149 K |
| Two-phase density at the same aligned PH | 1.2242% |
| Two-phase entropy at the same aligned PH | 5.154 J/kg/K |
| Interior surrogate Q minus actual full-mixture mass quality | 0.01939 absolute |

These are sampled numerical deviations against the current HEOS mixture, not
universal error bounds or experimental validation. At identical aligned enthalpy,
phase classification can differ near endpoints because the approximate and full
endpoint enthalpies differ. No quality correction, phase snapping or artificial
minimum temperature approach conceals this limitation. Very close to a physical
pinch, the model's feasibility classification and outlet heat can be sensitive to
errors much smaller than these sampled temperature deviations. Near-critical,
fractionating and phase-separating inventory applications are outside this release.

At a 40°C bubble point the actual native PPF glide is **4.895929 K**, compared with
4.896882 K for the full mixture at the same pressure. Over the selected bubble
temperature samples −40…65°C it falls from 6.931544 K to 3.583791 K; there is no
constant-saturation-temperature substitution.

## Coupled calculation and cost

An independently closed full-mixture one-branch heating fixture used all basic
state outputs snapshotted per flash and a near-solution PPF pressure seed. It still
took 83.73 s / 1191 native flashes. The unseeded snapshot route did not return a
cycle within 180 s. The seeded cooling route did not return within 160 s / 1344
flashes. The [timeout record](../reviews/r407c-full-mixture-timeouts.json) retains
these failed benchmark outcomes. Exact caching cannot remove the many distinct EOS states required by
pressure and coil closure. These results do not qualify the full circuit for the
interactive browser.

The guarded PPF heating and cooling fixtures close in 54.5 and 62.9 ms locally
after exact latent integration, versus 185 ms for heating with the prior adaptive
integral. The heating result changes by less than 10⁻⁹ relative. In the closed
heating comparison, PPF versus full-mixture heat differs −0.0353%, compressor work
−0.0646%, and high pressure −0.0760%. Energy closure is under 10⁻⁶ W and original
pressure tolerances remain 0.1 W. Fixture outputs and cost are recorded in
`reviews/r407c-cycle-*.json`. Timings are local snapshots, not a promised pacing
factor or browser performance bound.

## Qualification

The current [qualification log](../reviews/r407c-qualification.log) exercises all
seven released fluids with 1/3/5-branch heating/cooling, reverse defrost, 60 s wet
cooling and cold humid frost/reversal, controls, Off and explicit unsupported
combinations. R407C also closes all six direct low-speed points (0.05/.5/2 rps ×
heating/cooling), with actual EOS throughput and unchanged residual limits.
Independent native off-grid tests check exact PPF integrals in both heat directions.
The full-mixture comparison test checks the declared sampled property deviations;
it does not fit or correct the approximate EOS.

Actual zero→minimum startup is separately qualified using root's declared ramp
patch and `drive.ts` from `66ca8be` in an isolated snapshot. Cold heating/cooling
start at actual .5 rps per .25 s and reach 8 rps; retained warm coils from 300 s
operation restart after Off and the complete dwell. Accepted energy/water and
actual electrical/cycle work are checked at every step. Source identity and logs
are retained in [startup evidence](../reviews/r407c-startup-qualification.json).
That supervisor patch is owned by root and is not bundled into this refrigerant
successor commit.

The [browser probe](../reviews/refrigerants-browser-results.json) exercises all
seven fluids in native three-branch heating/cooling, R407C unavailable mass quality,
and the explicit full-mixture property benchmark after native rejection/recovery.
It records zero unhandled native/browser exceptions. The new guarded WASM hash is
`55d4d93788e146f773ba7dbbd14ad47a3e24fc0a273eaad910879f5404bbe0d0`.
