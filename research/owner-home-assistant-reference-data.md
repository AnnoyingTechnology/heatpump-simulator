# Owner Home Assistant reference data — retrieved 2026-10-11

Seven selected 6–8-hour calibration windows and one interrupted-demand comparison
are available in [home-assistant-calibration/README.md](home-assistant-calibration/README.md).
Start there before interpreting the machine-readable JSON/CSV exports.

The primary winter references are January 9 and 11, 2024: 1°C reported outdoor
temperature and approximately 472/371 W circuit input, with different measured
indoor temperatures. The strongest summer reference is June 23, 2026, 14:00–20:00
Europe/Paris: 39.98°C reported outdoor temperature, 888 W mean circuit input and
5.34 kWh circuit energy. Three summer and four winter windows permit comparisons.

These are temperatures at the sheltered outdoor unit, not independent regional
weather readings. All three heads' indoor/outdoor temperatures and indoor humidity
are retained with hourly means/minima/maxima and full-day electrical context.
Historical unit modes, On/Off states, targets and fans were purged from the live
SQLite recorder; the exports mark them unavailable. Do not assign the present
winter/summer presets to these historical measurements. No outdoor humidity,
thermal output or measured COP is available for these dates.

The source was opened read-only; no HA changes were made. The retrieval phase
described as pending in `owner-summer-calibration-plan.md` has now been performed,
with the missing-control limitations above. No simulator calibration or fitting
has been performed by this data-gathering task.

An unpublished Publii draft, “Heatpump measurements at 1°C and 40°C” (post 30),
describes the seven windows individually using the same exports. Its draft HTML and review notes
are in the reference directory. No publication or site generation was run.
