# Conservative axial profile experiment

Status: proposed research closure, independently checked for mathematical
conservation and reference invariance; **not yet a validated DX model or an
approved public charge implementation**. Recorded 2026-10-11. The existing
three-cell inventory implementation remains available for comparison.

The current conserved inventory engine is both too slow and unable to maintain
owner3heads operation from its declared uniform 7 °C start. A real displacement
startup ramp delays accumulator carryover protection but does not remove it.
Merely making the terminal coil cell initially dry also does not solve its rapid
rewetting. Neither result licenses assigning vapor to every gas-named port. Coil
terminal tubes are ordinary flow passages, not measured phase separators.

## Primary basis and departures

[Qiao and Laughman, IRACC 2022, TR2022-123](https://www.merl.com/publications/docs/TR2022-123.pdf),
section 2.1, provides a precedent for whole-coil mass/energy dynamics with an
axial enthalpy profile and fixed model structure. Its inlet-anchored profile and
mean-property closure are not adopted: they do not establish conservation of a
retained axial distribution through stopped or reversed flow. Its published
speed and accuracy results do not validate the new closure below.

[Jensen and Tummescheit, Modelica 2002](https://modelica.org/events/Conference2002/papers/p31_Jensen.pdf),
section 2 and Appendix A, derives integrated mass/energy balances with moving
phase boundaries. Section 3 shows the significance of void fraction and slip.
This proposal instead integrates a profile on a fixed physical coordinate, so
phase-boundary storage terms are implicit in the integrals rather than omitted.

[McKinley and Alleyne, ACC 2008](https://skoge.folk.ntnu.no/prost/proceedings/acc08/data/papers/0797.pdf),
section V.A, demonstrates fictitious mass loss from discontinuous void-fraction
resetting. No zone-state reset, fitted pseudo-state relaxation, or instantaneous
pressure-membership swap is proposed here.

## Three-coordinate coil

Let z run from 0 to 1 along the **fixed physical coil**, irrespective of mode or
flow direction. The physical volume V and conductance remain exactly the
declared generic values. Initially use a linear profile

```
h(z) = h_left + (h_right - h_left) z
rho(z) = EOS_rho(p, h(z))
e(z) = rho(z) h(z) - p
w(z) = 2z - 1
M = V integral rho dz
U = V integral e dz
W = V integral w e dz
```

p, h_left, h_right are reconstruction coordinates. M, U and W are retained
storage. Single-phase properties use the real R32 EOS. Two-phase properties use
pure-fluid equilibrium with declared homogeneous slip S=1; alpha follows the
specific-volume lever rule. This is a flow/holdup assumption whose sensitivity
must be checked, not measured OEM behavior. Phase fronts are the positions where
h(z) crosses the actual saturation enthalpies. No saturated outlet is selected
unless the reconstructed endpoint is actually saturated.

This differs from evaluating EOS(p, mean h): rho and rho*u are integrated over
the profile. Saturation crossings partition quadrature, and analytical wet-region
specific-volume integrals can reduce native EOS calls. Quadrature and its
derivatives must use compatible partitions and retain bounded work/error checks.

## Local continuity and exact backward Euler balances

Take signed m_left and m_right positive along increasing z. Given old/new
profiles over a candidate timestep dt, reconstruct internal mass flow by

```
m(z) = m_left - (V/dt) integral_0^z (rho_new - rho_old) ds
m_right = m_left - (M_new - M_old)/dt
```

This enforces local mass continuity for the reconstructed profiles, rather than
independently interpolating internal flow. Let F_left/right = m_left/right times
the **actual donor** enthalpy: external component/header for inflow, local
physical endpoint for outflow. Use the identical transfer with opposite signs
in the adjacent finite inventory. With q(z) the heat input per normalized
length, solve

```
M_new - M_old = dt (m_left - m_right)
U_new - U_old = dt (F_left - F_right + integral q dz)
W_new - W_old = dt (-F_left - F_right + 2 integral m(z) h_new(z) dz
                   + integral w(z) q(z) dz)
```

The W equation follows integration by parts of the local energy balance. The
incoming enthalpy appears explicitly, so even a flat adiabatic initial profile
responds spatially to a new inlet stream. It does not warm uniformly merely
because its global U increases.

No inlet-anchored algebraic replacement is needed at zero flow or reversal. The
stored profile remains fixed to physical coordinates and evolves through the
same balances. Reconnecting pressure regions must conserve every retained
component; changing a valve changes connectivity, not membership or inventories.

## Energy reference check

Define the matching first mass moment R = V integral w*rho dz. Local continuity
above gives the identity

```
(R_new - R_old)/dt = -m_right - m_left + 2 integral m(z) dz
```

Under an EOS reference shift h,u -> h+C,u+C, U shifts by C*M and W by C*R.
The U residual gains C times the M residual. The W residual gains C times the
mass-moment identity, which vanishes. Therefore an unmatched energy-moment
reference error is avoided **only if** reconstruction and internal flow use
the same spatial integrals and endpoint continuity is actually satisfied.
Independent numerical reference-shift tests remain required.

## Coupling and scope

Keep physical field-line volumes, finite accumulator and its existing pickup
protection, compressor displacement/efficiencies, actual restriction donor
properties, EEV state, drive state, coil metal/air/water balances, and transaction
rollback. Replace only ordinary coil fluid cells and their internal algebraic
faces with this profile closure. No volume/charge/UA/controller tuning is
authorized to hide differences from the existing model. Thermal exchange must
use the same q(z) in coil U, coil W, and the opposite metal energy ledger.

For three indoor units, replacing four three-cell coils with two endpoint
coordinates removes four enthalpy and eight internal-face unknowns (39 -> 27
coupled unknowns). This count does not prove a speedup: real-EOS quadrature and
HEM restriction evaluation can still dominate. Benchmark before adoption.

R32 is the initial domain. Pure-fluid lever-rule reconstruction cannot be
silently reused for zeotropic mixtures; component mass, phase composition and
glide would require a separate closure.

## Required evidence before coupled adoption

1. Show a full-rank, acceptably conditioned reconstruction Jacobian for flat and
   sloped liquid, vapor, two-phase, and phase-crossing profiles; reject singular
   or invalid candidates, without phase/quality clamping or state repair.
2. Isolated finite-tube tests: hotter/cooler inflow on both physical ends,
   outflow on both ends, stopped distributed heat input/removal, wet depletion,
   dew/bubble crossings and reversed pulses. Track M/U/W, integrated outlet
   enthalpy, endpoint quality/SH and event timing. Test EOS reference shifts.
3. Compare against the unchanged finite-volume equations at 3 -> 6 -> 12 cells
   with the same total volume, charge, conductance, initial energy/profile and
   boundaries; refine time independently. Conservation alone does not validate
   phase-front position or endpoint dryness.
4. Only after isolated acceptance, run owner/generic heating/cooling starts,
   low/nominal/high initial charge, uniform and explicitly declared distributed
   inventories, closed EEV, Off/restart, load changes, reversal and natural
   frost -> defrost -> thaw -> drain -> useful heat return with time refinement.
5. Measure browser/native-call throughput, accepted/rejected work, storage/EOS
   errors and all mass/energy/water ledgers. Preserve diagnostic stop and full
   rollback when the assumed axial profile cannot represent the state.

Independent review accepted the conservation/reference derivation conditionally;
it did not establish transient accuracy, zero-flow phase geometry, or production
readiness. The uniform 7 °C initialization is declared, not an observed refrigerant
distribution. Carryover protection may remain its legitimate physical outcome.
