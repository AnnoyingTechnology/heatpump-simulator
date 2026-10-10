You are the Sonnet 5.5 interface author of Heatpump Simulator 2026. Implement the owner's next UI revision directly. Existing research and initial mockup were accepted; the owner likes the equipment detail but dislikes the detailed building and wants much faster common controls. This pass is a scoped UX revision, not a physics engine. Read current relevant modules, edit early, and do not spend a long pass replanning.

Your ownership: src/, design/interface-design.md only. Root owns tools, config, research/docs/reviews and will run build/browser checks. English. All front artwork remains pure native SVG/CSS. No images, external assets/fonts, new packages or speculative features. No Bash, agents, Opus, global config/memory changes or Intime access. Follow existing parent rules as incorporated here; no parent reads needed.

OWNER REQUEST:
"It's not exactly what I had in mind, it's more detailed, but it's good. Let's just avoid drawing a detailed building. It's ugly and doesn't bring anything. We should just see clearly zones for inside/outside/rooms. Also, the most common things to edit should be always available, like exterior temperature/humidity. The most common things should be available either permanently, or ONE click away. Advanced features/settings can be a bit more hidden. You may continue."

Required resulting behavior:
1. Replace architectural scene dressing with restrained, attractive, clearly labelled OUTDOOR and INDOOR zones and one clean card/band per room. Remove roof/chimney, brick masonry, soil, windows, doors, rafters, floors/skirting/furniture and corresponding unused SVG defs/helpers/styles. A simple separator or boundary is sufficient. Keep the detailed equipment, gauges, reversible circuit, pipes, airflow and vector frost/meltwater. No fake house geometry. Room names/volume/input temperature/setpoint/output supply air remain legible. Preserve one common physical casing scale, correct connected paths and 1–5-room support. Existing geometry may stay so circuitry doesn't need redesign; zones should use blank space well and feel like a clear simulator workbench.

2. Pin outdoor temperature and RH sliders + numeric inputs in a compact permanent area outside the tabbed/scrolling panels (e.g. top of left sidebar). They must remain visible on Rooms, Equipment, Pipes and Advanced, with the diagnostic drawer open and at1440×900/1600×1000. Do not duplicate competing sliders or rebuild focused inputs. Clearly label configured values; do not imply they recalculate frozen readings. Keep this block compact, avoid several paragraphs of developer/provenance explanations in primary flows. Existing persistent preview/model-not-validated banner must remain visible.

3. Establish a practical control hierarchy:
   - Mode, example state, speed, pause/reset stay permanent in header.
   - Room setpoint, current input temperature, volume and heat-loss coefficient: one click on Rooms tab, and ideally clicking a room opens its inputs directly (selecting the room can also focus/scroll its card). If the room diagram requires two clicks to edit, fix that with direct navigation or inline selected-room controls.
   - Indoor count (1–5) and basic outdoor/indoor model selectors: immediately at top of Equipment tab, one click away; switching >3 keeps generic group constraint.
   - Pipes: lengths/sizes available with one tab click.
   - Advanced: pressure convention, display/taps/labels, compressor ηis and refrigerant research/catalogue dimensions/technical explanations live here, using details/accordions if helpful. No need to keep an Environment tab whose main sliders are permanently visible. Use a clear Advanced label. Pick a sensible common default tab, e.g. Rooms, not advanced settings.
   Preserve all existing controls and actions; no dead buttons or mere hidden settings removal. Inspectors still distinguish configuration and fixed readings. Keep diagnostics/provenance drawer for secondary evidence.

4. Keep snapshot notices truthful but reduce unnecessary primary-flow prose. Do not remove fixed-reading caveats, frosting-COP caution, ice/liquid preview amounts, defrost exhaustion notices, unknown exact N8 suffix/layout, or separate physical and virtual taps. All SC-01–09 scientific fixes remain correct. Liquid stop stays upstream of ALL five branches at local(190,222). No engine/calibration claim.

5. Fit both desktop widths without clipping header controls, permanent sliders, tabs, room labels or primary controls. Existing equipment close-up/detail and legend should remain usable. Preserve keyboard focus/accessibility and reduced-motion support. When room count shrinks selection stays valid. Vector-only assets remain.

Update design/interface-design.md to reflect the FINAL zoned composition and control hierarchy, replacing stale house-cutaway descriptions rather than appending contradictory notes. Document any remaining limitations accurately. Reply with concrete changes/files and unresolved issues, then stop.
