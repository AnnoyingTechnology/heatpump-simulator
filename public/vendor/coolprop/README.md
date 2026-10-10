# CoolProp browser backend

Observed and vendored on 2026-10-10 from the official CoolProp 8.0.0 JavaScript release:
https://sourceforge.net/projects/coolprop/files/CoolProp/8.0.0/JavaScript/

The unmodified ES module and WebAssembly binary are served locally. Runtime calculations need no remote service. The MIT license is included; the authoritative version is https://github.com/CoolProp/CoolProp/blob/v8.0.0/LICENSE.

SHA-256:

- `coolprop.js`: `ebd02f5721abc10fee3e6560b0d96c1a17b8ae1f01bc144a4f9a1af8cf1e3217`
- `coolprop.wasm`: `28a83d839ab69c7e6ea480298955ce223b6507dc6ffb83349dd31f1540867307`

Using this backend does not validate the coupled heat-pump model or calibrate manufacturer performance. See `research/coolprop-browser-feasibility.md` and the independent science reviews.
