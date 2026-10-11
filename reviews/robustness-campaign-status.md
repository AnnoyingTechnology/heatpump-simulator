# Engine robustness campaign evidence

Observed on 2026-10-11 using seeds 20261011 and 20261012. Each JSON receipt pins engine, compiled engine,
production guarded HEOS and harness hashes. Earlier candidate passes remain
historical evidence for their particular hashes; they do not certify later code.

The baseline quick campaign completed 31 scenarios: 25 passed and six physical
faults. The baseline endurance campaign completed 57 scenarios: 17 passed and
40 physical faults, with 24,897 accepted simulated seconds. These supplied
reproducible pressure-root, indoor icing, outlet fog and passive-room moisture
counterexamples. The full original two-hour frost scenario passed. Native
process exits, timeouts and conservation failures were not observed in these
campaigns. See `robustness-20261011-quick-baseline.json` and
`robustness-20261012-endurance-baseline.json`; original failure receipts and
fixtures are retained separately.

After the moisture, protection and pressure-regime corrections, the bounded
acceptance campaign in `robustness-release-verified-results.json` passed all
40 retained/representative scenarios, with 8,172 accepted simulated seconds.
The 1,800-second frost case completed four defrost cycles; both 1,200-second
strong-heating → 42°C cooling reversals passed. A preliminary run had an
incorrect harness assertion requiring compressor/coil mass matching to be
more precise than the declared solve tolerance; correcting that assertion
and replaying the identical frozen physical source produced these results.
The exact branch-flow conservation assertion remains stringent.

The broader frozen-source campaign in `robustness-final-seeded-results.json`
completed 57 scenarios: 53 passed and four physical faults. It accepted
34,040 of the requested 36,380 simulated seconds, including 178 configuration
edits. All four faults restored the accepted transaction exactly. There were
no invariant failures, native process exits or timeouts. Maximum accepted
energy residual was 1.953×10⁻⁶ J; water residual was 1.351×10⁻¹³ kg. The
1,800-second humid frost case completed four defrost cycles, and the bounded
1,800-second hot/wet cooling case passed. These are explicitly thirty-minute
cases, not a claim that the final source passed the original two-hour case.

The four new pressure/envelope counterexamples are `sequence-7` (eight heads,
360 seconds), `sequence-16` (eight heads, 150 seconds), `sequence-22` (eight
heads, 510 seconds), and `sequence-28` (one head, initial step). Their exact
operation schedules are in `tests/engine/fixtures/robustness-20261012/`; full
accepted checkpoints, original exception stacks and source hashes are in
`robustness-final-seeded-failures/`. A dedicated thermodynamics pass is
investigating whether each needs feasible root recovery or a physical
automatic protection hold. These faults remain unresolved for this hash;
the 40-case pass does not override the broader findings.

The following ordinary-UA/phase-query candidate completed 73 scenario replays:
71 passed and two newly exposed near-domain pressure roots failed, with
42,814.75 accepted simulated seconds. The 73 replays include the original
57 schedules plus 16 saved fixtures; several fixtures repeat broad schedules.
All four preceding failures passed complete 840-second schedules on this
candidate. Its newly found warm-heating grid fault (14.25 seconds) and retained
reversal fault (150.5 seconds) are preserved in `robustness-ordinary-UA-counterexamples/`
and the matching `tests/engine/fixtures/robustness-ordinary-UA/` directory.
See `robustness-ordinary-UA-73-results.json` for this historical candidate's
hashes and complete results. A subsequent in-domain derivative-probe correction
passed all six complete counterexample schedules.

The final in-domain derivative-probe source (cycle hash `294d647a…`) completed
all 75 replays with zero physical faults, invariant failures, process exits or
timeouts: 44,570 accepted simulated seconds, 178,280 quarter-second steps and
266 configuration edits. There are 63 distinct physical operation schedules;
saved fixture repetitions account for the additional replays. The full receipt
is `robustness-final-in-domain-FD-75-results.json`. Maximum accepted energy
residual was 1.541×10⁻⁶ J and water residual was 1.233×10⁻¹³ kg. The frost
scenario completed four defrost cycles in 1,800 seconds and drained 0.634632 kg
of water; both 1,200-second owner reversals, the reconstructed 1,100-second
friend case, hot/wet 1,800-second cooling and every retained fault schedule
passed. Earlier receipts are preserved with their own failures and hashes.

This final replay froze the source before the optional sensible ventilation
recovery feature was added. Its successful results do not certify that later
engine revision or changed frontend defaults. Subsequent recovery tests and
whole-engine regressions must be evaluated separately against their hashes.

The updated sensible-recovery engine (engine hash `1476bef6…`, ventilation
helper `6aef508a…`, cycle unchanged at `294d647a…`) then passed a separate
bounded 20-scenario campaign: 13,580 accepted simulated seconds, 54,320 steps,
16 retained-state edits, and no physical faults, invariant failures, process
exits or timeouts. Maximum energy residual was 1.716×10⁻⁶ J and water residual
was 4.885×10⁻¹⁴ kg. The receipt is `robustness-recovery-final-20-results.json`;
its exact input hashes, complete configurations and recorded patches can be
replayed from `tests/engine/fixtures/robustness-recovery-20261014/`.

