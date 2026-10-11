# Generic inverter comfort control

This is a scenario controller, not a manufacturer controller or equipment fit.
Default Reference equipment modulates; `control.strategy: 'on-off'` instead uses
`fixedSpeedRps` whenever it operates. Both retain real-EOS operating-point closure,
envelope protection, restart dwell and the separate configured defrost command.

Each enabled room requests positive sensible thermal power: estimated envelope,
ventilation and fabric loss at its target, with indoor fan heat accounted for,
plus proportional error and a slow bounded integral. Generic proportional and
integral times are 300 s and 600 s; integral correction is bounded to ±4000 W.
The 1006 J/kg/K estimate sets controller gains only; native humid-air energy and
water stores remain authoritative. Latent load is not explicitly forecast.
Integral updates require an actual accepted running interval after startup;
upper and lower saturation block integration in the direction of further
saturation independently for each room. Configuration mode/strategy changes
clear the integral; room-ID matching preserves it across ordinary edits.

Accepted cycle thermal capacity per actual speed is a lagged control estimate.
The total request sets speed from that estimate, within configured speed limits;
restart uses the existing fresh minimum-speed EOS forecast. Every actual operating
point freshly satisfies the original equations and tolerances. Positive room
requests supply relative branch flow weights in idealized lines; actual finite-UA
branch outlets mix before expansion. Defrost/fixed-speed use UA allocation.
Minimum-on retention of a zero-request path uses its UA coefficient as a declared
relative fallback weight, not a requested or delivered watt quantity. Physical
field-line heating retains its earlier branch-control scope.

Target crossing alone does not turn an inverter branch off. Cycling is necessary
when aggregate demand is below estimated minimum-speed capacity and every enabled
room exceeds target by the configured comfort margin. A checkpointed latch stops
normal demand until an enabled room returns to target. Minimum-on/off dwell still
applies. This estimate is not an OEM minimum-capacity map or a guarantee that every
load can be met continuously. Protection and defrost freeze ordinary integration.
All controller state participates in whole-step rollback; no stored heat is reset.

## Manufacturer evidence

[Daikin's inverter description](https://www.daikin.eu/en_us/about/daikin-innovations/inverter-technology.html)
supports adjusting compressor operation with demand, but specifies no PI law.
The [official exact N8 product table](https://www.daikin.fr/fr_fr/products/product.table.html/3mxm-n8.html)
identifies the 3MXM52N2V1B8 and 1.8 kg R32 charge, but does not establish the
owner-declared 130–2350 W electrical operating range. Primary-source conditions
are pending independent catalogue research; the range is not imposed on the generic model. Electrical power continues to emerge from the cycle.
The [Danfoss VZN application guide](https://assets.danfoss.com/documents/latest/580994/AB478735922007en-010201.pdf)
separates minimum speed, timing and operating-envelope control; its compressor
specific values are not transplanted to this domestic generic model.

Focused native tests passed; see `inverter-control-validation.json` for pinned
source hashes, stability/conservation results and limits. Combined full regression
and browser integration remain release gates. No new charge-model acceptance is implied.

Exact manufacturer combination research is recorded separately in
`daikin-3mxm52n8-specifications.md`. Its tabulated electrical ranges depend on
indoor combinations and rating conditions; no compressor-speed map is inferred.
