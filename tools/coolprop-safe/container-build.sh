#!/usr/bin/env bash
set -euo pipefail
export EMCC_CORES=3
export EM_CACHE=/project/tools/coolprop-safe/work/em-cache
emcc --version > tools/coolprop-safe/work/toolchain.txt
notices=public/vendor/coolprop-safe/licenses
mkdir -p "$notices"
cp /emsdk/upstream/emscripten/LICENSE "$notices/Emscripten-LICENSE"
for component in libcxx libcxxabi compiler-rt; do
  notice="/emsdk/upstream/emscripten/system/lib/$component/LICENSE.TXT"
  if [[ -f "$notice" ]]; then cp "$notice" "$notices/$component-LICENSE.TXT"; fi
done
notice=/emsdk/upstream/emscripten/system/lib/libc/musl/COPYRIGHT
if [[ -f "$notice" ]]; then cp "$notice" "$notices/musl-COPYRIGHT"; fi
cmake -S tools/coolprop-safe/work/source -B tools/coolprop-safe/work/build \
  -DCMAKE_TOOLCHAIN_FILE=/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake \
  -DCOOLPROP_JAVASCRIPT_MODULE=ON -DCMAKE_BUILD_TYPE=Release \
  -DCOOLPROP_INSTALL_PREFIX=/project/tools/coolprop-safe/work/install
cmake --build tools/coolprop-safe/work/build --target coolprop -j3
