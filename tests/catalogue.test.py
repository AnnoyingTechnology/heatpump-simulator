"""Checks the acceptance boundary, not just the format of generated profiles."""
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
                   'coolingOutdoorMinimum', 'coolingOutdoorMaximum'}
        for unit in self.review['units']:
            self.assertLessEqual(set(unit['factKeys']), allowed)
            self.assertNotIn('factoryCharge', unit['factKeys'])
        self.assertNotIn('electricalInputKw', module.generate())

    def test_daikin_colour_pairing_and_unpublished_airflow_are_explicit(self):
        outdoors = [u for u in self.review['units'] if u['reference'].startswith('RXA')]
        self.assertEqual({u['reference'] for u in outdoors}, {'RXA25A9', 'RXA35A9', 'RXA42B', 'RXA50B'})
        for outdoor in outdoors:
            self.assertEqual(outdoor['ports'], 1)
            self.assertEqual(len(outdoor['compatibleIndoorClasses']), 4)
            self.assertEqual({ref[-2:] for ref in outdoor['compatibleIndoorClasses']}, {'AW', 'BS', 'BT', 'BB'})
            self.assertTrue(outdoor['unpublishedOutdoorAirflow'])
        self.assertFalse(any(u['reference'].startswith(('FTXA20', 'CTXA15')) for u in self.review['units']))

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


if __name__ == '__main__':
    unittest.main()
