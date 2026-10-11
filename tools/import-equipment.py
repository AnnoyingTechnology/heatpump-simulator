#!/usr/bin/env python3
"""Generate runtime equipment from a bounded, source-reviewed acceptance list.

Candidate schema validation is separate from human source acceptance. A changed
candidate or primary PDF cannot silently update an accepted equipment profile.
No compressor map, heat-exchanger UA or electrical operating floor is inferred.
"""
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def multisplit_installation(unit, accepted, root):
    """Promote independently reviewed necessary installation rules, not OEM pair maps."""
    receipt = accepted['installationReview']
    path = root / receipt['path']
    if not path.exists() or sha(path) != receipt['sha256']:
        raise ValueError('Multisplit independent review receipt is missing or changed')
    reviewed = json.loads(path.read_text())
    if reviewed['candidate'] != {'path': accepted['candidateFile'], 'sha256': accepted['candidateSha256']}:
        raise ValueError('Multisplit review does not bind the accepted candidate')
    for source in reviewed['sourcePins']:
        snapshot = root / source['path']
        if not snapshot.exists() or sha(snapshot) != source['sha256']:
            raise ValueError('Required multisplit primary source is missing or changed')
    if accepted.get('compatibleIndoorClasses') != [] or accepted.get('pairingStatus') != 'unknown':
        raise ValueError('Unresolved multisplit full-SKU eligibility must remain unknown')
    if accepted.get('installationSourceBoundary') == 'legacy-unresolved':
        readback = next(r for r in reviewed['reviewedReadbacks'] if r['reference'] == unit['modelReference'])
        if readback['maximumConnectedHeads'] != accepted['ports']:
            raise ValueError('Legacy published maximum head count is inconsistent')
        for field in ('minimumConnectedHeads', 'classSumLimit', 'namedPortConstraints', 'highFanAirflow'):
            if readback[field] is not None:
                raise ValueError('Unreviewed legacy installation or high-fan inference')
        if set(accepted.get('unpublishedOperatingEndpoints', [])) != set(readback['unpublishedEndpoints']):
            raise ValueError('Unpublished legacy operating endpoints must be explicit and receipt-bound')
        facts = {f['key']: f['value'] for f in unit['facts']}
        for key, value in readback['operatingEndpoints'].items():
            if facts.get(key) != value or key not in accepted['factKeys']:
                raise ValueError('Legacy operating endpoint disagrees with independent source readback')
        for key in readback['unpublishedEndpoints']:
            if key in facts or not any(key in note and 'unpublished' in note for note in unit.get('unknowns', [])):
                raise ValueError('Unpublished legacy endpoint cannot be inferred or omitted from unknowns')
        return {'topology': 'multisplit', 'minimumConnectedHeads': None,
                'maximumConnectedHeads': accepted['ports'], 'connectedCapacityClassSumLimitKw': None,
                'ports': None, 'guide': 'Reviewed legacy N-generation sources; port/class/reducer rules unresolved',
                'exactEligibility': 'unknown', 'publishedMaximumTotalChargeKg': None}
    compatibility = unit['compatibility']
    ports = []
    for statement in compatibility:
        text = statement['description']
        match = re.match(r'Port ([A-E]) \(gas connection Ø([\d.]+) mm\): (.*?)\. These are', text)
        if not match:
            continue
        letter, diameter, body = match.groups()
        alternatives = []
        for part in body.split('; '):
            if part.startswith('footnote (a)'):
                if not alternatives or alternatives[-1]['capacityClasses'] != [42] or part != 'footnote (a) restricts class 42 to FTXM42R, FTXM42A, FTXA42C':
                    raise ValueError('Unreviewed conditional connection-class rule')
                alternatives[-1]['onlyGuideNamedIndoorClasses'] = ['FTXM42R', 'FTXM42A', 'FTXA42C']
            else:
                row = re.fullmatch(r'classes ([\d, ]+) -> reducer (.*)', part)
                if not row:
                    raise ValueError('Unreviewed connection alternative')
                classes, reducer = row.groups()
                if reducer == 'OPTIONAL ACCESSORY (accessory identity not given in table)':
                    reducer = 'optional accessory (not identified by this table)'
                if reducer not in ('none', '1+2', '2+4', '5+6', '1+3', 'optional accessory (not identified by this table)'):
                    raise ValueError('Unreviewed reducer identity')
                alternatives.append({'capacityClasses': [int(value) for value in classes.split(', ')], 'reducer': reducer})
        evidence = statement['evidence']
        expected_page = 37 if evidence['sourceId'] == 'g4c' else 39
        if f'Printed p.{expected_page},' not in evidence['locator'] or f'port {letter}.' not in evidence['locator']:
            raise ValueError('Multisplit port source locator is inconsistent')
        ports.append({'id': letter, 'gasConnectionOuterDiameterMm': float(diameter), 'alternatives': alternatives})
    if [p['id'] for p in ports] != list('ABCDE'[:accepted['ports']]):
        raise ValueError('Multisplit named-port topology is incomplete')
    count = next(c for c in compatibility if c['description'].startswith('At least 2'))
    if 'physically connected' not in count['description'] or f"maximum {accepted['ports']}" not in count['description']:
        raise ValueError('Multisplit connected-head count is inconsistent')
    limit = float(re.search(r'≤([\d.]+) kW', compatibility[0]['description']).group(1))
    caps = [c for c in compatibility if c['description'].startswith('Maximum allowable total refrigerant charge')]
    cap = float(re.search(r'is ([\d.]+) kg', caps[0]['description']).group(1)) if caps else None
    if caps and ('Printed p.48' not in caps[0]['evidence']['locator'] or 'table 8-1' not in caps[0]['evidence']['locator']):
        raise ValueError('Multisplit charge cap source locator is inconsistent')
    return {'topology': 'multisplit', 'minimumConnectedHeads': 2, 'maximumConnectedHeads': accepted['ports'],
            'connectedCapacityClassSumLimitKw': limit, 'ports': ports,
            'guide': '4P766272-4C (2025.05)' if count['evidence']['sourceId'] == 'g4c' else '4P766272-5C (2025.05)', 'exactEligibility': 'unknown',
            'publishedMaximumTotalChargeKg': cap}


