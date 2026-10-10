# Heatpump Simulator 2026 — implementable model specification

Status: **planned**, 2026-10-10. No validated engine exists at this milestone. This document defines the subsequent implementation; [heatpump-science-reference.md](heatpump-science-reference.md) supplies physical definitions and sources. [research/model-validation-plan.md](research/model-validation-plan.md) defines release gates. Manufacturer presets remain estimated until independently calibrated. Equations below are the project's reduced-order model choices unless explicitly marked as sourced facts.

## 1. Architecture and stages

The preferred end state is a **quasi-steady enthalpy-based refrigerant circuit coupled to dynamic coil metal, outdoor ice/water, room energy and room humidity**. It runs in a browser worker on CPU, one to five parallel indoor branches. It does not require FEA, GPU, a backend or a property web API. First resolve scientific consistency and unknowns; do not use a large dynamic fluid inventory model before charge/leaks are in scope.

1. **Current research/mockup:** design, sources, property feasibility probe and illustrative interface states. No claim of operating-point prediction.
2. **Property gate:** pinned, self-hosted open property backend, tested on R32 and pure-fluid candidates. Prefer direct CoolProp WASM if actual static-host coverage/performance passes; use generated phase-separated tables only if benchmarking demonstrates a worthwhile need. Keep the same property interface in both cases. Blend two-phase coverage is a separate gate.
3. **Steady circuit gate:** one branch first, then shared parallel branches; property-consistent compressor/EEVs, dry-air coil closure, fan/auxiliary accounting, physical pipe heat and pressure losses with declared correlation domains. One steady curve fit cannot identify all component parameters.
4. **Dynamic physical gate:** two-node rooms, moist-air state, wet-coil condensation, coil metal, mandatory outdoor frost/retained-water/refreezing and reverse-cycle defrost. This is required before the product can call its time evolution a heat-pump simulation. It is not an optional cosmetic feature.
5. **Calibration gate:** compare supported equipment combinations/conditions against manufacturer and, separately, observed data. Publish residuals/uncertainty. Add measured maps without compromising generic sandbox operation.

Full fluid inventory, two-phase slip dynamics, oil and leaks are extension work. The baseline treats refrigerant steady within each accepted substep; coil/room/ice energy is dynamic. Consequently pressure transients, refrigerant equalization, slugging and seconds-scale startup physics are outside model claims. Reversal stops compressor and switches routing after a declared generic dwell; it does not fabricate physical equalization pressures.

## 2. State, parameter and result schemas

Use one versioned immutable `Scenario` and one mutable `PhysicsState`. State values never depend on SVG positions.

| Object | Required fields and units |
| --- | --- |
| Scenario | fluid identity + composition basis/backend revision; outdoor T [K], RH [fraction], ambient p [Pa]; mode; room/branch arrays; equipment/controller assumptions; provenance per input |
| Room parameters | V [m³], initial dry-air mass [kg], envelope H [W/K], separate ventilation [kg dry air/s], C_fabric [J/K], H_air-fabric and envelope split [W/K], internal sensible/moisture gains, setpoint [K] |
| Coil parameters | defined A_air/A_ref/A_face [m²], air/ref conductance or HTC closures, metal capacity [J/K], dry airflow [kg dry air/s], fan map/assumption, natural-convection conductance, segment topology |
| Pipe parameters | physical length [m], OD/thickness/ID [m], elevations [m], roughness/fitting losses, insulation/ambient zones, thermal conductance [W/K], pressure-loss method + confidence |
| Compressor parameters | V_displacement [m³/rev] or equivalent calibrated mass-flow scale, speed [rev/s] limits, ηis, ηvol, ηdrive maps/constants, allowed p ratio/Tdischarge envelope |
| Dynamic room state | air enthalpy content H_air [J] and humidity ratio w [kg/kg dry air], fabric T [K]; derive air T and RH |
| Dynamic coil state | metal T for each segment [K], retained indoor condensate if supported [kg] |
| Dynamic outdoor film state | water mass M [kg], film enthalpy E_f [J], selected frost density/geometry closure; derive ice/liquid mass, T, thickness and blockage |
| Control state | operating mode, runtime/dwell timers, requested speed/fan levels, branch demand, generic hysteresis state, defrost stage; no manufacturer name on generic algorithm |
| Algebraic refrigerant state | p,h,T,s,ρ, phase, mass quality if defined; ṁ for each directed edge; component/pipe heat transfers, residuals, coverage validity |
| Ledgers | electrical J by component, signed useful room energy J, room sensible/latent J, outdoor air J, pipe exchange J by ambient zone, drive losses J, drainage mass/enthalpy, moisture input/output and film storage J |
| Result validity | `illustrative`, `property-checked`, `numerically-verified`, `calibrated`, `externally-validated` are distinct flags; include solver/coverage/degraded state and parameter uncertainty |

