# Owner house thermal changes: independent science review

2026-10-11. Scope: `src/engine/interzone.ts`, `engine.ts`, `demand.ts`, engine
types, UI types/defaults, runtime mapper and `tests/engine/interzone.test.mjs`.
No UI acceptance or publication approval is implied. No implementation edits
were made by this reviewer.

**Accepted within the declared lumped sensible model. No blocking science defect
found in the reviewed changes.** The owner temperature pattern is approximately
reproduced; the generic equipment does **not** reproduce the 500 W electrical
observation. This distinction must remain visible in release claims.

## Source findings

- Each link uses one common pre-step state and applies opposing
  `H × (T_neighbor − T_room)` powers. It does not add external energy, dry-air
  mass or water. Gain power enters air enthalpy and the global external-energy
  ledger; it remains separate from heat-pump electricity, useful HVAC heat and COP.
- Disabled indoor units retain air/fabric/metal dynamics and participate in links;
  their targets do not determine neighbor demand. The inverter feed-forward uses
  actual neighbor temperature and has the correct gain sign in heating/cooling.
  Refrigerant capacity still emerges from the accepted EOS cycle.
- Configuration validation rejects absent/self/duplicate endpoints, negative or
  nonfinite conductance, and invalid gains before accepting new configuration.
  Ordinary gain/link edits preserve stored state. Failed physical steps roll back
  physical stores and boundary ledgers.
- UI→engine mapping passes gains and ventilation, filters links by active room
  **identities**, and retains links when a unit is Off. Removed room slots lose
  their engine links; stored configuration retains them for reversible readdition.
  Reordering cannot attach a link to the wrong floor. Main configuration signatures
  include these fields and reach worker configuration without a special restart.
- The three-floor preset follows current owner settings and temperatures. Its
  envelope split, link coefficients, gains, ACH and humidity are explicitly
  provisional assumptions. Generic engine defaults remain unlinked with zero
  gains; compressor/coil/fan defaults and the disabled charge-model gate remain
  unchanged by this work. Effective mean floor losses are the intended granularity.

## Validation and bounded owner benchmark

Independently ran `node --test tests/engine/interzone.test.mjs`: **7/7 passed**.
These tests cover opposing heat transfer and water conservation in both modes,
room/link ordering, external gains accounting, controller signs and Off neighbors,
configuration validation/state retention, transactional rollback and timestep
refinement. Existing inverter/protection checks were separately run by the
implementation agent; release integration checks belong to the parent task.

Reviewed [owner-house-engine-benchmark.json](../research/owner-house-engine-benchmark.json):
guarded HEOS R32 reference, 0.25 s steps, 1200 simulated seconds, all refrigerant
and drive assumptions generic, idealized field lines, no inventory circuit.
The final 300 s produced:

| Quantity | Observed simulation |
|---|---:|
| Mean total electrical input | 649.03 W |
| Mean net HVAC room heat | 1924.52 W |
| Energy-weighted heating COP | 2.965 |
| Final ground / upstairs / attic | 18.024 / 21.622 / 18.335 °C |
| Active indoor unit | Upstairs only |
| Compressor speed | 18 rps throughout final 300 s |
| Faults / protection | None |
| Maximum energy / water residual | 5.72e−7 J / 5.77e−15 kg |

Electrical input is approximately **30% above** the owner's 500 W observation.
The unchanged generic equipment model, unconfirmed measured electricity boundary,
unmeasured humidity and assumed house parameters limit attribution. Do not bend
the envelope, links or efficiency to erase this difference. This warm-start
20-minute run is a useful transient checkpoint, not validated house equilibrium:
the assumed 12 MJ/K fabric capacity divided by approximately 113 W/K loss gives
an indicative whole-house timescale near 29 hours. Final-window temperature drifts
are still approximately +0.20/+0.23/−0.12 °C/h for attic/ground/upstairs.

The existing cycling latch requires every enabled room above its overshoot margin.
This could involve a backup room receiving passive heat, but the suspected cycling
interaction did not occur in this benchmark: no new controller change is warranted.

Reviewed engine hashes match the benchmark register: `interzone.ts`
`c16e478c3da14ce5957aa6f6bd9796d25370aa557904fd0a607c838c0649db63`,
`engine.ts` `df7cb5ef50bf4c38b5c88b2cfc720b298c8c66b3cd3fe70c142c0ea14de4031b`,
`demand.ts` `53e9c8bbc8e85e37f3cad9d842e22510ccf2404e04cc7bbe7755b14140d12197`,
engine types `2e43f53a811641899d86efcfc217dd901591dfe0b660911053cab0dd15a40e70`.

