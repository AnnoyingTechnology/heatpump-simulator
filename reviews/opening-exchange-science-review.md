# Orientation-dependent opening exchange: independent science review

Reviewed 2026-10-11. **Accept frozen Candidate A and its frontend mapping in the declared sensible-equivalent scope. No unresolved scientific source blocker remains. Updated whole-engine regression, robustness/endurance and publication remain root-owned release gates.** This is not owner-house/OEM calibration, actual airflow or moisture transport, a pressure-network solution or resolved stairwell stratification.

Reviewer read the final research note, engine/controller integration, optional geometry validation, tests and frontend mapping/settings; independently matched fingerprints and ran reviewer-only native checks against immutable `/tmp/heatpump-opening-science-snapshot-9ggrrx_t`. No production, test, build, dist or git changes were made by the reviewer.

## Physical interpretation and dimensions

The literature's horizontal opening is an aperture in a floor/ceiling, corresponding to the UI's vertical connection between floors. Cooper describes why dense gas over lighter gas can produce opposed streams across such an opening, even when a one-direction vent model misses them. [NIST original report abstract](https://www.nist.gov/publications/calculation-flow-through-horizontal-ceilingfloor-vent)

EnergyPlus's zero-imposed-pressure branch uses coefficient0.055, hydraulic diameter and density contrast; it gives equal rates in each direction only for unstable density ordering. Its full formulation also includes forced pressure, suppression/purge and stair geometry. Candidate A retains the square-aperture, temperature-only reduction of that branch, not the full AirflowNetwork. [EnergyPlus horizontal-opening equations13.38–13.51](https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/13.1-airflownetwork-model.html)

For a square aperture, `DH=sqrt(A)` and the implemented `q=0.055*A^(5/4)*sqrt(g*max(Tlower−Tupper,0)/TmeanK)` has units m³/s. It is the equivalent **one-way** counterflow rate. A common reference density1.2 kg/m³ and cp1006 J/(kg K) give `Hbuoy=rho*cp*q` in W/K. Net sensible transfer is `Hbuoy*(TA−TB)` once: equal counterstreams carry opposite enthalpy inputs, whose difference already gives this net transfer. An extra factor two would double count it.

A wall aperture instead uses the independently derived half-height orifice integral. With a centered neutral plane, constant width and Boussinesq density contrast, integrating `Cd*w*sqrt(2*g*|ΔT|*z/TmeanK)` over `0…height/2` gives `q=(Cd/3)*A*sqrt(g*height*|ΔT|/TmeanK)`. Wall Cd and floor0.055 describe different geometries and are not interchangeable. The physical aperture height is required; the editable2 m wall default is explicitly assumed, not silently taken from ceiling height.

Fixed reference density/cp and temperature-only stability are declared approximations. Strong humidity differences can change actual density ordering. The model excludes pressure-driven circulation, plumes, stratification, stair angle/obstruction, passage thickness, aspect ratio and inter-room dry-air/water transport. In particular, zero stable buoyancy/background does not establish that a real stairwell has zero disturbance or pressure-driven mixing. No universal coefficient accuracy or owner power prediction follows.

## Conservation and frontend/controller mapping

The insulated solid path remains bidirectional: `Hsolid=45/(0.26+0.120/0.040)=13.80368098 W/K`. Background mixing is a separate nonnegative sensible path. The floor instability gate applies only to buoyancy, not solid/background conduction. A/B renaming preserves the physical lower-room ID and only reverses the reported sign. Thermal reversal can change stability at fixed elevation; this is not a heat diode.

Each edge is evaluated from one common pre-step state and contributes identical opposite powers to its endpoints. Off heads remain room thermal nodes. Internal exchange changes neither the whole-house external boundary nor service-heat/COP ledgers. It transports no water between rooms; local RH, vapor and retained condensate/ice can nevertheless change through temperature-dependent room phase equilibrium. Native total H/W storage remains authoritative.

Controller feedforward reevaluates the same nonlinear law with only the assessed enabled room's target substituted. Neighbours retain actual temperatures and fixed elevation identity. Disabled targets are unused; no old-temperature H is frozen for the target estimate. The source also validates optional geometry before accepting edits and retains whole-step rollback.

Frontend defaults pass solid H plus optional opening geometry, without adding the former4×40=160 W/K opening path again. Ground is explicitly below first floor, which is explicitly below attic. Both links have4 m² opening,45 m² solid contact,120 mm wool, floor coefficient0.055 and background0. Closing the frontend aperture also disables its background path while retaining the stored background input for reopening; the lower-level engine schema permits an independently prescribed background at zero area. A whole-link H override explicitly selects legacy constant-H mode.

The final frontend also uses persisted lower identity for floor/ceiling envelope-area deductions. Reordering room rows preserves per-ID envelope H and opening gravity; same-level/legacy inference retains its earlier behavior. Internal transfer is excluded from the house external-loss ruler. Live H/heat/stability labels come from accepted engine diagnostics, and help explicitly says temperature-only sensible equivalence, not simulated air/humidity transport.

## Numerical and independent evidence

When opening links exist, all rooms share a step bound `dt<=0.25*Cbound/incidentH`, including simultaneous legacy links. With `Cbound=dryAirMass*1000`, this gives a conservative convex relaxation for isolated sensible link mixing when actual incremental capacity exceeds that estimate. Evaluating secant H at the common old state is appropriate to that explicit update; a nonlinear local derivative is not needed to establish its nonnegative weights. Actual storage still uses native enthalpy and equilibrium phases. No aperture, heat or property state is clipped. Numerically unsupported substeps fault explicitly and roll back. Legacy-only timestep/output remain unchanged.

This is an opening-mixing guard, not a global stability/accuracy proof for simultaneous coil, fabric, ventilation and external gains. Reviewer45 native Cp samples over−25…80°C,70–110 kPa and RH0/0.5/1 found minimum1004.74544 J/(kg dry air K), supporting the chosen1000 estimate in those samples. They do not prove an arbitrary-state bound. Large time acceleration still requires physical substeps.

`opening-exchange-independent-check.mjs` and its JSON receipt record reviewer execution on final source/native artifacts:

- Scalar owner-temperature case16/21.5/18.5°C gives L1→L0 **75.92025 W**, all solid, and L1→L2 **398.42759 W**, including357.01654 W buoyancy; one-way equivalent exchange0.09857978 m³/s. These are frozen-state model estimates, not measured flows or equilibrium house loads.
- Independent numerical wall half-aperture integration matches the implemented law within1.54×10⁻⁸ relative difference for two geometries and opposite temperature signs.
- Actual paired powers sum to zero. Own-target23°C feedforward loss is813.78620 W with actual16/18.5°C Off neighbours, independent of their deliberately invalid unused targets.
- Saturated-room sensible cooling retains0.00017607444 kg of local liquid, conserves each room's total water and global enthalpy exactly in the checked interval, and earns no HVAC/COP credit.
- A three-room small-volume nonlinear network accepts18 common substeps totalling0.4 s; first step0.01050871 s. Temperatures remain inside the original5…35°C range and converge to15.9490/15.4510/15.3798°C. Maximum energy residual2.98×10⁻⁸ J, water residual0.

These checks use the same native EOS as the engine and are consistency evidence, not experimental validation. Implementer reports41/41 guarded focused/adjacent tests, including13 new opening tests, passing. The legacy parity receipt reports162 exact whole-output comparisons in both modes against baseline008f5d8; this attributed parity evidence is separate from the reviewer's checks. Root's final source-pinned browser receipt reports5/5 actual worker/editor checks, including owner asymmetry, wall height, closed aperture, persistent lower identity, per-ID H retention and explicit legacy override. Broader post-change release gates remain independent.

## Checked final fingerprints

The independent JSON pins unchanged cycle, envelope, drive, air, properties and exact guarded native artifacts as well as the files below. Engine hashes are independently matched to the immutable snapshot; frontend/note hashes match current files and root's final browser receipt where applicable.

| File | SHA256 |
|---|---|
| `src/engine/interzone.ts` | `20671a676f3174e1757f4368ef0b4f1046a07b4b35d8e5377aaf689c8a43ee2b` |
| `src/engine/engine.ts` | `92174a5beb3fbbefd9c9bfba64a3f0155261a11782c9420f4bdfe3d6ae887903` |
| `src/engine/types.ts` | `2ed28a4c5e7fbe4e698752f717b2289e250aae0cda29649aa96bd9189b8ee400` |
| `src/types.ts` | `678598880494a05fcfe48d135a5507633a8658eb84b3cb29870065a279461e9b` |
| `src/state.ts` | `66f03aba92d30dcabba20870f9a62b818a24d4122ef4fb78e0391d545679565b` |
| `src/runtime/config.ts` | `b5b16659135246f17688d3d3d20d59ce9ef79ea3a370d259acd02d46e99fa748` |
| `src/settings.ts` | `370d284bda37bae6be339162ffceb76a1c943f7d83d68d9e4a4e405dab20c102` |
| `src/scene.ts` | `16cb5eb6560f190f040aec0b1b43745fa5544a050839cb1ce6473064b576aad7` |
| `tests/engine/opening-exchange.test.mjs` | `9c1901922a9c1fcfe9aa8785a379990252aaec13d820f80843a2e517c6703376` |
| `research/vertical-room-opening-model.md` | `55bd20d46b57ced6d4e164a57052c339c9d620dfb3009ee2221fa697394644a9` |

No scoped scientific source blocker remains. The temperature-only zero-pressure approximation, assumed geometry/coefficient/reference air constants and sensible-only transport scope must stay explicit. Owner steady room temperatures, electrical input and manufacturer performance remain uncalibrated; earlier controller/robustness passes do not substitute for the new complete release gates.
