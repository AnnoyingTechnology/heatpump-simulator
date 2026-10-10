# CoolProp browser feasibility

Observed on 2026-10-10 on Juniperus. This is a bounded property-backend probe, not validation of a coupled heat-pump solver or manufacturer performance.

## Artifact provenance

The official [JavaScript wrapper documentation](https://coolprop.org/coolprop/wrappers/Javascript/index.html) describes asynchronous local JS/WASM use. The probe uses the official [8.0.0 release directory](https://sourceforge.net/projects/coolprop/files/CoolProp/8.0.0/Javascript/), downloaded directly from these release URLs:

- `https://downloads.sourceforge.net/project/coolprop/CoolProp/8.0.0/Javascript/coolprop.js`
- `https://downloads.sourceforge.net/project/coolprop/CoolProp/8.0.0/Javascript/coolprop.wasm`

| File | Bytes | SHA-256 |
|---|---:|---|
| coolprop.js | 167060 | `ebd02f5721abc10fee3e6560b0d96c1a17b8ae1f01bc144a4f9a1af8cf1e3217` |
| coolprop.wasm | 9196512 | `28a83d839ab69c7e6ea480298955ce223b6507dc6ffb83349dd31f1540867307` |

The WASM magic and ESM export were checked. Both runtimes report backend version 8.0.0. CoolProp uses the [MIT license](https://github.com/CoolProp/CoolProp/blob/master/LICENSE); retain its license notice if distributing its assets. The downloaded probe artifacts are intentionally ignored by Git. No native/Emscripten toolchain was installed, and the mockup does not load this backend.

An official main-branch Actions artifact was downloaded during discovery but was **not used** for the reported results. The measured release is the SourceForge pair above.

## Method

[Probe implementation](coolprop-probe/probe-common.mjs), [Node runner](coolprop-probe/run-node.mjs), [browser page](coolprop-probe/browser-probe.html), and [isolated browser runner](../tools/check-coolprop-browser.mjs).

- Synthetic heating cycle: evaporation −5°C, condensation 40°C, superheat 5 K, subcooling 3 K, compressor isentropic efficiency 0.70.
- Additional R32 sample cycles: cooling at 7/45°C and defrost at 0/15°C, with the same superheat/subcooling/efficiency. These are refrigerant-state examples, with no claimed equipment/environment calibration or transient heat-transfer closure.
- For each of seven named pure/pseudo-pure fluids, evaluate cycle states and 60 varied four-call batches: H(P,T), T(P,H), S(P,T), H(P,S).
- Check the corresponding temperature round-trip, cycle energy identity, dew/bubble/mid-quality temperature, and finite results.
- Separately probe explicit mole-fraction R410A/R407C mixtures for dew pressure, bubble pressure, interior quality, and full cycle PT/PS/PH coverage. Probe inputs are mole fractions, not mass fractions.
- Browser: local isolated headless Chromium 154, CPU rendering, 1600×1000 viewport, locally served JS/WASM; no remote runtime requests. Node: installed Node 24.21.0. These are dated observations, not durable minimum versions.

## Observed results

Raw [browser results](coolprop-probe/browser-results.json) and [Node results](coolprop-probe/node-results.json) contain unrounded values and the sample cycle states.

| Property route | Browser median, four-call batch | Browser p95, four-call batch |
|---|---:|---:|
| R32 | 0.4 ms | 0.7 ms |
| R22 | 0.4 ms | 0.5 ms |
| R134a | 0.4 ms | 0.7 ms |
| R290 / n-Propane | 0.4 ms | 0.5 ms |
| R1234yf | 0.5 ms | 0.5 ms |
| R410A pseudo-pure | 0.4 ms | 0.5 ms |
| R407C pseudo-pure | 0.3 ms | 0.4 ms |

The final recorded run (including guarded mass-quality outputs) initialized in 90.2 ms in the browser and 46.5 ms in Node. An earlier run initialized in 126.6 ms; timings are workload/machine/run dependent. All named-fluid cycles and both explicit-mixture coverage sets returned finite results. The largest observed PT↔PH temperature round-trip residual was 1.36×10⁻⁷ K. No browser JavaScript exceptions were recorded. Entire browser probe took 5.40 s, including mixture flashes; the tab remained on a research page, separate from the UI mockup.

## Implications and limits

Direct JS/WASM is a credible first backend for a worker-based solver. This evidence does not justify adding pre-generated interpolation tables before measuring the actual coupled solver. Explicit mixture calls need their own timing and domain tests: this probe shows coverage at selected points, not a cheap universal blend calculation or guaranteed success across a heat-pump envelope.

The round-trip test checks internal numerical consistency; it is not independent metrological validation. The selected sample points do not test fluid validity bounds, critical-region robustness, transport correlations, heat-exchanger closure, real control maps, frost dynamics or accuracy against manufacturer test points. Those gates remain in the scientific validation plan. Preserving accurate phase/glide handling is more important than enabling all selectable fluids immediately.

The independent reviewer verified an important backend convention: `Q` is molar quality, while `Qmass` supplies mass quality in two-phase states. For an explicit R407C mixture at 800 kPa and input Q=0.5, Qmass is approximately 0.481705. They coincide for pure R32. Reports annotate that convention and include mass-quality output. In single-phase states raw Q returns a −1 sentinel, while Qmass may return an invalid result; the probe only requests Qmass after confirming 0≤Q≤1 and otherwise records null. Neither sentinel is a physical negative mass fraction. The release also exports working `HAPropsSI` (20°C/50% RH at 101325 Pa returns humidity ratio 0.0072936977); string `PhaseSI` is absent, while numeric `PropsSI('Phase',...)` is available. The implementation must use observed exports rather than assume every native API is wrapped.

## Reproduce

Download the two release files into `research/coolprop-probe/release/`, verify hashes, then run `node research/coolprop-probe/run-node.mjs`. Serve the probe directory locally (Python's standard HTTP server supplies `application/wasm`), and open `browser-probe.html` in a current browser. The automated runner expects the project's isolated Chromium on loopback port 9223 and the probe HTTP server on loopback port 5174. The final product need not use those QA ports or headless mode.
