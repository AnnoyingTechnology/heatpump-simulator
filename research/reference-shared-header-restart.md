# Reference shared-header closure and restart screening

Candidate follow-up to the accepted indoor-moisture/protection model, 2026-10-11.
Independent science acceptance and final broad regression remain separate release gates.

## Retained eight-head trigger

The immutable `robustness-20261012/sequence-7.json` target/enable edit at 360 s
changes two active branches to six. A hot branch at 38.648843°C incorrectly pinned
shared condensing temperature above that metal. The SC-target residual remained
16.8 W; the minimum-lift regime was unavailable at this cold source.

A branch whose metal exceeds shared saturation can still cool the discharge gas
without condensing it. The same finite-UA integral determines its vapor outlet;
colder branches can condense and subcool enough to produce a liquid mixed header.
Only the actual mass-weighted PH mixture must meet the shared subcooling target.
Every active branch must retain positive inlet-to-metal heat direction. The
idealized SC-target lower bound is therefore the coldest sink plus target SC.
Physical field-line per-branch subcooling remains governed by the hottest sink.

The follow-up replay exposed another failure at 374 s: the true operating point
is about 0.000892 K above a branch metal temperature. Ordinary PT quadrature
queries entered CoolProp's saturation ambiguity band and rejected cp evaluation,
preventing the pressure residual from reaching the unchanged 0.1 W criterion.
Single-phase enthalpy knots already determine the phase of each sensible panel.
Known liquid/gas phase inputs now resolve those EOS queries, including sensible
terminal enthalpy queries. Temperatures and properties are not shifted or fitted.
Plain PT retains its reusable native state outside a broad 0.01 K query-selection
band; this band changes the API query only. Pressure differences also remain on
the current side of branch saturation boundaries to resolve local slopes.
[CoolProp documents phase-imposed inputs and the need to know their phase](https://coolprop.org/coolprop/HighLevelAPI.html#imposing-the-phase-optional).

The subsequent broad candidate replay found two warm-source crossover failures
that the prior source had passed: `grid-heating-45-0` and `sequence-11`. A valid
continuation seed at the 1 K minimum lift was abandoned because preferred
forward-Te/backward-Tc Jacobian probes crossed the admissible lift boundary.
Floating-outlet probes could likewise cross the liquid-outlet bound. Rejected
probes now try the opposite one-sided difference, still subject to every original
domain check. This changes derivative initialization only, not controller regimes,
physical equations or acceptance tolerances. Both exact saved crossover states
are retained as focused regressions; their full schedules remain broad gates.

The saved two-point fixture in `eight-head-shared-header.json` checks the original
edit and the subsequent near-saturation state. Tests retain the original pressure
and mass acceptance criteria, verify actual branch heat direction, liquid PH
mixing, compressor/coil energy, positive compressor work, branch and mixing
entropy production, and outlet heat against a separately partitioned bisection
inverse. That inverse shares the EOS quadrature; it is independent inversion,
not independent experimental validation.

## Explicit restart protection

Three further exact schedules exposed starts for which no accepted Reference
cycle was available: a hot outdoor metal after reversal (`sequence-16`), a cold
source with strongly weighted hot indoor branches (`sequence-22`), and a cold
single-room start with low compressor efficiency (`sequence-28`).

The existing thermal-boundary estimate now also screens starts before requesting
a full pressure solve. A predicted discharge/ratio/condensing violation uses its
existing independent latch and thresholds. Unavailable thermal-domain estimates
use a separate, visible `thermal boundary` latch. Unknown or Off intervals do not
prove recovery; an available current-mode boundary releases that latch, retaining
all other recovery requirements and the existing minimum-off dwell.

For idealized heating, when maximum source-side Te plus the 1 K minimum lift
cannot place a liquid header above the coldest sink, minimum-lift control is
unavailable. The remaining SC-target estimate uses current branch allocation
weights and the limiting metal-equilibrium enthalpies:

`h_min(P) = sum(weight_i * H(P, Tmetal_i)) / sum(weight_i)`.

Positive branch heat direction bounds its outlet below the inlet and above its
metal equilibrium. A hot metal above saturation has a vapor limiting enthalpy;
using only the coldest sink misses that contribution. At exact metal/saturation
equality, the liquid endpoint supplies a conservative minimum, although a real
finite-UA desuperheating branch cannot remove latent heat at zero driving
temperature. Bisection locates a scalar SC-target pressure floor using this
regional trend. The maximum source-side Te and that floor estimate discharge and
ratio; they are a declared controller heuristic, not a global real-fluid
monotonicity theorem or a freshly closed operating cycle.

This policy is deliberately conservative: if `max(active metal) + target SC`
exceeds 65°C, the scalar bracket is unavailable without attempting a weighted
target-margin check at 65°C. Similarly, a source outside the selected restart
thermal boundary can be held even if another physical cycle might exist. These
holds indicate controller/domain unavailability, not proof of thermodynamic
impossibility. No selected property-domain cap was enlarged.

Stopped compressor work is zero. Existing fans, air exchange and actual thermal
stores continue evolving; successful recovery requires a new cycle satisfying
every original residual and hard envelope check. No solver exception becomes an
idle/protection result, and no stale cycle supplies heat or work. Manufacturer
control calibration, complete icing physics and public charge release remain
outside this change.

Frozen candidate source and results are recorded separately in the review receipt.
