# Average envelope U, estimated exposed area and parallel interzone paths

The engine accepts one lumped envelope conductance H per room, in W/K. The frontend's primary insulation input is an **effective average U in W/(m² K)**, with **H = U × exposed envelope area**. This represents the existing lumped envelope model; it does not resolve individual materials, windows, thermal bridges, ground coupling or roof construction. Ventilation, internal gains, window solar gains and interzone heat transfer remain separate.

## Automatic exposed-area estimate

For floor area A and mean ceiling height h, the starting estimate is a square box:

`area = 2 × A + 4 × sqrt(A) × h`

A linked shared interface removes its opening plus solid contact area from the estimated exterior envelope. Vertical links infer ceiling/floor from the top-to-bottom room stack. Horizontal links infer left/right walls from the same ordering; this is an inferred layout, not a measured orientation. A deduction is capped to the corresponding room face. Multiple connections on the same face use their maximum shared area, under a conservative overlapping-footprint assumption, rather than adding deductions for potentially overlapping surfaces. Off indoor units still belong to the house and retain their shared surfaces.

This deliberately simple estimate does not invent a gabled attic, buried ground area or resolved site geometry. Its positive optional `envelopeAreaOverrideM2` covers an owner's better estimate; null restores Auto. Interface geometry can exceed a smaller room's face, as in the owner's stated common 7 × 7 m footprint, but that room's exterior deduction never exceeds its own face. Shared interface conductance remains a separate prescribed connection; the area cap does not secretly rescale it.

The owner's provisional whole-room conductances remain **15 W/K attic, 25 W/K upstairs and 45 W/K ground**. U is initialized only after both shared interfaces exist, without rounding:

| Room | Volume m³ | Estimated exposed area m² | Effective average U W/(m² K) | H W/K |
| --- | ---: | ---: | ---: | ---: |
| Attic | 84 | 91.89502140642983 | 0.16322973508715521 | 15 |
| Upstairs | 155 | 94.98339722334595 | 0.26320389384698967 | 25 |
| Ground | 100 | 104.76521771955248 | 0.4295318711641601 | 45 |

These are calibration hypotheses, not measured fabric properties or regulation-certified U values. Nothing is fitted to force a particular electrical input or COP.

Dimension, shared-area and exposed-area-override edits retain U and recalculate H. Advanced whole-room H edits rebase U to H/current exposed area. The legacy volumetric G API remains compatible by rebasing U from H = G × volume. `Store.update` prioritizes an explicitly changed U, then an explicitly changed H, then a legacy G edit; otherwise it retains U. It synchronizes the whole-room `heatLossWPerK` cache and legacy `envelopeQualityWPerM3K`. Runtime derivation passes the complete house configuration, because shared faces cannot be reconstructed from an isolated room alone. Legacy configurations without U retain their existing whole-room H/G behavior.

## Ventilation and the whole-house reference ruler

The global ventilation input distinguishes single-flow ventilation from dual-flow sensible heat recovery. The owner's chosen defaults are **0.5 gross air changes/hour and 75% sensible recovery** in dual mode. These are declared scenario assumptions, not measured ventilation rates or a published efficiency for the owner's ventilation unit. A per-room gross ACH override remains possible. Single mode uses zero recovery while retaining the stored dual efficiency for later switching. Legacy configurations without global ventilation retain a room ACH or the prior 0.25 ACH fallback and zero recovery.

Runtime sends gross `ventilationACH` and `ventilationRecoveryEfficiency` separately. The engine retains gross dry-air and water-vapour exchange: recovery adds a prescribed sensible-energy correction to the ventilation boundary, without scaling ACH or vapor flux at the same inlet/room state. The room equilibrium flash retains any resulting room condensate/ice and conserves total energy/water. Core condensation/drainage/frost, latent transfer, bypass and ventilation fan power are not modeled. Each room has its own balanced exchange estimate; central exhaust mixing, duct routing and separate unrecovered infiltration are not resolved. The frontend does not implement a second ventilation physics model.

`houseEnvelopeSummary` sums envelope H for every active room, including Off indoor units. Its nominal ventilation sensible estimate is:

`Hvent = 0.34 × volume × grossACH × (1 − recoveryEfficiency)`

The coefficient 0.34 Wh/(m³ K) is a declared representative air volumetric heat capacity, not the worker's instantaneous moist-air or latent heat flux. Default house values are **85 W/K envelope + 14.4075 W/K nominal ventilation = 99.4075 W/K**. Internal gains and interzone transfers are excluded. The eight user-supplied historical RT/RE midpoint examples belong on this whole-house reference ruler. They must not be silently converted into per-room insulation grades or certification claims.

## Parallel interzone paths

Each modern link has simultaneous distinct parallel areas: an opening and insulated solid contact. The owner's stated 7 × 7 m common footprint gives a 4 m² opening for the 2 × 2 m stairwell and 45 m² remaining solid floor, with 120 mm glass wool between both floor pairs:

`Hlink = openingAreaM2 × openingTransferWm2K + contactAreaM2 / (0.26 + insulationMm / 1000 / 0.040)`

The default is **173.8036809815951 W/K** per floor pair: 160 W/K opening plus 13.8036809815951 W/K solid contact. Glass-wool conductivity 0.040 W/(m K) and combined surface-film resistance 0.26 m² K/W are representative assumptions, not measured layers. The opening coefficient 40 W/(m² K) remains an editable effective sensible parameter. This does not resolve buoyancy or transport air/moisture between rooms. Orientation changes geometry and presentation, not the symmetric H × temperature-difference law.

Opening/contact areas can independently be zero; a zero-conductance connection remains editable until explicitly removed. The areas describe nonoverlapping portions of the interface. An advanced direct H edit is explicit `conductanceOverrideWK`. Changing either area, thickness or opening coefficient clears that override; orientation-only edits retain it. The legacy exclusive kind/area/coefficient API remains available for older inputs.

## Shared coil cleanliness

The default clear-air-passage setting is **95%**, permanently shared by outdoor and all indoor coils. Legacy per-coil override fields remain deprecated compatibility inputs, but runtime and display helpers ignore them and every store update clears them to null. There is no hidden unbinding. Standalone engine coil parameters remain available to native engine users; this frontend deliberately exposes one shared control.

Live interzone powers remain worker-produced from accepted temperatures and canonical H. These frontend inputs do not modify refrigerant, compressor or COP laws, and do not bypass the conservative energy/water ledger.