## Cumulative service COP follow-up

Independently reviewed the subsequent `usefulServiceHeatJ` addition and ran the
guarded interzone/session-COP suites: **13/13 passed** (eight interzone and five
session tests). Each accepted substep accumulates net HVAC room heat with the
sign of the requested mode. Actual heating defrost and unwanted reversal heat
subtract useful service; mode changes preserve past service and electricity.
Idle controls remain in the denominator. Prescribed gains, interzone heat and
configuration storage impulses earn no HVAC service credit. Reset clears both
histories; failed steps restore the entire ledger. No accounting defect found.

This mixed-mode history is a cumulative service performance factor; it should
not be presented as a steady-state heating COP. At zero cumulative electricity
the ratio is undefined; negative useful service should remain visible rather
than being clamped away.

Follow-up hashes: `engine.ts`
`85df04d64d01c16c6891a8b5d950b3c6920fb324d57f38951d6e1adc2dc6daa2`,
engine types `e34d60667c637b5ba46e8c680714c9ccbb4fd2422e6d64894086cb7577830cd0`.
The preceding 1200 s receipt remains a historical physical benchmark: this
addition changes service accounting, not refrigerant or thermal physics.

## Open/solid link parameterization follow-up

Reviewed UI types, store setters and runtime mapping. Both opening and partition
links map to the unchanged symmetric engine conductance `H = area × coefficient`.
Positive finite area, nonnegative finite coefficient and a finite product are
checked before store acceptance. Stable room-ID upsert/filter behavior remains.
Legacy conductance-only links remain supported. Owner areas 5/3 m² at assumed
40 W/(m²·K) reproduce the benchmark's 200/120 W/K exactly. Type and orientation
do not introduce an asymmetric flux or unverified buoyancy law. Orientation means
connection direction; the future UI must use that meaning consistently.

The opening coefficient 40 and partition coefficient 1.5 W/(m²·K) are declared
editable assumptions. Neither is a universal air-film coefficient, construction
standard or measured material property. The mean floor envelope coefficient
continues to cover external losses, while internal links cancel globally.
No science defect found; visual editing/diagram and application integration
acceptance remain outside this source review.

Reviewed mapper/schema hashes: UI types
`c43f0bc8e8c916dec23b83a0e8ae24a599da184c81b18396610c449b16b3d163`,
state `ca4e0154332a5856377263db8e3d611a48ce9ae0b548c4b861216104ed47b8dc`,
runtime mapper `e959c59ff3c9c812fe91a91d065c5d0f1f64d3568c47d126f6435908680de91e`.

## Final drained-water and junction-diagnostic review

Final independent guarded run: **17/17 passed** (nine interzone, five session-COP,
three drained-water tests). Source review found no blocking defect. The added
water ledger integrates positive immediate indoor condensate plus actual outdoor
liquid drainage after successful candidate acceptance. Deposition, freezing,
melting, stored water, evaporation and configuration removal earn no drainage
credit. History survives configuration/mode edits, resets on Restart, and rolls
back with failed steps. The implementation agent also passed the existing natural
defrost fixture extended to verify uncredited deposition and counted liquid
drainage; its source assertions were independently inspected here.

`interzoneTransfers` uses accepted output temperatures and the engine's cloned
canonical conductance. Positive `heatFromAToBW` means A supplies B; reverse flow
changes its sign. Output snapshots remain independent of caller mutations and
pending UI metadata. The junction value is an instantaneous accepted-state flux,
whereas `RoomOutput.interzoneHeatW` records the last pre-step integration flux:
these should not be described as identical measurements. Neither changes storage
or cumulative accounting.

Final science acceptance includes these accounting/diagnostic additions. The
owner explicitly accepts approximately 649 W versus 500 W as a provisional
starting point with tolerances; this quantified difference remains documented
without requiring a product warning. Visual/application acceptance remains with
the parent task. The original 1200 s benchmark hash register above remains
historical and is not silently replaced by final accounting hashes.

Final hashes: `engine.ts`
`31e80127989aa76c2b95770432be2e1867c3799a793cd7665af50c6dfd62e768`,
engine types `cd797078c182162bb394db3dfed1a16c66a8ca919fa1b052cc4bec21f8fda779`,
`interzone.ts` `856dfe9535d53f52aa8aae8f0cc83167163b11bab8ca6bb9bb62ff9e600d8bed`.