Temperature/pressure readouts during off/transition are unavailable unless a separate passive-inventory model is implemented. A previously accepted algebraic state can be stored for diagnosis but must be labeled “last running state,” not current pressure.

## 3. Property service

Define `statePH(p,h)`, `statePT(p,T,phaseHint?)`, `statePS(p,s)`, `saturationP(p)` (bubble/dew endpoints) and optionally `statePQ(p,quality,basis)` and transport access. Return typed domain errors, never `NaN`, a plausible fallback number or silent clipping. All state functions include fluid/backend identity. Enthalpy and entropy conventions remain fixed at initialization. Only evaluate `Qmass` after phase/raw `Q` establishes a valid two-phase state (`0≤Q≤1`); the observed release returns invalid for single-phase Qmass. Return null/undefined quality there, not a fake liquid/vapor fraction.

Check every needed operation in the actual artifact; public library documentation is not a guarantee of a particular wrapper export. For blends distinguish pseudo-pure EOS from true mixtures. Test p–h and p–s inversions, not only p–T samples. A backend unable to perform a required inverse can use a bounded scalar inversion of supported forward calls within known phase regions, **only** if conditioning, monotonicity and coverage are verified. Such an inverse is a normal numerical method, not an unsupported fluid extrapolation. Do not enable a blend with ad hoc saturation averages.

