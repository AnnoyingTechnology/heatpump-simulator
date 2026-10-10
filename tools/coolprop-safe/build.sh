#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$project_root"
image='emscripten/emsdk@sha256:744fb6a68941970951bacf9d6632041a0398260492232691ef22bbf54b0585c6'
commit='ae81610e7d23efc57f9d051c8e70a4d66e87537f'
source_dir='tools/coolprop-safe/work/source'
if [[ ! -d "$source_dir/.git" ]]; then
  git clone --depth 1 --branch v8.0.0 --recurse-submodules --shallow-submodules https://github.com/CoolProp/CoolProp.git "$source_dir"
fi
[[ $(git -C "$source_dir" rev-parse HEAD) == "$commit" ]] || { echo 'Unexpected CoolProp source commit' >&2; exit 1; }
docker pull "$image"
python3 tools/coolprop-safe/prepare.py
# Only this project is mounted; no host SDK activation, Docker socket or secrets.
docker run --rm --cpus=3 --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$project_root,dst=/project" --workdir /project "$image" \
  bash tools/coolprop-safe/container-build.sh
python3 tools/coolprop-safe/notices.py
cp "$source_dir/LICENSE" public/vendor/coolprop-safe/LICENSE-CoolProp
cp tools/coolprop-safe/work/build/coolprop.{js,wasm} public/vendor/coolprop-safe/
chmod 644 public/vendor/coolprop-safe/coolprop.{js,wasm}
node tools/coolprop-safe/provenance.mjs
