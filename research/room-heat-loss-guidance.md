# Room heat-loss input: evidence and wording

Research date: 2026-10-10. Scope: assess whether the supplied age-band values can be presented as room heat-loss coefficients. This is research guidance for the simulator UI, not a compliance calculation or a validated building model.

## Finding

Room floor area and ceiling height determine the displayed room volume, `V = area × height`. They do not determine its heat-loss coefficient `H` in W/K. The coefficient depends on which boundaries actually lose heat, their areas and thermal transmittances, thermal bridges, and air exchange. Two equal-volume rooms can have very different `H` values (for example, an internal room versus a corner room with windows and a roof).

The supplied ranges—pre-1974 650–850, RT1974 400–600, RT1982 350–480, RT1988 300–400, RT2000 240–340, RT2005 200–300, RT2012 110–180, RE2020 80–150 W/K—could not be substantiated as French normative values, either per room or per square metre/volume. They have no stated reference size, exposed-area ratio, geometry, ventilation assumption, or renovation state. Do not label them as values prescribed by RT/RE regulations or apply them directly to an arbitrary room. Preserve them only as owner-supplied, unverified scenario bands if the interface needs those presets; label the reference basis as unspecified and make no compliance claim.

## Calculation basis supported by French sources

For transmission, a useful simplified room-level form is:

```text
Hroom ≈ Σ(bᵢ Uᵢ Aᵢ) + Σ(bⱼ ψⱼ Lⱼ) + Σ(χₖ)
```

where each boundary is weighted for its adjacent environment (`b`), `U` is in W/(m²·K), area `A` in m², linear bridge coefficient `ψ` in W/(m·K), length `L` in m, and point bridge `χ` in W/K. Add ventilation/infiltration heat loss, commonly represented in simplified form as approximately `0.34 × airflow (m³/h)` W/K. The French DPE 3CL method explicitly sums wall, ceiling, floor, window and door terms `b × S × U`, thermal bridges, and air renewal; it defines the relevant boundaries as those between the heated space and outdoors, unheated spaces, or ground. The RT/RE Th-Bat definitions likewise distinguish transmission `H` (W/K) from surface `U` (W/(m²·K)) and account for areas, bridges, and air renewal.

This is a sizing basis, not a turnkey estimate from the current geometry inputs: the UI does not ask for the room's exposed boundary areas, boundary type, U-values, bridge lengths, or airflow. A volume-based heuristic could be added only as a clearly declared generic scenario assumption, not as a French regulatory conversion.

## Proposed tooltip

> **Heat loss (W/K)** is the room’s modeled heat-loss coefficient: approximate heat loss is `W/K × indoor–outdoor temperature difference (K)`. Room area and volume alone cannot determine it. A building calculation needs the areas and U-values of heat-losing walls, windows, floor and ceiling, plus thermal bridges and air exchange. The construction-year ranges are unverified, size-dependent scenario references with no stated reference geometry; they are not RT/RE requirements and should not be read as room-specific values. Adjust this slider for an illustrative room scenario.

If the supplied age bands remain in a help panel, append: “Reference bands supplied for this simulator; their underlying area, volume and boundary assumptions are unknown.” Avoid attaching “RT” or “RE2020” in a way that implies those texts prescribe these W/K bands.

## Primary sources

- [Règles Th-Bat – fascicule généralités (government RT-RE portal), especially pp. 5, 15–17](https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/1-fascicule_generalites.pdf): defines transmission heat-loss coefficient `H` in W/K, surface transmittance `U`, and the building transmission expression from `U×A`, linear thermal bridges and point bridges; distinguishes ventilation-related losses.
- [Annexe méthode de calcul 3CL-DPE (government RT-RE portal), §3, pp. 5–6](https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/annexe_methode_de_calcul_3cl-dpe_v1.3.pdf): `GV` is the sum of opaque/glazed boundary losses, thermal bridges and air renewal; provides `b×S×U` terms and states which boundaries count.
- [FAQ RE2020 141: calculating heat-loss surface ATbat (government RT-RE portal)](https://rt-re-batiment.developpement-durable.gouv.fr/faq-re2020-141-comment-calculer-la-surface-a811.html): explains that even a dwelling within a larger building needs its corresponding heat-loss surfaces calculated from the Th-Bat rules; floor area alone is not a proxy for the heat-loss boundary area.
- [FAQ RE2020 147: why airtightness is normalized by heat-loss surface (government RT-RE portal)](https://rt-re-batiment.developpement-durable.gouv.fr/faq-re2020-147-pourquoi-l-indicateur-q4pasurf-a-t-a817.html): notes that heat losses occur at the envelope and explains why the regulation uses heat-loss surface rather than volume for this indicator.
- [Arrêté du 4 août 2021, Article 21 (Légifrance)](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000043938749): RE2020 gives component U-value requirements in W/(m²·K); it does not establish the supplied room-level W/K age bands.

## Limitation

The sources establish the correct dependencies and units, but they do not validate any of the supplied age-band ranges. Nor do they supply a universal room `W/K per m²` or `W/K per m³` lookup. A quantitative preset requires explicit reference geometry and boundary/ventilation assumptions, or a traceable dataset of calculated examples.
