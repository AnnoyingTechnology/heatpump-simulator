# Guarded exact-HEOS backend and startup sensitivity review

Status: **source/failure contract and Reference backend promotion accepted**. Review dated 2026-10-10. Public charge release remains **not accepted**. This reviewer performed read-only source, artifact/hash and evidence inspection; no shared builds, backend acceptance runs or long simulations. Reported test execution is attributed to the author/root. Effective inherited reviewer model identifier is unknown; no model substitution was requested.

## Native boundary and property integration

Read the guarded C ABI, JS facade, Properties integration, build/preparation/notices/provenance scripts and actual generated compile/link commands. Native update/getter/PropsSI/HAPropsSI EOS operations catch standard and unknown C++ exceptions and return an explicit status or NaN plus bounded error text. The facade raises ordinary JS Errors. R32 HEOS and eight explicit input pairs preserve the existing EOS rather than replacing it with a fitted approximation.

Update invalidates the handle before flashing, checks computed finite positive T/p/density, then admits reads. Failed updates and getters invalidate and destroy the affected EOS object; a later valid update reconstructs it. Reads before update and after deletion reject. Scalar refrigerant and humid-air operations catch their own failures. Sharing one 2048-byte error buffer suits synchronous serialized worker calls; concurrent/reentrant use is outside this contract. These catches cover ordinary native EOS exceptions, not arbitrary WASM memory traps or process failure.

Three concrete defects found during draft review are now closed in source and acceptance coverage:

- Properties originally retained `lastInput` after a guarded getter destroyed its native state. The catch now clears it. The real Properties test flashes a wet state, triggers undefined sound speed, then obtains uncached enthalpy at exactly the same inputs; this exercises recovery without relying on an explicit adapter update.
- Symbol/BigInt/nonnumeric update arguments originally could throw during JS-to-WASM coercion before invalidation. The facade now deliberately sends a guarded invalidating failure for wrong numeric types. Native failed reads reject thereafter; recovery requires a valid update.
- Nullable native strings originally reached string construction. The facade now checks string types, and factory/PropsSI/HAPropsSI native entry points reject null pointers before conversion.

The guarded Properties route replaces unsafe reusable-state preflight with native catches plus an already-flashed computed getter. It retains the former computed density/pressure/temperature bounds; PD validates computed T and DU computed P, rather than input echoes. Legacy modules retain their old safe scalar preflight. Selected simulator pressure/T domains, pure-R32 Qmass semantics and field-read ordering remain unchanged. Exact-input mathematical caches may retain previously computed values, but an uncached getter after failure must reflash.

Generated JS contains precisely the six guarded `hp_create/destroy/update/read/props/haprops` entry points and no embind/AbstractState markers. The facade does not expose the native module. Allocation and exception runtime exports remain necessary. State/module deletion is idempotent and disposal rejects subsequent use.

## Observed artifact and build provenance

