# Reference moisture and operating-envelope robustness

This is a generic reduced model, not a manufacturer controller or resolved wall/coil ice model. The conserved refrigerant model remains unavailable publicly.

Room air stores total dry-air-basis enthalpy and water, including retained liquid/ice. A bounded native humid-air equilibrium flash separates vapor and retained phase without clipping relative humidity or inventing drainage. Ventilation and coil contact use the gas state; returned outlet mist remains in the room total. Retained condensate represents a lumped reservoir, not a calibrated wall moisture buffer. Volume and atmospheric-pressure edits re-equilibrate these stores and retain the existing configuration-impulse accounting.

Cooling antifreeze uses declared generic 2°C stop and 5°C release thresholds. Fan warming uses the actual thermal ledger. A prospective metal-temperature check can discard a freshly solved algebraic cycle before work/heat is committed. Reference has no stored refrigerant state to remap. Independent discharge, pressure-ratio, condensing-temperature and antifreeze latches preserve every outstanding recovery requirement through overlapping triggers and stopped intervals. Heating mode explicitly cancels the cooling-only latch.

Optional catalogue volume flow is converted with native inlet specific volume in m³/kg dry air. No nominal density is substituted. Source high-fan volume flow applied across modes remains an explicit catalogue assumption.

Idealized heating may select a second declared control regime: 1 K positive minimum lift with floating actual subcooling, rather than forcing the target subcooling when the warm source/cold sink makes it infeasible. Actual finite-UA branch outlets and their mixed PH header close the original equations. The field-line regime is unchanged. This is an alternate controller policy, not a proved universal complementarity law.

The generic condensing governor starts derating at 60°C, stops at 63°C and releases at 59°C; the existing 65°C hard property boundary is unchanged. Cold pressure-corner seeds improve nonlinear initialization without changing acceptance tolerances.

An already-held Reference drive can use a thermal-boundary estimate to maintain its hold without attempting an infeasible cycle on every idle interval. Heating uses the coldest active sink compatible with the floating mixed-header regime. The estimate is a declared control assumption, not a proven global minimum-discharge bound or sensor. Native input bounds are checked; a discharge enthalpy comparison avoids constructing a PH state above the selected temperature limit. Recovery still requires a freshly closed operating cycle. No solver exception is converted into a protection hold, and no stale cycle is used for heat or work.

Final acceptance requires source-pinned focused tests, broad native regression and retained-failure replay. Earlier 73/73 and 10/12 campaign receipts refer to intermediate source and do not certify this final version. The friend's generic worker-fatal screenshot remains unreproduced; these fixes do not establish its native-abort cause.
