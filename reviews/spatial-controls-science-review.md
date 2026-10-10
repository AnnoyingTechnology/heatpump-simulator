# Independent spatial-controls science review

Reviewer: dedicated science-compliance agent. Date: 2026-10-10. Status: **initial mapping/scope review complete; final spatial implementation and browser evidence pending**.

Scope is the owner-requested frontend refactor: prominent per-unit supply temperature/net-room heat, controls beside relevant objects, no persistent default sidebars and a contextual inspector. Write scope is this file only. No engine/runtime/state/types/fixtures or numerical edits are authorized for this pass. The prior [engine science verdict](engine-science-review.md) and [control-refinement verdict](control-refinement-science-review.md) remain bounded generic R32 acceptance, not manufacturer or empirical calibration. No EOS test or full engine suite was repeated.

## Observed input ownership before the refactor

Read `src/types.ts`, `src/runtime/config.ts`, `view.ts`, `state.ts` and current scene/sidebar/inspector/chrome mappings. UI placement must preserve the following actual ownership:

| Input | Actual scope and scientific meaning |
| --- | --- |
| Outdoor T/RH | Common outdoor-air boundary inputs. RH uses saturation over ice below 0 °C. These are not coil-metal temperature or stored film state. |
| Room volume / H | Independent room dry-air inventory volume and envelope heat-loss coefficient; changing one room must not change another. H is W/K, not a kW load or building area. |
| Room setpoint / enabled | Independent thermostat target and requested unit operation. Off closes circulation/forced fan without removing the room or erasing storage. |
| Room air input | Initial temperature intended for a restarted run/new room; distinct from actual calculated room air temperature. Current Reset wiring contradicts that contract (SP-01 below). |
| Indoor air UA / refrigerant UA / air mass flow | Three shared `cfg.live` values assigned to **every** indoor room by `engineConfigFromUi`. A selected-unit editor must clearly say “all indoor units”; placement beside a unit cannot make these independent. |
| Outdoor air UA / refrigerant UA / air mass flow / deposition area | Outdoor-only generic model parameters. Deposition area is an assumed frost-model area, not a measured manufacturer finned area. |
| Global cleanliness | Default remaining clear passage for **all** coils, 100% to 10%; not outdoor-only and not a direct COP penalty. |
| Outdoor/room cleanliness override | Independent local override; null inherits the global default. Effective value/source must stay visible. A global edit must preserve existing overrides. |
| Branch length / gas and liquid OD | Independent one-way physical line-set geometry, not drawn route length. Effects are excluded in default idealized mode; bounded physical HEM is an advanced option. |
| Wall thickness / insulation conductance | Shared generic line assumptions under the current schema. Selected-branch placement must not imply independently stored values. Bore is OD−2t; family minimum wall is not installed measurement. |
| Compressor ηis / displacement / maximum speed | Common generic compressor parameters. ηis does not include drive efficiency; maximum speed is not observed current speed or fan RPM. |
| Model reference / indoor capacity class | Drawn casing and label; live generic UA/airflow/compressor performance does not change with reference selection. Capacity-class fixture shares remain Examples-only. |

No new per-unit UA/airflow capability can be implied by this frontend-only pass. A future independent-parameter expansion would require explicit schema/adapter work and a separate check.

## Prominent branch-reading boundaries

The live adapter maps each branch supply temperature from its actual `RoomOutput.airOutletC` and fan power from that same room. Stopped forced fans, idle, closed branches and defrost do not have a valid forced-air supply temperature. Preserve an unavailable marker/reason; do not display the target, room temperature, common-header refrigerant temperature, 0 °C or a nominal catalogue outlet instead. One active unit cannot authorize another unit’s supply value. Faults/incompatible pending changes withhold output, and compatible target/weather changes preserve only the visibly tagged last calculated snapshot.

The branch kW reading is **net heat to room air**, including fan heat, not refrigerant-side coil duty or nominal capacity. Heating displays the signed room heat directly; cooling negates it to represent removal, preserving a negative value if fan/storage effects temporarily warm the room. Defrost retains signed room heat and unavailable useful COP; it is not cooling requested by the owner. Unit Off can leave a small nonzero natural/passive room-coil exchange. Do not force branch heat to zero merely to match the Off label. Different branch capacities/outlets remain independent actual outputs, including heterogeneous branches.

Give both supply temperature (°C) and net room heat (kW) clear units, labels and prominence comparable to actual room T/target. Labels must identify heating/cooling versus signed defrost; increasing numeric font size must not hide sign, null reason, source provenance or the distinction between input and output.

Examples remain constructed fixed snapshots. Off/setpoint/geometry/cleanliness edits are requests/configuration, not new solved fixture values; show mismatch/provenance rather than inventing a recalculated branch. Actual live branch outputs must never be reconstructed from catalogue capacity weights.

## Local controls and stored state

Object-local weather controls edit ambient inputs, while outdoor-coil readouts retain actual metal temperature, ice and liquid inventory from accepted physics. A warmer ambient edit cannot instantly melt/reset ice or equate the metal to ambient. Rejected/pending configuration retains labelled accepted inventory with its timestamp and withholds incompatible operating values. Existing liquid water, room humidity and metal/fabric temperatures survive control relocation and selection changes.

