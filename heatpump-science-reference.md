# Heatpump Simulator 2026 — scientific reference

Research date: 2026-10-10. Author: dedicated thermodynamics research agent. This is a **planned model**, not evidence of an implemented or validated simulation. The current product milestone is research and an interface mockup. Numerical mockup readings are illustrative. The implementation contract is [model-specification.md](model-specification.md); acceptance work is [research/model-validation-plan.md](research/model-validation-plan.md). Equipment evidence is maintained separately in [research/primary-source-register.md](research/primary-source-register.md).

## 1. What can be claimed

A reduced-order model can conserve mass and energy, resolve real refrigerant states, respond to heat exchanger size, airflow, pipes, moisture and frost, and show physically understandable trends on a browser CPU. It cannot reproduce a particular manufacturer's capacity map or internal controls merely by knowing its model number. Correct property data do not validate the complete heat pump. Nominal capacity does not identify compressor displacement, refrigerant distribution, heat exchanger UA or defrost thresholds uniquely.

The owner **declares** a Daikin 3MXM52N8 with FTXA25 + FTXA35 + FTXA25. Exact indoor suffixes, current nameplate and operating measurements are **unknown**. The owner's installation article is **historical**, not a present survey. A fluid experiment with another refrigerant is a virtual redesigned system; it is not a suggestion to refill the Daikin with a different gas. Sizes, pipe restrictions, allowable pressures and control maps belong to equipment, not to the refrigerant label alone.

Throughout, “fact” means supported source evidence; “assumption” means a deliberate model closure; “estimate” means an uncertain parameter; “unknown” means unestablished. Record these alongside each preset value. Physical consistency, numerical accuracy, equipment calibration and external validation are four distinct achievements.

## 2. Units, signs and thermodynamic states

Internally use SI: pressure p in Pa absolute; temperature T in K; mass flow ṁ in kg/s; specific enthalpy h and internal energy u in J/kg; entropy s in J/(kg·K); power Q̇ and P in W; energy in J; area A in m²; UA in W/K; moisture ratio w in kg water/kg dry air. Convert only at UI boundaries: °C = K − 273.15, kW = W/1000, bar = Pa/100000, kWh = J/3600000. Temperature differences in K and °C are numerically identical; absolute-temperature ratios require K.

`bar(a)` is absolute pressure. `bar(g)` means p_abs − p_ambient: standard atmosphere 101325 Pa is an optional explicit default, not a universal measured ambient pressure. Pressure ratio always uses absolute pressures. A branch gas service tap is on the suction side in cooling and discharge/condenser side in heating; its identity does not remain “low pressure.” A generic high-side diagnostic tap must not be presented as a documented accessible Daikin fitting.