This campaign includes four 1,200-second owner reversals (house and old generic
fixtures, heating→cooling and cooling→heating), the 1,100-second reconstructed
friend case, 1,800-second hot/wet cooling and 1,800-second humid frost. The
recovery frost run completed four defrosts and drained 0.634035 kg. Twelve
seeded one/three/five/eight-head cases used 0/80/100% sensible effectiveness,
gross 0.5 ACH, saturated extreme weather and retained mode/weather/target/on-off
edits. A separate 1,200-second owner winter case used the current 0.5 ACH,
75% sensible recovery, 95% clear coils and 173.803681 W/K links. It averaged
661.18 W with session COP 2.696 and final attic/upstairs/ground temperatures
18.919/21.785/18.013°C. These are generic-reference observations, not measured
manufacturer calibration; no equations were fitted to reach 500 W.

Recovery coverage concerns the declared balanced sensible-only exchange with
gross moisture transfer. It does not certify exchanger condensation, frost,
bypass, ventilation fan power or a calibrated manufacturer recovery unit.

The friend's screenshot case has not reproduced a native failure in the
reconstructed Node scenarios. Its original worker failure cannot be declared
fixed from these results. Browser worker-failure retention/diagnostics checks
are separate evidence. Coverage uses the released reference R32 circuit,
not every refrigerant or calibrated manufacturer map, and does not replace
physical calibration or prove robustness for all permitted combinations.

The persistent ±1 K comfort-call/fan revision (engine `868c205b…`, demand
`2723ec0b…`) passed the twenty retained recovery inputs plus a 1,200-second
owner −4°C/ground16 case: 21/21, 14,780 accepted seconds and 59,120 public
requests. Its receipt remains `indoor-comfort-robustness-results.json`; these
old constant-conductance inputs are preserved separately from opening geometry.

The Candidate A opening-exchange freeze (engine `92174a5b…`, interzone
`20671a67…`, cycle `294d647a…`, types `2ed28a4c…`) passed all 21 new-geometry
schedules: 18,746 accepted seconds, 74,984 quarter-second public requests,
75,129 accepted internal intervals and six retained-state edits. Maximum
energy residual was 8.270×10⁻⁷ J and water residual 1.394×10⁻¹³ kg. The
1,800-second frost case completed four defrost/drain cycles, draining 0.623650 kg.
Both 1,200-second owner reversals, actual 0/1/−4°C owner geometry, wet cooling,
eight-head reversal, isolated stable/unstable floor and wall openings, and
large-aperture/small-room adaptive intervals passed. Isolated openings preserved
per-room total water and initial temperature bounds. One-m³ trajectories had
decreasing differences under timestep refinement; the adaptive large-aperture
runs recorded nonuniform actual intervals and every observed difference without
claiming monotone successive convergence.

`opening-exchange-robustness-results.json` retains the exact source/harness
hashes, diagnostics, input hashes and numerical comparisons. Twenty-one complete
inputs are in `tests/engine/fixtures/opening-exchange-robustness/`. The observer
now validates and integrates every accepted adaptive interval and persists its
preceding checkpoint. A separate smoke25 passed with the identical observer but
a later valve-diagnostics cycle/type snapshot; that distinction is explicit in
the receipt. The later long replay was intentionally stopped after seven passes
when independent review required moving diagnostic publication outside physical
fallback selection. The cancellation is recorded in its temporary artifact;
it is neither a final pass nor evidence of a native crash. The corrected valve
publication revision requires its own frozen replay receipt.

After a new user report at 146 simulated seconds, the unmodified published
`1fc0324` frontend was bundled in an isolated temporary copy to obtain canonical
`engineConfigFromUi(defaultConfig(), defaultConfig().live)` inputs. Six startup
runs at 0/1/−4°C outdoors and ground16/17, with first21.5, atticOff and actual
18.3/21.5/18°C initial rooms, each passed 600 seconds. These preserve all other
frontend mappings, including tubing diameters and floating-point room volume.
`published-owner-startup-146-robustness-results.json` records the published
frontend/engine hashes, canonical UI, six complete fixtures, 3,600 accepted
seconds and residual maxima. The reported fault did not reproduce; its actual
URL, edited settings and error text were not yet known. Native startup passes
alone do not diagnose a browser worker failure.

The corrected valve-diagnostic publication freeze (cycle `8d47208f…`, types
`04eb849d…`, engine/interzone unchanged) then passed all 21 opening schedules,
the original smoke25 and all six canonical published-default startup inputs.
Every auxiliary run captured exactly matching engine/backend/harness hashes.
Combined coverage is 52 completed replays, 22,448 simulated seconds, 89,792
public requests, 89,937 accepted internal intervals and 12 retained-state edits.
Maximum energy/water residuals remain 8.270×10⁻⁷ J / 1.394×10⁻¹³ kg; four
complete defrost/drain cycles occurred in the long frost run. All 21 final
room/outdoor/energy outputs were bit-identical to the original opening freeze.
`valve-port-robustness-results.json` records this corrected source, exact fixture
parity and separate cancelled-run history. No physical fault, invariant failure,
native exit or timeout occurred within these complete campaigns. The user's
localhost HMR/reload diagnosis is separate browser evidence, not inferred from
these native passes.
