Continue the Heatpump Simulator interface with Sonnet 5.5. Read AGENTS.md and existing files. You own src/scene.ts, src/chrome.ts, src/style.css and design/interface-design.md only for this pass. Do not change runtime/engine/main/tests/config/state. Pure vector artwork. Do not run Bash or commands; parent runs build/browser QA.

The runtime now has simulation.inventory: { outdoor: EngineOutput['outdoor']; simulatedSeconds:number } | null. This contains the last accepted conserved outdoor film inventory even while the current input is pending or rejected. start/reset clears it. It NEVER authorizes old active cycle readings.

Update the scene tick and corner ice readout and chrome ice header to show retained last-accepted ice/liquid mass from simulation.inventory when Live is not usable. Do not visually erase existing frost or puddles during pending/rejected configuration. Clearly label this state as held / last accepted state (time if useful). Animate melting only with usable current engine output and actual positive meltPowerW. If no inventory, use — and no ice. Keep pressures/COP/fan outlets/room sensor values blank when unavailable. Examples stay independent.

Check the outdoor exchanger inspector's current editing action: if it doesn't already permit one click to Equipment for the outdoor cleanliness override, report that to parent (do not edit inspector.ts in this pass).

Keep the recently added direct room setpoint sliders and corner layout intact. Report exactly which files changed and any unverified geometry.
