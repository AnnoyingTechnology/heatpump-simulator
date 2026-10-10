# Safe exact-CoolProp browser build plan

Observed 2026-10-10. This is a research/build proposal only: no CoolProp source, product code, toolchain, or browser assets were changed. The goal is a safe, reusable HEOS property state without approximation tables, while retaining humid-air `HAPropsSI` capability.

## Findings in pinned v8.0.0

The official [CoolProp v8.0.0 JavaScript workflow](https://github.com/CoolProp/CoolProp/blob/v8.0.0/.github/workflows/javascript_builder.yml) pins the Emscripten container to `emscripten/emsdk@sha256:744fb6a68941970951bacf9d6632041a0398260492232691ef22bbf54b0585c6` (commented as SDK 4.0.12). It configures with the Emscripten CMake toolchain and `-DCOOLPROP_JAVASCRIPT_MODULE=ON`, then builds `install`. The [pinned CMake source](https://github.com/CoolProp/CoolProp/blob/v8.0.0/CMakeLists.txt) sets up `-lembind`, Release mode, `-sDISABLE_EXCEPTION_CATCHING=0`, `-sALLOW_MEMORY_GROWTH=1`, `-sEXPORT_ES6=1`, and `-sMODULARIZE=1`; it compiles `src/CoolPropLib.cpp` and `src/emscripten_interface.cxx`. The current wrapper directly binds `AbstractState::update` and output getters, so native exceptions are not translated into a structured success/error contract at that JS interface.

The C API already contains reusable-state functions. In pinned [`CoolPropLib.cpp`](https://github.com/CoolProp/CoolProp/blob/v8.0.0/src/CoolPropLib.cpp), `AbstractState_factory` returns a `long` handle and `AbstractState_free` releases it; each includes `catch (...)`, `errcode`, and a caller-provided message buffer. `AbstractState_update` similarly wraps one state update in `try/catch` and sets the error code/message. `AbstractState_keyed_output` wraps each output calculation and returns `_HUGE` on error. The [official API reference](https://coolprop.org/_static/doxygen/html/_cool_prop_lib_8cpp.html) specifies `errcode=0` as success and nonzero as error for these accessors. Thus an opaque HEOS state can be created once, then updated and queried across solver iterations without recreating the EOS object or calling the high-level scalar API repeatedly.

There is also `AbstractState_update_and_5_out`, which does one update and five keyed outputs for each point in input arrays. Its exception contract needs special care: in v8.0.0 the inner per-point catch deliberately suppresses an error and leaves that point's output slots unchanged; the outer `errcode` only reports failures outside those per-point catches. A one-point call can initialize outputs to NaN sentinels and detect unchanged outputs, but it cannot reliably provide the detailed per-property native error. The five-output function is useful for non-failing batches; it should not be mistaken for a detailed per-point safe wrapper. `AbstractState_update_and_common_out` has the same per-element behavior and returns molar T, p, density, enthalpy and entropy.

The humid-air distinction is material. Pinned `CoolPropLib.cpp`'s C `HAPropsSI` wrapper calls `HumidAir::HAPropsSI` without a local `try/catch`; `HAProps` is the neighboring wrapper that has a catch. The shipped [Emscripten binding](https://github.com/CoolProp/CoolProp/blob/v8.0.0/src/emscripten_interface.cxx) binds `HAPropsSI` directly. A safe custom artifact should wrap `HAPropsSI` on the C++ side too and return status/message/value rather than relying on a JavaScript `catch` around an uncaught C++ call.

## Recommended minimal interface

Add one small, version-controlled C++ binding/shim to the pinned v8.0.0 source, retaining HEOS as the thermophysical backend. The safest fast call is a reusable `AbstractState` plus one native wrapper operation that performs update and returns the exact output set used by a solver evaluation inside a single native `try/catch`. Return an explicit status, a numeric output record, and an error string; on failure, mark every output invalid and do not let an exception cross the JS/WASM boundary. Also provide create/destroy operations and a safe humid-air function.

Two equivalent implementation shapes are feasible:

1. Extend the Emscripten `AbstractState` binding with a wrapper method that takes the state by reference, performs `update`, obtains requested outputs, catches `std::exception` and `...`, and returns an explicit result object. Also bind a safe `HAPropsSI` wrapper. This reuses the factory already in the official ESM module and avoids exposing C API pointer plumbing to JavaScript.
2. Provide a narrow `extern "C"` shim with opaque state handles and exported `hp_state_create`, `hp_state_eval`, `hp_state_destroy`, and `hp_hapropssi` functions. Internally it can own `CoolProp::AbstractState::factory("HEOS", fluid)` in a small C++ handle object. `hp_state_eval` must wrap the update plus all output reads in a single catch boundary. This keeps a conventional, testable C ABI and gives the JS layer stable integer/pointer and buffer inputs.

Do not expose arbitrary backend strings or broad CoolProp accessors to the UI. Limit the wrapper to the required HEOS fluid/state calls and humid-air properties. Keep the source license and notices with the shipped artifacts. CoolProp v8.0.0 is [MIT licensed](https://github.com/CoolProp/CoolProp/blob/v8.0.0/LICENSE); retain its license text. Record the pinned Emscripten SDK/image identity and its license notices in the build provenance as well.

## Build route and reproducible inputs

Available locally on 2026-10-10: `cmake`, `ninja`, and the Docker CLI. Neither `emcc` nor `emcmake` was found; `docker image ls` showed no Emscripten SDK image. No build was run, and no image or SDK was downloaded. The Docker CLI can run the exact immutable container named by CoolProp's CI without activating or editing any global SDK configuration. Use a project-local, pinned CoolProp v8.0.0 source checkout (or submodule/worktree at release commit `ae81610`) and mount only the project tree into the container. Write intermediate files under an ignored project-local build directory and stage the final ESM JS/WASM plus notices under `public/vendor/coolprop/` only after tests pass.

The official upstream configure/build shape is:

```sh
cmake -B build/coolprop-wasm -S vendor/coolprop-src \
  -DCMAKE_TOOLCHAIN_FILE=/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake \
  -DCOOLPROP_JAVASCRIPT_MODULE=ON -DCMAKE_BUILD_TYPE=Release \
  -DCOOLPROP_INSTALL_PREFIX="$PWD/build/coolprop-wasm/install_root"
cmake --build build/coolprop-wasm --target install -j
```

Run those commands inside `emscripten/emsdk@sha256:744fb6a68941970951bacf9d6632041a0398260492232691ef22bbf54b0585c6`, following the pinned [upstream workflow](https://github.com/CoolProp/CoolProp/blob/v8.0.0/.github/workflows/javascript_builder.yml). For a local container run, bind-mount the project checkout and use a project-local output path; do not install the SDK on the host or activate a global environment. The image is not currently cached, so executing this route would need the explicit container image pull and source checkout; neither happened in this research task.

For a custom single-file C ABI shim, expose only its entry points through Emscripten `EXPORTED_FUNCTIONS` (or mark them `EMSCRIPTEN_KEEPALIVE`). If JavaScript calls native functions directly, the wasm module also needs only the memory helpers and string conversion/call helpers actually used (`_malloc`/`_free`, `UTF8ToString`/`stringToUTF8`, and `ccall` if chosen). Prefer a tiny JS facade over exporting the full C API or all of embind. The official [Emscripten modularized-output guide](https://emscripten.org/docs/compiling/Modularized-Output.html) documents `MODULARIZE` and ES-module output; the [settings reference](https://emscripten.org/docs/tools_reference/settings_reference.html) documents explicit `EXPORTED_FUNCTIONS` exports. The v8 CoolProp target already emits a modularized ESM factory and companion WASM; preserve the matching loader/binary pair.

Use normal `Release` optimization, Emscripten's default IEEE floating-point behavior, and exception catching required by the native wrapper. Do not pass `-ffast-math`, `-Ofast`, or reassociation/finite-only options. Keep exception support enabled for all translation units containing the catches and at link time; v8's CMake uses `-sDISABLE_EXCEPTION_CATCHING=0`, which is the compatibility setting used by the pinned build. The current Emscripten docs note that exceptions are disabled by default in optimized builds and that catch support must be enabled; see [C++ exception support](https://emscripten.org/docs/porting/exceptions.html) and [optimization notes](https://emscripten.org/docs/optimizing/Optimizing-Code.html). `ASSERTIONS=1` is useful in a debug test build but should be evaluated separately from the production Release artifact size and speed.

The exact pinned 8.0.0 vendor files currently in the project are 167,060 bytes of JavaScript and 9,196,512 bytes of WASM (per [existing artifact provenance](coolprop-browser-feasibility.md)). Those figures are the unmodified release baseline, not a size estimate for a trimmed shim. No custom bundle size has been measured; record JS, WASM, compressed transfer sizes, and cold initialization time after the build. Include the CoolProp MIT license and build-provenance text alongside the shipped pair. No extra fluid-data files are expected for the normal embedded HEOS build; verify the install output rather than assuming this for a modified build.

## Narrow acceptance check before integration

- Build from the recorded CoolProp tag/commit and SDK image digest into an isolated local output directory.
- Confirm output imports as a browser ESM module and its WASM loads from the colocated artifact; record the produced pair's SHA-256 hashes and sizes.
- Verify the exported boundary is limited to create, evaluate, destroy, and humid-air calls, with no C++ exception crossing into JS.
- With one reusable R32 HEOS state, compare valid PT and PH outputs against the existing pinned 8.0.0 module. Inject an invalid state; confirm the wrapper returns a structured error, then query a valid state on the same instance and confirm it still works.
- Exercise `HAPropsSI` success and invalid-input paths through the safe wrapper; retain property/round-trip tolerances from the current CoolProp feasibility report.
- Run the existing 25/25 reference/regression checks unchanged before comparing the current solver pacing. Measure warmed 50-active and idle cost, and compare speed, cold startup, and output errors with the baseline. Do not claim performance gains from one-shot microbenchmarks alone.

## Boundaries and unknowns

This task did not fetch the SDK image or CoolProp source, compile a custom binary, measure output size, or verify a wrapper implementation. The exact wrapper API and output record should follow the engine's actual required output set. A C ABI handle model may simplify JS integration, while an embind wrapper may be smaller to maintain; both need a native catch at the call boundary. This proposal preserves exact HEOS EOS behavior but does not claim that EOS runtime alone explains all remaining solver CPU cost.
