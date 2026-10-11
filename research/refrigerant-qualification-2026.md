# Generic refrigerant qualification — 2026-10-11

The released comparison circuit uses R22, R32, R290, R134a, R1234yf and the documented
R410A pseudo-pure EOS. This is generic compatible equipment with the configured
compressor displacement/efficiencies and coil conductances. Changing fluid does not
predict an OEM retrofit, rewrite installed tubing, convert catalogue performance,
or scale COP. The worker restarts with the selected EOS and supplied house settings.

## Properties and provenance

The browser uses the guarded, self-hosted CoolProp HEOS artifact. Its upstream source
is pinned to `ae81610e7d23efc57f9d051c8e70a4d66e87537f`; coefficient tables and binary
interaction models are unmodified. The rebuilt artifact, interface input hashes,
SDK image and licences are recorded in
[provenance.json](../public/vendor/coolprop-safe/provenance.json).
The native state retains its fluid/composition when an invalid update/getter forces
recreation. An invalid trial therefore cannot silently become an R32 state.

| Fluid | Selected EOS | Selected pressure domain, bar absolute | Selected temperature domain, °C | Coupled release |
| --- | --- | --- | --- | --- |
| R22 | Pure HEOS `R22` | 0.5–48 | −60–160 | Idealized Reference |
| R32 | Pure HEOS `R32` | 0.5–50 | −60–160 | Existing Reference and existing inventory qualification |
| R290 | Pure HEOS `n-Propane` | 0.5–40 | −60–160 | Idealized Reference |
| R134a | Pure HEOS `R134a` | 0.5–38 | −60–160 | Idealized Reference; lower-pressure comparator |
| R1234yf | Pure HEOS `R1234yf` | 0.5–32 | −60–136.85 | Idealized Reference; optional comparator |
| R410A | Fixed-composition pseudo-pure HEOS `R410A`, nominal 50/50 R32/R125 by mass | 0.5–47 | −60–160 | Idealized Reference, explicitly approximate phase treatment |
| R407C | Explicit HEOS R32/R125/R134a, 23/25/52 by mass | 0.5–40 | −60–160 | Property qualification only; circuit gated |

Bounds are open. The reference pressure solver retains −40…45°C evaporating and
−5…65°C condensing limits. These are computational coverage limits, not hardware
ratings or a manufacturer's operating envelope. R1234yf's 410 K EOS temperature
ceiling requires its smaller upper bound; the controller's enthalpy preflight respects
that bound. Published pure/pseudo-pure critical pressures exceed the corresponding
selected pressure ceilings, and all critical temperatures exceed 65°C.
Primary EOS/transport sources and numerical limits are maintained by CoolProp:
[R22](https://coolprop.org/fluid_properties/fluids/R22.html),
[R32](https://coolprop.org/fluid_properties/fluids/R32.html),
[propane](https://coolprop.org/fluid_properties/fluids/n-Propane.html),
[R134a](https://coolprop.org/fluid_properties/fluids/R134a.html),
[R1234yf](https://coolprop.org/fluid_properties/fluids/R1234yf.html).

R410A uses Lemmon's identified pseudo-pure EOS, not an explicit phase-composition
mixture flash. It preserves its nonzero bubble/dew glide: the browser probe measures
0.119655 K at a 40°C bubble point. Superheat is defined from dew temperature;
subcooling and the published condensing coordinate use bubble temperature. The coil
integrates the selected EOS's PH temperatures across the latent interval, including
near-pinches, instead of assigning one saturation temperature. The pseudo-pure
quality/density treatment approximates a fixed-composition fluid; it does not resolve
fractionation or establish an explicit mixture's mass-quality accuracy.
[CoolProp R410A EOS provenance](https://coolprop.org/fluid_properties/fluids/R410A.html),
[Lemmon 2003 EOS paper](https://doi.org/10.1023/A:1025048800563).

R407C uses native `set_mass_fractions`, which converts the declared mass composition
using the pinned component molar masses. It never uses the R407C pseudo-pure EOS,
linear interpolation of endpoint enthalpies/temperatures, or `Qmass=Q`. Its selected
interior states have nonlinear PH temperatures and distinct mass/molar qualities;
the browser measures about 4.897 K glide at 40°C bubble. The guarded interface exposes
native `Qmass`. Scalar fallbacks encode the mole fractions from that same native mass
composition, and no estimated interaction rules are installed.
[CoolProp mixture composition and interaction models](https://coolprop.org/fluid_properties/Mixtures.html),
[low-level mixture states](https://coolprop.org/coolprop/LowLevelAPI.html).

## Observed acceptance and remaining coverage

The meaningful tests in [refrigerants.test.mjs](../tests/engine/refrigerants.test.mjs)
check saturation and PH/PT states against the separately distributed official HEOS
artifact, native identity recovery, transport-property availability, energy/mass/entropy
constraints, one/three/five-branch heating and cooling, reverse-cycle defrost, wet cooling,
frost/reversal, inverter operation, Off commands and explicit unsupported combinations.
This is numerical agreement and model-conservation acceptance, not experimental
validation of any real appliance. An independent analytical R410A glide integral also
checks the near-pinch coil treatment.

The [coupled qualification log](../reviews/refrigerants-qualification.log) passes six
acceptance groups, including 60 s wet cooling and cold frost/reversal trajectories
for every released fluid. The [additional glide/mixture tests](../reviews/refrigerants-blend-properties.log)
pass the independent R410A integral and full-equilibrium R407C mass-quality checks.

The [browser results](../reviews/refrigerants-browser-results.json) pin the tested WASM
hash, show both three-branch directions for each released fluid, twenty native
rejection/recovery cycles per fluid, resolved R407C property states and zero browser
exceptions. [R32 regression](../reviews/refrigerants-r32-regression.log) passes twenty-two
existing property/storage/cycle/coil/protection assertions. The original R32 algorithms,
pressure bounds, accepted-state rollback and conservation contracts are retained.

All alternate gases currently require **idealized field lines** and **Reference**.
Standalone physical heating fixtures worked for the pure alternatives, but physical
cooling's branch/shared-superheat closure did not qualify, including tests with generic
larger small pipes. Narrow inherited pipes can also exhaust the existing kinetic-energy,
pressure-loss or valve-authority guards. Because reverse defrost uses cooling paths,
the complete alternate-fluid physical circuit is gated in both modes. No tubing is
silently changed and no physical loss is silently ignored.

The full-mixture R410A pressure-solve probe was interrupted after several minutes
without a returned cycle. The full-mixture R407C coupled pressure/coil/control path is
therefore not released on the basis of passing property calls alone. Future release
requires bounded-cost coupled qualification, including gliding pinches, heterogeneous
branches, defrost, controller boundaries, and phase-composition-aware transport.
The [low-speed probe](../reviews/refrigerants-low-speed-probe.json) also closes all
36 combinations of the six released fluids, both directions and 0.05/0.5/2 rps
with three idealized branches at unchanged tolerances; maximum residual is
0.074862 W. These are isolated startup points, not acceptance of a complete
zero-to-minimum actuator ramp trajectory.

Conserved inventory remains R32-only; alternate pure-fluid storage and blend species/
fractionation are separate acceptance work. Near-critical/transcritical operation,
slip, oil circulation and appliance safety/installation decisions remain outside this
comparison model.
