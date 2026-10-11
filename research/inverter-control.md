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

Every room has a stored thermostat call separate from its physical refrigerant
path. In heating a satisfied room starts calling at target−1 K and a calling
room stops at target+1 K; cooling reverses these thresholds. The default margin
is 1 K on each side and remains configurable in the engine. Inside the band the
call retains its previous state, independent of instantaneous positive/zero PI
request. Explicit Off always clears it. New/reset/explicitly enabled units seed
unknown history as calling at or beyond target in the demand direction. A mode
change seeds the opposite-direction call; ordinary target/weather/size edits
preserve known history. This initialization policy is a generic assumption.

Calling inverter rooms use a continuous 25–100% commanded fan fraction across
the band, reaching the low end just before the stop boundary. Configured high-fan
flow and air-side conductance scale by that fraction; fan electrical watts scale
by its cube. The cube is an ideal fan-affinity surrogate, including a simplified
motor assumption, and linear conductance is a bounded generic heat-exchanger
approximation. Neither is a measured domestic-unit map. Dirt scales the remaining
flow/conductance at unchanged fan command. Actual thermal evolution and prospective
cooling antifreeze checks use the same commanded flow/conductance. The SVG stream
slows and fades with the accepted fan fraction. Fixed-speed units retain full
fan command while calling.

Accepted cycle thermal capacity per actual speed is a lagged control estimate.
The total positive request sets speed within configured limits; restart uses a
fresh minimum-speed EOS forecast. Every actual operating point freshly satisfies
the original equations and tolerances. Idealized inverter branch allocation
combines 95% normalized positive thermal-request shares with a 5% normalized
active refrigerant-UA reserve. The latter is an explicit generic valve-opening
assumption that retains a positive refrigerant path for a calling room whose PI
request reaches zero. With no positive request, allocation uses normalized UA.
Defrost/fixed-speed use UA allocation. Physical field-line heating retains its
earlier branch-control scope. These shares are dimensionless, not OEM EEV maps.

When the final comfort call stops, ordinary compressor operation stops without
forcing heat into a satisfied room for minimum-on dwell. Minimum-off restart
dwell and physical envelope protections remain. Defrost/reversal paths are
separate safety states; explicit all-unit Off aborts the circuit while retaining
stored heat, frost and water. A latched comfort call can remain true during a
compressor protection hold while the physical fan/source behaves independently.
The former global minimum-load latch is retained as an inactive checkpoint field
for compatibility. Protection and defrost freeze ordinary integration. All
controller history participates in whole-step rollback; no stored heat is reset.

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

`inverter-control-validation.json` records the earlier controller and is historical
evidence. The current symmetric thermostat and fan update has separate release
checks under `reviews/indoor-comfort-*`. No new charge-model acceptance is implied.

Exact manufacturer combination research is recorded separately in
`daikin-3mxm52n8-specifications.md`. Its tabulated electrical ranges depend on
indoor combinations and rating conditions; no compressor-speed map is inferred.
