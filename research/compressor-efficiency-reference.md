# Compressor isentropic efficiency reference

Research snapshot: 2026-10-11. Scope: the illustrative browser model, with attention to the Daikin 3MXM52N8 and residential inverter rotary/scroll compressors. This is not a compressor map or a validation of any named heat pump.

## Finding

The public primary sources reviewed do not establish a measured isentropic-efficiency value, range, or map for the Daikin 3MXM52N8, nor a transferable value for current Daikin or Mitsubishi Electric residential inverter compressors. Treat the 3MXM52N8 ηis as **unknown**. Manufacturer combination tables publish heating/cooling capacity and electrical input at specified combinations and operating points; those are complete-system results and do not identify refrigerant-side compressor work, refrigerant mass flow, compressor inlet/outlet states, or compressor-only power. They therefore cannot be inverted into ηis without additional measurements and boundary assumptions. The Daikin combination sheet is useful for product behavior, not compressor calibration: [3MXM52N8 combination data, Daikin PDF](https://www.daikin.es/content/dam/MDM/TechnicalDrawings/Split/3MXM-N8/EN/3MXM52N8_comb_3D105372E_EN.pdf).

The strongest nearby quantitative research found compares rotary and scroll compressors installed in R410A split heat-pump systems under AHRI test conditions. It reports relative ηis differences between those tested units (from −5.4% to +14% depending on capacity and mode), not an absolute value applicable to the 3MXM52N8 or a universal residential range. It also reports separate volumetric-efficiency and seasonal-system results, reinforcing that these are distinct measures. [Li et al., “Comparative Studies of Scroll and Rotary Compressors for US Market Heat Pumps and Air Conditioners,” Purdue International Compressor Engineering Conference, 2021](https://docs.lib.purdue.edu/icec/2664/).

Mitsubishi Heavy Industries (MHI), a company distinct from Mitsubishi Electric, published an engineering paper on a 3-HP R410A DC twin-rotary compressor for commercial air conditioners. It describes geometry and motor improvements and gives relative improvement claims, rather than a transferable ηis map. This is mechanism context, not evidence for the Daikin 3MXM52N8 or a Mitsubishi Electric domestic unit. [Miura et al., “Small and High-Efficiency 3-HP DC Twin Rotary Compressor,” Mitsubishi Heavy Industries Technical Review, vol. 48, no. 2, June 2011](https://www.mhi.com/technology/review/sites/g/files/jwhtju2326/files/tr/pdf/e482/e482023.pdf).

## Definitions and model boundary

For the model's adiabatic refrigerant compression step, with inlet state 1, actual outlet state 2, and ideal isentropic outlet 2s at the same discharge pressure:

```text
ηis = (h2s − h1) / (h2 − h1)
P_ref = ṁ (h2 − h1)
```

This is refrigerant enthalpy-rise efficiency. It is not motor/drive efficiency, volumetric efficiency, or heat-pump COP. Volumetric efficiency determines refrigerant flow relative to suction density, displacement, and speed; motor/drive efficiency converts electrical input to compressor work under the chosen model boundary; COP is useful heating or cooling divided by electrical input at a stated system boundary. NIST's CYCLE_D documentation takes isentropic, volumetric, and motor efficiencies as separate inputs and treats motor waste heat separately, supporting this distinction. [NIST CYCLE_D User's Guide, version 6](https://www.nist.gov/system/files/documents/2018/12/19/cycle_d_ver._6.0_users_guide.pdf).

NIST's cycle-comparison paper uses ηis = 0.65, volumetric efficiency = 0.82, and electric-motor efficiency = 0.85 as **CYCLE_D input data** in Table 4. The paper's actual title is “Performance of a finned-tube evaporator optimized for different refrigerants and its effect on system efficiency,” by Piotr A. Domanski, David Yashar, and Minsung Kim; it was published online in 2005. The values are simulation inputs, not measurements of a modern inverter unit or a recommended default. They show that values in this neighborhood can be used as explicit cycle-model assumptions, not that a particular value is known for a product. [Domanski, Yashar & Kim, NIST-hosted paper, Table 4](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=910428).

Official CoolProp documentation describes thermophysical property calculations and its simple compression-cycle example accepts `eta_com` as an input. CoolProp supplies refrigerant state properties needed to calculate ideal and assumed actual states; it does not supply a manufacturer's compressor ηis map. [CoolProp simple compression-cycle API](https://coolprop.org/apidoc/CoolProp.Plots.SimpleCyclesCompression.html), [CoolProp scope](https://coolprop.org/).

## Decision for the simulator

Keep the current **70%** value as a declared, fixed, generic educational assumption if the model needs one; available evidence does not justify replacing it with another fixed number. Do not label it manufacturer-known, measured, or representative of the Daikin 3MXM52N8. Its evidence quality is **low for predicting a named product** and **adequate only as a transparent illustrative parameter** in this reduced-order model. The available research supports that compressor efficiencies are operating-condition- and compressor-dependent; a single constant is not a calibrated inverter map.

If a product-specific ηis is later needed, require compressor-level measurements or a manufacturer-provided compressor map with refrigerant, speed, suction/discharge states, superheat, and stated power boundary. System COP or electrical input alone is insufficient. Keep the model's ηis, volumetric-efficiency, and drive-efficiency inputs separately named and accounted for.
