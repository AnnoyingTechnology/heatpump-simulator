# Owner startup: inventory migration and generic control assumptions

Read-only diagnosis, 2026-10-10. Evidence: `charge-pilot-results.json`
(`ownerStartupFlux`, `ownerValveInitializationComparison`), current charge/drive
source, and the reproducible native-EOS calculation in
`tools/analyze-owner-startup.mjs`. No new transient simulation or source change.
Historical traces predate the reviewed integral nozzle; they establish the model's
mechanism, not a current-source nominal operating result.

The immediate modeled cause of protection is wet bulk inventory entering the
accumulator faster than its dry vapor pickup removes mass. The accumulator already
has saturated vapor pickup; absence of a separator is not the diagnosis. The
source's homogeneous cells discharge their bulk equilibrium mixture, while the
accumulator is homogeneous, adiabatic storage without an oil/liquid return route.
Its generic vapor-volume latch holds at 0.02 and recovers at 0.04.

In the paired updated-room traces (84/155/100 m³), both starts have accumulator
mass 0.242435 kg. At 0.25 s, initial EEV 0.65 gives source inlet 0.08285 kg/s,
pickup 0.00861 kg/s and total EEV feed 0.00409 kg/s. Initial EEV zero reduces
feed to 0.000144 kg/s, yet source inlet remains 0.08163 kg/s and accumulator
mass reaches 0.26069 kg versus 0.26099 kg. At 1 s, feed is about 98% lower,
but accumulator masses remain 0.31669 versus 0.31857 kg. These instantaneous
rates are not exact interval integrals, especially across protection events.

At 10 s, default start is held with accumulator mass 0.61893 kg; the initially
closed case remains admitted at 0.58150 kg. Its gain is only about 10% lower,
and its source inlet still exceeds pickup. This demonstrates delayed protection,
not sustained nominal operation. The longer closed-start probe timed out without
a saved endpoint. The old default trace holds at approximately 9.25 s.

The declared initial condition is one isothermal 7°C density flash, uniformly
distributed over all cells, including gas lines. For 1.8 kg and the generic
4.45480 L geometry, native R32 EOS gives 10.1150 bar, mass quality 0.04260,
vapor volume fraction 0.62464 and total internal energy 401053.47 J. About
1.7233 kg is liquid, including 0.5336 kg in gas lines and 0.4375 kg in the
outdoor coil. This is a legal generic equilibrium initial condition, not a
measured stopped distribution. The initial distribution and homogeneous source
outlet closure are coupled; available traces cannot separate their contributions.

Controller assumptions also matter. With wet outlet superheat zero, the generic
EEV closes by approximately 0.015 opening/s from 0.65. An exactly zero opening
with compressor command/admission triggers a 0.025 preposition on a quarter-second
step, producing repeated opening/closing pulses: initial zero is not a persistent
closed-start policy. The drive holds 18 rps for the first 10 accepted seconds,
so default protection precedes its normal speed ramp. Increasing speed is not
demonstrated to solve wet migration and may increase it. None of these policies
is established as the owner's manufacturer's control behavior.

## Proposed bounded comparison

Use four new research initial conditions: original uniform phase allocation and
a dry outdoor gas-end cell, each with initial EEV 0.65 or zero. Retain the current
controller, including its pulses, to avoid conflating initialization and control.
Keep the accumulator and gas lines' initial M/U unchanged in the dry-cell pair.
Redistribute phase into the remaining coils and small lines at the same saturation
P/T using the native EOS lever rule, not by adding vapor or changing energy:

`rho_i = (1-alpha_i) rho_l + alpha_i rho_v`,
`x_i = alpha_i rho_v / rho_i`,
`M_i = V_i rho_i`, `U_i = M_i h_i - P V_i`.

Holding `sum(V_i alpha_i)` fixed preserves total mass, internal energy and total
phase amounts. The EOS calculation finds a feasible remaining alpha 0.55720;
native PH reconstruction differs from original totals by 2.44e-15 kg and
4.66e-10 J. This changes the declared initial local inventory distribution;
it must never remap an evolving accepted checkpoint. A broader dry-gas-line
allocation is also feasible, but should be a later sensitivity test rather than
another simultaneous change.

Initially limit each case to 1 s/four quarter-second steps and 60 wall seconds;
save every accepted checkpoint, report unfinished cases, and do not repeat full
warmups. Preserve EOS, volumes, charge, thermal/controller state, work accounting,
and every original local/global M/U/water acceptance limit. Record inlet phase,
source M/U, accumulator M/U/vapor fraction, actual EEV flow/opening, pickup,
drive phase/speed, and signed useful heat/work ledgers. Check an informative pair
at eighth-second steps before drawing a temporal-resolution conclusion.

A large reduction of early filling in both dry-cell starts would support initial
source inventory as the dominant early trigger. Rapid rewetting under both EEV
starts would point toward the conservative spatial phase/outlet closure requiring
separate investigation. A controller redesign is a separate declared experiment;
do not force a closed valve, relax protection, fit volume/charge, or replace bulk
outlet enthalpy with unlimited dry vapor. Manufacturer internal volumes, stopped
phase distribution and liquid/oil return details remain unknown. No public gate
or full frost/heating acceptance follows from this diagnosis.
