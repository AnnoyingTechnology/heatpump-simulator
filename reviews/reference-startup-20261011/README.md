# Reference startup evidence

The production change is one idealized-only `startupFromRest` flag using the existing accepted drive API. The permanent gate is `tests/engine/reference-startup.test.mjs`: all six released fluids start heating/cooling through actual conserved low-speed cycles, plus real R32 warm restart/Off/dwell, natural defrost return, and legacy fixed speed. `inverter-demand.test.mjs` retains its longer owner-continuity check and now expects actual startup slew.

Run from the repository after compiling the engine with the reviewed Reference flag:

```sh
./node_modules/.bin/tsc -p tests/engine/tsconfig.json
HEATPUMP_TEST_BACKEND=guarded node --test tests/engine/reference-startup.test.mjs tests/engine/inverter-demand.test.mjs
```

The permanent focused gate passes24/24 tests in124.142s on the safe native backend; `permanent-tests-results.json` pins the tested production candidate, tests and exact published-owner fixture. Its retained inverter suite also exercises an injected native failure and controller transaction rollback.

The bounded qualification covers48 meaningful six-fluid scenarios and32172 accepted steps. The initial500s natural-frost endpoints expired before heating return in three fluids; original failed endpoint receipts are preserved, and identical-input event-bounded700s replays complete. R410A has a generic-model thermal-boundary hold during defrost; no OEM timing claim is made. The separate R32 cold/warm static bath results retain physical-line rejections, and no ramp is enabled for physical lines. Full per-trajectory/static JSON receipts are losslessly compressed as `.json.gz`; `receipt-archives.json` pins compressed and original bytes. The existing aggregate artifact hashes refer to the exact decompressed JSON bytes, so the original source/receipt evidence is preserved. For example, `gzip -cd reviews/reference-startup-20261011/six-fluid-R32-dynamic-results.json.gz` reads the original receipt.

Read `six-fluid-startup-qualification.md` and the indexed aggregate JSON for complete source/input/guard pins and limitations. There are no household measurement exports in this directory.

The original exploratory harnesses are archived byte-for-byte for their recorded hashes; they refer to the original isolated snapshot locations. A portable full replay is `replay.mjs`, below. It uses the currently compiled engine, current safe backend and the frozen browser initial config from its existing receipt. It does not reconstruct missing source snapshots or silently patch production. Compare source hashes to the aggregate receipt before claiming exact reproduction.

```sh
node reviews/reference-startup-20261011/replay.mjs /tmp/startup-replay R32
node reviews/reference-startup-20261011/replay.mjs /tmp/startup-replay R134a frost
```

The optional `frost` argument chooses the700s event-completion replay instead of the original eight-case500s-window replay. All source/build/backend/input/harness hashes are recorded afresh. These replay outputs are temporary, not repository updates.
