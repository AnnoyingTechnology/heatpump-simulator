Sonnet 5.5, owner steering after your completed cleanliness pass:
- “regarding the rooms and outdoor, clearly visible numeric values in the corner of the boxes; with sensor, output, etc. would be good. Small charts of t° evolution (in the rooms) can come later.”
- “we could likely put the 'called' temperature next to that.” Root interpreted as requested room setpoint, owner then added “with a slider or something”. Root committed compact slider next to EACH ROOM setpoint directly in diagram.

Implement this concrete UX request now. Edit src/scene.ts, src/style.css, maybe controls.ts/chrome.ts/inspector.ts only if necessary, plus design/interface-design.md. No engine/runtime/main/state/research/reviews/tests edits, no Bash, no agents/Opus. Root will handle main click-delegation guards for native controls and validation. Do not claim tests done.

The zoned scene is accepted, no architecture. Front illustrations pure SVG/CSS, no raster/canvas. HTML controls embedded via SVG foreignObject are permitted as native UI controls if appropriate; prefer accessible native range and optional number/stepper rather than brittle custom pointer math. Keep controls DOM stable while engine updates frequently. Input field is Config.rooms[i].setpointC and store.update, same setting as Rooms sidebar. Get existing slider bounds/step from sidebar; labels must identify room. Do NOT restart room state or load example/weather conditions when changing setpoint.

ROOM corner panel:
- Name/volume clear.
- Current room-air sensor temperature prominently, side-by-side with requested SETPOINT temperature (e.g Air20.4°C / Setpoint21.0°C). LIVE currentReadings.engine.rooms[i].temperatureC, RH if space. Never use initial cfg.rooms[i].airC as actual dynamic live temp.
- Compact directly draggable/settable SETPOINT control next to/under its numeric requested value. Keyboard accessible, number stepping useful. Prevent scene click/keyboard selection handlers intercepting control interactions (you may stopPropagation on controls; root alsoguardsmain). Native input values/focus must not be overwritten unnecessarily by sync.
- SUPPLY/output-air temperature clearly labelled separately, and actual branch output kW if space. Inactivefan supply emdash, fault/loading readings emdash. Heatingoutputpositive/cooling removalpositive using branchesFor; duringdefrost signedheatnegative withappropriate label, COPsuppressed remainsglobal.
- Examples mark air/supply/output as EXAMPLE; config Setpoint remains requested input, mismatch logic staystruthful. Averages/weights are never real live readouts. Currentroominitialtemperature belongssidebar only.

OUTDOOR corner panel:
- Visible ambient temperature and RH (configured weather inputs, meaningful evenloading).
- Exhaust/supply-air temperature from currentReadings.outdoorOutletC; unavailableoff/fault/loading emdash.
- Ice quantity if space, fromliveoutput or exampleclock, clearlysource-aware; pressures alreadymanometers/globalribbon so optionalnotnecessary.
- Keep common outdoor temperature/RH sliders pinned in sidebar; do not duplicate largecontrols inoutdoorboard now.

Need readable numeric values inOVERVIEW at1440x900/1600x1000 AND1–5roomcards, not tiny labels. They should occupy a clear corner/rightsideofeachbox, never coverhardware/paths/dirt/frost/manometers. Current labels/topright/sub/supply may be reorganized into this small panel; remove duplicate/conflicting captionlabels. Hardwarecase scale andconnectedpipes must remainexactcurrentgeometry. If5roomsforcecompactmode, keep Air+Setpoint numeric+slider clear, supply/power stillreadable oranintentionalconcisesecondrow. No charts now. No pointless scene furniture.

Reuse existing currentReadings/branchesFor/liveStatus contracts; no invented calculations/COPfactors. Effectivecleanliness overlays remainindependent. Newtemperaturepanels mustnotoverlap reservedlegend/header. Preserveglobalweather controls andstrictsources. Replychangedfiles andcoordinationnotes, thenstop.