Tables, if chosen, have phase masks and independent saturation curves. Blend tables require nonlinear equilibrium interior and clear mass-quality conversion. A custom interpolator must pass off-grid tests and cycle-level checks; endpoint matches alone do not validate it. Direct WASM avoids this additional interpolation uncertainty at the cost of measured artifact size and CPU use. Current official JS/WASM availability is documented in [CoolProp wrapper](https://coolprop.org/coolprop/wrappers/Javascript/index.html). **Observed** pinned-release static-browser feasibility is recorded in [research/coolprop-browser-feasibility.md](research/coolprop-browser-feasibility.md): 8.0.0 pure/pseudo-pure and selected explicit mixtures passed. This is not full-domain validation. The release exposes `HAPropsSI` and `PropsSI('Phase',...)`; `PhaseSI` itself is not exported. Obtain explicit-mixture vapor mass quality through verified `Qmass`; `Q` is molar. Never use a missing phase helper as justification to invent thermodynamic phases.

## 4. Circuit graph and degrees of freedom

Ports D/S/O/I have the fixed identities in the science reference. Four-way state only changes D–O,I–S versus D–I,O–S connectivity. EEVs sit in outdoor liquid-side branch routing for the illustrated 3MXM-N family abstraction. Gas and liquid field pipes retain physical node identity while flow changes direction. Common gas-side service node follows the manufacturer-family diagram; extra branch/high-side taps are virtual diagnostics. Exact N8 auxiliary details remain unverified.

At every steady node:

```
Σṁ_in = Σṁ_out
Σṁ_in h_in + Q̇_node = Σṁ_out h_out
```

An ideal adiabatic EEV preserves h; the downstream p determines flashing. Ideal headers are adiabatic mixers. Ordinary two-pipe multi-split branches cannot independently choose cooling versus heating.

**Minimal explicit closure with N active branches, negligible pipe drop first:** control chooses compressor speed n. Algebraic unknowns are p_L,p_H and N branch flows ṁ_i. The compressor equation fixes total flow from `(p_L,h_S,p_H,n)`. In cooling, specify generic indoor outlet dew-superheat targets for each branch and outdoor condenser outlet bubble-subcool target. In heating, specify indoor outlet bubble-subcool targets for each branch and outdoor outlet dew-superheat target. Given p_L,p_H, those targets determine endpoint enthalpies; compressor gives h_D. Each of N indoor coil closures supplies one heat/enthalpy residual; the outdoor coil supplies one; sum-flow minus compressor-flow supplies one. Thus N+2 unknowns and N+2 equations.

These targets are **idealized control closures**, not claims about what each Daikin EEV senses/regulates. In heating, parallel condenser liquid endpoints can differ with their local pipe losses; mix their throttled returns energetically before shared outdoor evaporation. In cooling, mixed suction enthalpy is mass-weighted; include field gas-line superheat gain. An inactive branch is removed from the active mass-flow closure rather than assigned a fraction of full power.

Requested room loads choose outer-loop speed and branch target/airflow adjustments, with actuator bounds and priorities. Do **not** additionally demand exact room Q for all branches, fixed p_L,p_H, fixed speed and fixed superheat/subcooling: that overdetermines the circuit. At limits, expose unmet room loads and target errors. If explicit EEV dynamics are introduced, their opening/mass-flow law replaces appropriate idealized target closures, not another redundant equation. Flashing-valve flow coefficients and choked behavior require calibration; a liquid orifice formula is insufficient for all states.

Pipe-pressure loss refinement introduces local node p and edge momentum residuals; it must preserve headers' flow/mixing constraints and local target reference pressures. Solve pressure drops with branch flows rather than deducting an arbitrary COP penalty after solving. A compact initial implementation may use a staggered pressure update, provided convergence and energy residuals are tested.

## 5. Component equations and energy ledger

Compressor:

```
ṁ_comp = ρ_S V_disp n η_vol
h_Ds = h(p_D,s_S)
h_D = h_S + (h_Ds−h_S)/η_is
P_ref = ṁ_comp(h_D−h_S)
P_comp,el = P_ref/η_drive
Q̇_drive,out = P_comp,el−P_ref
```

This ηis describes effective adiabatic enthalpy rise. The last heat destination is a declared baseline simplification. Keep electrical, mechanical and refrigerant work distinct; calibrating a shaft-efficiency/motor-heating model changes this closure with its own energy terms. Reject liquid suction and envelope violations instead of making the accumulator magically repair them.

For every quasi-steady refrigerant coil segment, heat delivered **from refrigerant to metal** is `Q̇_ref→metal=ṁ(h_in−h_out)`. A heat-transfer law relates that flux to local refrigerant and metal T; use phase-aware zones/segments and stated flow geometry. For indoor metal:

```
C_metal dT_metal/dt = Q̇_ref→metal − Q̇_metal→air
```

For outdoor metal with film:

```
C_metal dT_metal/dt = Q̇_ref→metal − Q̇_metal→film − Q̇_metal→air,bare
```

Air sensible/latent and film fluxes close independently as below. Metal energy explains the difference between instantaneous refrigerant-side and air-side capacity. Generic component UA must be identified for its temperature difference/resistance boundary, not reused as both total ref-to-air conductance and ref-to-metal conductance without transformation. Fin efficiency belongs in the relevant air-side resistance.

Indoor fan adds its electrical power to room air (declared motor-in-room assumption). Its position after/before the coil determines temperature ordering and inlet psychrometrics. Outdoor fan and drive loss go to outdoor air/environment. Controls/heaters are assigned an explicit physical destination. Pipe heat is assigned to its ambient zone and included with opposite sign there; an insulated pipe still has finite conductance. Neglected pipe heat is a declared zero assumption only in a verification fixture.

At steady dry operation, no pipes or storage, the useful heating relation is `Q̇_rooms,net=Q̇_evap,ref+P_ref+ΣP_indoor_fan`; the complete electrical input is larger. Complete-system external balance also includes drive loss, outdoor fan and controls heat. In cooling, `Q̇_rooms,net_removed=Q̇_evap,ref−ΣP_indoor_fan` for that simple dry boundary. Wet drainage terms are added explicitly; avoid changing definitions between modes.

Maintain residuals for each component and global control volume. Choose boundaries once: whole model includes room air/fabric, coil metal and film, with outdoor air, envelope leak/ventilation, moisture sources, drains and electric work crossing its boundary. Positive external flux is into modeled storage. Integrated ledger residual is `ΔE_storage−∫Σexternal energy flux dt`. Do not test a different instantaneous steady equation during storage/defrost and call it a violation.

## 6. Air and moisture closure

Use dry-air mass flow. For dry segments, w_out=w_in and temperature follows the sensible effectiveness/metal-film heat-transfer closure. For wet cooling segments, determine a surface/ADP temperature, mix bypass fraction b of entering air with contact air at saturation over water, and solve both `w_out=b w_in+(1−b)w_sat(T_surface)` and `h_out=b h_in+(1−b)h_sat(T_surface)`. b is effective contact bypass, not necessarily a literal air stream bypass. Require an energy-consistent surface solve; do not independently prescribe total Q, b, surface T and outlet conditions.

For a dry coil surface above inlet dew point, no condensation; the fully wet mixing equation must not create water. Partially wet coil uses segmentation or a continuous dry/wet split. Confirm outlet RH≤1 without silently losing energy. Condensate flux is ṁ_da(w_in−w_out). Heat into metal equals `ṁ_da(h_in−h_out)−ṁ_cond h_drain` for drain leaving at its modeled T. If water temporarily stores on the indoor coil, integrate its mass/enthalpy and use those storage terms instead of instant drainage. Outdoor deposition uses ice saturation and film accounting below.

Room air is a **constant-pressure well-mixed psychrometric reservoir approximation** at specified ambient pressure, with fixed initial dry-air inventory and balanced ventilation exchange. It uses enthalpy storage, not an exact sealed constant-volume gas/internal-energy model. Fabric capacity supplies most inertia. Integrate H_air and w jointly:

```
dH_air/dt = Q̇_fabric/air + Q̇_envelope,sensible + Q̇_sensible_gains
            + ṁ_da,supply(h_supply−h_room)
            + ṁ_da,vent(h_outdoor−h_room) + Ġ_water h_vapor,source
dw/dt = [ṁ_da,supply(w_supply−w_room)
         + ṁ_da,vent(w_outdoor−w_room) + Ġ_water] / m_da,room
H_air = m_da,room h_air(T,w)
```

When coil circulation is off, its ṁ supply term is zero unless natural-convection coupling is represented. Indoor fan energy is already included in h_supply; do not add it again to H_air. Solve T from H_air,w. Fabric receives the opposite exchange term and its envelope/gains. This avoids incorrectly using total latent cooling to lower room sensible T. Sensible diagnostics can be derived at a declared humidity reference; exact split convention is documented. For moisture gains supplied as liquid evaporating within room, source enthalpy and latent uptake must be modeled rather than assigning vapor enthalpy externally.

Map simple envelope H to a declared network split and H_air-fabric so the series conductance has the requested steady H. Ventilation is separately visible or explicitly included in H. No double counting. Until room-condensation-on-walls is implemented, stop or mark unsupported when unhandled supersaturation occurs; continuing with RH clamped would violate water balance.

## 7. Mandatory conservative frost/defrost

Track one lumped film per outdoor coil initially; segment it later when justified. Its state is M,E_f. Ice/liquid fraction and T are derived with the enthalpy plateau in the science reference. Set M=0 at dry initialization and E_f=0. Do not reset M or E_f just because mode changes.

During frosting, contact air exchanges heat and moisture against a subzero surface with saturation over ice. `ṁ_dep=ṁ_da(w_in−w_out)≥0` when ice saturation permits deposition. Bounds prevent removal of more incoming vapor than exists. Air contact effectiveness or a heat/mass transfer analogy supplies the transfer closure; its coefficient and frost geometry need calibration.

Use a single boundary convention:

```
dM/dt = ṁ_dep + ṁ_liquid_cond − ṁ_drain − ṁ_evap − ṁ_sublime
dE_f/dt = ṁ_da(h_air,in−h_air,out) + Q̇_metal→film
           − ṁ_drain h_liquid(T_drain)
```

In this convention air enthalpy change already includes energy of deposition/condensation/evaporation/sublimation; its sign handles outgoing vapor too. Do **not** subtract evaporation latent energy a second time. If using separate vapor-flow enthalpy instead, replace the air term consistently. Derived film state supplies ice/liquid mass; drainage is available liquid only. Retained water freezes only after removing L_f per kg, and that removal appears in metal/refrigerant or outgoing-air flux.

Frost thickness estimate is `δ=M_ice/(ρ_frost A_deposition)`; A_deposition is defined geometry, not automatically all finned area. Add a frost resistance `R_f=δ/(k_frost A_effective)` and a separately specified air blockage/fan-flow closure. A simple UA multiplier and reduced airflow can be a labeled calibration surrogate but must remain finite/monotone and report uncertainty. Avoid claiming geometrically resolved fin bridging from a single mass unless fin spacing and deposition distribution are actually specified.

Generic stages: heating → compressor-stop reversal dwell → reverse-cycle defrost → drainage/reversal dwell → heating warm-up. Defrost enters cooling-direction topology; outdoor fans normally off in the generic example; indoor forced fans off unless explicitly selected. Natural convection and stored metal supply finite evaporator energy; the solver may lower speed or fail envelope/capacity constraints. Keeping forced convection while stopping the visual fan is forbidden.

Melting follows E_f and M, never a timer decrement of ice. Film at melting has T≈273.15K. Ice-cold sensible energy, fusion, metal warming and external loss all consume heat. Terminate only after derived ice falls below tolerance and coil T threshold/dwell is satisfied. Safety timeout reports incomplete defrost and remaining ice. Drainage removes liquid mass and its enthalpy; a retained fraction/drain time is declared. Fans/heaters/controls, indoor heat extraction and compressor electric power remain in all ledgers. Display defrost useful indoor heat separately from heat to outdoor coil and melt energy.

## 8. Numerics and time semantics

Algebraic solve uses log-pressure coordinates, bounded positive branch flow variables and warm starts. Use safeguarded Newton/trust-region or bracketed outer pressure solves with explicit residual scaling. Prevent p_H≤p_L, invalid phase, unsatisfied pinch, out-of-table/domain states and negative flows through fixed-direction active branches. A failed solve reduces step/retries within an explicit bound and then returns “No feasible operating point”; do not fabricate capacity or preserve stale readings as current.

Integrate slow states with an energy-conserving finite-step update and event splitting. Suggested initial target step ≤0.25 s, refined around melt/reversal/cycling events; this is a proposed engineering starting point, not an established required physical timescale. Implicit or exact linear updates for the room RC network avoid artificial instability. Resolve controller updates by simulated time. Re-evaluate algebraic circuit as needed inside each step, especially when film/metal changes; validate lagged coupling by timestep convergence.

Time-speed choices 0.25×,0.5×,1×,2×,5×,10× alter the wall-time accumulator only. Physics maximum step does not grow at 10×. Pause preserves state/ledgers; reset returns initial conditions. At equal simulated timestamps, all speeds must agree within integration tolerance. A hidden tab pauses by default; a visible “Paused while hidden” message avoids silent unbounded catch-up. Rendering/flow animation is decoupled from physics. A backlog limit pauses with an explicit “Cannot maintain selected speed” state instead of discarding simulated time.

Every accepted step records local/global energy residual and water residual. Nonnegative water masses use event-limited transfers, not post-hoc clamps; tiny roundoff correction may be tolerated only if tracked and below validation tolerance.

## 9. Input ranges: physical domain versus sandbox range

No range below is an equipment-approved operating envelope. These are **proposed generic exploration bounds**, to be intersected with EOS coverage and chosen equipment maps. Unsupported points report why; sliders do not certify operation.

| Parameter | Planned bounds/default logic | Basis and limitation |
| --- | --- | --- |
| Outdoor air T | −25…45°C basic sandbox | Encompasses useful cold/warm exploration; equipment operating limits source-dependent |
| RH | 0…100% | Physical fraction; zero humidity produces no frost source; ice/water RH convention stated below freezing |
| Room initial T / setpoint | 5…40°C / 10…30°C basic | Comfort exploration rather than process cooling; moist-air coverage still checked |
| Room V | 10…500 m³ | Geometry; larger rooms can be unsupported by preset capacity without constraining basic physics |
| Envelope H | 0…500 W/K per room | Allows adiabatic test and wide loss variation; estimate from surfaces/U-values when known |
| Fabric C | >0; example 0.5…50 MJ/K | Broad lumped-room exploration; depends on construction, cannot be inferred from air volume alone |
| ηis | 0<η≤1 physical; 0.4…0.9 UI, generic 0.70 | Stable exploration; no Daikin calibration; η=1 ideal benchmark, η→0 invalid practical envelope |
| ηvol / ηdrive | >0…1 baseline; default placeholders marked estimated | Separate physical definitions; real speed/ratio maps unestablished |
| Superheat/subcool target | 3…15 K / 0…10 K generic | Dry suction/subcooled outlet exploration, not device commands; zero SC demands careful saturation endpoint lookup |
| Coil UA/areas/capacity | Positive, zero allowed for isolated test | Geometric source or calibration required; no universal m²/kW |
| Frost density | 0<ρ<ρ_ice; generic test sweep 50…500 kg/m³ | Porosity bound; sweep is uncertainty exercise, not validated local frost density |
| Frost k, retention/drain time | Positive, measured/correlation-domain dependent | Do not invent equipment constants; dimension/energy checks needed |
| Pressure/temperature envelope | Actual backend bounds + conservative subcritical margin | Reject near critical/unsupported transcritical; fluid-specific critical properties queried from backend |
| Pipe geometry | Positive length/ID; exact preset installation restrictions separately | Manufacturer length limits apply to its hardware; generic experiments require pressure-loss validity |

Under-zero outdoor RH input default is defined relative to **liquid-water saturation** to match many meteorological RH conventions; convert actual vapor pressure before comparing ice saturation. Expose/change this convention if importing source data using ice-relative RH. Do not treat RHw=RHi at the same subzero T.

The initial property verification grid may span refrigerant evaporating −35…20°C, condensing 15…60°C, SH 0…30K and discharge up to a selected EOS-valid limit. This is a test domain proposal, not a promise all pairs or fluids operate there. Trim it by p/T critical margins, compressor constraints and nonpositive temperature lift. A single rectangular fluid-agnostic pressure grid is unsuitable.

## 10. Parameter identification and extensibility

Keep equipment dimension/catalogue data separate from modeled internal parameters. Fit a small identifiable parameter set using multiple conditions and independent heat/power/airflow outputs; report sensitivity and multiple plausible fits if underdetermined. Never derive all UA/η/displacement values from a single nominal Q/COP and then call them manufacturer data. Exact suffixes and manufacturer operating conditions are prerequisite to a device-specific calibration claim.

The initial owner preset uses name/nominal classes as declared context, historical family dimensions as sourced estimates, and generic internal parameters explicitly. Actual branch lengths/heights require owner or installation evidence with its date. No engine behavior is inferred from drawn tube length.

Future charge/leak support replaces steady mass equations with `d(ρV)/dt=ṁ_in−ṁ_out` and `d(Mu)/dt=Σṁh+Q̇−Ẇ`, tracking individual blend components when applicable. Storage uses **u**, transported flow energy uses **h**. This is a design boundary, not a baseline capability. It will need algebraic constraints/DAE integration and inventory/void fraction data. Oil, three-pipe recovery, hot water and catalogue ingestion each require their own model and validation scope.
