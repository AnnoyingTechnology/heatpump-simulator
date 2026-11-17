# ARXM50A5V1B operating-range investigation — 2026-11-17

The exact Daikin France ARXM-A product table prints the ARXM50A5V1B column as cooling maximum `50 (1), 46 (1)` °C dry bulb and heating minimum `-21 (1), -15 (1)` °C wet bulb. Footnote (1) points to a separate operating-range drawing. That drawing was not exposed in the manufacturer's product-page documentation list during this review.

The current Daikin France installer reference guide 4PFR766272-2F (2025) states broad ambient limits for ARXM50 of cooling −10…50 °C dry bulb and heating −20…24 °C dry bulb. Those are broader guide conditions and do not identify which of the product table's paired cells applies to the exact A5V1B row, nor provide the cited drawing. They cannot replace the two missing table endpoints or their wet-bulb condition.

The candidate and runtime therefore keep `coolingOutdoorMaximum` and `heatingOutdoorMinimum` null. Cooling minimum −10 °C dry bulb and heating maximum 18 °C wet bulb remain source-backed. No alternate endpoint is selected.
