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

    def test_mxz_partial_physical_readback_matches_pinned_candidate(self):
        receipt = json.loads((ROOT / 'reviews/terra-mitsubishi-mxz-physical-readback-2026.json').read_text())
        for pin in [receipt['candidate'], *receipt['sourcePins']]:
            self.assertEqual(hashlib.sha256((ROOT / pin['path']).read_bytes()).hexdigest(), pin['sha256'])
        candidate = json.loads((ROOT / receipt['candidate']['path']).read_text())
        rows = {u['modelReference']: u for u in candidate['units']}
        self.assertEqual(len(receipt['reviewedUnits']), 12)
        self.assertEqual(set(rows), {r['reference'] for r in receipt['reviewedUnits']})
        for reviewed in receipt['reviewedUnits']:
            facts = {f['key']: f['value'] for f in rows[reviewed['reference']]['facts']}
            for key in ('height', 'width', 'depth'):
                self.assertEqual(facts[key], reviewed['caseMm'][key])
            self.assertEqual(facts['airflow'], reviewed['coolingHighFanFlowM3h'])
            self.assertEqual(facts['refrigerant'], reviewed['refrigerant'])
            self.assertEqual(facts['maximumIndoorUnits'], reviewed['maximumConnectedHeads'])
            self.assertEqual(reviewed['ports'], reviewed['maximumConnectedHeads'])
            self.assertEqual(reviewed['minimumConnectedHeads'], 2)
            for mode in ('cooling', 'heating'):
                self.assertEqual([facts[mode + 'OutdoorMinimum'], facts[mode + 'OutdoorMaximum']], reviewed[mode + 'RangeC'])

    def test_mitsubishi_rz_and_unaccepted_mxz_candidates_keep_source_boundaries(self):
        rz = json.loads((ROOT / 'research/catalogue/staging/terra-mitsubishi-rz-2026.json').read_text())
        mxz = json.loads((ROOT / 'research/catalogue/staging/terra-mitsubishi-mxz-2026.json').read_text())
        self.assertEqual((len(rz['units']), len(mxz['units'])), (6, 12))
        self.assertEqual({u['modelReference'] for u in mxz['unresolvedReferences']},
                         {'MXZ-5F102VF3', 'MXZ-6F120VF3'})
        accepted = {u['reference'] for u in self.review['units']}
        self.assertTrue({u['modelReference'] for u in rz['units']}.issubset(accepted))
        self.assertFalse(accepted.intersection(u['modelReference'] for u in mxz['units']))
        for unit in rz['units']:
            facts = {f['key']: f['value'] for f in unit['facts']}
            if unit['unitType'] == 'outdoor':
                self.assertEqual(facts['refrigerant'], 'R290')
                self.assertEqual((facts['coolingOutdoorMaximum'], facts['heatingOutdoorMinimum']), (50, -30))
        for unit in mxz['units']:
            facts = {f['key']: f['value'] for f in unit['facts']}
            self.assertEqual(facts['refrigerant'], 'R32')
            self.assertIn(facts['maximumIndoorUnits'], (2, 3, 4))
            self.assertTrue(any('3 A' in c['description'] for c in unit['compatibility']))

    def test_mitsubishi_rz_visual_readback_and_pair_boundaries(self):
        receipt = json.loads((ROOT / 'reviews/terra-mitsubishi-rz-independent-acceptance-2026.json').read_text())
        for pin in receipt['sourcePins']:
            self.assertEqual(hashlib.sha256((ROOT / pin['path']).read_bytes()).hexdigest(), pin['sha256'])
        rows = {r['reference']: r for r in self.review['units']}
        profiles = {}
        for name in ('CATALOGUE_OUTDOORS', 'CATALOGUE_INDOORS'):
            profiles.update({p['id']: p for p in json.loads(re.search(
                r'export const ' + name + r' = (.*?) as const;', module.generate(), re.S).group(1))})
        self.assertEqual(len(receipt['reviewedUnits']), 6)
        for size, indoor_flow, outdoor_flow, dims in ((25, 846, 2160, (714, 800, 285)),
                                                       (35, 846, 2322, (714, 800, 285)),
                                                       (50, 972, 2916, (880, 840, 330))):
            indoor, outdoor = f'MSZ-RZ{size}VU', f'MUZ-RZ{size}VUHZ'
            for ref, flow, case in ((indoor, indoor_flow, (305, 998, 247)), (outdoor, outdoor_flow, dims)):
                row = rows[ref]
                doc = json.loads((ROOT / row['candidateFile']).read_text())
                unit = next(u for u in doc['units'] if u['modelReference'] == ref)
                module.source_review_metadata(unit, row, ROOT)
                self.assertEqual(profiles[ref]['caseMm'], dict(zip(('h', 'w', 'd'), case)))
                self.assertEqual(profiles[ref]['coolingHighFanFlowM3h'], flow)
            profile = profiles[outdoor]
            self.assertEqual(profile['refrigerant'], 'R290')
            self.assertEqual(profile['ports'], 1)
            self.assertEqual(profile['compatibleIndoorClasses'], [indoor])
            for mode, low, high, condition in (('cooling', -10, 50, 'outdoor dry-bulb / dry-bulb'),
                                                ('heating', -30, 24, 'outdoor wet-bulb / dry-bulb')):
                self.assertEqual(profile['publishedOperatingRangesC'][mode],
                                 {'minimum': low, 'maximum': high, 'condition': condition})
        changed = dict(rows['MUZ-RZ25VUHZ']); changed['compatibleIndoorClasses'] = ['MSZ-RZ35VU']
        doc = json.loads((ROOT / changed['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == changed['reference'])
        with self.assertRaisesRegex(ValueError, 'pairing or topology changed'):
            module.source_review_metadata(unit, changed, ROOT)
        unit = json.loads(json.dumps(unit))
        next(f for f in unit['facts'] if f['key'] == 'refrigerant')['value'] = 'R32'
        with self.assertRaisesRegex(ValueError, 'differs from independent readback'):
            module.source_review_metadata(unit, rows['MUZ-RZ25VUHZ'], ROOT)

    def test_mitsubishi_hr_inventory_already_contains_six_exact_pairs(self):
        units = {unit['reference']: unit for unit in self.review['units']}
        for size in (25, 35, 42, 50, 60, 71):
            indoor = f"MSZ-HR{size}" + ("VFK2" if size < 60 else "VF2")
            outdoor = f"MUZ-HR{size}VF2"
            self.assertIn(indoor, units)
            self.assertEqual(units[outdoor]['compatibleIndoorClasses'], [indoor])

    def test_mitsubishi_r32_visual_readback_and_pair_boundaries(self):
        receipt = json.loads((ROOT / 'reviews/terra-mitsubishi-r32-independent-acceptance-2026.json').read_text())
        for pin in receipt['sourcePins']:
            self.assertEqual(hashlib.sha256((ROOT / pin['path']).read_bytes()).hexdigest(), pin['sha256'])
        rows = {r['reference']: r for r in self.review['units']}
        profiles = {}
        for name in ('CATALOGUE_OUTDOORS', 'CATALOGUE_INDOORS'):
            profiles.update({p['id']: p for p in json.loads(re.search(
                r'export const ' + name + r' = (.*?) as const;', module.generate(), re.S).group(1))})
        for reviewed in receipt['reviewedUnits']:
            ref = reviewed['reference']; row = rows[ref]
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == ref)
            module.source_review_metadata(unit, row, ROOT)
            self.assertEqual(profiles[ref]['coolingHighFanFlowM3h'], reviewed['factValues']['airflow'])
            if ref.startswith('MUZ-'):
                self.assertEqual(profiles[ref]['compatibleIndoorClasses'], reviewed['compatibleIndoorClasses'])
                self.assertEqual(profiles[ref]['publishedOperatingRangesC']['heating']['minimum'], -25 if '-LN' in ref else -30)
        for family, suffixes, base in (('EF', 'BWS', 'VGK2'), ('LN', 'RBVW', 'VG3')):
            for suffix in suffixes:
                ref = f'MSZ-{family}18{base}{suffix}'
                self.assertNotIn('compatibleOutdoorReferences', profiles[ref])
                self.assertNotIn('compatibleOutdoorClasses', profiles[ref])
                self.assertNotIn('nominalCoolingKw', profiles[ref])
                self.assertTrue(all(ref not in p['compatibleIndoorClasses'] for p in profiles.values() if 'compatibleIndoorClasses' in p))
        changed = dict(rows['MUZ-RW25VGHZ2']); changed['compatibleIndoorClasses'] = ['MSZ-RW35VG2']
        doc = json.loads((ROOT / changed['candidateFile']).read_text())
        unit = next(u for u in doc['units'] if u['modelReference'] == changed['reference'])
        with self.assertRaisesRegex(ValueError, 'pairing or topology changed'):
            module.source_review_metadata(unit, changed, ROOT)

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
            self.assertEqual(runtime['acceptance'], 'reviewed-class-fields' if accepted.get('identityKind') == 'published-class' else 'reviewed-fields')
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
        self.assertEqual(len(outdoors), 34)
        self.assertEqual(len(indoors), 58)
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
            'RXM25A5V1B9': {'FTXM25A2V1B', 'FTXM25A5V1B', 'FVXM25B2V1B', 'FDXM25F3V1B9', 'FFA25A2VEB9', 'FNA25A2VEB9'},
            'RXM35A5V1B9': {'FTXM35A2V1B', 'FTXM35A5V1B', 'FVXM35B2V1B', 'FDXM35F3V1B9', 'FFA35A2VEB9', 'FNA35A2VEB9', 'FBA35A2VEB9', 'FCAG35BVEB', 'FHA35AVEB98'},
            'RXM50A5V1B9': {'FTXM50A2V1B', 'FTXM50A5V1B', 'FVXM50B2V1B', 'FDXM50F3V1B9', 'FFA50A2VEB9', 'FNA50A2VEB9', 'FBA50A2VEB9', 'FCAG50BVEB', 'FHA50AVEB98'},
        }
        self.assertEqual({u['reference'] for u in outdoor_records}, set(expected))
        for accepted in outdoor_records:
            refs = expected[accepted['reference']]
            self.assertEqual(set(accepted['compatibleIndoorClasses']), refs)
            self.assertEqual(set(accepted['pairingEvidenceByIndoor']), refs)
            self.assertTrue(accepted['unpublishedOutdoorAirflow'])
            for ref, evidence in accepted['pairingEvidenceByIndoor'].items():
                self.assertEqual(evidence['excerpt'], ref + ' / ' + accepted['reference'])

    def test_terra_rxm_exact_pair_columns_match_pinned_source_headers(self):
        pins = {s['sourceFile']: s['sourceSha256'] for s in self.review['additionalSourceSnapshots']}
        tables = sorted((ROOT / 'research/sources').glob('terra-*-rxm-a[89]-pairs.html'))
        self.assertEqual(len(tables), 16)
        columns = set()
        for table in tables:
            self.assertEqual(module.sha(table), pins[str(table.relative_to(ROOT))])
            columns.update(re.findall(r'<th>([A-Z0-9]+ / RXM[A-Z0-9]+)</th>', table.read_text()))
        self.assertEqual(len(columns), 33)
        for column in columns:
            indoor, outdoor = column.split(' / ')
            accepted = next(u for u in self.review['units'] if u['reference'] == outdoor)
            self.assertIn(indoor, accepted['compatibleIndoorClasses'])
            self.assertEqual(accepted['pairingEvidenceByIndoor'][indoor]['excerpt'], column)
        a8 = next(u for u in self.review['units'] if u['reference'] == 'RXM50A5V1B8')
        self.assertEqual(set(a8['unresolvedOperatingEndpoints']), {'coolingOutdoorMaximum', 'heatingOutdoorMinimum'})
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            receipt = root / a8['sourceReview']['path']
            receipt.parent.mkdir(parents=True)
            receipt.write_bytes((ROOT / a8['sourceReview']['path']).read_bytes())
            unit = json.loads((ROOT / a8['candidateFile']).read_text())['units'][0]
            with self.assertRaisesRegex(ValueError, 'primary snapshot'):
                module.source_review_metadata(unit, a8, root)

    def test_siesta_eligibility_evidence_retains_exact_combination_boundaries(self):
        page = (ROOT / 'research/sources/luna-next-daikin-2026-catalogue-p335.html').read_text()
        self.assertIn('ATXM20A 25A + 25A', page)
        self.assertIn('multi combinations only', page)
        table = (ROOT / 'research/sources/terra-siesta-atxm-a---2amxm-m9.html').read_text()
        for suffix in ('2', '5'):
            self.assertIn(f'ATXM20A{suffix}V1B / ATXM20A{suffix}V1B / 2AMXM40M4V1B9', table)
        atxf = (ROOT / 'research/sources/terra-siesta-atxf-g---2amxf-a.html').read_text()
        self.assertIn('ATXF25G5V1B / ATXF35G5V1B / 2AMXF40A2V1B', atxf)
        self.assertNotIn('ATXF25F5V1B', atxf)
        arxm = next(u for u in self.review['units'] if u['reference'] == 'ARXM50A5V1B')
        self.assertEqual(set(arxm['unresolvedOperatingEndpoints']), {'coolingOutdoorMaximum', 'heatingOutdoorMinimum'})

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

    def _generate_with_outdoor_refrigerant(self, root, value):
        units = [u for u in self.review['units'] if u['reference'] in ('RXZ25N', 'FTXZ25N')]
        for accepted in units:
            candidate = root / accepted['candidateFile']
            doc = json.loads((ROOT / accepted['candidateFile']).read_text())
            for unit in doc['units']:
                for fact in unit['facts']:
                    if fact['key'] == 'refrigerant':
                        fact['value'] = value
            candidate.parent.mkdir(parents=True, exist_ok=True)
            candidate.write_text(json.dumps(doc))
            accepted['candidateSha256'] = module.sha(candidate)
        review_path = root / 'research/catalogue/equipment-acceptance.json'
        review_path.parent.mkdir(parents=True, exist_ok=True)
        review_path.write_text(json.dumps({**self.review, 'units': units}))
        return module.generate(root)

    def test_outdoor_profiles_carry_their_published_qualified_refrigerant(self):
        outdoors = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        self.assertTrue(outdoors and all(p['refrigerant'] in module.SELECTABLE_OUTDOOR_REFRIGERANTS for p in outdoors))
        with tempfile.TemporaryDirectory() as folder:
            generated = self._generate_with_outdoor_refrigerant(Path(folder), 'R-290')
            profile = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', generated, re.S).group(1))[0]
            self.assertEqual((profile['id'], profile['refrigerant']), ('RXZ25N', 'R290'))
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'R410A is not a qualified selectable outdoor fluid'):
                self._generate_with_outdoor_refrigerant(Path(folder), 'R-410A')

    def test_explicit_installation_shape_is_checked_independently_of_its_receipt(self):
        accepted = next(u for u in self.review['units'] if u['reference'] == '2MXF40A2V1B')
        valid = accepted['installation']
        self.assertEqual(module.checked_installation(valid, 2, {}), valid)
        ports_only = {**valid, 'ports': None, 'minimumConnectedHeads': 2}
        self.assertEqual(module.checked_installation(ports_only, 2, {}), ports_only)
        for broken, message in (({**valid, 'maximumConnectedHeads': 3}, 'head maximum'),
                                ({**valid, 'minimumConnectedHeads': 3}, 'head minimum'),
                                ({**valid, 'exactEligibility': 'valid'}, 'multisplit shape'),
                                ({**valid, 'ports': valid['ports'][:1]}, 'named ports'),
                                ({**valid, 'connectedCapacityClassSumLimitKw': 0}, 'class-sum')):
            with self.assertRaisesRegex(ValueError, message):
                module.checked_installation(broken, 2, {})
        with self.assertRaisesRegex(ValueError, 'head maximum'):
            module.checked_installation(valid, 2, {'maximumIndoorUnits': [{'value': 3}]})

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
        pairing_receipt = json.loads((ROOT / accepted['pairingReview']['path']).read_text())
        with tempfile.TemporaryDirectory() as directory:
            isolated = Path(directory)
            for pin in [accepted['sourceReview'], *receipt['sourcePins'], accepted['pairingReview'], *pairing_receipt['sourcePins']]:
                target = isolated / pin['path']; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / pin['path'], target)
            with self.assertRaisesRegex(ValueError, 'Designated research input'): module.source_review_metadata(unit, accepted, isolated)
            for pin in [*receipt['designatedResearchInputs'], receipt['primaryTableReadback']]:
                target = isolated / pin['path']; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / pin['path'], target)
            module.source_review_metadata(unit, accepted, isolated)
            (isolated / receipt['primaryTableReadback']['path']).write_text('{}')
            with self.assertRaisesRegex(ValueError, 'primary readback'): module.source_review_metadata(unit, accepted, isolated)

    def test_atxc_e_exact_pairing_uses_ev1b_headers_and_keeps_positive_cooling_minimum(self):
        profiles = json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))
        for size in (20, 25, 35, 50, 60, 71):
            p = next(p for p in profiles if p['id'] == f'ARXC{size}EV1B')
            self.assertEqual(p['compatibleIndoorClasses'], [f'ATXC{size}EV1B'])
            self.assertEqual(p['ports'], 1)
            self.assertIsNone(p['coolingHighFanFlowM3h'])
            self.assertEqual(p['marketScope'], 'Europe; France availability unverified')
            self.assertEqual(p['publishedOperatingRangesC']['cooling']['minimum'], 10 if size < 50 else -10)
            self.assertEqual(p['publishedOperatingRangesC']['cooling']['condition'], 'outdoor dry-bulb')
            self.assertEqual(p['publishedOperatingRangesC']['heating'], {'minimum': -15.0, 'maximum': 18.0, 'condition': 'outdoor wet-bulb'})
            entry = next(e for e in self.review['units'] if e['reference'] == p['id'])
            self.assertEqual(entry['pairingEvidence']['sourceId'], 'siesta-pair-e')
            self.assertEqual(entry['pairingEvidence']['excerpt'], f'ATXC{size}EV1B / ARXC{size}EV1B')

    def test_published_classes_require_separate_review_contract_and_never_alias_factory_suffixes(self):
        profiles = {p['id']: p for name in ('CATALOGUE_OUTDOORS', 'CATALOGUE_INDOORS') for p in json.loads(re.search(r'export const ' + name + r' = (.*?) as const;', module.generate(), re.S).group(1))}
        classes = [u for u in self.review['units'] if u.get('identityKind') == 'published-class']
        self.assertEqual(len(classes), 25)
        for accepted in classes:
            profile = profiles[accepted['reference']]
            self.assertEqual(profile['acceptance'], 'reviewed-class-fields')
            self.assertEqual(profile['identityKind'], 'published-class')
            expected_page = ('p.349' if accepted['reference'].startswith(('FTXTP', 'RXTP')) else
                             'p.326' if accepted['reference'].startswith('FVXM') else
                             'p.327' if accepted['reference'].startswith('FDXM') else 'p.320')
            self.assertEqual(profile['sourceEdition'], 'ECPEN26-500 (02/2026), ' + expected_page)
            self.assertEqual(profile['sourceStatus'], 'availability-unknown')
            self.assertEqual(accepted['reference'], accepted['candidateReference'])
        for exact in ('FTXM20A2V1B', 'FTXM25A5V1B', 'RXM25A5V1B9'):
            self.assertNotEqual(profiles[exact]['acceptance'], 'reviewed-class-fields')
            self.assertNotIn('identityKind', profiles[exact])
        self.assertNotIn('CTXM15A', profiles)

    def test_perfera_merged_cells_cooling_vs_heating_flow_and_db_wb_ranges(self):
        profiles = {p['id']: p for name in ('CATALOGUE_OUTDOORS', 'CATALOGUE_INDOORS') for p in json.loads(re.search(r'export const ' + name + r' = (.*?) as const;', module.generate(), re.S).group(1))}
        outdoors = ['RXM20A', 'RXM25A9', 'RXM35A9', 'RXM42A', 'RXM50A8', 'RXM60A', 'RXM71A']
        for i, size in enumerate((20, 25, 35, 42, 50, 60, 71)):
            indoor = profiles[f'FTXM{size}A']; outdoor = profiles[outdoors[i]]
            self.assertEqual(indoor['coolingHighFanFlowM3h'], [714, 714, 792, 798, 762, 936, 948][i])
            self.assertEqual(indoor['caseMm'], {'h': 298, 'w': 804 if i < 5 else 997, 'd': 252 if i < 5 else 292})
            self.assertEqual(outdoor['caseMm'], {'h': 610, 'w': 923, 'd': 367} if i < 5 else {'h': 734, 'w': 954, 'd': 401})
            self.assertEqual(outdoor['compatibleIndoorClasses'], [f'FTXM{size}A'])
            self.assertIsNone(outdoor['coolingHighFanFlowM3h'])
            self.assertEqual(outdoor['publishedOperatingRangesC']['cooling']['maximum'], 50 if i < 6 else 46)
            heating = outdoor['publishedOperatingRangesC']['heating']
            self.assertEqual(heating['minimum'], -21 if i < 6 else -15)
            self.assertIn('wet-bulb', heating['condition'])
            self.assertNotIn('nominalCoolingKw', outdoor)

    def test_class_suffix_unknown_and_layout_review_are_required_not_optional_cache(self):
        accepted = next(u for u in self.review['units'] if u.get('identityKind') == 'published-class')
        doc = json.loads((ROOT / accepted['candidateFile']).read_text()); unit = next(u for u in doc['units'] if u['modelReference'] == accepted['reference'])
        changed = json.loads(json.dumps(unit)); changed['unknowns'] = []
        with self.assertRaisesRegex(ValueError, 'unpublished suffix'): module.source_review_metadata(changed, accepted, ROOT)
        changed = dict(accepted); changed.pop('sourceEdition')
        with self.assertRaisesRegex(ValueError, 'availability claim'): module.source_review_metadata(unit, changed, ROOT)
        receipt = json.loads((ROOT / accepted['sourceReview']['path']).read_text())
        with tempfile.TemporaryDirectory() as directory:
            isolated = Path(directory)
            for item in [accepted['sourceReview'], *receipt['sourcePins'], *receipt.get('designatedResearchInputs', [])]:
                target = isolated / item['path']; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes((ROOT / item['path']).read_bytes())
            with self.assertRaisesRegex(ValueError, 'visual layout review'): module.source_review_metadata(unit, accepted, isolated)


    def test_siesta_outdoor_exact_pair_columns_are_not_arx_rx_aliases(self):
        accepted = [u for u in self.review['units'] if u['candidateFile'].endswith('luna-siesta-outdoor-exact-pairs-2026.json')]
        self.assertEqual(len(accepted), 10)
        self.assertEqual(sum(len(u['compatibleIndoorClasses']) for u in accepted), 13)
        all_refs = {u['reference'] for u in self.review['units']}
        self.assertNotIn('ARXM20A5V1B', all_refs)
        for row in accepted:
            self.assertEqual(row['ports'], 1)
            self.assertEqual(row['sourceStatus'], 'availability-unknown')
            self.assertNotIn('airflow', row['factKeys'])
            self.assertEqual(set(row['pairingEvidenceByIndoor']), set(row['compatibleIndoorClasses']))
            for indoor, evidence in row['pairingEvidenceByIndoor'].items():
                self.assertEqual(evidence['excerpt'], indoor + ' / ' + row['reference'])
                self.assertTrue(indoor.startswith('ATX'))
                self.assertNotIn('ATXM20', indoor)
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        self.assertEqual(profiles['ARXM25A5V1B']['compatibleIndoorClasses'], ['ATXM25A2V1B', 'ATXM25A5V1B'])
        self.assertIn('FTXM25A2V1B', profiles['RXM25A5V1B9']['compatibleIndoorClasses'])
        self.assertEqual(profiles['ARXF60A5V1B9']['compatibleIndoorClasses'], ['ATXF60F2V1B'])
        self.assertEqual(profiles['RXF60D5V1B9']['compatibleIndoorClasses'], ['FTXF60F2V1B'])

    def test_arxm50_individual_source_alternatives_stay_null_with_known_bounds_and_conditions(self):
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        p = profiles['ARXM50A5V1B']; ranges = p['publishedOperatingRangesC']
        self.assertEqual(p['caseMm'], {'h': 734, 'w': 954, 'd': 401})
        self.assertIsNone(p['coolingHighFanFlowM3h'])
        self.assertEqual(ranges['cooling']['minimum'], -10)
        self.assertIsNone(ranges['cooling']['maximum'])
        self.assertIsNone(ranges['heating']['minimum'])
        self.assertEqual(ranges['heating']['maximum'], 18)
        self.assertIn('dry-bulb', ranges['cooling']['condition'])
        self.assertIn('wet-bulb', ranges['heating']['condition'])
        for key in ('nominalCoolingKw', 'factoryCharge', 'electricalInputKw'):
            self.assertNotIn(key, p)
        self.assertEqual(profiles['ARXF42F5V1B']['caseMm'], {'h': 556, 'w': 740, 'd': 343})
        self.assertEqual(profiles['ARXF50F5V1B']['caseMm'], {'h': 610, 'w': 923, 'd': 367})

    def test_nepura_ftxtp_p349_classes_are_receipt_bound_and_keep_exact_suffix_unknown(self):
        refs = {'FTXTP25A', 'RXTP25A', 'FTXTP35A', 'RXTP35A'}
        accepted = [row for row in self.review['units'] if row['reference'] in refs]
        self.assertEqual({row['reference'] for row in accepted}, refs)
        profiles = {p['id']: p for name in ('CATALOGUE_OUTDOORS', 'CATALOGUE_INDOORS')
                    for p in json.loads(re.search(r'export const ' + name + r' = (.*?) as const;', module.generate(), re.S).group(1))}
        for row in accepted:
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == row['reference'])
            metadata = module.source_review_metadata(unit, row, ROOT)
            self.assertEqual(metadata['sourceEdition'], 'ECPEN26-500 (02/2026), p.349')
            self.assertEqual(metadata['marketScope'], 'Europe; France availability unverified')
            self.assertIn('Factory suffix is unpublished in this catalogue table; exact full-SKU eligibility and current retail availability remain unknown.', unit['unknowns'])
            self.assertEqual(profiles[row['reference']]['identityKind'], 'published-class')
        for size in (25, 35):
            indoor, outdoor = profiles[f'FTXTP{size}A'], profiles[f'RXTP{size}A']
            self.assertEqual(indoor['coolingHighFanFlowM3h'], 660)
            self.assertEqual(outdoor['compatibleIndoorClasses'], [f'FTXTP{size}A'])
            self.assertEqual(outdoor['ports'], 1)
            self.assertIsNone(outdoor['coolingHighFanFlowM3h'])
            self.assertEqual(outdoor['publishedOperatingRangesC']['heating']['condition'], 'outdoor wet-bulb')
            self.assertEqual(outdoor['publishedOperatingRangesC']['cooling']['condition'], 'outdoor dry-bulb')

    def test_floor_and_duct_published_classes_preserve_seven_source_pair_columns(self):
        expected = {'FVXM25B': 'RXM25A9', 'FVXM35B': 'RXM35A9', 'FVXM50B': 'RXM50A8',
                    'FDXM25F9': 'RXM25A9', 'FDXM35F9': 'RXM35A9', 'FDXM50F9': 'RXM50A8', 'FDXM60F9': 'RXM60A'}
        pair_columns = {'FVXM25B': '25B + 25A9', 'FVXM35B': '35B + 35A9', 'FVXM50B': '50B + 50A8',
                        'FDXM25F9': '25F9 + 25A9', 'FDXM35F9': '35F9 + 35A9',
                        'FDXM50F9': '50F9 + 50A8', 'FDXM60F9': '60F9 + 60A'}
        accepted = {row['reference']: row for row in self.review['units'] if row['reference'] in expected}
        self.assertEqual(set(accepted), set(expected))
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_INDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        for ref, outdoor in expected.items():
            row = accepted[ref]
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == ref)
            module.source_review_metadata(unit, row, ROOT)
            profile = profiles[ref]
            self.assertEqual(profile['compatibleOutdoorClasses'], [outdoor])
            self.assertEqual(profile['coolingHighFanFlowM3h'], next(f['value'] for f in unit['facts'] if f['key'] == 'airflow' and 'cooling' in f['condition']))
            self.assertEqual(row['classPairingEvidence']['excerpt'], pair_columns[ref])
            self.assertEqual(profile['sourceEdition'], 'ECPEN26-500 (02/2026), ' + ('p.326' if ref.startswith('FVXM') else 'p.327'))

    def test_nepura_ftxta_d_exact_finish_pairs_retain_preliminary_source_boundary(self):
        expected = {f'FTXTA30D2V1B{finish}': f'FTXTA30D2V1B{finish} / RXTA30C2V1B' for finish in 'GLPY'}
        accepted = {row['reference']: row for row in self.review['units'] if row['reference'] in expected}
        self.assertEqual(set(accepted), set(expected))
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_INDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        for ref, excerpt in expected.items():
            row = accepted[ref]
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == ref)
            module.source_review_metadata(unit, row, ROOT)
            self.assertEqual(row['classPairingEvidence']['excerpt'], excerpt)
            self.assertEqual(profiles[ref]['compatibleOutdoorClasses'], ['RXTA30C2V1B'])
            self.assertEqual(profiles[ref]['coolingHighFanFlowM3h'], 786)
            self.assertTrue(any('preliminary' in note.lower() for note in unit['unknowns']))
            for fact in unit['facts']:
                if fact['key'] != 'airflow' or 'cooling' in fact['condition']:
                    self.assertIn('preliminary', fact.get('condition', ''))
            self.assertNotIn('nominalCoolingKw', profiles[ref])

    def test_sensira_3mxf_a9_imports_only_published_typed_connection_rules(self):
        refs = {'3MXF52A2V1B9', '3MXF68A2V1B9'}
        accepted = {row['reference']: row for row in self.review['units'] if row['reference'] in refs}
        self.assertEqual(set(accepted), refs)
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        for ref in refs:
            row = accepted[ref]
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == ref)
            module.source_review_metadata(unit, row, ROOT)
            profile = profiles[ref]
            installation = profile['installation']
            self.assertEqual(profile['ports'], 3)
            self.assertEqual(profile['compatibleIndoorClasses'], [])
            self.assertEqual(installation['minimumConnectedHeads'], None)
            self.assertEqual(installation['maximumConnectedHeads'], 3)
            self.assertEqual(installation['connectedCapacityClassSumLimitKw'], 9.0)
            self.assertEqual(installation['publishedMaximumTotalChargeKg'], 2.2 if '52' in ref else 2.4)
            self.assertEqual([p['id'] for p in installation['ports']], ['A', 'B', 'C'])
            self.assertEqual(installation['ports'][0]['gasConnectionOuterDiameterMm'], 9.5)
            self.assertEqual(installation['ports'][1]['gasConnectionOuterDiameterMm'], 12.7)
            self.assertEqual(installation['ports'][0]['alternatives'][-1]['onlyGuideNamedIndoorClasses'], ['FTXF42F'])
            self.assertEqual(installation['exactEligibility'], 'unknown')
            self.assertIsNone(profile['coolingHighFanFlowM3h'])
            self.assertEqual(profile['publishedOperatingRangesC']['cooling']['condition'], 'outdoor dry-bulb')

    def test_sensira_2mxf_a_imports_current_port_rules_and_exact_table_combinations(self):
        refs = {'2MXF40A2V1B', '2MXF50A2V1B'}
        accepted = {row['reference']: row for row in self.review['units'] if row['reference'] in refs}
        self.assertEqual(set(accepted), refs)
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_OUTDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        expected = {
            '2MXF40A2V1B': (6.0, 9.5, 'none', [20, 25, 35]),
            '2MXF50A2V1B': (8.5, 12.7, '1+2', [20, 25, 35, 42]),
        }
        for ref, (cap, port_b_mm, reducer_b, classes) in expected.items():
            row = accepted[ref]
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == ref)
            module.source_review_metadata(unit, row, ROOT)
            profile = profiles[ref]
            installation = profile['installation']
            self.assertEqual(profile['ports'], 2)
            self.assertEqual(profile['compatibleIndoorClasses'], [])
            self.assertIsNone(installation['minimumConnectedHeads'])
            self.assertEqual(installation['maximumConnectedHeads'], 2)
            self.assertEqual(installation['connectedCapacityClassSumLimitKw'], cap)
            self.assertEqual([p['id'] for p in installation['ports']], ['A', 'B'])
            self.assertEqual(installation['ports'][0]['gasConnectionOuterDiameterMm'], 9.5)
            self.assertEqual(installation['ports'][1]['gasConnectionOuterDiameterMm'], port_b_mm)
            self.assertEqual(installation['ports'][0]['alternatives'][0]['capacityClasses'], classes)
            self.assertEqual(installation['ports'][1]['alternatives'][0]['reducer'], reducer_b)
            self.assertEqual(installation['exactEligibility'], 'unknown')
            self.assertIsNone(profile['coolingHighFanFlowM3h'])

    def test_siesta_atxp_n9_exact_partner_references_are_source_pinned(self):
        pairs = {'ATXP20N5V1B9': 'ARXP20N5V1B9', 'ATXP25N5V1B9': 'ARXP25N5V1B9', 'ATXP35N5V1B9': 'ARXP35N5V1B9'}
        accepted = {row['reference']: row for row in self.review['units'] if row['reference'] in pairs}
        self.assertEqual(set(accepted), set(pairs))
        profiles = {p['id']: p for p in json.loads(re.search(r'export const CATALOGUE_INDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        for ref, partner in pairs.items():
            row = accepted[ref]
            doc = json.loads((ROOT / row['candidateFile']).read_text())
            unit = next(u for u in doc['units'] if u['modelReference'] == ref)
            module.source_review_metadata(unit, row, ROOT)
            self.assertEqual(profiles[ref]['compatibleOutdoorReferences'], [partner])
        changed = dict(accepted['ATXP20N5V1B9']); changed['compatibleOutdoorReferences'] = ['ARXP25N5V1B9']
        doc = json.loads((ROOT / changed['candidateFile']).read_text()); unit = next(u for u in doc['units'] if u['modelReference'] == changed['candidateReference'])
        with self.assertRaisesRegex(ValueError, 'Exact indoor/outdoor pairing differs'):
            module.source_review_metadata(unit, changed, ROOT)

    def test_partial_range_requires_reviewed_unknowns_and_rejects_numeric_alternative_substitution(self):
        accepted = next(u for u in self.review['units'] if u['reference'] == 'ARXM50A5V1B')
        doc = json.loads((ROOT / accepted['candidateFile']).read_text()); unit = next(u for u in doc['units'] if u['modelReference'] == accepted['reference'])
        module.source_review_metadata(unit, accepted, ROOT)
        changed = dict(accepted); changed.pop('unresolvedOperatingEndpoints')
        with self.assertRaisesRegex(ValueError, 'Unresolved operating endpoints'): module.source_review_metadata(unit, changed, ROOT)
        for key, values in [('coolingOutdoorMaximum', [50, 46]), ('heatingOutdoorMinimum', [-21, -15])]:
            for value in values:
                changed = json.loads(json.dumps(unit)); changed['facts'].append({'key': key, 'value': value})
                with self.assertRaisesRegex(ValueError, 'alternative cannot be substituted'): module.source_review_metadata(changed, accepted, ROOT)
        changed = json.loads(json.dumps(unit)); changed['unknowns'] = []
        with self.assertRaisesRegex(ValueError, 'unknown boundary'): module.source_review_metadata(changed, accepted, ROOT)

    def test_every_siesta_exact_colour_suffix_pair_is_receipt_bound(self):
        accepted = next(u for u in self.review['units'] if u['reference'] == 'ARXM25A5V1B')
        doc = json.loads((ROOT / accepted['candidateFile']).read_text()); unit = next(u for u in doc['units'] if u['modelReference'] == accepted['reference'])
        changed = json.loads(json.dumps(accepted)); changed['pairingEvidenceByIndoor']['ATXM25A5V1B']['excerpt'] = 'FTXM25A5V1B / RXM25A5V1B9'
        with self.assertRaisesRegex(ValueError, 'per-indoor pairing evidence'): module.source_review_metadata(unit, changed, ROOT)
        changed = json.loads(json.dumps(unit)); changed['compatibility'] = changed['compatibility'][:1]
        with self.assertRaisesRegex(ValueError, 'exact pair column is absent'): module.source_review_metadata(changed, accepted, ROOT)



class TerraHeadCandidateSourceChecks(unittest.TestCase):
    def test_ffa_fna_candidates_are_column_pinned_and_accepted_without_pairs(self):
        import hashlib
        for family, digest, flows in (
            ('ffa', 'afdbce9eeede3cffbd66457c25b1197ab4343aba1a429247de871ee95e2958c8', [540, 600, 762, 870]),
            ('fna', '4125f3b75faee791d2b877f10bfdc1d987fbc26fb9485fd3348fa86aa6c2c286', [522, 522, 960, 960]),
        ):
            source = ROOT / f'research/sources/terra-daikin-{family}-a9-table.html'
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)
            candidate = json.loads((ROOT / f'research/catalogue/staging/terra-daikin-{family}-a9.json').read_text())
            self.assertEqual([u['modelReference'] for u in candidate['units']], [f'{family.upper()}{n}A2VEB9' for n in (25, 35, 50, 60)])
            self.assertEqual([next(f['value'] for f in u['facts'] if f['key'] == 'airflow') for u in candidate['units']], flows)
            self.assertTrue(all(not u['compatibility'] for u in candidate['units']))

    def test_terra_fna_height_footnote_and_unpaired_physical_profiles(self):
        html = (ROOT / 'research/sources/terra-daikin-fna-a9-table.html').read_text()
        self.assertIn('620, 720 (1)', html)
        self.assertIn('(1) - Including installation legs', html)
        generated = module.generate()
        profiles = {p['id']: p for p in json.loads(re.search(
            r'export const CATALOGUE_INDOORS = (.*?) as const;', generated, re.S).group(1))}
        for family in ('FFA', 'FNA'):
            for size in (25, 35, 50, 60):
                profile = profiles[f'{family}{size}A2VEB9']
                self.assertNotIn('compatibleOutdoorClasses', profile)
                self.assertNotIn('compatibleOutdoorReferences', profile)
                self.assertEqual(profile['caseMm']['h'], 620 if family == 'FNA' else 260)

class TerraAdditionalHeadSourceChecks(unittest.TestCase):
    def test_columns_receipts_and_runtime_preserve_only_evidenced_fields(self):
        import hashlib, html
        expected = {
            'fba-a9': ('1316387ffaab1e2f8b8da9cd7969c52a487237f38953c5a8587738dde01eda2c', 3),
            'fcag-b': ('21be15ff985396aad77e627c02b355a90cbfc7ba7a5bdde25c407b8eb9834783', 3),
            'fha-a9': ('eade582361ab80a01524e49927602658c7326c0c05393420556059ef106c1610', 8),
        }
        profiles = {p['id']: p for p in json.loads(re.search(
            r'export const CATALOGUE_INDOORS = (.*?) as const;', module.generate(), re.S).group(1))}
        acceptance = json.loads((ROOT / 'research/catalogue/equipment-acceptance.json').read_text())
        for slug, (digest, count) in expected.items():
            path = ROOT / f'research/sources/terra-daikin-{slug}-table.html'
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)
            markup = path.read_text()
            rows = []
            for row in re.findall(r'<tr[^>]*>(.*?)</tr>', markup, re.S):
                cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)
                rows.append([html.unescape(re.sub(r'<[^>]+>', '', cell)).strip() for cell in cells])
            doc = json.loads((ROOT / f'research/catalogue/staging/terra-daikin-{slug}.json').read_text())
            self.assertEqual(len(doc['units']), count)
            header = next(row for row in rows if doc['units'][0]['modelReference'] in row)
            dimension_rows = [next(row for row in rows if row[:4] == prefix) for prefix in (
                ['Dimensions', 'Unit', 'Height', 'mm'], ['', '', 'Width', 'mm'], ['', '', 'Depth', 'mm'])]
            airflow = next(row for row in rows if row[:5] == ['Fan', 'Air flow rate', 'Cooling', 'High', 'm³/min'])
            for unit in doc['units']:
                ref = unit['modelReference']
                idx = header.index(ref) - 1 + 5
                facts = {f['key']: f['value'] for f in unit['facts']}
                self.assertEqual([facts[k] for k in ('height', 'width', 'depth')], [float(row[idx - 1]) for row in dimension_rows])
                self.assertAlmostEqual(facts['airflow'], float(airflow[idx]) * 60)
                self.assertEqual(unit['compatibility'], [])
                accepted = next(row for row in acceptance['units'] if row['reference'] == ref)
                module.source_review_metadata(unit, accepted, ROOT)
                profile = profiles[ref]
                self.assertEqual(profile['caseMm'], dict(zip(('h', 'w', 'd'), (facts[k] for k in ('height', 'width', 'depth')))))
                self.assertEqual(profile['coolingHighFanFlowM3h'], facts['airflow'])
                self.assertNotIn('compatibleOutdoorClasses', profile)
                self.assertNotIn('compatibleOutdoorReferences', profile)
            if slug == 'fha-a9':
                idx = header.index('FHA60AVEB99') - 1 + 5
                self.assertTrue(all(not row[idx - 1] for row in dimension_rows) and not airflow[idx])
                self.assertNotIn('FHA60AVEB99', profiles)
                self.assertTrue(any(u['modelReference'] == 'FHA60AVEB99' for u in doc['unresolvedReferences']))

if __name__ == '__main__':
    unittest.main()