Use `(p,h,fluid/composition)` as the principal refrigerant state. Obtain T, s, density, phase and where defined vapor quality x from the property backend. A temperature alone cannot tell whether refrigerant is vapor or liquid. At pure-fluid saturation, p and T are dependent; quality or enthalpy is needed to fix the state. **Fact:** CoolProp exposes saturation endpoints through quality 0/1 and warns against forcing an incorrect phase; enthalpy/entropy reference offsets must stay consistent across a calculation. [CoolProp high-level API](https://coolprop.org/coolprop/HighLevelAPI.html)

For a **pure fluid** at subcritical pressure, with saturated liquid/vapor values h_f,h_g:

```
x = (h − h_f)/(h_g − h_f),               h_f ≤ h ≤ h_g
T = T_sat(p)
1/ρ = (1−x)/ρ_f + x/ρ_g                 homogeneous equilibrium density
```

x is **mass fraction of vapor**, not the fraction of pipe volume filled with vapor. Void fraction differs because vapor is less dense. Outside the two-phase range, x is undefined: show “—”, not 0 or 1 as a fake single-phase quality. Superheated vapor is above the dew temperature at local p; subcooled liquid is below the bubble temperature. Do not use single-phase cp to cross a phase change.

## 3. Refrigerant coverage and blends

This selection covers important domestic and small commercial air conditioning over roughly three decades plus requested comparison fluids. It is a deliberately bounded survey, not a claim that every gas is common in split air conditioners or every appliance uses the same circuit. Fluid identifiers below have public CoolProp EOS documentation; selector activation still requires project-specific validation of all required state operations.

| Fluid | Type and relevance | Property candidate and coverage boundary |
| --- | --- | --- |
| R22 | Pure HCFC; legacy air conditioning/heat pumps | `R22`, pure-fluid EOS; historical comparison, not retrofit advice. [EOS documentation](https://coolprop.org/fluid_properties/fluids/R22.html) |
| R407C | Zeotropic HFC blend, relevant R22-era replacement systems | Fixed composition R32/R125/R134a, **mass** fractions 0.23/0.25/0.52. Strongly relevant glide. CoolProp `R407C` is a pseudo-pure EOS; true-mixture and full two-phase flash coverage must be verified. [R407C EOS](https://coolprop.org/fluid_properties/fluids/R407C.html), [mixture definitions](https://coolprop.org/fluid_properties/Mixtures.html) |
| R410A | Near-azeotropic HFC blend, widespread split-system generation | R32/R125 **mass** fractions 0.50/0.50. Small glide must remain distinguishable from exact zero. `R410A` pseudo-pure or validated fixed-composition mixture. [R410A EOS](https://coolprop.org/fluid_properties/fluids/R410A.html), [mixture definitions](https://coolprop.org/fluid_properties/Mixtures.html) |
| R32 | Pure HFC; declared owner preset, corroborated by 3MXM-N family documentation | `R32`; first equipment-specific property target. The opened manual is N2-family, not exact N8 revision evidence. [R32 EOS](https://coolprop.org/fluid_properties/fluids/R32.html), [Daikin 2019 R32 guide, cover and §6.6.3](https://www.daikin.eu/content/dam/document-library/Installer-reference-guide/ac/split/3MXM-N%2C%203AMXM-M%2C%203AMXF-A%2C%203MXF-A%2C%204MXM-N%2C%205MXM-N_4PEN600463-1_2019_10_Installer%20reference%20guide_English.pdf) |
| R290 | Pure propane; heat pump/refrigeration comparison fluid | `n-Propane` / documented aliases. A thermodynamic model does not establish appliance safety or retrofit compatibility. [Propane EOS](https://coolprop.org/fluid_properties/fluids/n-Propane.html) |
| R134a | Pure HFC, important domestic refrigeration and some heat pumps; not a generic modern split preset | `R134a`, useful lower-pressure comparator. [R134a EOS](https://coolprop.org/fluid_properties/fluids/R134a.html) |
| R1234yf | Pure HFO, chiefly automotive relevance; expressly requested comparator | `R1234yf`; no implication that it is the owner's fluid or standard for this domestic multi-split. [R1234yf EOS](https://coolprop.org/fluid_properties/fluids/R1234yf.html) |

Blend definitions must specify mass versus mole fractions. Convert z_i = (y_i/M_i)/Σ(y_j/M_j) before passing a mole-based backend; store the original mass fractions and conversion provenance. R410A's approximate mole fractions 0.697615/0.302385 are not its mass percentages. Never set arbitrary binary interaction rules to make a missing fluid “work.” **Fact:** CoolProp warns that estimated interaction rules can produce wrong predictions; flash coverage is version/backend dependent. Its documentation contains both limited-input legacy discussion and newer mixture-flash material. [CoolProp mixtures](https://coolprop.org/fluid_properties/Mixtures.html) **Observed:** the project's pinned 8.0.0 browser probe passes selected explicit R410A/R407C mixture PT/PH/PS and interior-quality calls; this does not establish full-domain robustness. [Local feasibility evidence](research/coolprop-browser-feasibility.md)

For a blend at fixed pressure, bubble T is where liquid first boils and dew T is where vapor first condenses; their difference is glide. Define superheat against dew and subcooling against bubble. Through evaporation/condensation, temperature and coexisting phase compositions generally change. A single representative saturation temperature is insufficient for a gliding-coil pinch calculation. The pure-fluid endpoint lever rule above is **not** a general blend flash: endpoint saturated liquid and vapor of the overall composition do not constitute the two phases at every intermediate quality. Do not invent linear T(x) or linear h(x) for R407C. Use validated `(p,h)→T,x,ρ,s` surfaces or a resolved equilibrium mixture flash. Explicit-mixture `Q` is molar vapor fraction; the pinned backend supports `Qmass`, which should be used after its own validation. Manual conversion requires actual coexisting phase molecular masses. [CoolProp low-level treatment of two-phase derivatives and mixtures](https://coolprop.sourceforge.net/dev/coolprop/LowLevelAPI.html), [local feasibility evidence](research/coolprop-browser-feasibility.md)

Research these seven fluids now; release pure fluids only after passing their gates, and keep blends disabled with a coverage explanation until bubble/dew/interior states pass. Refrigerant GWP, regulatory eligibility and flammability are separate metadata requiring a dated authoritative source if displayed; stale EOS metadata must not become a safety classification.

## 4. Property architecture in a static browser

**Recommended planned approach:** use a small backend-neutral interface with **self-hosted direct CoolProp WASM first**, preferably in a worker with reused state objects and continuation/caching. The actual official 8.0.0 release was downloaded and tested locally: the final recorded browser run initialized in 90.2 ms and seven pure/pseudo-pure four-call batches had p95 0.4–0.7 ms on this machine; selected explicit mixtures also passed, with materially greater cost. Timings vary by run (earlier initialization: 126.6 ms). This bounded probe makes direct EOS practical enough to try before adding custom interpolation. It does not validate the coupled solver or full operating domain. [Observed artifact, hashes and results](research/coolprop-browser-feasibility.md)

**Conditional optimization:** if the coupled solver's measured cost warrants it, generate versioned, phase-separated tables offline, validate independent off-grid states, and ship the covered operating domain. Browser runtime has no network property API either way. Retain exact fluid/composition, units, reference convention, EOS revision, domain, errors, hashes and license notices; retain the generator/interpolator if tables are introduced.

If tables become necessary, for pure fluids store a saturation table on log(p), separate subcooled-liquid and superheated-vapor surfaces, and inverse `(p,s)→h` coverage for compression. Use monotone interpolation at phase boundaries. In two-phase states use validated saturation endpoints and the pure-fluid mass-quality formula. For blends generate a separate nonlinear two-phase surface; a pseudo-pure identifier merely existing is insufficient. Avoid interpolating cells across a phase boundary, unresolved near-critical gradient or invalid EOS region. Fail closed outside coverage; never extrapolate silently.

**Fact:** official CoolProp JavaScript documentation provides a JS/WASM pair and Emscripten build route; `.wasm` must be served correctly. Self-host assets on GitHub Pages and verify repository-subpath URLs. An unthreaded build avoids cross-origin isolation dependencies. Local static serving passed; actual Pages deployment, worker integration and coupled 1–5 branch timing remain future gates. [Official JavaScript wrapper](https://coolprop.org/coolprop/wrappers/Javascript/index.html), [local static-host evidence](research/coolprop-browser-feasibility.md)

CoolProp's native TTSE/bicubic documentation demonstrates phase-aware tabulation, but full-range tables have appreciable per-fluid storage and are not automatically a browser-ready compact asset. A custom limited-domain generator is a separate engineering deliverable and must earn its own error bounds. [CoolProp tabulation](https://coolprop.org/coolprop/Tabular.html)

Avoid hand-written Antoine-only models, ideal-gas refrigerant compression, constant refrigerant cp across condensation, or a fitted COP formula presented as first-principles simulation. Such approximations cannot yield simultaneously credible pressure, discharge temperature, phase and latent heat over seven fluids. Constant-cp approximations remain acceptable for air/metal within declared ranges.

## 5. The reversible refrigerant circuit

**Manufacturer fact:** the independently opened 2019 Daikin guide covers **3MXM52N2V1B**, a family reference rather than proof of the owner's N8 revision. Its p.29 schematic shows compressor, accumulator, outdoor coil, **four-way valve**, three outdoor branch EEVs, headers and common gas/liquid stop valves. §6.4.7 identifies a Schrader gas-stop-valve service connection. This supports one **common gas-side physical service port**, not invented branch taps. The paired field connections and single shared reverser support the two-pipe heat-pump abstraction; omitted auxiliary paths and exact N8 revisions remain unverified. [Daikin 2019 guide §6.4.7–8 and §12.2, p.29](https://www.daikin.eu/content/dam/document-library/Installer-reference-guide/ac/split/3MXM-N%2C%203AMXM-M%2C%203AMXF-A%2C%203MXF-A%2C%204MXM-N%2C%205MXM-N_4PEN600463-1_2019_10_Installer%20reference%20guide_English.pdf), [local schematic](research/sources/daikin-3mxm-n-schematic-page29-29.png)

**Planned abstraction:** reverser ports `D` compressor discharge, `S` compressor suction via accumulator, `O` outdoor gas-side header, `I` indoor gas-side header. Cooling pairs D↔O and I↔S; heating pairs D↔I and O↔S. Compressor always draws from S and delivers D. No arrow traverses D→S inside the four-way valve. EEVs throttle; they are not the cycle reversing valve. Stop valves are service isolation devices; do not portray them as modulating EEVs.

| Mode | Gas branch direction | Smaller “liquid” branch direction and state | Indoor/outdoor roles |
| --- | --- | --- | --- |
| Heating | Outdoor discharge header → room | Room condenser liquid → outdoor EEV → outdoor distributor | Indoors condense; outdoors evaporate |
| Cooling | Room vapor → outdoor suction header | Outdoor condenser → outdoor EEV → room; downstream EEV can be **two-phase** | Outdoors condense; indoors evaporate |
| Reverse-cycle defrost | Cooling-direction gas path | Cooling-direction smaller path | Outdoor coil receives condenser heat; indoor coils/source metal supply evaporator heat |

“Liquid pipe” is a manufacturer's connection name, not a guarantee of liquid everywhere in both modes. The outdoor-EEV placement matters: cooling field pipe downstream of that EEV can carry flash mixture, whereas heating field return carries high-pressure liquid before outdoor throttling. All phase overlays must come from local `(p,h)` state, including downstream flashing and line heat gains. Parallel branches share headers and common compressor; do not draw them in series. Each installed indoor unit has a paired larger gas and smaller liquid connection; inactive branches do not receive an invented proportional heat share.

An accumulator protects compressor suction in the physical circuit; the initial model enforces dry suction and treats its storage as omitted. It cannot simulate liquid slugging, inventory migration or equalization. Reversal is a state-machine transition with compressor interruption and retained coil energy. Until refrigerant inventory dynamics exist, pressures during interruption/reversal are “not modeled,” never an invented instant measured jump.

## 6. Enthalpy balance, efficiencies and COP

For the elementary adiabatic steady cycle, 1 is compressor inlet, 2 outlet, 3 condenser outlet, 4 expansion outlet:

```
h_2s = h(p_2,s_1)
η_is = (h_2s − h_1)/(h_2 − h_1)
h_2 = h_1 + (h_2s − h_1)/η_is
P_ref = ṁ(h_2 − h_1)
h_4 = h_3                            adiabatic throttling, negligible ΔKE/ΔPE
Q̇_evap = ṁ(h_1 − h_4)
Q̇_cond = ṁ(h_2 − h_3)
Q̇_cond − Q̇_evap = P_ref
```

These are an energy balance and isentropic-efficiency definition, not manufacturer curves. The NIST heat-pump test-apparatus report separately defines refrigerant-side compressor work, isentropic efficiency and volumetric efficiency; its refrigerant-side COP boundary is narrower than the product's complete electrical COP. [NIST TN 1895 §3.2](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1895.pdf) The NIST teqp example also demonstrates a simple EOS-based cycle; it is a useful regression concept, not a model of this Daikin. [NIST teqp heat pump recipe](https://pages.nist.gov/teqp-docs/en/latest/recipes/HeatPumpModel.html)

**Baseline assumption:** use an effective adiabatic refrigerant-rise η_is, then `P_comp,el=P_ref/η_drive`. Assign `P_comp,el−P_ref` to an explicit outdoor drive/shell loss ledger. This is a transparent reduced-order allocation, not a claim that all motor loss occurs outside refrigerant in a hermetic compressor. More detailed calibration can allocate motor heat to suction gas or discharge/shell with a separately identified shaft efficiency and thermal model; avoid double-counting a motor loss already embedded in a measured refrigerant-rise map. NIST CYCLE_D distinguishes isentropic, volumetric and motor efficiencies and offers explicit motor heat destinations. [NIST CYCLE_D user's guide](https://www.nist.gov/system/files/documents/2018/12/19/cycle_d_ver._6.0_users_guide.pdf)

```
P_total = P_comp,el + P_outdoor_fan + ΣP_indoor_fan + P_controls
          + P_crankcase + P_pan_heater + P_other_active_aux
COP_heating = ΣQ̇_room,net / P_total                  ordinary heating, positive output
COP_cooling = ΣQ̇_room,net_removed / P_total          total sensible + latent cooling
```

Fans ultimately add heat: indoor fan heat increases net room heating and decreases net cooling; outdoor fan/drive loss is outdoor heat. Use the fan location to compute post-fan outlet air. A fan speed changes airflow, UA and electrical consumption, not just particle-animation speed. The fan affinity cube law is an idealized same-system scaling assumption, not a measured ECM map; include a measured map or label its uncertainty. Crankcase/pan heaters draw power only under their stated generic or sourced controls.

Instantaneous COP is undefined at zero electrical input; display “—.” During defrost show signed room heat transfer and “Defrost”; suppress an ordinary positive heating-COP label or label a signed net ratio explicitly. Over a heating scenario report `net room heat delivered / total electrical energy`, including interruptions, standby and negative defrost room heat. Do not average instantaneous COPs. EER and SEER/SCOP use specific units/test/bin procedures; never relabel one instantaneous simulated COP “SCOP.”

With pipes/metal/ice included, apply the global ledger, not `Q_room = Q_out + P_total` with all losses ignored. At a mixing header, `h_mix = Σṁ_i h_i/Σṁ_i`; pressure equalization and dissipation must preserve energy. Heat/power fields are powers; cumulative heat/energy fields require integration and different units.

## 7. Heat exchangers, area and airflow

Area definitions are not interchangeable: primary tube outside area, refrigerant-side wetted area, fin area, total air-side finned area, and frontal face area. **UI requirement:** every m² value names which area, measurement/source or estimate method. Equipment casing width×height is not finned surface. Finned area can greatly exceed frontal area; nominal kW does not determine it uniquely.

Use `UA`, the overall conductance after film resistances, wall conduction and fin efficiency. A dry simplified resistance network is

```
1/UA = 1/(η_o h_air A_air) + R_wall + 1/(h_ref A_ref) + R_fouling
```

Each h here is a heat-transfer coefficient [W/(m²·K)], distinct from refrigerant enthalpy h [J/kg]. In code use unambiguous identifiers. U only has meaning relative to its declared reference area. Editing area with constant geometry coefficients is an **assumed scaling** of UA; offer independent expert UA and area/provenance rather than pretending two independent sliders both determine the same exchanger.

For a constant-temperature pure-fluid two-phase segment exchanging dry air:

```
C_air = ṁ_air c_p,air
NTU = UA/C_air
ε = 1 − exp(−NTU)
Q̇ = ε C_air (T_ref − T_air,in)              signed heat delivered to air
```

It is not valid to extend the constant-T formula across desuperheating, subcooling, gliding mixture condensation or wet/frost air transfer. Use a few axial segments/zones, splitting at phase transitions, and march air and refrigerant with a stated crossflow/counterflow approximation. Enforce sensible temperature approaches/pinches; no segment can transfer finite heat at the wrong gradient. Integrate coil-metal capacitance separately so a switched/stopped compressor does not instantly erase stored coil heat.

Outlet air temperature follows energy and dry-air mass flow; it is not refrigerant condensing temperature. Air volume flow [m³/h] must be converted through density to dry-air mass flow for psychrometrics. Outdoor outlet air cools during heating and warms during cooling, except where a local frost/melt transient changes the energy allocation. Zero airflow has a separate natural-convection path; division by zero is not a valid stopped-fan model.

## 8. Rooms, heat leakage and moisture

Room dimensions give volume V, air mass and geometric surface candidates; they do not specify wall insulation or thermal mass. Use independent envelope heat-loss conductance H [W/K], ventilation rate and fabric capacity. If H includes ventilation, do not add that same ventilation sensible loss again.

**Planned minimum:** a two-node air/fabric network per room. A one-node “room air only” capacity makes temperature respond unrealistically fast; inflating air capacity without disclosure hides the model. Let air temperature T_a and fabric T_m have capacities C_a,C_m [J/K], conductances H_am,H_ao,H_mo [W/K]:

```
C_a dT_a/dt = Q̇_HVAC,sensible + Q̇_gains,a + H_am(T_m−T_a)
              + H_ao(T_out−T_a) + Q̇_vent,sensible
C_m dT_m/dt = Q̇_gains,m + H_am(T_a−T_m) + H_mo(T_out−T_m)
```

These T equations explain the sensible RC network, not the complete moist-air energy integration. The authoritative coupled `(H_air,w)` equations and declared constant-pressure reservoir approximation are in model-specification §6. H_am transfers equal/opposite energy between nodes. Effective steady envelope conductance is `H_ao + H_am H_mo/(H_am+H_mo)`, not the sum of all three. Use this relation when mapping a simple “Heat loss [W/K]” slider to the network. Keep inter-room transfer absent initially unless explicitly modeled; each indoor unit serves one room, while compressor capacity is shared. Solar/internal gains may be explicit scenario inputs or a declared zero assumption.

Track humidity ratio independently:

```
m_da,room dw/dt = ṁ_da,vent(w_out−w_room) + Ġ_water
                  − ṁ_condensate + ṁ_reevaporation
```

For the caloric approximation at near-atmospheric pressure, with T_C in °C:

```
p_v = RH · p_sat(T)
w = 0.621945 p_v/(p_ambient−p_v)
h_air ≈ 1006 T_C + w(2501000 + 1860 T_C)         J/kg dry air
```

RH is fraction 0–1, not percentage in this equation. Use saturation over water for liquid dew-point/condensate and saturation over ice for frost deposition. The simple caloric equation is a declared approximation; validate humidity transformations and saturation functions against a humid-air reference. CoolProp documents dry-air versus humid-air enthalpy/volume conventions; mixing them causes mass-flow errors. [CoolProp humid air](https://coolprop.org/fluid_properties/HumidAir.html)

Heating ordinarily changes RH by warming air at nearly constant w; it does not actively remove water merely because RH falls. Cooling dehumidifies when a surface is below the incoming dew point. A wet-coil approximation uses an apparatus-dew-point surface and bypass/contact factor, then computes outlet h and w together. EnergyPlus documents an ADP/bypass treatment for DX coils; its performance modifiers remain separate empirical closures and must not be imported without their data. [EnergyPlus coils engineering reference](https://energyplus.readthedocs.io/en/stable/guides/engineering-reference/15.2-coils.html)

For condensation, `ṁ_cond=ṁ_da(w_in−w_out)`. Exact steady air-side heat into the coil is `ṁ_da(h_in−h_out)−ṁ_cond h_liquid,drain`, using liquid enthalpy on the same water reference. Include drain enthalpy instead of charging latent heat twice. Net HVAC removal from the room air stream is the moist-air enthalpy drop; condensate carries the remaining liquid energy away. Room temperature integration uses the sensible part, with the latent energy represented by evolving water content. Prefer conserving total moist-air energy and moisture then recovering T, or include all composition terms explicitly. Never apply total cooling to sensible room capacity while also subtracting water.

No unmodeled clamp of RH to 100%: if room air reaches supersaturation, either conserve mass/energy with a room-condensation reservoir or report that scenario outside supported room conditions. Off-cycle condensate re-evaporation is optional initially only if the simplification is declared; outdoor retained water/refreezing is mandatory for repeated frost cycles.

## 9. Frost and defrost are part of the energy model

Frost is determined by **surface** temperature and moisture availability, not just outdoor dry bulb. A coil can frost above 0°C outdoor air when its surface is colder; very cold dry air may supply little water. Require surface below freezing and incoming vapor partial pressure above ice saturation. A heat/mass transfer analogy or calibrated contact effectiveness gives an attainable deposition rate, bounded by air moisture supply. Frost increases thermal resistance and can reduce air passage; its density, conductivity and blockage law are uncertain model parameters, not Daikin measurements.

**Scientific precedent:** a published lumped frost/retained-water model tracks film energy and mass through deposition, melting, drainage and refreezing, coupled to refrigerant and metal control volumes. It demonstrates why retained water cannot simply vanish after defrost. Its automotive flat-tube parameters must not be transplanted as household-coil calibration. [Ma et al., frost/defrost model with retained water](https://arxiv.org/html/2412.00017v1)

**Planned conservative reduction:** track outdoor deposited/retained water mass M and water/ice enthalpy E_f, plus outdoor metal energy. Use liquid water at 0°C as zero enthalpy:

```
h_ice(T_C) ≈ −L_f + c_ice T_C
h_liquid(T_C) ≈ c_water T_C
L_f ≈ 333500 J/kg, c_ice ≈ 2100 J/(kg·K), c_water ≈ 4180 J/(kg·K)
```

These are chosen approximate near-freezing constants, not full water EOS functions. **Primary-source check:** the NIST table gives fusion enthalpy 333.4 J/g and ice cp 2.10 J/(g·K) at 0°C; 333.5 kJ/kg here is a rounded modeling constant differing by ~0.03%, not an exact quotation. Constant ice cp is less accurate farther below freezing. [NIST ice/water table, pp.1–2](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=926353)

At `E_f < −M L_f`, all water is ice and T_f follows sensible ice enthalpy. At `−M L_f ≤ E_f ≤ 0`, T_f=0°C, `M_ice=−E_f/L_f`, `M_liquid=M−M_ice`. At E_f>0 all is liquid and its T follows liquid sensible heat. This enthalpy state avoids a temperature jump through melting and naturally requires energy for refreezing.

Air loses water vapor mass to M. The correct coupled balance is `dE_f/dt = Q̇_air_to_film + Q̇_metal_to_film + water mass enthalpy terms`, with each boundary flux counted once. One convenient convention computes `Q̇_air_to_film=ṁ_da(h_in−h_out)` **including** deposited or evaporated vapor energy; do not add vapor enthalpy or remove evaporation latent heat again. Drainage separately removes liquid mass and its outgoing enthalpy from E_f. Alternatively split sensible/latent heat and vapor enthalpy explicitly, consistently. Equal/opposite metal coupling appears in the metal equation. Frost latent release is not a free additional heat source after moist-air enthalpy difference is counted.

Minimum energy to turn initially subzero ice into 0°C water is `M_ice[c_ice(0−T_ice)+L_f]`, before heating metal, heat loss and drainage temperatures. For example **analytical illustrative calculation**, 1 kg ice at −5°C needs approximately 344 kJ (0.0956 kWh) for the ice alone. A 60-second melt would require at least 5.73 kW directed into that ice; not a prediction for this machine. Ice cannot disappear when a timer expires.

Reverse-cycle defrost reverses refrigerant flow: outdoor coil becomes condenser, indoor source coil becomes evaporator. Compressor power plus indoor/coil-source heat supply outdoor defrost heat, less losses. Typically fans are reduced/stopped, but the model must still provide a finite natural-convection/metal heat source and solve capacity; it cannot retain normal fan UA while displaying “fans off.” Include temporary negative indoor heat, stored metal energy, warm-up and interrupted delivery. A pan heater or resistance defrost consumes explicit electrical energy and is not equivalent to cycle reversal.

**Generic control assumption:** trigger on estimated blockage/UA degradation with minimum runtime and optional maximum-time safeguard; terminate on sufficiently depleted ice and a positive coil temperature, followed by drainage/warm-up. Sensor thresholds, EEV commands, minimum/maximum durations and fan sequences for the owner's unit are **unknown**. A failed melt or unsustainable cycle reports a fault/degraded state and retains mass/energy; it does not force completion to make animation convenient.

## 10. Inverter operation, pipes and integration

Variable compressor speed changes mass flow approximately through suction density, swept volume and volumetric efficiency: `ṁ≈ρ_suction V_disp n η_vol`. This is a first closure, not a calibrated inverter map. Isentropic/volumetric/drive efficiencies and compressor envelope generally vary with pressure ratio and speed. Start with exposed generic constants plus bounded operating envelope; add manufacturer/measured maps only with provenance. Room thermostats request loads; shared compressor capacity is allocated among active branches, then EEVs regulate branch thermodynamic targets. Capacity is neither the sum of indoor model-number capacities nor a guarantee each room receives its request.

Below stable minimum speed, model cycling/hysteresis, compressor restart delays and retained coil/room energy. A generic demand controller must be labeled as such. No invented Daikin algorithm, perfect simultaneous setpoint tracking, or fixed part-load bonus. Heating and cooling cannot coexist in different rooms in the supported two-pipe topology. A room asking for the opposing mode receives no active delivery and a clear mode-conflict status.

Physical pipe length, **inside** diameter, elevation and insulation are independent of drawn path. Single-phase Darcy–Weisbach pressure loss uses friction, fittings and hydrostatic sign; line heat exchange changes h through `ṁ dh=Q̇_line`. Two-phase loss requires an identified correlation or explicitly low-confidence homogeneous approximation; void fraction/slip and oil are unresolved. Cooling's outdoor-EEV small pipe can be two-phase, so a liquid-only resistance formula everywhere is wrong. Manufacturer pipe sizes often specify outside diameter; wall thickness is needed to compute flow area. Different refrigerants require compatible generic hardware, not merely replacement pressure labels.

Time acceleration multiplies simulated elapsed time, **not** capacities, flow, controller gain or Δt limits. Integrate fixed/adaptive small physics steps using a wall-clock accumulator, then render less often. Pause freezes physics. A hidden tab must follow a declared pause or bounded catch-up rule. Split mode events and melt completion within a step; no negative masses from taking a long accelerated frame. Integrate powers into energy with physical seconds; 1× and 10× must yield the same state at equal simulated time to solver tolerance. UI arrow speed is a visual encoding with its own maximum and never changes mass flow.

## 11. UI–science contract

Until validation, display **“Illustrative data — model not validated”** next to the global readings and inspector; charts use **“Illustrative scenario”**. Controls may demonstrate linked presentation, but cannot claim property-backend execution. A preset bearing a manufacturer name says **“Owner preset; estimated internal parameters”**. Every synthetic parameter/result has `illustrative` provenance in UI data.

| Exact label | Meaning / units |
| --- | --- |
| Heat delivered to rooms [kW] | Net air-side heating, after indoor fan heat and transient storage |
| Cooling removed from rooms [kW] | Total sensible + latent net cooling; sensible split separately |
| Total electrical input [kW] | Compressor + all active fans/heaters/controls |
| Heating COP / Cooling COP | Correct current-mode boundary; “—” if undefined; no normal heating COP during defrost |
| Refrigerant-side condenser heat [kW] | Separate diagnostic, not interchangeable with room delivery |
| High-side pressure [bar(a)] / Low-side pressure [bar(a)] | Absolute defaults; explicit bar(g) alternative and ambient pressure |
| Isentropic efficiency ηis [%] | Enthalpy-rise definition in §6, not total machine efficiency |
| Drive/motor efficiency [%] | Separate electrical conversion assumption |
| Air-side finned surface [m²] | Named area; provenance source/estimate; UA separate |
| Overall conductance UA [W/K] | Effective transfer resistance, distinct from area |
| Air inlet / Air outlet [°C] | Air temperature; fan location and moisture treatment defined |
| Refrigerant temperature [°C] | Local thermodynamic state, not outlet air |
| Vapor mass quality x [%] | Two-phase only; “—” for single-phase or unsupported blend |
| Superheat [K] / Subcooling [K] | Local dew/bubble references |
| Room volume [m³] / Heat loss [W/K] / Fabric capacity [kJ/K] | Geometry, leakage and thermal inertia remain distinct |
| Relative humidity [%] / Humidity ratio [g/kg dry air] | RH source outdoor/room stated |
| Condensate [kg/h] / Frost ice mass [kg] | Water flows versus accumulated water distinguished |
| Defrost heat to outdoor coil [kW] / Melt energy used [kWh] | Heat/power boundary and accumulation explicit |
| Branch pipe length [m] / Tube outside diameter [mm] | Field-pipe geometry; thickness/inside diameter in advanced configuration |

Encode **phase independently from temperature**: vapor `#9B7BFF` (purple), liquid `#35C5B6` (teal), two-phase `#F4B860` (amber with dots/hatching), unsupported/off/transition `#8C98A8` (gray). Use line pattern/text so color is not the sole cue. A separate numeric/gradient overlay represents temperature. Warm vapor, cold vapor and warm liquid remain identifiable; blue is never a universal “gas” color. Flow arrows indicate signed local flow and disappear when no flow is modeled.

Reverser reads **“4-way reversing valve”**, has four connected ports D/S/O/I and displays actual mode pairing. Branch throttles read **“EEV A/B/…”**; their outdoor location should reflect manufacturer schematic for the owner preset. Show gas and liquid stop valves as distinct service devices. Gas service ports stay at their physical connections while pressure role changes with mode. Any extra tap is labeled **“Virtual diagnostic tap”**. Illustrate accumulator and outdoor distributor/header; detail omitted auxiliary devices in a schematic note rather than inventing connections. All room branches have paired pipes.

An honest mockup scenario can show **R32, heating, outdoor 3°C/85% RH, indoor 20°C, setpoint 21°C**, with an explicitly illustrative cold surface and frost; it cannot infer frost rate or pressure from these inputs alone. A paired cooling mockup can use outdoor 32°C/50% RH, indoor 27°C/55% RH and setpoint 24°C. Sample high/low pressures, refrigerant temperatures and compressor readings must come from one internally coherent illustrative cycle or be left “—”; do not fabricate apparently validated Daikin telemetry. Demonstration kW/COP must satisfy their displayed arithmetic boundaries. Defrost must visibly reverse flow, show retained ice/meltwater and interrupt room heating. Its time may be an animation demonstration, clearly labeled.

## 12. Extension boundaries

Charge/leaks require conserved refrigerant/component inventories and phase volumes, with blend fractionation; the quasi-steady baseline cannot support them by scaling capacity. Oil transport/return requires additional species and slip/entrainment closures. Three-pipe heat recovery requires different topology, branch selectors and simultaneous high/low pressure operation. Domestic hot water adds another load/exchanger and controls. Save/share/export require schema versioning and property asset identity. Exhaustive catalogues require licensed, dated data ingestion. None is implemented in this milestone.

Missing calibration data include exact indoor suffixes, actual airflow/fan maps, compressor maps/envelope, coil geometry/UA and metal mass, refrigerant-side HTC/circuiting, EEV characteristics, indoor bypass/wet-coil behavior, pipe wall thickness/insulation/elevation, frost density/blockage/drainage behavior and real control thresholds. Publish these gaps alongside any future nominal-fit result; do not hide them behind decimal precision.
