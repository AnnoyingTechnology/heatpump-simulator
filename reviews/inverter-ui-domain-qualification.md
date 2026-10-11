# Frozen inverter UI-domain qualification, 2026-10-11

Observed: five bounded sustained native replays passed on the unchanged release engine and guarded HEOS backend. Inputs start from the actual browser worker's `diagnostic.initialConfig`, preserving the owner house, 95% cleanliness and 75% balanced ventilation recovery. Each scenario changes only its recorded weather, targets, mode or installed line lengths. This is a native replay of browser-equivalent inputs, separate from the browser's earlier 20-minute run.

| Scenario | Simulated seconds | Ordinary compressor stops | Completed defrosts | Final system W | Final rps |
| --- | ---: | ---: | ---: | ---: | ---: |
| Owner −4°C, ground 16°C | 1200 | 0 | 0 | 553.94 | 14.727 |
| 2°C / 100% RH, enabled rooms 26°C | 1800 | 0 | 4 | 1746.82 | 49.229 |
| Strong heat 300 s →42°C cooling 900 s | 1200 | 0 | 0 | 1887.55 | 48.946 |
| Actual owner physical lines, heating | 1200 | 0 | 0 | 426.36 | 10.951 |
| Exact unchanged owner 1°C default | 7200 | 0 | 0 | 488.22 | 13.619 |

The exact 1°C owner configuration ran continuously for 7200 seconds, including the natural ground-head join. It finished with upstairs 21.499533°C against 21.5°C and ground 17.001181°C against 17°C. Both enabled thermostat calls remained true; there was no ordinary stop, protection event or defrost. Final electrical input was 488.215795 W; the two-hour average was 467.377426 W. This shows the controller sustaining the real native load after room air approaches its targets; it is neither manufacturer calibration nor a claim that all fabric temperatures have reached equilibrium.

All 50,400 accepted physics intervals retained the original EOS pressure-closure tolerance, exact shared-header sum, compressor mass tolerance, discharge/ratio caps, energy/water accounting and all-calls-Off invariant. Maximum cumulative energy residual was 2.918e−6 J and water residual 2.11e−14 kg. No native fault occurred, so the worker's exact transaction-rollback assertion was armed but not exercised; separate controller/native regressions cover rejected-step rollback.

The humid 26°C stress case reached its natural ice threshold and completed four defrost cycles with useful heating return. Its unchanged dedicated 35 rps defrost policy reported 555 quarter-second thermal-boundary supervision intervals during reversing/defrost restart holds. It had zero ordinary stops; all resulting admitted cycles and water/heat ledgers remained valid. The other four sustained cases had no protection event. Reversal-induced administrative stops are legitimate and do not imply a thermostat stop; the compressor transition log records accepted physical intervals, while `updateConfig` itself does not advance time.

The separately pinned exact 25-case short smoke replay passed 25/25 after changing only initial/updated compressor minima to the declared UI policy. Those original cases contain idealized Reference lines, so that receipt provides additional idealized weather/reversal coverage. The sustained physical-heating replay used actual owner lengths 14/6.5/7.5 m, gas ID 7.92 mm and liquid ID 4.75 mm. Advanced physical cooling remains 18 rps because the reviewed unequal-branch 8 rps case is unsupported; no hidden higher-speed retry is introduced.

Replays: `inverter-ui-domain-replay.mjs`, `inverter-ui-domain-worker.mjs`, and `inverter-ui-minimum-smoke-replay.mjs`. Full results and every frozen source/build/vendor/input hash are in `inverter-ui-domain-robustness-results.json`; short results are in `inverter-ui-minimum-smoke-results.json`. The real browser-input receipt SHA256 is `02cb353216d7c92051b2361d7d5c9b79370eb5223e69255032862fb6ce11857e`. A copy and the replay source are retained in the immutable qualification snapshot `/tmp/heatpump-inverter-ui-domain-final4/snapshot`.

Historical Home Assistant references were read only at README scope. Their historical targets/modes/fans are purged and outdoor RH unknown; current presets, COP or delivered heat were not imputed. No raw household export was accessed or changed. House losses, gains and links were unchanged; electrical watts were never forced.

Receipt SHA256: `54747ef8d7e09a1de6dab9d27fc6cab07ea82a581d6c84a856c968d321b166be`
