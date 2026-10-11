#!/usr/bin/env python3
"""Generate runtime equipment from a bounded, source-reviewed acceptance list.

Candidate schema validation is separate from human source acceptance. A changed
candidate or primary PDF cannot silently update an accepted equipment profile.
No compressor map, heat-exchanger UA or electrical operating floor is inferred.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate(root=ROOT):
    review = json.loads((root / 'research/catalogue/equipment-acceptance.json').read_text())
    # The original PDF is a research cache, not a runtime dependency.
    pdf = root / review['sourceFile']
    if pdf.exists() and sha(pdf) != review['sourceSha256']:
        raise ValueError('Primary PDF changed; source acceptance must be repeated')
    for source in review.get('additionalSourceSnapshots', []):
        path = root / source['sourceFile']
        if path.exists() and sha(path) != source['sourceSha256']:
            raise ValueError(f"Additional source snapshot changed: {source['sourceFile']}")
    profiles = []
    for accepted in review['units']:
        candidate = root / accepted['candidateFile']
        if sha(candidate) != accepted['candidateSha256']:
            raise ValueError(f"Candidate changed: {accepted['candidateFile']}")
        doc = json.loads(candidate.read_text())
        if doc['manufacturer'] not in ('daikin', 'mitsubishi-electric'):
            raise ValueError('Unreviewed manufacturer')
        unit = next(u for u in doc['units'] if u['modelReference'] == accepted['candidateReference'])
        selected = []
        for fact_key in accepted['factKeys']:
            facts = [f for f in unit['facts'] if f['key'] == fact_key]
            if not facts:
                raise ValueError(f"Missing accepted fact: {unit['modelReference']} {fact_key}")
            selected.extend(facts)
        by_key = {key: [f for f in selected if f['key'] == key] for key in accepted['factKeys']}
        # Mode must be explicitly selected in the acceptance record; published
        # heating airflow must never accidentally replace cooling high fan flow.
        if 'coolingAirflowCondition' in accepted:
            eligible_flow = [f for f in by_key.get('airflow', []) if f['condition'] == accepted['coolingAirflowCondition']]
        else:
            eligible_flow = [f for f in by_key.get('airflow', []) if 'cooling' in f['condition'].lower() or 'froid' in f['condition'].lower()]
        candidate_has_airflow = any(f['key'] == 'airflow' for f in unit['facts'])
        generic_outdoor_flow = unit['unitType'] == 'outdoor' and accepted.get('unpublishedOutdoorAirflow') is True and 'airflow' not in by_key
        generic_indoor_flow = unit['unitType'] == 'indoor' and accepted.get('unpublishedIndoorAirflow') is True and not candidate_has_airflow
        if accepted.get('unpublishedIndoorAirflow') is True and candidate_has_airflow:
            raise ValueError('Indoor airflow cannot be marked unpublished when candidate facts provide it')
        if generic_indoor_flow and not any('airflow' in note.lower() and 'unpublished' in note.lower()
                                           for note in unit.get('unknowns', [])):
            raise ValueError('Unpublished indoor airflow must be stated in the candidate unknowns')
        if not eligible_flow and not generic_outdoor_flow and not generic_indoor_flow:
            raise ValueError('Accepted cooling fan-flow condition is absent')
        airflow = max(eligible_flow, key=lambda f: f['value']) if eligible_flow else None
        dimensions = {key: by_key[key][0]['value'] for key in ('height', 'width', 'depth')}
        scalars = [*dimensions.values()] + ([airflow['value']] if airflow else [])
        if any(not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0 for v in scalars):
            raise ValueError('Accepted airflow/casing must be positive scalar values')
        sources = {s['id']: s for s in doc['sources']}
        identity = accepted.get('identityEvidence', unit['identityEvidence'])
        referenced = {f['evidence']['sourceId'] for f in selected} | {identity['sourceId']}
        if unit['unitType'] == 'outdoor':
            referenced.add(accepted['pairingEvidence']['sourceId'])
            pairing_by_indoor = accepted.get('pairingEvidenceByIndoor')
            if pairing_by_indoor is not None:
                expected = set(accepted['compatibleIndoorClasses'])
                if set(pairing_by_indoor) != expected:
                    raise ValueError('Pairing evidence must cover every compatible indoor reference exactly')
                for evidence in pairing_by_indoor.values():
                    if not all(evidence.get(key) for key in ('sourceId', 'locator', 'excerpt')):
                        raise ValueError('Pairing evidence is incomplete')
                    referenced.add(evidence['sourceId'])
        if not referenced.issubset(sources):
            raise ValueError('Accepted field references an absent source')
        profile = {
            'id': accepted['reference'], 'manufacturer': doc['manufacturer'],
            'unitType': unit['unitType'],
            'acceptance': 'reviewed-fields',
            'caseMm': {'h': dimensions['height'], 'w': dimensions['width'], 'd': dimensions['depth']},
            'coolingHighFanFlowM3h': airflow['value'] if airflow else None,
        }
        capacity = by_key.get('capacityClass')
        if capacity:
            profile['nominalCoolingKw'] = capacity[0]['value']
        if unit['unitType'] == 'outdoor':
            refrigerant = by_key['refrigerant'][0]['value']
            if refrigerant not in ('R32', 'R-32'):
                raise ValueError('Only validated R32 profiles can be selected')
            profile.update(ports=accepted['ports'],
                           compatibleIndoorClasses=accepted['compatibleIndoorClasses'])
            profile['publishedOperatingRangesC'] = {
                mode: {'minimum': by_key[mode + 'OutdoorMinimum'][0]['value'],
                       'maximum': by_key[mode + 'OutdoorMaximum'][0]['value'],
                       'condition': by_key[mode + 'OutdoorMinimum'][0]['condition']}
                for mode in ('cooling', 'heating')}
        profiles.append(profile)
    refs = [p['id'] for p in profiles]
    if len(refs) != len(set(refs)):
        raise ValueError('Duplicate equipment identity')
    indoor_ids = {p['id'] for p in profiles if p['unitType'] == 'indoor'}
    for p in profiles:
        if p['unitType'] == 'outdoor' and (p['ports'] != 1 or not set(p['compatibleIndoorClasses']).issubset(indoor_ids)):
            raise ValueError('Accepted monosplit topology/pairing is inconsistent')
    groups = [(name, [p for p in profiles if p['unitType'] == kind]) for name, kind in
              [('CATALOGUE_OUTDOORS', 'outdoor'), ('CATALOGUE_INDOORS', 'indoor')]]
    result = '// Generated by tools/import-equipment.py from source-reviewed fields. Do not edit.\n'
    result += '// Full evidence: research/catalogue/equipment-acceptance.json and its hash-pinned candidate files.\n'
    for name, profiles in groups:
        # Type is encoded by the separate arrays. Research-only source excerpts,
        # field evidence and hashes remain in the immutable acceptance/candidates,
        # not repeated in the browser bundle for every colour variant.
        profiles = [{key: value for key, value in p.items() if key != 'unitType'} for p in profiles]
        result += 'export const ' + name + ' = ' + json.dumps(profiles, ensure_ascii=False, indent=2) + ' as const;\n\n'
    return result


if __name__ == '__main__':
    target = ROOT / 'src/equipment-data.ts'
    target.write_text(generate())
    print(f'Generated {target.relative_to(ROOT)}')
