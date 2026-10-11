# Equipment profile acceptance — 2026-10-11

Qwen3.8-Flash-Next on 10.10.10.204 produced 52 candidate records: HR12, AY12,
AP4, EF9, LN9 and FT6. Candidate structure validation passed for all 52. This review then
checked a bounded set of facts against the already cached official Mitsubishi
Electric France 2026–2027 catalogue, using primary table text and rendered PDF
pages 50, 54, 56, 60, 64, 68 and 72. No new manufacturer discovery was performed here.

The runtime selector promotes 25 outdoor references and their verified single
matched indoor units. EF25/35/42/50 offer each explicitly listed B/W/S colour
variant; LN25/35/50/60 offer each listed R/B/V/W variant, yielding 45 indoor
choices. EF18 and LN18 are multisplit-only and are excluded:
the table's “Compatible uniquement avec les multisplits” annotation applies to
size18, not to the adjacent size25–50 monosplit columns. The owner Daikin preset
and editable generic outdoor remain available, giving 27 outdoor choices.

Promoted outdoor references:

- MUZ-HR25VF2, MUZ-HR35VF2, MUZ-HR42VF2, MUZ-HR50VF2, MUZ-HR60VF2, MUZ-HR71VF2.
- MUZ-AY15VG2, MUZ-AY20VG2, MUZ-AY25VG2, MUZ-AY35VG2, MUZ-AY42VG2, MUZ-AY50VG2.
- MUZ-AP60VG2, MUZ-AP71VG3.
- MUZ-EF25VG2, MUZ-EF35VG2, MUZ-EF42VG2, MUZ-EF50VG2.
- MUZ-LN25VG3, MUZ-LN35VG3, MUZ-LN50VG3, MUZ-LN60VG3.
- MUZ-FT25VGHZ2, MUZ-FT35VGHZ2, MUZ-FT50VGHZ2.

Promoted fields are table identity, matched monosplit pairing and one-port
topology, casing dimensions, nominal cooling capacity as an informational
combination rating, cooling high-fan volumetric airflow, R32 refrigerant and
published operating-range metadata with its original table conditions. Every
promoted field retains full source evidence and conditions in its hash-pinned
research candidate and acceptance record. The compact generated runtime keeps
only applied/UI fields, acceptance status and relevant range conditions. The acceptance list freezes each candidate SHA-256 and the
primary PDF SHA-256; altered candidates require renewed source acceptance.

Model selection applies the published airflow in m³/s. The physical engine
converts it to dry-air mass flow at the current inlet temperature, humidity and
pressure. Reusing cooling high-fan airflow in heating is an explicit generic
assumption: the reviewed tables do not publish a heating airflow map. A manual
mass-flow override removes the selected volume-flow profile. No fixed air
density is assumed. Compressor displacement, efficiency, speed range, coil UA,
metal storage and fan electrical power keep the existing generic inputs.
Published capacity is not converted into guessed compressor geometry or an
OEM performance map. Charge effects stay gated; factory charge is not promoted.

Selecting a one-port model preserves the other rooms and their settings in the
inactive pool, rather than connecting three heads to a monosplit. A matched
head is selected for the remaining active room; incompatible head choices are
rejected. The generic group can use a published head as a user-defined scenario,
without asserting manufacturer compatibility.

Validation passed: six source-acceptance tests and the full TypeScript check.
The acceptance tests include a synthetic Daikin fixture proving manufacturer
neutrality and rejecting accidental use of larger heating airflow as cooling
airflow. No fictional fixture is promoted into application data.

Four browser checks from the first batch exercised its 18 outdoor profiles, exact pairings, room
pool and edited-input preservation, airflow override fallback, EF colour
variants, an eight-port generic scenario and actual worker construction at an
18rps user speed ceiling. That earlier lower-bound check found inherited fixed-speed
and defrost commands must respect the selected ceiling; the UI adapter now caps
both, while leaving normal default commands unchanged. Final browser coverage
of the expanded 25-model selector belongs to the current root verification pass.

This is bounded profile integration, not the full Daikin/Mitsubishi consumer
database. Additional families, verified multisplit combinations and genuine OEM
performance maps remain future research and acceptance work.

Runtime compaction retains all 70 profiles and their applied parameters while
removing repeated source excerpts and hashes from the browser bundle. Full
evidence remains in research records. Generated source fell from 466239 to 33076
bytes; the production entry bundle fell from 555210 to 220039 bytes (70142 bytes
gzipped). TypeScript and production build passed.
