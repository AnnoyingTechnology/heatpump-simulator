"""Checks the acceptance boundary, not just the format of generated profiles."""
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('equipment_import', ROOT / 'tools/import-equipment.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CatalogueAcceptance(unittest.TestCase):
    def setUp(self):
        self.review = json.loads((ROOT / 'research/catalogue/equipment-acceptance.json').read_text())

    def test_generated_runtime_matches_frozen_source_acceptance(self):
        self.assertEqual(module.generate(), (ROOT / 'src/equipment-data.ts').read_text())

    def test_compact_runtime_keeps_applied_fields_without_duplicate_research_payloads(self):
        generated = module.generate()
        for unused in ('acceptedFacts', 'identityEvidence', 'candidateSha256', 'pairingEvidence', '"sources"'):
            self.assertNotIn(unused, generated)
        self.assertIn('research/catalogue/equipment-acceptance.json', generated)
        profiles = {}
        for name in ('CATALOGUE_OUTDOORS', 'CATALOGUE_INDOORS'):
            data = json.loads(re.search(r'export const ' + name + r' = (.*?) as const;', generated, re.S).group(1))
            profiles.update({p['id']: p for p in data})
        for accepted in self.review['units']:
            runtime = profiles[accepted['reference']]
            candidate = json.loads((ROOT / accepted['candidateFile']).read_text())
            unit = next(u for u in candidate['units'] if u['modelReference'] == accepted['candidateReference'])
            if accepted.get('unpublishedOutdoorAirflow'):
                self.assertEqual(unit['unitType'], 'outdoor')
                self.assertNotIn('airflow', accepted['factKeys'])
                self.assertIsNone(runtime['coolingHighFanFlowM3h'])
            else:
                flow = next(f for f in unit['facts'] if f['key'] == 'airflow' and f['condition'] == accepted['coolingAirflowCondition'])
                self.assertEqual(runtime['coolingHighFanFlowM3h'], flow['value'])
            self.assertEqual(runtime['manufacturer'], candidate['manufacturer'])
            self.assertEqual(runtime['acceptance'], 'reviewed-fields')
            for key, dimension in [('h', 'height'), ('w', 'width'), ('d', 'depth')]:
                fact = next(f for f in unit['facts'] if f['key'] == dimension)
                self.assertEqual(runtime['caseMm'][key], fact['value'])
            if unit['unitType'] == 'outdoor':
                self.assertEqual(runtime['ports'], accepted['ports'])
                self.assertEqual(runtime['compatibleIndoorClasses'], accepted['compatibleIndoorClasses'])
                for mode in ('cooling', 'heating'):
                    self.assertTrue(runtime['publishedOperatingRangesC'][mode]['condition'])

    def test_only_reviewed_monosplit_pairings_and_explicit_colour_variants_are_promoted(self):
        units = self.review['units']
        outdoors = [u for u in units if u['reference'].startswith('MUZ-')]
        indoors = {u['reference'] for u in units if u['reference'].startswith('MSZ-')}
        self.assertEqual(len(outdoors), 25)
        self.assertEqual(len(indoors), 45)
        self.assertNotIn('MSZ-EF18VGK2', indoors)
        self.assertNotIn('MSZ-LN18VG3', indoors)
        for outdoor in outdoors:
            self.assertEqual(outdoor['ports'], 1)
            self.assertLessEqual(set(outdoor['compatibleIndoorClasses']), indoors)
            self.assertTrue(outdoor['pairingEvidence']['locator'])
            if outdoor['reference'].startswith('MUZ-EF'):
                self.assertEqual(len(outdoor['compatibleIndoorClasses']), 3)
                self.assertEqual({ref[-1] for ref in outdoor['compatibleIndoorClasses']}, set('BWS'))
            if outdoor['reference'].startswith('MUZ-LN'):
                self.assertEqual(len(outdoor['compatibleIndoorClasses']), 4)
                self.assertEqual({ref[-1] for ref in outdoor['compatibleIndoorClasses']}, set('RBVW'))
            if outdoor['reference'].startswith('MUZ-FT'):
                self.assertEqual(outdoor['compatibleIndoorClasses'], ['MSZ-FT' + outdoor['reference'][6:8] + 'VGK2'])

    def test_no_unverified_compressor_or_performance_map_fields_are_accepted(self):
        allowed = {'airflow', 'height', 'width', 'depth', 'capacityClass', 'refrigerant',
                   'heatingOutdoorMinimum', 'heatingOutdoorMaximum',
                   'coolingOutdoorMinimum', 'coolingOutdoorMaximum', 'maximumIndoorUnits'}
        for unit in self.review['units']:
            self.assertLessEqual(set(unit['factKeys']), allowed)
            self.assertNotIn('factoryCharge', unit['factKeys'])
        self.assertNotIn('electricalInputKw', module.generate())

    def test_multisplit_profiles_preserve_unknown_exact_eligibility_and_documentary_charge_caps(self):
        profiles = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        multis = [p for p in profiles if 'installation' in p and p['installation']['minimumConnectedHeads'] is not None]
        self.assertEqual(len(multis), 9)
        self.assertEqual(sum(len(p['installation']['ports']) for p in multis), 28)
        for profile in multis:
            installation = profile['installation']
            self.assertEqual(profile['compatibleIndoorClasses'], [])
            self.assertEqual(installation['exactEligibility'], 'unknown')
            self.assertEqual(installation['minimumConnectedHeads'], 2)
            self.assertEqual(installation['maximumConnectedHeads'], profile['ports'])
            self.assertIsNone(profile['coolingHighFanFlowM3h'])
            self.assertNotIn('factoryCharge', profile)
            self.assertNotIn('nominalCoolingKw', profile)
        caps = {p['id']: p['installation']['publishedMaximumTotalChargeKg'] for p in multis}
        self.assertEqual(caps['3MXM52A2V1B8'], 2.2)
        self.assertIsNone(caps['2MXM50A2V1B8'])

    def test_legacy_profiles_do_not_borrow_a_generation_bounds_ports_or_super_low_airflow(self):
        profiles = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        legacy = [p for p in profiles if p.get('installation', {}).get('guide', '').startswith('Reviewed legacy')]
        self.assertEqual(len(legacy), 9)
        by_id = {p['id']: p for p in legacy}
        for p in legacy:
            self.assertEqual(p['sourceStatus'], 'legacy')
            self.assertEqual(p['compatibleIndoorClasses'], [])
            self.assertIsNone(p['installation']['minimumConnectedHeads'])
            self.assertIsNone(p['installation']['connectedCapacityClassSumLimitKw'])
            self.assertIsNone(p['installation']['ports'])
            self.assertIsNone(p['installation']['publishedMaximumTotalChargeKg'])
            self.assertIsNone(p['coolingHighFanFlowM3h'])
            self.assertEqual(p['installation']['exactEligibility'], 'unknown')
            self.assertNotIn('factoryCharge', p)
        for ref in ('2MXM40N2V1B', '2MXM50N2V1B'):
            self.assertIsNone(by_id[ref]['publishedOperatingRangesC']['cooling']['maximum'])
            self.assertIsNone(by_id[ref]['publishedOperatingRangesC']['cooling']['minimum'])
        for ref in ('3MXM40N2V1B8', '3MXM52N2V1B8', '4MXM80N2V1B9', '5MXM90N2V1B9'):
            self.assertEqual(by_id[ref]['publishedOperatingRangesC']['cooling']['maximum'], 46)
            self.assertIsNone(by_id[ref]['publishedOperatingRangesC']['heating']['minimum'])
            self.assertIsNone(by_id[ref]['publishedOperatingRangesC']['heating']['maximum'])
        self.assertEqual(by_id['3MXM68N2V1B']['publishedOperatingRangesC']['heating'],
                         {'minimum': -15.0, 'maximum': 18.0, 'condition': 'outdoor wet-bulb'})
        self.assertNotIn('3MXM52N8', by_id)  # owner family never silently aliases a full nameplate

    def test_unknown_legacy_endpoints_need_explicit_receipt_bound_unknowns(self):
        import copy
        accepted = copy.deepcopy(next(e for e in self.review['units'] if e.get('installationSourceBoundary') == 'legacy-unresolved'))
        doc = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        accepted['unpublishedOperatingEndpoints'] = []
        with self.assertRaisesRegex(ValueError, 'must be explicit'):
            module.multisplit_installation(unit, accepted, ROOT)
        accepted['unpublishedOperatingEndpoints'] = next(e for e in self.review['units'] if e['reference'] == accepted['reference'])['unpublishedOperatingEndpoints']
        unit['facts'].append({'key': 'heatingOutdoorMinimum', 'value': -20})
        with self.assertRaisesRegex(ValueError, 'cannot be inferred'):
            module.multisplit_installation(unit, accepted, ROOT)

    def test_multisplit_review_binding_and_unknown_pairing_boundary(self):
        import copy
        accepted = copy.deepcopy(next(e for e in self.review['units'] if e.get('topology') == 'multisplit'))
        document = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in document['units'] if u['modelReference'] == accepted['candidateReference'])
        accepted['compatibleIndoorClasses'] = ['FTXA25']
        with self.assertRaisesRegex(ValueError, 'must remain unknown'):
            module.multisplit_installation(unit, accepted, ROOT)
        accepted['compatibleIndoorClasses'] = []
        accepted['candidateSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'does not bind'):
            module.multisplit_installation(unit, accepted, ROOT)

    def test_multisplit_conditional_42_and_port_C_reducers_stay_distinct(self):
        profiles = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        port_a = next(p for p in profiles if p['id'] == '2MXM50A2V1B8')['installation']['ports'][0]
        alternatives = [p for p in port_a['alternatives'] if 42 in p['capacityClasses']]
        self.assertEqual(len(alternatives), 2)
        self.assertEqual(alternatives[0]['onlyGuideNamedIndoorClasses'], ['FTXM42R', 'FTXM42A', 'FTXA42C'])
        self.assertNotIn('onlyGuideNamedIndoorClasses', alternatives[1])
        self.assertIn('optional accessory', alternatives[1]['reducer'])
        port_c = next(p for p in profiles if p['id'] == '4MXM80A2V1B8')['installation']['ports'][2]
        self.assertEqual([p['reducer'] for p in port_c['alternatives']], ['5+6', '5+6', '1+3', 'none'])

    def test_multisplit_sources_are_required_instead_of_optional_cache_fallback(self):
        import shutil
        accepted = next(e for e in self.review['units'] if e.get('topology') == 'multisplit')
        doc = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        with tempfile.TemporaryDirectory() as directory:
            isolated = Path(directory)
            receipt = isolated / accepted['installationReview']['path']
            receipt.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / accepted['installationReview']['path'], receipt)
            with self.assertRaisesRegex(ValueError, 'primary source is missing'):
                module.multisplit_installation(unit, accepted, isolated)

    def test_daikin_colour_pairing_and_unpublished_airflow_are_explicit(self):
        outdoors = [u for u in self.review['units']
                    if Path(u['candidateFile']).name.startswith('daikin-rxa')]
        self.assertEqual({u['reference'] for u in outdoors}, {'RXA25A9', 'RXA35A9', 'RXA42B', 'RXA50B'})
        for outdoor in outdoors:
            self.assertEqual(outdoor['ports'], 1)
            self.assertEqual(len(outdoor['compatibleIndoorClasses']), 4)
            self.assertEqual({ref[-2:] for ref in outdoor['compatibleIndoorClasses']}, {'AW', 'BS', 'BT', 'BB'})
            self.assertTrue(outdoor['unpublishedOutdoorAirflow'])
        legacy = [u for u in self.review['units'] if Path(u['candidateFile']).name.startswith('daikin-ftxa')]
        self.assertFalse(any(u['reference'].startswith(('FTXA20', 'CTXA15')) for u in legacy))

    def test_daikin_ururu_2026_pairs_and_bulb_conditions_are_preserved(self):
        accepted = [u for u in self.review['units'] if u['reference'].startswith(('FTXZ', 'RXZ'))]
        self.assertEqual({u['reference'] for u in accepted}, {
            'FTXZ25N', 'FTXZ35N', 'FTXZ50N', 'RXZ25N', 'RXZ35N', 'RXZ50N'})
        for size in (25, 35, 50):
            indoor, outdoor = f'FTXZ{size}N', f'RXZ{size}N'
            out = next(u for u in accepted if u['reference'] == outdoor)
            self.assertEqual(out['compatibleIndoorClasses'], [indoor])
            self.assertTrue(out['unpublishedOutdoorAirflow'])
            candidate = json.loads((ROOT / out['candidateFile']).read_text())
            record = next(u for u in candidate['units'] if u['modelReference'] == outdoor)
            facts = {f['key']: f for f in record['facts']}
            self.assertEqual(facts['refrigerant']['value'], 'R-32')
            self.assertEqual(facts['coolingOutdoorMinimum']['condition'], 'outdoor dry-bulb')
            self.assertEqual(facts['heatingOutdoorMinimum']['condition'], 'outdoor wet-bulb')
            self.assertEqual(facts['heatingOutdoorMinimum']['value'], -20)
            self.assertEqual(facts['coolingOutdoorMaximum']['value'], 43)

    def test_daikin_emura_2026_finish_skus_have_exact_pairs_and_pair_evidence(self):
        accepted = [u for u in self.review['units']
                    if u['candidateFile'].endswith('luna-daikin-emura-2026.json')]
        indoors = [u for u in accepted if u['reference'].startswith('FTXJ')]
        outdoors = [u for u in accepted if u['reference'].startswith('RXJ')]
        self.assertEqual(len(indoors), 15)
        self.assertEqual(len(outdoors), 5)
        self.assertTrue(all(u['reference'].endswith(('BW9', 'BS9', 'BB')) for u in indoors))
        candidate = json.loads((ROOT / accepted[0]['candidateFile']).read_text())
        identities = {u['modelReference'] for u in candidate['units']}
        self.assertEqual({u['reference'] for u in accepted}, identities)
        for outdoor in outdoors:
            refs = outdoor['compatibleIndoorClasses']
            evidence = outdoor['pairingEvidenceByIndoor']
            self.assertEqual(len(refs), 3)
            self.assertEqual(set(evidence), set(refs))
            self.assertEqual({r[-2:] for r in refs}, {'W9', 'S9', 'BB'})
            candidate_outdoor = next(u for u in candidate['units']
                                     if u['modelReference'] == outdoor['reference'])
            candidate_pairs = {item['evidence']['excerpt'] for item in candidate_outdoor['compatibility']}
            for indoor, source_evidence in evidence.items():
                self.assertIn(indoor + ' / ' + outdoor['reference'], source_evidence['excerpt'])
                self.assertTrue(any(pair in excerpt for excerpt in candidate_pairs
                                    for pair in [indoor + ' / ' + outdoor['reference']]))

    def test_sensira_ftxf_published_indoor_profiles_are_bounded_without_unverified_outdoors(self):
        accepted = [u for u in self.review['units']
                    if u['candidateFile'].endswith('luna-daikin-sensira-ftxf-2026.json')]
        indoors = [u for u in accepted if u['reference'].startswith('FTXF')]
        outdoors = [u for u in accepted if u['reference'].startswith('RXF')]
        self.assertEqual({u['reference'] for u in indoors}, {
            'FTXF20F5V1B', 'FTXF25F5V1B', 'FTXF35F5V1B', 'FTXF42F5V1B',
            'FTXF50F5V1B', 'FTXF60F2V1B', 'FTXF71F2V1B'})
        self.assertEqual({u['reference'] for u in outdoors},
                         {'RXF20F5V1B', 'RXF25F5V1B', 'RXF35F5V1B', 'RXF42F5V1B', 'RXF50F5V1B'})
        for unit in indoors:
            self.assertEqual(unit['factKeys'], ['capacityClass', 'height', 'width', 'depth', 'airflow'])
        candidate = json.loads((ROOT / indoors[0]['candidateFile']).read_text())
        status = {u['modelReference']: u['status'] for u in candidate['units'] if u['unitType'] == 'indoor'}
        self.assertEqual({ref for ref, value in status.items() if value == 'legacy'},
                         {'FTXF35F5V1B', 'FTXF50F5V1B', 'FTXF60F2V1B'})
        ftxf71 = next(u for u in candidate['units'] if u['modelReference'] == 'FTXF71F2V1B')
        self.assertEqual(next(f['value'] for f in ftxf71['facts'] if f['key'] == 'airflow'), 1038)
        for outdoor in outdoors:
            self.assertTrue(outdoor['unpublishedOutdoorAirflow'])
            self.assertEqual(outdoor['compatibleIndoorClasses'], [outdoor['reference'].replace('RXF', 'FTXF')])
            self.assertEqual(outdoor['factKeys'][-4:], ['coolingOutdoorMinimum', 'coolingOutdoorMaximum',
                                                       'heatingOutdoorMinimum', 'heatingOutdoorMaximum'])
            self.assertEqual(outdoor['ports'], 1)
        ftxf35 = next(u for u in candidate['units'] if u['modelReference'] == 'FTXF35F5V1B')
        self.assertEqual(next(f['value'] for f in ftxf35['facts'] if f['key'] == 'capacityClass'), 3.3)

    def test_current_sensira_ftxc_uses_full_evidence_backed_skus_and_pair_limits(self):
        accepted = [u for u in self.review['units']
                    if u['candidateFile'].endswith('luna-daikin-sensira-ftxc-e-fr-2026.json')]
        expected_sizes = {20, 25, 35, 50, 60, 71}
        indoors = {u['reference'] for u in accepted if u['reference'].startswith('FTXC')}
        outdoors = [u for u in accepted if u['reference'].startswith('RXC')]
        self.assertEqual(indoors, {f'FTXC{size}EV1B' for size in expected_sizes})
        self.assertEqual({u['reference'] for u in outdoors}, {f'RXC{size}EV1B' for size in expected_sizes})
        for outdoor in outdoors:
            indoor = outdoor['reference'].replace('RXC', 'FTXC')
            self.assertEqual(outdoor['compatibleIndoorClasses'], [indoor])
            self.assertEqual(outdoor['pairingEvidence']['excerpt'], indoor + ' / ' + outdoor['reference'])
            candidate = json.loads((ROOT / outdoor['candidateFile']).read_text())
            record = next(u for u in candidate['units'] if u['modelReference'] == outdoor['reference'])
            facts = {f['key']: f for f in record['facts']}
            self.assertEqual(facts['refrigerant']['value'], 'R-32')
            self.assertEqual(facts['heatingOutdoorMinimum']['condition'], 'outdoor wet-bulb')
            self.assertEqual(facts['coolingOutdoorMinimum']['condition'], 'outdoor dry-bulb')
        self.assertTrue(all('capacityClass' not in u['factKeys'] for u in accepted))

    def test_comfora_ftxp50_preserves_published_pair_class_and_uses_exact_france_casing(self):
        candidate_file = 'research/catalogue/staging/luna-daikin-comfora-2026.json'
        indoor = next(u for u in self.review['units']
                      if u['candidateFile'] == candidate_file and u['reference'] == 'FTXP50N9')
        self.assertEqual(indoor['candidateReference'], 'FTXP50N9')
        self.assertEqual(set(indoor['factKeys']), {'airflow', 'height', 'width', 'depth', 'capacityClass'})
        candidate = json.loads((ROOT / candidate_file).read_text())
        unit = next(u for u in candidate['units'] if u['modelReference'] == 'FTXP50N9')
        self.assertEqual(unit['identityEvidence']['excerpt'], 'FTXP + RXP | 50N9 + 50N8')
        dimensions = {fact['key']: fact['value'] for fact in unit['facts']
                      if fact['key'] in ('height', 'width', 'depth')}
        self.assertEqual(dimensions, {'height': 286, 'width': 770, 'depth': 225})
        for fact in unit['facts']:
            if fact['key'] in ('height', 'width', 'depth', 'airflow'):
                self.assertEqual(fact['evidence']['sourceId'], 'daikin-fr-ftxp-n9')
                self.assertIn('FTXP50N5V1B9', fact['evidence']['locator'])
        outdoor = next(u for u in self.review['units']
                       if u['candidateFile'] == candidate_file and u['reference'] == 'RXP50N8')
        self.assertEqual(outdoor['compatibleIndoorClasses'], ['FTXP50N9'])

    def test_ururu_2026_catalogue_page_is_in_required_source_snapshots(self):
        source_file = 'research/catalogue/source-cache/daikin-eu-2026-split-page-307.html'
        snapshot = next(s for s in self.review['additionalSourceSnapshots']
                        if s['sourceFile'] == source_file)
        self.assertEqual(snapshot['sourceSha256'],
                         '6ed56c9960c23278782b8416ea2b32afa7aa28a3199c5b0a88d784efeb1a8dd0')
        self.assertEqual(hashlib.sha256((ROOT / source_file).read_bytes()).hexdigest(), snapshot['sourceSha256'])

    def test_fdxm_current_full_indoor_references_have_reviewed_airflow_and_exact_rxm_classes(self):
        accepted = [u for u in self.review['units']
                    if u['candidateFile'].endswith('luna-daikin-fdxm-f9-fr-2026.json')]
        self.assertEqual({u['reference'] for u in accepted}, {
            'FDXM25F3V1B9', 'FDXM35F3V1B9', 'FDXM50F3V1B9', 'FDXM60F3V1B9'})
        candidate = json.loads((ROOT / accepted[0]['candidateFile']).read_text())
        for size in (25, 35, 50, 60):
            unit = next(u for u in candidate['units'] if u['modelReference'] == f'FDXM{size}F3V1B9')
            self.assertEqual(len(unit['compatibility']), 1)
            self.assertIn(f'{size}F9 + ', unit['compatibility'][0]['evidence']['excerpt'])
            airflow = next(f for f in unit['facts'] if f['key'] == 'airflow')
            self.assertEqual(airflow['condition'], 'cooling mode, high fan speed; exact conversion from published m³/min ×60')
            self.assertNotIn('capacityClass', {f['key'] for f in unit['facts']})

    def test_perfera_archived_full_indoor_skus_remain_distinct_and_unpaired(self):
        accepted = [u for u in self.review['units']
                    if u['candidateFile'].endswith('luna-daikin-perfera-ftxm-a-fr-legacy.json')]
        self.assertEqual(len(accepted), 12)
        self.assertEqual({u['reference'] for u in accepted}, {
            'FTXM20A5V1B', 'FTXM20A2V1B', 'FTXM25A2V1B', 'FTXM25A5V1B',
            'FTXM35A5V1B', 'FTXM35A2V1B', 'FTXM42A2V1B', 'FTXM42A5V1B',
            'FTXM50A5V1B', 'FTXM50A2V1B', 'FTXM60A2V1B', 'FTXM71A2V1B'})
        candidate = json.loads((ROOT / accepted[0]['candidateFile']).read_text())
        for unit in candidate['units']:
            self.assertEqual(unit['status'], 'legacy')
            self.assertEqual(unit['compatibility'], [])
            self.assertNotIn('capacityClass', {f['key'] for f in unit['facts']})

    def test_perfera_rxm_a9_has_per_full_sku_pair_evidence_for_wall_and_floor_heads(self):
        outdoor_records = [u for u in self.review['units']
                           if u['candidateFile'].endswith('luna-daikin-perfera-rxm-a9-fr-legacy-pairs.json')]
        expected = {
            'RXM25A5V1B9': {'FTXM25A2V1B', 'FTXM25A5V1B', 'FVXM25B2V1B'},
            'RXM35A5V1B9': {'FTXM35A2V1B', 'FTXM35A5V1B', 'FVXM35B2V1B'},
            'RXM50A5V1B9': {'FTXM50A2V1B', 'FTXM50A5V1B', 'FVXM50B2V1B'},
        }
        self.assertEqual({u['reference'] for u in outdoor_records}, set(expected))
        for accepted in outdoor_records:
            refs = expected[accepted['reference']]
            self.assertEqual(set(accepted['compatibleIndoorClasses']), refs)
            self.assertEqual(set(accepted['pairingEvidenceByIndoor']), refs)
            self.assertTrue(accepted['unpublishedOutdoorAirflow'])
            for ref, evidence in accepted['pairingEvidenceByIndoor'].items():
                self.assertEqual(evidence['excerpt'], ref + ' / ' + accepted['reference'])

    def test_perfera_floor_heads_are_added_to_exact_shared_rxm_pair_maps(self):
        accepted = [u for u in self.review['units']
                    if u['candidateFile'].endswith('luna-daikin-perfera-fvxm-b-fr-2026.json')]
        self.assertEqual({u['reference'] for u in accepted}, {
            'FVXM25B2V1B', 'FVXM35B2V1B', 'FVXM50B2V1B'})
        rxm_records = [u for u in self.review['units']
                       if u['candidateFile'].endswith('luna-daikin-perfera-rxm-a9-fr-legacy-pairs.json')]
        for size in (25, 35, 50):
            outdoor = next(u for u in rxm_records if u['reference'] == f'RXM{size}A5V1B9')
            indoor = f'FVXM{size}B2V1B'
            self.assertIn(indoor, outdoor['compatibleIndoorClasses'])
            self.assertEqual(outdoor['pairingEvidenceByIndoor'][indoor]['excerpt'],
                             indoor + ' / ' + outdoor['reference'])

    def test_current_stylish_nepura_colour_pairs_are_individually_cited(self):
        outdoor = next(u for u in self.review['units'] if u['reference'] == 'RXTA30C2V1B')
        expected = {'FTXTA30C2V1BW', 'FTXTA30C2V1BB'}
        self.assertEqual(set(outdoor['compatibleIndoorClasses']), expected)
        self.assertEqual(set(outdoor['pairingEvidenceByIndoor']), expected)
        candidate = json.loads((ROOT / outdoor['candidateFile']).read_text())
        for indoor, evidence in outdoor['pairingEvidenceByIndoor'].items():
            record = next(u for u in candidate['units'] if u['modelReference'] == indoor)
            self.assertTrue(any(c['evidence'] == evidence for c in record['compatibility']))

    def test_shared_outdoor_pairing_evidence_must_cover_exact_compatible_set(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            accepted = next(u for u in self.review['units'] if u['reference'] == 'RXZ25N')
            doc = json.loads((ROOT / accepted['candidateFile']).read_text())
            candidate = root / accepted['candidateFile']
            candidate.parent.mkdir(parents=True)
            candidate.write_text(json.dumps(doc))
            accepted['candidateSha256'] = module.sha(candidate)
            accepted['compatibleIndoorClasses'] = ['FTXZ25N', 'FTXZ35N']
            accepted['pairingEvidenceByIndoor'] = {
                'FTXZ25N': accepted['pairingEvidence']
            }
            review = {**self.review, 'units': [accepted]}
            review_path = root / 'research/catalogue/equipment-acceptance.json'
            review_path.parent.mkdir(parents=True, exist_ok=True)
            review_path.write_text(json.dumps(review))
            with self.assertRaisesRegex(ValueError, 'cover every compatible indoor reference'):
                module.generate(root)

    def test_changed_candidate_requires_new_source_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            accepted = self.review['units'][0]
            review_path = root / 'research/catalogue/equipment-acceptance.json'
            review_path.parent.mkdir(parents=True)
            review_path.write_text(json.dumps({**self.review, 'units': [accepted]}))
            candidate = root / accepted['candidateFile']
            candidate.parent.mkdir(parents=True, exist_ok=True)
            candidate.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Candidate changed'):
                module.generate(root)

    def test_changed_additional_source_snapshot_requires_new_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.review['additionalSourceSnapshots'][0]
            snapshot = root / source['sourceFile']
            snapshot.parent.mkdir(parents=True)
            snapshot.write_text('changed primary source')
            review_path = root / 'research/catalogue/equipment-acceptance.json'
            review_path.parent.mkdir(parents=True, exist_ok=True)
            review_path.write_text(json.dumps({**self.review, 'units': []}))
            with self.assertRaisesRegex(ValueError, 'Additional source snapshot changed'):
                module.generate(root)

    def test_manufacturer_neutral_import_and_exact_cooling_flow_selection(self):
        # A synthetic fixture exercises importer behavior without promoting a
        # fictional manufacturer unit into the application acceptance list.
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            accepted = dict(next(u for u in self.review['units'] if u['reference'] == 'MSZ-AY25VGK2'))
            doc = json.loads((ROOT / accepted['candidateFile']).read_text())
            doc['manufacturer'] = 'daikin'
            unit = doc['units'][0]
            heating_flow = dict(next(f for f in unit['facts'] if f['key'] == 'airflow'))
            heating_flow.update(value=2000, condition='heating mode, high fan speed')
            unit['facts'].append(heating_flow)
            candidate = root / accepted['candidateFile']
            candidate.parent.mkdir(parents=True)
            candidate.write_text(json.dumps(doc))
            accepted['candidateSha256'] = module.sha(candidate)
            review_path = root / 'research/catalogue/equipment-acceptance.json'
            review_path.parent.mkdir(parents=True, exist_ok=True)
            review_path.write_text(json.dumps({**self.review, 'units': [accepted]}))
            result = module.generate(root)
            self.assertIn('"manufacturer": "daikin"', result)
            self.assertIn('"coolingHighFanFlowM3h": 630', result)
            self.assertNotIn('"coolingHighFanFlowM3h": 2000', result)

    def test_unpublished_indoor_airflow_is_null_and_requires_explicit_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            accepted = dict(next(u for u in self.review['units'] if u['reference'] == 'MSZ-AY25VGK2'))
            doc = json.loads((ROOT / accepted['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
            unit['facts'] = [fact for fact in unit['facts'] if fact['key'] != 'airflow']
            unit['unknowns'].append('Cooling airflow is unpublished in this source table.')
            candidate = root / accepted['candidateFile']
            candidate.parent.mkdir(parents=True)
            candidate.write_text(json.dumps(doc))
            accepted.update(candidateSha256=module.sha(candidate), factKeys=['height', 'width', 'depth'],
                            unpublishedIndoorAirflow=True)
            review_path = root / 'research/catalogue/equipment-acceptance.json'
            review_path.parent.mkdir(parents=True, exist_ok=True)
            review_path.write_text(json.dumps({**self.review, 'units': [accepted]}))
            result = module.generate(root)
            self.assertIn('"coolingHighFanFlowM3h": null', result)
            accepted.pop('unpublishedIndoorAirflow')
            review_path.write_text(json.dumps({**self.review, 'units': [accepted]}))
            with self.assertRaisesRegex(ValueError, 'cooling fan-flow condition is absent'):
                module.generate(root)

    def test_current_stylish_full_references_have_eight_exact_monosplit_finish_pairs(self):
        accepted = [entry for entry in self.review['units']
                    if entry['candidateFile'].endswith('luna-reviewed-daikin-stylish-cd-2026.json')]
        self.assertEqual(len(accepted), 45)
        outdoors = [entry for entry in accepted if entry['reference'].startswith('RXA')]
        self.assertEqual({entry['reference'] for entry in outdoors}, {
            'RXA20A5V1B8', 'RXA25A5V1B8', 'RXA35A5V1B8', 'RXA42B5V1B8', 'RXA50B5V1B8'})
        for outdoor in outdoors:
            self.assertEqual(outdoor['ports'], 1)
            self.assertTrue(outdoor['unpublishedOutdoorAirflow'])
            self.assertNotIn('factoryCharge', outdoor['factKeys'])
            self.assertNotIn('mass', outdoor['factKeys'])
            self.assertEqual(len(outdoor['compatibleIndoorClasses']), 8)
            self.assertEqual(set(outdoor['pairingEvidenceByIndoor']), set(outdoor['compatibleIndoorClasses']))
            for indoor, evidence in outdoor['pairingEvidenceByIndoor'].items():
                self.assertEqual(evidence['excerpt'], indoor + ' / ' + outdoor['reference'])
        self.assertFalse(any(entry['reference'].startswith('CTXA15') for entry in accepted))

    def test_current_stylish_physical_source_groups_and_leading_multi_column_are_preserved(self):
        entry = next(entry for entry in self.review['units']
                     if entry['candidateFile'].endswith('luna-reviewed-daikin-stylish-cd-2026.json'))
        candidate = json.loads((ROOT / entry['candidateFile']).read_text())
        flows = {'20': 660, '25': 690, '35': 714, '42': 786, '50': 810}
        capacities = {'20': 2.0, '25': 2.5, '35': 3.4, '42': 4.2, '50': 5.0}
        for unit in candidate['units']:
            facts = {fact['key']: fact for fact in unit['facts']}
            if unit['unitType'] == 'indoor':
                ref = unit['modelReference']
                source = 'catalogue-p315' if ref[6] == 'D' else 'catalogue-p317'
                for key in ('height', 'width', 'depth', 'airflow'):
                    self.assertEqual(facts[key]['evidence']['sourceId'], source)
                self.assertEqual([facts[key]['value'] for key in ('height', 'width', 'depth')], [295, 798, 189])
                self.assertEqual(facts['airflow']['value'], flows[ref[4:6]])
                self.assertEqual(facts['capacityClass']['value'], capacities[ref[4:6]])
            else:
                source = 'rxa-a8-table' if unit['modelReference'][5] == 'A' else 'rxa-b8-table'
                for key in ('height', 'width', 'depth', 'refrigerant', 'coolingOutdoorMinimum',
                            'coolingOutdoorMaximum', 'heatingOutdoorMinimum', 'heatingOutdoorMaximum'):
                    self.assertEqual(facts[key]['evidence']['sourceId'], source)
                self.assertIn('dry-bulb', facts['coolingOutdoorMinimum']['condition'])
                self.assertIn('wet-bulb', facts['heatingOutdoorMinimum']['condition'])

    def test_reviewed_rxf_d9_is_exact_europe_pairing_with_unknown_sales_status(self):
        profiles = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        for size in (60, 71):
            ref = f'RXF{size}D5V1B9'
            p = next(p for p in profiles if p['id'] == ref)
            self.assertEqual(p['compatibleIndoorClasses'], [f'FTXF{size}F2V1B'])
            self.assertEqual(p['ports'], 1)
            self.assertEqual(p['caseMm'], {'h': 734, 'w': 870, 'd': 373})
            self.assertIsNone(p['coolingHighFanFlowM3h'])
            self.assertEqual(p['sourceStatus'], 'availability-unknown')
            self.assertEqual(p['marketScope'], 'Europe; France availability unverified')
            self.assertEqual(p['publishedOperatingRangesC'], {
                'cooling': {'minimum': -10.0, 'maximum': 48.0, 'condition': 'outdoor dry-bulb'},
                'heating': {'minimum': -15.0, 'maximum': 18.0, 'condition': 'outdoor wet-bulb'}})

    def test_source_review_blocks_pairing_status_and_condition_changes(self):
        import copy
        accepted = copy.deepcopy(next(e for e in self.review['units'] if e['reference'] == 'RXF60D5V1B9'))
        doc = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        self.assertEqual(module.source_review_metadata(unit, accepted, ROOT)['sourceStatus'], 'availability-unknown')
        for field, value in [('compatibleIndoorClasses', ['FTXF71F2V1B']), ('ports', 2),
                             ('marketScope', 'France current'), ('factKeys', ['height'])]:
            changed = copy.deepcopy(accepted); changed[field] = value
            with self.assertRaises(ValueError): module.source_review_metadata(unit, changed, ROOT)
        changed = copy.deepcopy(unit); changed['status'] = 'current'
        with self.assertRaisesRegex(ValueError, 'status'): module.source_review_metadata(changed, accepted, ROOT)
        changed = copy.deepcopy(unit)
        next(f for f in changed['facts'] if f['key'] == 'heatingOutdoorMinimum')['condition'] = 'outdoor dry-bulb'
        with self.assertRaisesRegex(ValueError, 'condition'): module.source_review_metadata(changed, accepted, ROOT)

    def test_reviewed_rxf_requires_primary_snapshot_bytes(self):
        import shutil
        accepted = next(e for e in self.review['units'] if e['reference'] == 'RXF60D5V1B9')
        doc = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        with tempfile.TemporaryDirectory() as directory:
            isolated = Path(directory)
            path = isolated / accepted['sourceReview']['path']; path.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / accepted['sourceReview']['path'], path)
            with self.assertRaisesRegex(ValueError, 'primary snapshot'): module.source_review_metadata(unit, accepted, isolated)

    def test_siesta_exact_head_flows_follow_source_header_not_class_or_ftx_alias(self):
        profiles = json.loads(re.search(r'export const CATALOGUE_INDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        readback = json.loads((ROOT / 'reviews/siesta-primary-table-readback-2026.json').read_text())
        self.assertEqual(len(readback['units']), 18)
        expected = {row['reference']: row for row in readback['units']}
        accepted = [row for row in self.review['units'] if row['candidateFile'].endswith('reviewed-luna-siesta-exact-indoor-2026.json')]
        self.assertEqual({row['reference'] for row in accepted}, set(expected))
        for row in accepted:
            p = next(p for p in profiles if p['id'] == row['reference'])
            self.assertEqual(p['coolingHighFanFlowM3h'], expected[p['id']]['facts']['coolingHighFanM3min'] * 60)
            self.assertNotIn('nominalCoolingKw', p)
            self.assertEqual(p['sourceStatus'], 'availability-unknown')
            self.assertEqual(p['marketScope'], 'France technical table; current availability unverified')
        by_id = {p['id']: p for p in profiles}
        self.assertEqual(by_id['ATXP25N5V1B9']['coolingHighFanFlowM3h'], 582)
        self.assertEqual(by_id['ATXF42F5V1B']['caseMm'], {'h': 286, 'w': 770, 'd': 225})
        self.assertEqual(by_id['ATXF71F2V1B']['coolingHighFanFlowM3h'], 1038)

    def test_siesta_review_cannot_claim_heating_as_cooling_or_alias_exact_reference(self):
        import copy
        accepted = copy.deepcopy(next(e for e in self.review['units'] if e['reference'] == 'ATXM35A5V1B'))
        doc = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        module.source_review_metadata(unit, accepted, ROOT)
        accepted['coolingAirflowCondition'] = 'heating high fan'
        with self.assertRaisesRegex(ValueError, 'cooling airflow condition'): module.source_review_metadata(unit, accepted, ROOT)
        accepted['coolingAirflowCondition'] = 'cooling high fan'
        accepted['reference'] = 'FTXM35A5V1B'
        with self.assertRaisesRegex(ValueError, 'renamed or aliased'): module.source_review_metadata(unit, accepted, ROOT)
        accepted['reference'] = 'ATXM35A5V1B'
        next(f for f in unit['facts'] if f['key'] == 'airflow' and f['condition'] == 'cooling high fan')['value'] = 666
        with self.assertRaisesRegex(ValueError, 'fact or condition'): module.source_review_metadata(unit, accepted, ROOT)

    def test_siesta_documentary_arx_pairs_do_not_rewrite_rx_eligibility(self):
        readback = json.loads((ROOT / 'reviews/siesta-primary-table-readback-2026.json').read_text())
        self.assertEqual(len(readback['pairings']), 8)
        self.assertTrue(all(row['outdoor'].startswith(('ARXM', 'ARXF')) for row in readback['pairings']))
        rxf = next(e for e in self.review['units'] if e['reference'] == 'RXF60D5V1B9')
        self.assertEqual(rxf['compatibleIndoorClasses'], ['FTXF60F2V1B'])
        self.assertNotIn('ATXF60F2V1B', rxf['compatibleIndoorClasses'])
        self.assertFalse(any(row['indoor'].startswith('ATXP') for row in readback['pairings']))

    def test_siesta_designated_research_and_readback_are_required_hash_pins(self):
        import shutil
        accepted = next(e for e in self.review['units'] if e['reference'] == 'ATXP20N5V1B9')
        doc = json.loads((ROOT / accepted['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        receipt = json.loads((ROOT / accepted['sourceReview']['path']).read_text())
        with tempfile.TemporaryDirectory() as directory:
            isolated = Path(directory)
            for pin in [accepted['sourceReview'], *receipt['sourcePins']]:
                target = isolated / pin['path']; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / pin['path'], target)
            with self.assertRaisesRegex(ValueError, 'Designated research input'): module.source_review_metadata(unit, accepted, isolated)
            for pin in [*receipt['designatedResearchInputs'], receipt['primaryTableReadback']]:
                target = isolated / pin['path']; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / pin['path'], target)
            module.source_review_metadata(unit, accepted, isolated)
            (isolated / receipt['primaryTableReadback']['path']).write_text('{}')
            with self.assertRaisesRegex(ValueError, 'primary readback'): module.source_review_metadata(unit, accepted, isolated)


if __name__ == '__main__':
    unittest.main()
