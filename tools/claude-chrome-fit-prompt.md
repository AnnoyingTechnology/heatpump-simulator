Continue Sonnet5.5 UI refinement in Heatpump Simulator. Same parentAGENTS/noautomemory; only src/chrome.ts,src/style.css,design/interface-design.md. No Bash/build/browser/git/engine/runtime/state/main changes. Root compiled it after a tiny DOM hidden boolean fix; nativehidden can be string with currentTS so keep setPop(hidden===true).

Rendered actual1600px screenshot shows Reset cut off at right edge. Measured1440Live: brand250.8px, runcontrols410.9px, Source120px, headline356px, status120px, Readings+Reset164.9px andgaps; finalResetright1524.6px. Examplesadds another scenarioselect and is worse. Current singleheader still feels packed ratherthan intentionallysimplified. Fix using priority/hierarchy, not wrapping into morefullwidthbars or hidingoverflow.

Concrete preferredsolution:
- Move Source(Live/Examples) and the contextual Examplescenario select into the existing Readingspopover, with readable labels. Both controls remain oneclickaway, builtonce and keyboardusable. Their currentlyselectedsource/scenario still clearlyidentified inheader's Examplesfixedbadge/status and mainmode context. DefaultLive staysplain. Free this space inprimaryheader.
- Keep mode, pause/resume, speedselect, actualclock,3headlinevalues, clearstatus, Readings andResetvisible at1440and1600.
- Simplify/resetitswidth ifneeded; no inaccessibleclippedcontrols. Brandcancompact sensiblywithoutnewbranding. Reducewastedgaps/padding insteadofshrinkingalltext. Currentheadlinecells haveplentywidth; readableCOP/heat/electric labels mustremainclear, fullscientificlabeltooltipifnecessary.
- Give status enoughspace (roughly170px) toshow "Last calculated step" uncut. Use concise note "Resume to recalculate" whenpaused, "Awaiting calculation" whenrunningpending; fullsnapshotdetailstayonhover/inReadings. Normal "Generic R32 · uncalibrated" and Examples "Fixed illustrative readings" shouldbelegible ratherthan heavilyellipsised. Faultbadge and unavailableheadlinevaluesmustalwaysvisible; concise"Readings withheld"notefullreasoninhover/popover acceptable.
- The sceneviewrowcanstayoneslimrow; ensure Examplesfixed/Offnotrecomputed cuesarenotlost. Do nothidefixedreadingprovenance.
- Preserve fixed72pxsingleheader and stablepositionwhenstatus/valueschange. Nofananimation oroldstackedribbonreturn.

Root willadaptQA tosource/scenariochoicesoneclickinpopover and willrerunrealcontrolsanddesktopfit. Documentnewselectors/remaininguncertainty anddo notrunchecks.