The main source commit and SDK image digest are explicit. The digest matches the [official upstream Javascript workflow](https://github.com/CoolProp/CoolProp/blob/v8.0.0/.github/workflows/javascript_builder.yml); [CoolProp's upstream license](https://github.com/CoolProp/CoolProp/blob/v8.0.0/LICENSE) is MIT. Actual generated compiler/link commands use `-O3`, native exception catching enabled, `ASSERTIONS=1`, and no fast-math flag. No EOS coefficient edits or conservation/tolerance changes are part of this backend.

The earlier HEAD-only dirty-source concern is addressed by preparation's tracked-diff allowlist: only CMake and the replacement interface may differ, and both are deterministically rewritten from the pinned source/project wrapper. Dependencies resolved through CPM include mutable upstream tags; the recorded immutable commit/archive/tree manifest is checked after building, with tracked dependency cleanliness, **before copying the new JS/WASM pair**. Drift therefore rejects staging instead of silently accepting a different dependency. This is verified-input reproducibility, not a demonstrated byte-identical clean rebuild. Unexpected untracked source files are outside the recorded tracked-diff contract; avoid treating a reused development checkout as stronger evidence than the pinned recipe provides.

The inspected pair is `coolprop.js` SHA256 `6fa2e627803e2453da12cb9fce160ca3326851cd179444edc5ab698e21524d6c` (128107 bytes) and WASM SHA256 `7c6160bf570e2a33ca09e9e1de288266c09052b9e38c45885dd09848e9d3a89c` (9158849 bytes; gzip 4329711). The JS facade is SHA256 `06c177c9281052d81ec3a607059c02413c336837d9bd01e0f3f5b49298072e34`.

Initially all 26 recorded recipe/artifact/license hashes matched independent read-only hashing. A subsequent packaging-only split of the container recipe into `container-build.sh` temporarily made the recorded build.sh hash stale. The author refreshed provenance in commit `6bbf2c7`, including the new container recipe and runtime notices. Final independent read-only hashing confirms all 31 recorded recipe/artifact/license hashes match. The unchanged native pair retains its tested hashes; this equivalent shell-recipe split required no native rebuild. The packaging gate is closed.

CoolProp, linked/header dependency and SDK notices are shipped alongside the artifact. The new container recipe also copies available libc++, libc++abi, compiler-rt and musl notices. The pinned multicomplex checkout declares MIT in its README but lacks its referenced LICENSE; the exact README is retained and the upstream limitation documented. Retain notices and dependency/source provenance with distribution. This is a technical notice review, not a legal opinion on all downstream licensing obligations.

## Acceptance evidence and disposition

Read the raw Node/browser validation source and result records, Properties recovery test, root regression TAP and guarded browser pacing JSON. The author/root performed these runs; this reviewer did not repeat them:

| Evidence | Observed result |
|---|---|
| Guarded raw Node and isolated Chromium | 522 getter comparisons each, eight input pairs, wet/endpoints/single-phase, nine humid-air outputs; PASS |
| Existing reusable native state comparison | Maximum relative disagreement **0** |
| Scalar PropsSI comparison | Maximum relative disagreement 1.65e-9, from input pressure echo versus native computed pressure; existing distinction |
| Fault handling in each environment | 2000 bad updates/recovery, getter invalidation, wrong JS types/null strings, HA/scalar failure, deletion/disposal; PASS |
| Chromium uncaught exceptions | 0 in the raw probe |
| Root guarded Properties regressions | 7/7 PASS, including real same-input getter-fault recovery |
| Root Reference engine regressions | 25/25 PASS, 84.707 s |
| Root coil/nozzle regressions | 7/7 PASS, 7.692 s; original local/global balances and actual rollback retained |
| Real guarded Reference worker/browser pacing | 5/5 PASS; quarter-second steps, pause/backlog and room dynamics checks |

The browser pacing artifact records actual rates about 0.944× at requested 1×, 1.946× at 2×, 13.289× at active 50×, and 49.485× in an all-off scene at requested 50×. Thus the controls materially change physical progress, and active 50× remains CPU-limited in this measured workload. This is hardware/workload evidence, not a universal 50× guarantee. Raw property benchmarking alone is not a simulation-speed claim.

**The exact guarded backend can be promoted for the existing Reference engine separately from the experimental charge model.** No scientific/guard-contract blocker remains in the reviewed Reference scope. The parent owns the loader switch and final browser verification. Keep the prior backend available during scoped integration; malformed cases must never be run through its unsafe native state API.

The backend has not changed the scientific model or native numerical precision: do not rebase stored M/U, weaken residual caps, or infer the nozzle/frost problem is fixed from faster flashes. Experimental charge-core regressions, sustained useful owner operation and natural ice → accepted reversal → melt/drain → heating return remain separate gates. The previous conserved continuation ended at 48.5 s on the isentropic integral density work budget after genuine ice formation, without completing that sequence. Public charge availability remains false.

## Owner startup: conserved new-condition 2×2 proposal

Read `research/owner-startup-diagnosis.md`, its scalar EOS calculation and historical trace references. The diagnosis correctly separates saturated-vapor compressor pickup from wet homogeneous source inlet flow. The accumulator already has dry pickup; replacing it with another unlimited separator is not a supported remedy. Reducing initial EEV opening sharply reduces fresh valve feed while early accumulator filling remains close, supporting retained source inventory as an important modeled mechanism. These are historical trajectories, not current-integral/nozzle nominal validation. The uncompleted longer closed-start run must stay reported as unfinished.

At common pure-fluid saturation P/T, define vapor volume fraction α. Then `M=ΣV[(1−α)ρ_l+αρ_v]` and `U=ΣV[(1−α)ρ_l u_l+αρ_v u_v]`. Fixed total V and `ΣVα` therefore preserve global M/U and phase amounts. The proposed density/mass-quality conversion and `U=Mh−PV` are correct. A new initial condition making only the outdoor gas-end cell dry while compensating phase volume elsewhere is a legal saturation-equilibrium allocation if every resulting α lies in [0,1]. It is not a measured OEM stopped-system distribution.

Keep the accumulator and gas-line local stores exactly cloned in the dry-source pair; compute changed-cell states without reflashing/rebasing unchanged stores. Report native construction roundoff rather than repair an evolving accepted checkpoint. The documented approximately 2.44×10⁻¹⁵ kg/4.66×10⁻¹⁰ J aggregate differences are scalar author evidence, not a new transient test performed here. A new scenario's spatial redistribution of local M/U is categorically different from editing a running accepted state.

Conceptually accept the proposed 2×2 **new-condition research comparison**: uniform versus dry gas-end phase allocation, each with initial actuator fraction 0.65 or zero, otherwise identical geometry, charge, total M/U, metal/room/thermal/control state and constitutive laws. Keep the existing startup/preposition pulses; initial zero opening is not a persistent closed-start controller. Limit each to four quarter-steps/one simulated second and 60 wall seconds, save every accepted checkpoint, report unfinished cases, and compare an informative pair at eighth-second steps before a temporal conclusion. No run is executed or independently commissioned by this review.

Causal interpretation must remain limited: compensating phase allocation changes other coil/small-line inventories, so an outcome establishes sensitivity to this conserved spatial distribution rather than unique proof that the source outlet law is wrong. Rapid rewetting can also be a physical response to changed storage/pressure/heat flow; it warrants inspection rather than automatic closure replacement. No manifold identity, volume, charge, protection threshold, accepted-state remap or fabricated heat/oil return should change in this comparison. **Proposal accepted conceptually within its bounded research scope; nominal owner operation and public charge/frost release remain open.**
