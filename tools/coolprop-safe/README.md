# Guarded exact HEOS backend

This artifact is selected by the production Reference worker after property,
engine, browser and independent-review acceptance. It implements the pinned CoolProp HEOS properties and humid air without approximation tables,
fast-math, changes to EOS coefficients, or charge acceptance changes. The owner
startup phase sensitivity proposal remains unexecuted; full frost melt/reversal
and useful heating acceptance remain open.

## Native boundary and integration contract

`public/vendor/coolprop-safe/adapter.js` exports an asynchronous module factory
compatible with the engine's selected-fluid `factory('HEOS',fluid)`, `input_pairs`, `PropsSI`
and `HAPropsSI` calls. `guardedStateApi === true` identifies this contract. Its
state supports `update`, `T`, `p`, `hmass`, `smass`, `rhomass`, `Q`, `cpmass`,
`viscosity`, `speed_sound`, explicit `Qmass` and idempotent `delete`. Module `dispose` destroys
remaining states and releases its error buffer; subsequent operations reject.

The only property entry points exported from WASM are guarded C ABI operations:
`hp_create`, `hp_destroy`, `hp_update`, `hp_read`, `hp_props`, `hp_haprops`.
Standard Emscripten allocation/exception/runtime exports remain necessary.
No unsafe embind state or native humid-air getter is exposed. All EOS operations
are inside native `std::exception` and catch-all handlers, translated into ordinary
JavaScript errors. Update checks finite positive computed T/p/density. Caller
selected physical envelopes remain the property service's responsibility.

Failed updates **and getters** invalidate native readouts and discard the affected
EOS instance. The same handle recovers through a later valid update with its original
fluid and mass composition. JavaScript
wrong numeric types force native invalidation before throwing, including Symbol
and BigInt; string arguments are checked before `ccall`, with native null guards
as well. Properties integration must clear its remembered `lastInput` on every
failed operation so a subsequent same-input request reflashes. It may skip the
legacy scalar preflight only for this explicit guarded contract. Scalar calls
remain available, guarded, for outputs/input pairs outside the reusable interface.

## Reproduction

From the project root:

```sh
bash tools/coolprop-safe/build.sh
node tools/coolprop-safe/check.mjs
python3 -m http.server 5181 --bind 127.0.0.1
# In another terminal, with the existing project QA Chromium on port 9223:
node tools/coolprop-safe/check-browser.mjs
```

The recipe uses the [official pinned v8 Javascript target](https://github.com/CoolProp/CoolProp/blob/v8.0.0/.github/workflows/javascript_builder.yml),
release commit `ae81610e7d23efc57f9d051c8e70a4d66e87537f`, and immutable SDK image
`emscripten/emsdk@sha256:744fb6a68941970951bacf9d6632041a0398260492232691ef22bbf54b0585c6`.
It mounts only this project, uses three CPU workers/quota, and keeps source,
downloads, SDK cache and build products in ignored `work/`. No host SDK activation
or global configuration is needed. The controlled changes replace the upstream
Javascript interface and its link exports; all other tracked source edits reject.
Resolved dependency commits/archive hashes are locked and verified, with extracted
archive tree hashes and tracked dependency cleanliness checks.

Artifact provenance records actual compiler version, compiler/link commands,
input hashes, artifact hashes, and raw/gzip/Brotli sizes. Release uses `-O3`,
IEEE defaults, exception catches enabled and `ASSERTIONS=1`. Keep the generated
JS/WASM pair together. The recipe stages a newly built pair; raw probes must pass
before integration. CoolProp/dependency/SDK notices are retained beside it.
The pinned multicomplex README declares MIT but references a top-level LICENSE
absent from that checkout; its exact README declaration is retained, without
inventing a missing notice. This upstream notice limitation should remain visible
when considering distribution.

## Observed raw acceptance (2026-10-10)

Both Node and isolated Chromium probes passed 522 property comparisons spanning
PT, PH, PS, PQ, QT, PD, DU and DT, plus nine humid-air comparisons. All compared
guarded getter outputs exactly matched the existing reusable native state in
these probes (`maxLegacyStateRelative = 0`). Against scalar `PropsSI`, maximum
relative difference was 1.65e-9: its input pressure echo 700000 Pa differs from
the native computed pressure 699999.9988476102 Pa. This is an existing native
state/scalar distinction, not a new EOS approximation.

Each environment passed 2,000 bad updates with rejected stale getters and valid
recovery, two-phase speed-of-sound getter failure followed by rejection of every
getter and valid recovery, invalid pairs, NaN/Infinity, nonnumeric arguments,
deletion/disposal, invalid scalar calls and humid-air errors. Chromium reported
zero uncaught exceptions. Complete numerical records and timing batches are in
`node-results.json` and `browser-results.json`.

For five warmed batches of 200 distinct PH updates with four outputs, final
Chromium medians were 53.8 ms for four scalar calls, 14.5 ms for the legacy
preflight plus reusable state, and 1.2 ms for guarded state (~12× faster than
the preflight path). Cold guarded module initialization was 90 ms in that run.
These are raw property timings, not a claim of 50× simulation pacing. Independent
Properties/Reference regressions, same-browser active/idle pacing and scientific
review are separate integration gates owned by the root agent. They passed:
seven property-service checks, 25 Reference regressions, seven focused coil/nozzle
checks and five real-worker browser checks. Active owner-preset heating achieved
approximately 13× when requesting 50×, with unchanged quarter-second steps;
idle reached approximately 49×. See `reviews/guarded-backend-science-review.md`
and `reviews/guarded-simulation-speed-browser-results.json`.

Generated provenance is a build receipt. Its candidate status records the build
stage; integration and model-release acceptance are recorded here and in
`PROGRESS.md`. Rebuilding an artifact requires repeating its acceptance checks.

## Additional refrigerants

The strict native whitelist now includes R22, R32, propane, R134a, R1234yf, the
documented R410A pseudo-pure identifier and explicit fixed-composition R407C/R410A
mixture identifiers. Backend availability is separate from coupled release. The
registry in `src/engine/refrigerants.ts` gates circuits;
[qualification and limitations](../../research/refrigerant-qualification-2026.md)
distinguish pure, pseudo-pure and equilibrium-mixture paths.

After compiling the engine test modules, the existing QA browser can reproduce
`tools/check-refrigerants-browser.mjs` against a static server on port 5188.
