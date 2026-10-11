#!/usr/bin/env python3
"""Validate candidate structure and numeric consistency; never certifies source truth.

Development/research tool only. Requires jsonschema; no Python runs in the site.
Usage: python3 tools/validate-catalogue.py research/catalogue/staging/*.json
"""
import json
import math
import sys
from pathlib import Path
from urllib.parse import urlparse

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / 'research/catalogue/catalogue.schema.json').read_text())
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
UNITS = {
    'capacityClass': 'kW', 'SEER': 'none', 'SCOP': 'none',
    'refrigerant': 'none', 'factoryCharge': 'kg', 'maximumIndoorUnits': 'none',
    'controlStrategy': 'none', 'height': 'mm', 'width': 'mm', 'depth': 'mm',
    'mass': 'kg', 'airflow': 'm3/h', 'fanMotorOutput': 'W', 'fanElectricalInput': 'W',
    'heatingOutdoorMinimum': 'degC', 'heatingOutdoorMaximum': 'degC',
    'coolingOutdoorMinimum': 'degC', 'coolingOutdoorMaximum': 'degC',
    'maximumTotalPipeLength': 'm', 'maximumBranchPipeLength': 'm',
    'maximumHeightDifference': 'm', 'additionalChargePerLength': 'kg/m',
    'prechargedPipeLength': 'm', 'liquidConnectionDiameter': 'mm',
    'gasConnectionDiameter': 'mm', 'soundPressure': 'dBA', 'soundPower': 'dBA',
    'supplyVoltage': 'V', 'supplyPhases': 'none', 'supplyFrequency': 'Hz',
}


def validate(data, seen):
    errors = [f'{list(e.path)}: {e.message}' for e in VALIDATOR.iter_errors(data)]
    if errors:
        return errors
    ids = [s['id'] for s in data['sources']]
    if len(ids) != len(set(ids)):
        errors.append('duplicate source IDs')
    for source in data['sources']:
        uri = urlparse(source['url'])
        if uri.scheme != 'https' or not uri.hostname:
            errors.append(f"{source['id']}: source must use a complete HTTPS URL")
    def evidence(e):
        if e['sourceId'] not in ids:
            errors.append(f"evidence points to absent source {e['sourceId']}")
    for unit in data['units']:
        ref = unit['modelReference']
        identity = (data['manufacturer'], data['market'].casefold(), ref.casefold())
        if identity in seen:
            errors.append(f'{ref}: duplicate unit reference in the same market')
        seen.add(identity)
        evidence(unit['identityEvidence'])
        keys = set()
        for fact in unit['facts']:
            key, value = fact['key'], fact['value']
            evidence(fact['evidence'])
            identity = (key, fact.get('condition'))
            if identity in keys:
                errors.append(f'{ref}: duplicate {key} for the same conditions')
            keys.add(identity)
            if fact['unit'] != UNITS[key]:
                errors.append(f'{ref}: {key} needs {UNITS[key]}, got {fact["unit"]}')
            if key == 'controlStrategy' and value not in ('inverter', 'on-off', None):
                errors.append(f'{ref}: unknown control strategy')
            if key == 'refrigerant' and value is not None and (not isinstance(value, str) or not value.strip()):
                errors.append(f'{ref}: refrigerant needs a non-empty identifier')
            if isinstance(value, dict):
                values = [value.get(k) for k in ('minimum', 'nominal', 'maximum')]
                present = [v for v in values if v is not None]
                if key in ('refrigerant', 'controlStrategy', 'maximumIndoorUnits', 'supplyPhases'):
                    errors.append(f'{ref}: {key} requires a scalar fact')
                elif not present or any(not math.isfinite(v) for v in present) or present != sorted(present):
                    errors.append(f'{ref}: invalid {key} fact range')
                elif not key.startswith(('heatingOutdoor', 'coolingOutdoor')) and any(v < 0 for v in present):
                    errors.append(f'{ref}: negative {key} fact range')
                continue
            if key not in ('refrigerant', 'controlStrategy') and value is not None:
                if not isinstance(value, (int, float)) or not math.isfinite(value):
                    errors.append(f'{ref}: {key} needs a finite number')
                elif not key.startswith(('heatingOutdoor', 'coolingOutdoor')) and value < 0:
                    errors.append(f'{ref}: negative {key}')
                elif key == 'maximumIndoorUnits' and (value < 1 or value != int(value)):
                    errors.append(f'{ref}: connection count must be a positive integer')
                elif key == 'supplyPhases' and value not in (1, 3):
                    errors.append(f'{ref}: unsupported number of supply phases')
        for rating in unit['ratings']:
            evidence(rating['evidence'])
            for key in ('thermalCapacityKw', 'electricalInputKw'):
                values = [rating[key].get(k) for k in ('minimum', 'nominal', 'maximum')]
                present = [v for v in values if v is not None]
                if any(not math.isfinite(v) or v < 0 for v in present):
                    errors.append(f'{ref}: invalid {key} range')
                elif present != sorted(present):
                    errors.append(f'{ref}: unordered {key} min/nominal/max')
        for compatible in unit['compatibility']:
            evidence(compatible['evidence'])
    return errors


def main():
    if len(sys.argv) < 2:
        raise SystemExit('Supply candidate JSON paths. No candidates were validated.')
    seen, failed, units = set(), False, 0
    for arg in sys.argv[1:]:
        path = Path(arg)
        try:
            data = json.loads(path.read_text(), parse_constant=lambda s: (_ for _ in ()).throw(ValueError(f'Non-finite JSON {s}')))
            errors = validate(data, seen)
        except (OSError, ValueError) as error:
            errors = [str(error)]
        if errors:
            failed = True
            for error in errors:
                print(f'FAIL {path}: {error}', file=sys.stderr)
        else:
            count = len(data['units'])
            units += count
            print(f'PASS {path}: {count} candidate units; source truth still requires review')
    print(f'{units} structurally valid candidate units. No records promoted.')
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