Controls should stay local in meaning as well as position: selected-room volume/H/override affects that room; shared indoor parameters explicitly affect all heads; the global cleanliness default affects inheriting coils; selected-branch length/OD affects that branch. Current compressor/field-line assumptions and manufacturer-unknown details remain accessible even when persistent sidebars disappear. A contextual inspector is a viewing/editing surface, not an independent physical solver or a reason to initialize/reset the selected object.

## Material finding: SP-01 — initial-temperature Reset contract (medium, open)

Observed source contradicts the newly repeated promise that an initial-room-temperature edit is applied by Reset. `src/settings.ts:427–429` labels it “on Reset” and explicitly tells the user to press Reset. `src/chrome.ts:107` instead invokes `Store.reset()`, whose `src/state.ts:121` restores the whole configuration to `defaultConfig()` before incrementing `resetEpoch`. The main runtime synchronization starts from that already-restored configuration. The edited room initial temperature, as well as other scenario settings, is lost. The engine's `initialTemperatureC` mapping is correct; this is a UI/state reset-contract defect.

Recommended minimal fix: introduce a distinct simulation-restart API retaining the current configuration, clearing the simulated time/inventories and restarting the engine from those inputs; bind the visible simulation Reset/Restart action to it. Keep existing `reset()` factory-default semantics for historical QA or an explicitly labelled restore-defaults action. State clearly that restarting begins a new scenario and resets stored thermal/water state. Verify a changed initial room temperature and a second edited parameter survive the UI restart and initialize the new run. No engine change or full numerical rerun is required. Sent to the coordinator for the scoped correction; final disposition remains pending.

## Permanent refrigerant probe contract

Read the author's [refrigerant-temperature investigation](refrigerant-temperature-review.md) and actual `src/runtime/view.ts`/circuit mappings. Its short real-backend observations are author evidence, not a new independent numerical rerun. The checked default heating endpoints differ by 3 K; the existing below−10 °C colour clipping can hide a real difference. Individual two-phase branches may also correctly exchange heat at equal inlet/outlet temperatures. Display returned temperatures accurately; do not force a gradient, add a nominal superheat offset or replace latent heat with a sensible `m cp ΔT` estimate.

Use the solved cycle mode, including reverse defrost while the requested UI mode remains heating. Keep REF temperatures separate from AIR supply/exhaust, ambient and metal/film temperatures:

| Equipment probe | Live heating | Live cooling / defrost |
| --- | --- | --- |
| Outdoor REF IN | `engine.cycle.expansionOutlet.temperatureC` | `engine.cycle.discharge.temperatureC` |
| Outdoor REF OUT | `engine.cycle.suction.temperatureC` | `engine.cycle.condenserOutlet.temperatureC` |
| Compressor REF S / D | Actual `suction` / `discharge` temperatures | Same fixed physical S / D ports |
| Indoor i REF IN / OUT | Actual `branchInlets[i]` / `branchOutlets[i]` | Same actual flow-endpoint arrays |

Each indoor pair requires that branch's mass flow be positive. Never copy the mixed common suction onto every individual branch outlet. In heating the outdoor IN is the small-side port and OUT gas-side; cooling/defrost reverse them. Indoor heating IN is gas-side and OUT small-side, also reversed in cooling/defrost. Compressor S/D remain fixed ports. No solved cycle, closed branch, fault or withheld incompatible configuration means `—`, not stale or nominal refrigerant endpoints. Defrost can show solved REF endpoints with forced AIR outlets unavailable. Compatible retained snapshots require visible last-calculated qualification.

Examples use their explicitly labelled fixed fixture values: outdoor heating `expOutC → suctionC`, otherwise `dischargeC → condOutC`; indoor heating `dischargeC → condOutC`, otherwise `expOutC → suctionC`; compressor always `suctionC → dischargeC`. Do not imply that these are a new calculated live branch solution.

Require permanent, readable 0.1 °C endpoint values beside equipment, independent of opening an inspector. Optional signed ΔT is OUT−IN in K. No actual axial midpoint state is exposed: `coilM`/`inM` cannot become an invented measured temperature profile or metal-temperature substitute. Separate air and refrigerant colour scales preserve phase encoding and exact numeric readings. The proposed air colour range −30…50 °C and refrigerant −40…145 °C are display ranges only; they do not extend the engine's current outdoor-input guard −25…45 °C or establish calibrated equipment coverage. The probe pass remains frontend-only.

## Final review gates

Await final supplied source and rendered/browser evidence. Inspect actual supply/null/sign handling, labelled shared versus local setters, inherited overrides, model-reference caveats, physical-line exclusions, visible held/fault state and preserved accepted film versus editable ambient. Confirm prominent °C/kW display at 1–5 rooms without false interpolation or fixed nominal fallback. No numerical rerun is needed if the pass stays within the authorized frontend scope; any numerical/schema/adapter change requires separate review.

SP-01 is a confirmed source-level contract defect pending the coordinator’s correction. The shared indoor UA/airflow, inherited-cleanliness and actual-probe boundaries above were sent as early constraints. Final spatial/probe implementation acceptance remains pending source and rendered/browser evidence.
