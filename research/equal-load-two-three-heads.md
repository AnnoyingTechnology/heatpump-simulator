# Two versus three active indoor units at equal heating output

Measured in the current engine on 2026-10-11; source commit `8c4d17356e2c8fe7735d229152011f656131f686`. This is a controlled model experiment, not measured Daikin performance or a universal claim about adding a head.

The experiment uses the production guarded R32 HEOS backend, the current Reference refrigerant cycle and current air-side exchange equations. Three identical generic indoor units are connected; either two or three are active. All active units receive 21°C air at 45% RH, with full fan speed, 95% cleanliness, generic refrigerant conductance of 350 W/K, air conductance of 170 W/K and nominal dry-air flow of 0.15 kg/s. The same outdoor unit receives 1°C air. Outdoor RH is deliberately 2%, isolating steady exchanger performance without frost; the script checks that actual deposition is zero. No fluid property, efficiency or conductance is fitted to obtain a favourable result.

The input is total useful heat delivered to room air, including indoor fan heat. Air-side balances determine indoor metal temperature. Outdoor metal temperature and compressor speed are solved together until the specified heat delivery and zero outdoor-metal energy accumulation both close. Refrigerant pressures and coil outlets are solved by the existing `solveCycle`, rather than imposed. The electricity denominator includes compressor input, all active indoor fans, outdoor fan and controls. Each indoor fan consumes 25 W at full speed; outdoor fan consumes 85 W and controls 15 W. Inactive coil/room transients are outside this steady prescribed-boundary experiment.

| Equal delivered heat | Two units input / COP | Three units input / COP | COP increase | Electricity saving |
| --- | --- | --- | --- | --- |
| 1.5 kW | 431.1 W / 3.480 | 426.0 W / 3.521 | 1.18% | 1.17% |
| 3.0 kW | 907.9 W / 3.304 | 825.4 W / 3.634 | 10.00% | 9.09% |
| 4.5 kW | 1572.9 W / 2.861 | 1366.8 W / 3.292 | 15.08% | 13.11% |

At 3 kW, condensing temperature falls from 39.48°C to 33.29°C. Compressor electricity falls by approximately 107.5 W, outweighing the additional 25 W indoor fan. This advantage emerges from the existing finite-conductance and refrigerant equations; there is no head-count COP multiplier.

All six operating points pass heat/metal equilibrium residuals below 0.03 W, production cycle closure, compressor-speed bounds and refrigerant energy balance. Tightening cycle pressure residual tolerance from 0.01 W to 0.001 W reproduces each electrical input within 0.005 W and COP within 0.00002. Machine-readable results retain both solves and compiled-engine hashes in `reviews/equal-load-two-three-heads-results.json`.

The result establishes that the current model can produce the expected exchanger-area benefit under controlled conditions, including extra fan electricity. It does not establish that three heads always improve COP, nor quantify the benefit for the owner's installation. The test excludes automatic fan/thermostat behaviour, minimum-load cycling, startup, frosting/defrost, pipe transport, charge effects, room-to-room transfer and OEM performance maps. Actual room inlet temperatures and demand distribution can differ substantially from these equal-temperature boundaries. A separate dynamic same-house comparison is needed for that question.

Reproduce from the project root, using a new isolated directory for compiled engine files:

```sh
npx tsc -p tests/engine/tsconfig.json --outDir /tmp/heatpump-equal-load-check/build
HEATPUMP_SOURCE_COMMIT=8c4d17356e2c8fe7735d229152011f656131f686 node tools/check-equal-load-heads.mjs /tmp/heatpump-equal-load-check/build /tmp/heatpump-equal-load-check/results.json
```

Set `HEATPUMP_SOURCE_COMMIT` to the actual compiled checkout when repeating after changes. The tool reports computed comparisons without requiring a positive COP change.