def source_review_metadata(unit, accepted, root):
    """Bind new source-qualified profiles and market claims to an independent receipt."""
    receipt = accepted['sourceReview']
    path = root / receipt['path']
    if not path.exists() or sha(path) != receipt['sha256']:
        raise ValueError('Independent source review receipt is missing or changed')
    reviewed = json.loads(path.read_text())
    if reviewed['candidate'] != {'path': accepted['candidateFile'], 'sha256': accepted['candidateSha256']}:
        raise ValueError('Independent source review does not bind the accepted candidate')
    for source in reviewed['sourcePins']:
        path = root / source['path']
        if not path.exists() or sha(path) != source['sha256']:
            raise ValueError('Required source-qualified primary snapshot is missing or changed')
    row = next(r for r in reviewed['reviewedUnits'] if r['reference'] == unit['modelReference'])
    if unit['status'] != row['candidateStatus'] or set(accepted['factKeys']) != set(row['factKeys']):
        raise ValueError('Source-reviewed status or applied field set changed')
    for fact in unit['facts']:
        if fact['key'] in row['factValues']:
            if fact['value'] != row['factValues'][fact['key']] or fact.get('condition') != row.get('factConditions', {}).get(fact['key']):
                raise ValueError('Source-qualified fact or condition differs from independent readback')
    if accepted['ports'] != row['ports'] or accepted['compatibleIndoorClasses'] != row['compatibleIndoorClasses'] or accepted['pairingEvidence'] != row['pairingEvidence']:
        raise ValueError('Source-reviewed exact pairing or topology changed')
    metadata = row['runtimeMetadata']
    if any(accepted.get(k) != value for k, value in metadata.items()):
        raise ValueError('Region or availability claim differs from independent source review')
    if set(metadata) != {'sourceStatus', 'marketScope'} or metadata['sourceStatus'] != 'availability-unknown':
        raise ValueError('Unreviewed source-status metadata contract')
    return metadata


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
            if accepted.get('topology') == 'multisplit':
                referenced |= {c['evidence']['sourceId'] for c in unit['compatibility']}
            else:
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
        if 'sourceReview' in accepted:
            profile.update(source_review_metadata(unit, accepted, root))
        capacity = by_key.get('capacityClass')
        if capacity:
            profile['nominalCoolingKw'] = capacity[0]['value']
        if unit['unitType'] == 'outdoor':
            refrigerant = by_key['refrigerant'][0]['value']
            if refrigerant not in ('R32', 'R-32'):
                raise ValueError('Only validated R32 profiles can be selected')
            profile.update(ports=accepted['ports'],
                           compatibleIndoorClasses=accepted['compatibleIndoorClasses'])
            if accepted.get('topology') == 'multisplit':
                if accepted['ports'] != by_key['maximumIndoorUnits'][0]['value']:
                    raise ValueError('Accepted multisplit head cap disagrees with published value')
                profile['installation'] = multisplit_installation(unit, accepted, root)
                if accepted.get('installationSourceBoundary') == 'legacy-unresolved':
                    if unit.get('status') != 'legacy':
                        raise ValueError('Legacy source boundary cannot imply current availability')
                    profile['sourceStatus'] = 'legacy'
            if accepted.get('installationSourceBoundary') == 'legacy-unresolved':
                receipt = json.loads((root / accepted['installationReview']['path']).read_text())
                readback = next(r for r in receipt['reviewedReadbacks'] if r['reference'] == unit['modelReference'])
                profile['publishedOperatingRangesC'] = {
                    mode: {'minimum': by_key[mode + 'OutdoorMinimum'][0]['value'] if mode + 'OutdoorMinimum' in by_key else None,
                           'maximum': by_key[mode + 'OutdoorMaximum'][0]['value'] if mode + 'OutdoorMaximum' in by_key else None,
                           'condition': readback['operatingConditions'][mode]}
                    for mode in ('cooling', 'heating')}
            else:
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
        if p['unitType'] == 'outdoor' and 'installation' not in p and (p['ports'] != 1 or not set(p['compatibleIndoorClasses']).issubset(indoor_ids)):
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
