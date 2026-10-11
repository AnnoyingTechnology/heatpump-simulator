# Reference inverter supervisor correction

2026-10-11. This implements the actuator/control findings in
[the retained diagnosis](inverter-low-load-diagnosis.md), without fitting the
house, assigning measured electrical watts or changing thermodynamic equations.

The ordinary Reference inverter now begins at its admissible configured minimum
and immediately follows configured2 rps/s upward /4 rps/s downward slew. Every
accepted speed receives a fresh refrigerant/coil solution and real thermal/
electrical integration. The first positive speed is the admitted minimum: this
does not claim a continuous motor trajectory from zero through unqualified
subminimum speeds. Explicit Off and conservative protection override the slew.

The raw capacity-to-speed request survives min/max clipping and appears as
`diagnostics.rawDemandSpeedRps`. The PI controller uses actual-versus-raw command
and the selected speed limits for directional antiwindup: lower saturation
blocks negative-error winddown and admits positive recovery; upper saturation
does the converse, independently per calling room. Zero-request handling remains.
Integration occurs only on accepted ordinary inverter intervals with an actual
positive compressor cycle and no protection; defrost/reversing/passive intervals
do not integrate. Controls, speed and integral remain in the existing whole-step
rollback transaction.

The generic engine/native default retains18 rps. Root owns the separate declared
interactive configuration:8 rps for idealized Reference heating/cooling and
physical heating;18 rps for advanced physical cooling and gated inventory.
Those are bounded-model assumptions, not manufacturer frequency limits.
Inventory/fixed-speed/dedicated defrost retain their existing drive policy; the
new immediate2/4 slew is passed only to ordinary Reference inverter operation.

The narrowly reviewed physical cooling correction in `cycle.ts` is a peer/root
change. It removes an incorrect common-suction-temperature search restriction
and seeds branch flow before real transported terminal checks. It qualifies
single-branch cooling at8 rps, but unequal multi-branch physical cooling still
cannot close at8 in the retained limiting example. That real advanced-model
limitation remains explicit; there is no hidden higher-speed retry or weaker
cycle acceptance. This controller change does not resolve it.

The14 focused checks cover the exact published owner house for1200 s with only
the declared actuator minimum set to8, maintaining continuous compressor work
and a calling upstairs head across its target. Envelope/gain/link/pipe/weather
inputs remain those of the retained published fixture. They also check native
cold startup and retained-hot-coil restart against admitted speed, bounded slew,
actual compressor work and electrical-energy increments; hard discharge/ratio
and header-mass limits; lower/upper antiwindup; rate validation without state
mutation; all-calls Off; genuine below-minimum cycling; conventional fixed speed;
legacy startup/protection/dwell; slew timestep refinement and native-failure
rollback. Combined regressions, interactive mapping/browser checks and publication
remain root's release gates.

Final execution results and exact source/compiled/backend fingerprints are
recorded in `inverter-supervisor-regression-results.json` after the final frozen
native run. Independent reviewer acceptance is separate from implementation.
