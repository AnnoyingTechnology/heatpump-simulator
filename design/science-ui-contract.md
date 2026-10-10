# Interface science contract

Provided by the dedicated GPT-6.1 Sol thermodynamics agent on 2026-10-10 and reconciled with the completed research. The full scientific reference/specification supplies the detailed definitions and evidence.

Owner styling requirement: all front/simulator illustrations are pure vector (native SVG/CSS), including frost, gauges and equipment. Research PDF excerpts and QA screenshots are evidence only; do not embed them as interface artwork.

- FOUR-WAY REVERSING VALVE, ports D (compressor discharge), S (compressor suction), O (outdoor gas header), I (indoor gas header). A three-way service valve is distinct from a cycle reversing valve.
- Heating: compressor discharge → indoor condensers → branch liquid returns → branch expansion valves → outdoor evaporator → compressor suction.
- Cooling: compressor discharge → outdoor condenser → branch expansion valves → indoor evaporators → compressor suction.
- The opened N2-family schematic places the branch EEVs outdoors. Exact N8 auxiliary layout remains unknown. Draw a clearly generic, family-informed explanatory circuit rather than claim an exact Daikin internal mechanical layout.
- Temperature and phase must have independent encodings. Vapor: purple; liquid: teal; two-phase: patterned amber. Use separate temperature values/gradient overlay, not a contradictory red/blue phase legend. Superheated vapor and subcooled liquid are legitimate states.
- Pressures default to bar(a), explicit absolute units; gauge display subtracts local ambient pressure and must say bar(g).
- Compressor control: Isentropic efficiency ηis [%]. Drive/motor efficiency is separate. Electrical input includes fans and auxiliaries.
- Heat-exchanger display: air-side finned surface [m²] requires a justified geometry estimate or measured/published value. Actual family surface is currently unknown and displayed —. UA [W/K] and the generic frost deposition area are distinct parameters.
- Examples numeric output must be consistently marked Interface preview · illustrative readings · model not validated. Live uses actual engine outputs with explicit generic assumptions and its own review status; these two sources remain separate.
- Room size/heat-loss/setpoint controls feed the live physics and remain configuration-only in Examples. Initial room temperature applies on Reset, not during ordinary edits. Never use arbitrary slider-to-COP formulas.
- Service taps attach to fixed physical nodes. A gas field-line service tap can be high pressure in heating and low pressure in cooling; do not label it permanently suction/low side. Internal compressor suction/discharge taps are explanatory instrumentation and must not be passed off as manufacturer-provided service ports.
- Defrost routes compressor discharge to the outdoor coil. Separate room heat (which may be negative or near zero) from heat delivered to the outdoor coil and melting ice. Do not show normal heating COP during defrost.
- Branch fixture heat rates must sum to system indoor heat; do not assign the full system capacity to each room. Manufacturer performance and exact pressure/temperature calibrations remain unknown until measured/published.
- Owner preset outdoor case dimensions (historical manufacturer family catalogue): H×W×D 734×958×340 mm; FTXA25/35 same indoor case H×W×D 295×798×189 mm. Use one physical illustration scale for equipment casing dimensions; schematic internals may be exploded and must say so. Capacity25 vs35 should not arbitrarily resize that shared casing.
- The owner 3MXM52 preset has three branch connections. One-to-five unit configuration belongs to the broader generic sandbox; adding fourth/fifth units must switch to a visibly generic compatible outdoor group or be blocked in the owner preset. Never show five connected heads while still claiming that exact three-head outdoor model.

Historical owner-blog installation values recovered by the source agent: three one-way lines 7.5 / 6.5 / 14 m, total 28 m; reported aggregate height 15.05 m (do not interpret as maximum elevation or allocate per branch without evidence). Exact indoor suffixes unknown. The owner setup uses R32, corroborated by manufacturer family documentation; the installed nameplate is uninspected.
