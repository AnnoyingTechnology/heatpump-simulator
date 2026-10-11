# Sensible ventilation recovery

`RoomConfig.ventilationRecoveryEfficiency` is optional and bounded to [0, 1].
Omission or zero preserves the existing single-flow thermal model. The gross
`ventilationACH` still determines the balanced dry-air exchange rate
`md = roomDryAirMass * ACH / 3600`; effectiveness never changes that rate.

The room boundary receives

```
Cmin = min(md * cpOutdoor, md * cpRoom)
qVent = md * (hOutdoor - hRoom) + eta * Cmin * (Troom - Toutdoor)
waterVent = md * (wOutdoor - wRoom)
```

This is the standard sensible effectiveness/Cmin relation for balanced supply
and exhaust streams. The signed correction warms winter intake and cools
summer intake. Both inlet heat capacities are evaluated at the actual gas
states, with CoolProp `C` in J/(kg dry air K); `H` and `W` use the same dry-air
basis. Inlet heat capacities are held constant for this algebraic exchanger
estimate, rather than integrating their temperature variation through a core.
Thus effectiveness one limits the modeled sensible transfer by Cmin; it does
not remove unequal-humidity enthalpy exchange.

The correction enters the existing ventilation energy boundary once. It does
not enter compressor-delivered heat, COP, or electricity. Gross vapor exchange
is unchanged. The existing room phase flash accounts for any resulting room
liquid/ice storage, including saturated outdoor intake at 45 C. No cooled
virtual supply gas is submitted to the humid-air EOS: such a gas could be
supersaturated. This is a prescribed sensible recovery model, not an exchanger
phase-change model. Core condensation/drainage, frosting, latent transfer,
bypass, unbalanced streams, and ventilation fan power are not resolved.

The controller's existing sensible demand estimate uses its existing constant
1006 J/(kg dry air K), scaled by `(1 - eta)` for ventilation only. It remains a
demand estimate; the energy ledger uses the native inlet Cp/Cmin formula above.
Proposed owner UI defaults of gross 0.5 ACH and effectiveness 0.8 are explicit
scenario assumptions, not measured device performance or reduced water flow.

References checked for this change:

- [EnergyPlus Engineering Reference, heat exchangers](https://energyplus.readthedocs.io/en/stable/guides/engineering-reference/16.8-heat-exchangers.html): supply temperature uses sensible effectiveness times the minimum stream heat-capacity rate divided by the supply rate.
- [CoolProp humid-air properties](https://coolprop.org/fluid_properties/HumidAir.html): `C`, `H`, and `W` property bases.

`tests/engine/ventilation-recovery.test.mjs` checks native Cp against a dry-basis
enthalpy derivative, both heat-transfer directions, Cmin effectiveness bounds,
latent-only exchange, gross water identity at a frozen state, room energy/water
conservation with active HVAC, omission/zero compatibility, transactional
configuration validation, and high-effectiveness saturated-intake phase storage.
