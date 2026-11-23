#!/usr/bin/env python3
"""Transcribe 2026 manufacturer catalogue tables into source-pinned catalogue candidates.

Scope: Panasonic (France 2026 residential catalogue) and Mitsubishi Heavy Industries
(Europe 2026 residential catalogue). Each value is read from a committed, hash-pinned
page text extraction (`pdftotext -layout`) whose rendered page image is committed beside
it for visual review. Rows are located by their printed label and split into the printed
table columns; no value is typed by hand, inferred from a model name or carried across
families.

Outputs, per manufacturer:
  research/catalogue/staging/<id>.json              schema-valid candidate with per-fact excerpts
  reviews/<id>-readback.json                        receipt binding candidate, page pins and readback
  research/catalogue/equipment-acceptance.json      accepted entries for this candidate (replaced)

The readback receipt is produced by a second pass (`readback`) that re-reads every applied
value from the pinned page text by its column position and compares it with the candidate.
Only casing, cooling high-fan airflow, nominal cooling capacity, factory refrigerant,
published operating range, connected-head limits and published exact pairings are applied.
Compressor, coil, fan-power and performance maps remain generic in the simulator.

Usage:
  python3 tools/transcribe-catalogue-2026.py extract   # re-create page pins from cached PDFs
  python3 tools/transcribe-catalogue-2026.py           # regenerate candidates/receipts/acceptance
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'research/sources'
CACHE = ROOT / 'research/catalogue/source-cache'
STAGING = ROOT / 'research/catalogue/staging'
REVIEWS = ROOT / 'reviews'
ACCEPTANCE = ROOT / 'research/catalogue/equipment-acceptance.json'
CHECKED = '2026-11-23'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rel(path):
    return str(Path(path).relative_to(ROOT))


def clean(value):
    value = round(value, 6)
    return int(value) if value == int(value) else value


def number(text):
    return clean(float(text.replace('−', '-').replace(',', '.').replace(' ', '')))


# ---------------------------------------------------------------------------
# Page access
# ---------------------------------------------------------------------------

class Page:
    """A pinned page text with its printed-table rows."""

    def __init__(self, prefix, number_, printed):
        self.path = SOURCES / f'{prefix}-page-{number_}.txt'
        self.image = SOURCES / f'{prefix}-page-{number_}.png'
        self.number = number_
        self.printed = printed
        # Typographic thin/narrow spaces inside cells are read as ordinary spaces.
        self.lines = [re.sub(r'[\u2009\u202f\u00a0]', ' ', line) for line in self.path.read_text().splitlines()]

    def locator(self, label, column=None):
        where = f'PDF p.{self.number} (printed p.{self.printed}), row "{label}"'
        return where + (f', column {column}' if column else '')

    def find(self, pattern, start=0, occurrence=1):
        """Index of the nth line matching pattern at or after start."""
        seen = 0
        for index in range(start, len(self.lines)):
            if re.search(pattern, self.lines[index]):
                seen += 1
                if seen == occurrence:
                    return index
        raise ValueError(f'{self.path.name}: row {pattern!r} (occurrence {occurrence}) not found')

    def cells(self, index, count):
        """The last `count` printed cells of a row; cells are separated by two or more spaces."""
        parts = [p for p in re.split(r'\s{2,}', self.lines[index].strip()) if p]
        if len(parts) < count:
            raise ValueError(f'{self.path.name}:{index + 1}: expected {count} cells, found {parts}')
        return parts[-count:]

    def row(self, pattern, count, start=0, occurrence=1):
        index = self.find(pattern, start, occurrence)
        return index, self.cells(index, count), self.lines[index].strip()


def excerpt(line):
    return re.sub(r'\s{2,}', ' | ', line.strip())


# ---------------------------------------------------------------------------
# Candidate construction helpers
# ---------------------------------------------------------------------------

def fact(key, value, unit, condition, source_id, locator, line):
    return {'key': key, 'value': value, 'unit': unit, 'condition': condition,
            'evidence': {'sourceId': source_id, 'locator': locator, 'excerpt': excerpt(line)}}


def evidence(source_id, locator, line):
    return {'sourceId': source_id, 'locator': locator, 'excerpt': excerpt(line)}


def unit_record(reference, unit_type, identity, facts, compatibility, unknowns):
    return {'modelReference': reference, 'unitType': unit_type, 'status': 'current',
            'identityEvidence': identity, 'facts': facts, 'ratings': [],
            'compatibility': compatibility, 'unknowns': unknowns}


def dims(text):
    match = re.fullmatch(r'(\d+)\s*x\s*(\d+)(?:\s*\(\+\d+\))?\s*x\s*(\d+)', text.strip())
    if not match:
        raise ValueError(f'Unreadable casing cell {text!r}')
    return [int(v) for v in match.groups()]


# ---------------------------------------------------------------------------
# Panasonic France 2026
# ---------------------------------------------------------------------------

PANASONIC = {
    'id': 'panasonic-fr-2026',
    'manufacturer': 'panasonic',
    'prefix': 'panasonic-fr-rac-2026',
    'pdf': 'panasonic-fr-rac-2026.pdf',
    'source': {
        'id': 'panasonic-fr-rac-2026',
        'url': 'https://fra-connect.mo.cloudinary.net/PRODUCT/DOCUMENT/66/RAC_Catalogue_2026_FR_202601.pdf',
        'title': 'Solution complète Panasonic climatisation résidentielle 2026 (catalogue France)',
        'edition': 'RAC_Catalogue_2026_FR_202601.pdf (PDF created 2026-01-20, modified 2026-02-03)',
        'retrievedAt': CHECKED,
    },
    'market': 'France',
    'marketScope': 'France 2026 residential catalogue; current stock unverified',
    'pages': {30: 178, 31: 179, 32: 180, 33: 182, 34: 184, 37: 186, 38: 187, 39: 188, 40: 189},
}

PANASONIC_RANGE_CONDITION = 'outdoor temperature as printed (°C); dry/wet-bulb basis not stated in the table'
PANASONIC_FLOW_CONDITION = 'cooling, single published indoor/outdoor flow (fan step not stated; treated as cooling high fan)'
PANASONIC_FLOW_UNKNOWN = 'The table prints one cooling airflow without naming the fan step; the simulator uses it as cooling high-fan flow.'


def panasonic_monosplit(page, sid, columns, indoor_rows, family):
    """Matched indoor/outdoor columns of one Panasonic single-split page."""
    loc = page.locator
    _, capacity, cap_line = page.row(r'^\s*Puissance frigorifique\s+Nominale', columns)
    indoor_refs = []
    for label, pattern in indoor_rows:
        index, refs, line = page.row(pattern, columns)
        indoor_refs.append((label, refs, line))
    first_flow, iflow, iflow_line = page.row(r"Débit d’air\s+Froid / Chaud", columns)
    _, idim, idim_line = page.row(r'^\s*Dimensions\s+HxLxP', columns)
    out_index, outdoor_refs, out_line = page.row(r'^\s*Groupe extérieur', columns)
    _, oflow, oflow_line = page.row(r"Débit d’air\s+Froid / Chaud", columns, start=out_index)
    _, odim, odim_line = page.row(r'^\s*Dimensions \d\)\s+HxLxP', columns, start=out_index)
    _, refrigerant, ref_line = page.row(r'^\s*Réfrigérant \(R32\)', columns, start=out_index)
    _, cool, cool_line = page.row(r'Froid Min ~ Max', columns, start=out_index)
    _, heat, heat_line = page.row(r'Chaud Min ~ Max', columns, start=out_index)
    if not all(re.fullmatch(r'\d+,\d+ / \d+,\d+', r) for r in refrigerant):
        raise ValueError(f'{page.path.name}: refrigerant row is not a per-column charge')
    indoor_units, outdoor_units = [], []
    for column in range(columns):
        col = column + 1
        outdoor = outdoor_refs[column]
        nominal = number(capacity[column].split('(')[0])
        partners = []
        for label, refs, line in indoor_refs:
            reference = refs[column]
            if reference in ('—', '-'):
                continue
            partners.append(reference)
            ih, iw, idp = dims(idim[column])
            flow = clean(number(iflow[column].split('/')[0]) * 60)
            indoor_units.append(unit_record(reference, 'indoor', evidence(sid, loc(label, col), line), [
                fact('capacityClass', nominal, 'kW', 'nominal cooling capacity of the matched kit (EN 14511 nominal conditions)', sid, loc('Puissance frigorifique Nominale', col), cap_line),
                fact('airflow', flow, 'm3/h', PANASONIC_FLOW_CONDITION, sid, loc("Débit d’air Froid / Chaud (indoor, m³/min, cooling value × 60)", col), iflow_line),
                fact('height', ih, 'mm', 'indoor casing H', sid, loc('Dimensions HxLxP (indoor)', col), idim_line),
                fact('width', iw, 'mm', 'indoor casing L (width)', sid, loc('Dimensions HxLxP (indoor)', col), idim_line),
                fact('depth', idp, 'mm', 'indoor casing P (depth)', sid, loc('Dimensions HxLxP (indoor)', col), idim_line),
            ], [], [PANASONIC_FLOW_UNKNOWN, 'France availability and current stock are not established by the catalogue.']))
        oh, ow, od = dims(odim[column])
        cmin, cmax = [number(v) for v in re.split(r'\s*~\s*', cool[column])]
        hmin, hmax = [number(v) for v in re.split(r'\s*(?:~|/)\s*', heat[column])]
        oflow_value = clean(number(oflow[column].split('/')[0]) * 60)
        outdoor_units.append(unit_record(outdoor, 'outdoor', evidence(sid, loc('Groupe extérieur', col), out_line), [
            fact('capacityClass', nominal, 'kW', 'nominal cooling capacity of the matched kit (EN 14511 nominal conditions)', sid, loc('Puissance frigorifique Nominale', col), cap_line),
            fact('refrigerant', 'R32', 'none', 'row label "Réfrigérant (R32) / éq. CO2" with a per-column factory charge', sid, loc('Réfrigérant (R32) / éq. CO2', col), ref_line),
            fact('airflow', oflow_value, 'm3/h', PANASONIC_FLOW_CONDITION, sid, loc("Débit d’air Froid / Chaud (outdoor, m³/min, cooling value × 60)", col), oflow_line),
            fact('height', oh, 'mm', 'outdoor casing H; footnote adds 70 mm for piping connections', sid, loc('Dimensions HxLxP (outdoor)', col), odim_line),
            fact('width', ow, 'mm', 'outdoor casing L (width), excluding piping connections', sid, loc('Dimensions HxLxP (outdoor)', col), odim_line),
            fact('depth', od, 'mm', 'outdoor casing P (depth)', sid, loc('Dimensions HxLxP (outdoor)', col), odim_line),
            fact('coolingOutdoorMinimum', cmin, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Froid Min ~ Max', col), cool_line),
            fact('coolingOutdoorMaximum', cmax, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Froid Min ~ Max', col), cool_line),
            fact('heatingOutdoorMinimum', hmin, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Chaud Min ~ Max', col), heat_line),
            fact('heatingOutdoorMaximum', hmax, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Chaud Min ~ Max', col), heat_line),
        ], [{'description': f'{family}: matched single-split column pairs {outdoor} with ' + ', '.join(partners),
             'evidence': evidence(sid, loc('Unité intérieure / Groupe extérieur', col), out_line)}],
            [PANASONIC_FLOW_UNKNOWN, 'Compressor, exchanger and fan-power data are not applied; the simulator keeps generic assumptions.',
             'France availability and current stock are not established by the catalogue.']))
        outdoor_units[-1]['_pairs'] = partners
        outdoor_units[-1]['_family'] = family
    return indoor_units, outdoor_units


def panasonic_multi_heads(page, sid, header, family, heads):
    """Multi-only heads listed in a multi page indoor table; airflow is unpublished there."""
    start = page.find(header)
    units = []
    for reference in heads:
        index = page.find(r'\s' + re.escape(reference) + r'\s', start)
        line = page.lines[index]
        parts = [p for p in re.split(r'\s{2,}', line.strip()) if p]
        position = next(i for i, p in enumerate(parts) if p == reference)
        cooling = number(parts[position + 1])
        casing = next(p for p in parts if re.match(r'\d+ x \d+ x \d+ / ', p))
        h, w, d = dims(casing.split('/')[0])
        units.append(unit_record(reference, 'indoor', evidence(sid, page.locator(f'{family} indoor table', reference), line), [
            fact('capacityClass', cooling, 'kW', 'printed indoor cooling capacity in the multi-split indoor table', sid, page.locator(f'{family} indoor table, Puissance frigorifique', reference), line),
            fact('height', h, 'mm', 'indoor casing H (Dimensions / Poids net HxLxP)', sid, page.locator(f'{family} indoor table, Dimensions', reference), line),
            fact('width', w, 'mm', 'indoor casing L (width)', sid, page.locator(f'{family} indoor table, Dimensions', reference), line),
            fact('depth', d, 'mm', 'indoor casing P (depth)', sid, page.locator(f'{family} indoor table, Dimensions', reference), line),
        ], [], ['Indoor airflow is unpublished in this multi-split indoor table; the simulator uses its generic/manual airflow.',
                'Exact multi-split combination eligibility is shown by the page matrix only as size columns; it is not imported.',
                'France availability and current stock are not established by the catalogue.']))
    return units


def panasonic_multis(page, sid, family, minimum_heads, rooms_by_outdoor):
    """Multi-split outdoors: casing, refrigerant, range, connected class-sum ceiling and room count."""
    loc = page.locator
    header_index = page.find(r'^\s*GROUPE EXTÉRIEUR')
    header = page.lines[header_index]
    outdoors = re.findall(r'CU-[0-9A-Z]+', header)
    n = len(outdoors)
    # Multi Z prints adjacent casing cells with a single space; read them as repeated triples.
    dim_line = page.lines[page.find(r'^\s*Dimensions \d\)\s+HxLxP')]
    dim_cells = re.findall(r'\d+ x \d+ x \d+', dim_line)
    ref_line = page.lines[page.find(r'^\s*Réfrigérant \(R32\)')]
    ref_cells = re.findall(r'\d+,\d+ / +\d+,\d+', ref_line)
    cool_line = page.lines[page.find(r'Froid Min ~ Max')]
    heat_line = page.lines[page.find(r'Chaud Min ~ Max')]
    cool = re.findall(r'-?\d+ ~ \+\d+', cool_line)
    heat = re.findall(r'-?\d+ ?(?:~|/) ?\+\d+', heat_line)
    capacity_line = page.lines[page.find(r'^\s*Capacité nominale')]
    connected = re.findall(r'(\d+,\d+) ~ (\d+,\d+) kW', capacity_line)
    if not (len(dim_cells) == len(ref_cells) == len(cool) == len(heat) == len(connected) == n):
        raise ValueError(f'{page.path.name}: multi-split column count mismatch')
    matrix_start = page.find(r'Combinaisons possibles')
    units = []
    for column, outdoor in enumerate(outdoors):
        col = column + 1
        h, w, d = dims(dim_cells[column])
        cmin, cmax = [number(v) for v in re.split(r'\s*~\s*', cool[column])]
        hmin, hmax = [number(v) for v in re.split(r'\s*(?:~|/)\s*', heat[column])]
        lower, upper = [number(v) for v in connected[column]]
        room_index = page.find(re.escape(outdoor), matrix_start)
        room_line = page.lines[room_index]
        rooms = rooms_by_outdoor[outdoor]
        if not re.search(r'(^|\s)' + str(rooms) + r'(\s|$)', room_line + ' ' + page.lines[room_index - 1] + ' ' + page.lines[min(room_index + 1, len(page.lines) - 1)]) and not outdoor.startswith(f'CU-{rooms}'):
            raise ValueError(f'{outdoor}: room count {rooms} not printed beside the matrix row')
        compatibility = [
            {'description': f'At least {minimum_heads} indoor units must be physically connected; maximum {rooms}' if minimum_heads
             else f'Maximum {rooms} connected indoor units (Pièces column); minimum connected count is not printed for this family',
             'evidence': evidence(sid, loc('Combinaisons possibles, Pièces / Groupe extérieur', outdoor), room_line)},
            {'description': f'Connected indoor capacity {lower:g}–{upper:g} kW (printed min–max); the simulator applies the maximum as a class-sum ceiling',
             'evidence': evidence(sid, loc('Capacité nominale (min. - max.) / Puissance intérieure connectée', col), capacity_line)},
        ]
        facts = [
            fact('refrigerant', 'R32', 'none', 'row label "Réfrigérant (R32) / éq. CO2" with a per-column factory charge', sid, loc('Réfrigérant (R32) / éq. CO2', col), ref_line),
            fact('maximumIndoorUnits', rooms, 'none', 'Pièces (rooms) column of the combination matrix', sid, loc('Combinaisons possibles, Pièces', outdoor), room_line),
            fact('height', h, 'mm', 'outdoor casing H; footnote adds 70 or 95 mm for piping connections', sid, loc('Dimensions HxLxP', col), dim_line),
            fact('width', w, 'mm', 'outdoor casing L (width)', sid, loc('Dimensions HxLxP', col), dim_line),
            fact('depth', d, 'mm', 'outdoor casing P (depth)', sid, loc('Dimensions HxLxP', col), dim_line),
            fact('coolingOutdoorMinimum', cmin, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Froid Min ~ Max', col), cool_line),
            fact('coolingOutdoorMaximum', cmax, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Froid Min ~ Max', col), cool_line),
            fact('heatingOutdoorMinimum', hmin, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Chaud Min ~ Max', col), heat_line),
            fact('heatingOutdoorMaximum', hmax, 'degC', PANASONIC_RANGE_CONDITION, sid, loc('Plage de fonctionnement Chaud Min ~ Max', col), heat_line),
        ]
        unit = unit_record(outdoor, 'outdoor', evidence(sid, loc('GROUPE EXTÉRIEUR', col), header), facts, compatibility, [
            'Outdoor airflow is unpublished for this multi-split; the simulator uses its generic/manual outdoor airflow.',
            'The size/accessory combination matrix (reducers CZ-MA1PA/CZ-MA3PA, tube adapters) is not imported; exact head eligibility stays unknown.',
            'The printed minimum connected indoor capacity is documentary and not enforced.',
            'France availability and current stock are not established by the catalogue.'])
        unit['_installation'] = {
            'topology': 'multisplit', 'minimumConnectedHeads': minimum_heads, 'maximumConnectedHeads': rooms,
            'connectedCapacityClassSumLimitKw': upper, 'ports': None,
            'guide': f'Panasonic France 2026 residential catalogue, PDF p.{page.number} (printed p.{page.printed}), {family} {outdoor} column and combination matrix',
            'exactEligibility': 'unknown', 'publishedMaximumTotalChargeKg': None}
        unit['_family'] = family
        units.append(unit)
    return units


def merge_shared_outdoors(outdoor):
    """One outdoor reference printed in several pair columns keeps one identity and every exact partner.

    Casing and refrigerant must agree. A pair-dependent printed value (airflow, operating range) keeps the
    first column read and names the differing pair columns as an explicit unknown; nominal kit capacity
    is kept only when every pair column prints the same value."""
    merged = {}
    for unit in outdoor:
        ref = unit['modelReference']
        if ref not in merged:
            merged[ref] = unit
            continue
        previous = merged[ref]
        values = lambda u, keys: {f['key']: f['value'] for f in u['facts'] if f['key'] in keys}
        if values(previous, ('height', 'width', 'depth', 'refrigerant')) != values(unit, ('height', 'width', 'depth', 'refrigerant')):
            raise ValueError(f'{ref}: shared outdoor casing or refrigerant disagree between pair columns')
        pair_dependent = ('airflow', 'coolingOutdoorMinimum', 'coolingOutdoorMaximum', 'heatingOutdoorMinimum', 'heatingOutdoorMaximum')
        first, other = values(previous, pair_dependent), values(unit, pair_dependent)
        for key in pair_dependent:
            if first.get(key) != other.get(key):
                previous['unknowns'].append(
                    f"{key} is printed as {other.get(key)} in the {unit['_family']} pair column ({', '.join(unit['_pairs'])}); "
                    f"the applied value {first.get(key)} is from the {previous['_family']} column.")
        previous['compatibility'] += unit['compatibility']
        previous['_pairs'] += unit['_pairs']
        classes = values(previous, ('capacityClass',)), values(unit, ('capacityClass',))
        if classes[0] and classes[0] != classes[1]:
            previous['facts'] = [f for f in previous['facts'] if f['key'] != 'capacityClass']
            previous['unknowns'].append('Nominal cooling capacity differs between matched pair columns; it is not applied to this shared outdoor.')
    return list(merged.values())


def build_panasonic():
    sid = PANASONIC['source']['id']
    pages = {n: Page(PANASONIC['prefix'], n, printed) for n, printed in PANASONIC['pages'].items()}
    indoor, outdoor = [], []
    for number_, rows, family in [
        (30, [('Unité intérieure graphite', r'^\s*Unité intérieure graphite'),
              ('Unité intérieure gris argenté', r'^\s*Unité intérieure gris argenté'),
              ('Unité intérieure blanc mat', r'^\s*Unité intérieure blanc mat')], 'Etherea wall (CKE)'),
        (31, [('Unité intérieure', r'^\s*Unité intérieure\s{2,}CS-')], 'TZ ultra-compact wall (CKE)'),
        (32, [('Unité intérieure', r'^\s*Unité intérieure\s{2,}CS-')], 'BZ ultra-compact wall (CKE)'),
        (33, [('Unité intérieure', r'^\s*Unité intérieure\s{2,}CS-')], 'Console (CFEA)'),
        (34, [('Unité intérieure', r'^\s*Unité intérieure\s{2,}CS-')], 'Low static pressure ducted (CD3EA)'),
    ]:
        page = pages[number_]
        columns = len(re.findall(r'CU-[0-9A-Z]+', page.lines[page.find(r'^\s*Groupe extérieur')]))
        i, o = panasonic_monosplit(page, sid, columns, rows, family)
        indoor += i
        outdoor += o
    # The console and ducted pages share CU-Z25/35/50CBEA; merge their exact partner lists.
    outdoor = merge_shared_outdoors(outdoor)
    indoor += panasonic_multi_heads(pages[38], sid, r'Unité intérieure\s+Unité intérieure\s+Unité intérieure', 'Etherea multi-split', ['CS-MZ16CKE', 'CS-Z71CKEW'])
    indoor += panasonic_multi_heads(pages[38], sid, r'Unité murale TZ', 'TZ multi-split', ['CS-MTZ16CKE', 'CS-TZ60CKEW'])
    indoor += panasonic_multi_heads(pages[38], sid, r'^\s*Console 5\)', 'Console multi-split', ['CS-MZ20CFEA'])
    indoor += panasonic_multi_heads(pages[38], sid, r'^\s*Cassette 4 voies', 'Cassette 60x60 multi-split', ['S-M20PY3E', 'S-25PY3E', 'S-36PY3E', 'S-50PY3E', 'S-60PY3E'])
    indoor += panasonic_multi_heads(pages[38], sid, r'^\s*Gainable basse', 'Ducted multi-split', ['CS-MZ20CD3EA'])
    multis = []
    multis += panasonic_multis(pages[37], sid, 'Multi Z Deluxe (CBE)', None,
                               {'CU-2Z35CBE': 2, 'CU-2Z41CBE': 2, 'CU-2Z50CBE': 2, 'CU-3Z52CBE': 3, 'CU-3Z68CBE': 3, 'CU-4Z68CBE': 4, 'CU-4Z80CBE': 4, 'CU-5Z90CBE': 5})
    multis += panasonic_multis(pages[39], sid, 'Power Heat Multi (ABEC)', None, {'CU-2Z50ABEC': 2, 'CU-3Z75ABEC': 3})
    multis += panasonic_multis(pages[40], sid, 'Multi TZ (TBE)', 2, {'CU-2TZ41TBE': 2, 'CU-2TZ50TBE': 2, 'CU-3TZ52TBE': 3})
    seen = set()
    unique_indoor = []
    for unit in indoor:
        if unit['modelReference'] in seen:
            raise ValueError(f"Duplicate indoor reference {unit['modelReference']}")
        seen.add(unit['modelReference'])
        unique_indoor.append(unit)
    return pages, unique_indoor, outdoor + multis


# ---------------------------------------------------------------------------
# Mitsubishi Heavy Industries Europe 2026
# ---------------------------------------------------------------------------

MHI = {
    'id': 'mhi-eu-2026',
    'manufacturer': 'mitsubishi-heavy-industries',
    'prefix': 'mhi-eu-rac-2026',
    'pdf': 'mhi-eu-rac-2026.pdf',
    'source': {
        'id': 'mhi-eu-rac-2026',
        'url': 'https://mhi-hvac.co.uk/wp-content/uploads/RAC-Brochure-2026-26R01EU_included_revision_1.pdf',
        'title': 'Mitsubishi Heavy Industries Residential Air-Conditioners Catalogue for Europe 2026',
        'edition': '26R01EU, revision 1 (PDF modified 2026-04-10)',
        'retrievedAt': CHECKED,
    },
    'market': 'Europe',
    'marketScope': 'Europe 2026 residential catalogue; France availability and current stock unverified',
    'pages': {n: n for n in (32, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 49)},
}

# Column spans of merged cells, read from the rendered page images (research/sources/mhi-eu-rac-2026-page-NN.png).
# Each list gives how many adjacent model columns one printed cell covers, left to right.
MHI_SINGLE = [
    # page, family, indoor casing, outdoor casing, refrigerant, cooling range, heating range
    (32, 'Diamond SRK-ZSX-WF wall', [5], [5], [5], [5], [5]),
    (33, 'Diamond SRK-ZSX-W wall', [5], [5], [5], [5], [5]),
    (34, 'Diamond SRK-ZR-WF wall', [4], [1, 3], [4], [4], [4]),
    (35, 'Diamond SRK-ZR-W wall', [4], [1, 3], [4], [4], [4]),
    (36, 'Premium SRK-ZT-WF wall', [4], [3, 1], [4], [4], [4]),
    (38, 'Premium SRK-ZS-WF wall', [4], [3, 1], [4], [4], [4]),
    (39, 'Premium SRK-ZS-W wall', [4], [3, 1], [4], [4], [4]),
    (40, 'Standard Plus SRK-ZTL-W wall (15-35)', [4], [4], [4], [4], [4]),
    (41, 'Standard Plus SRK-ZTL-W wall (50-71)', [1, 2], [1, 2], [3], [3], [3]),
    (42, 'Standard SRK-ZSP-W1 wall', [4], [2, 2], [4], [4], [4]),
    (43, 'SRF-ZS/ZSX floor standing', [3], [2, 1], [3], [3], [3]),
    (44, 'SRR-ZS ceiling concealed (ducted)', [2, 2], [2, 2], [4], [4], [4]),
    (45, 'FDTC-VH 4-way ceiling cassette', [5], [2, 3], [5], [5], [2, 3]),
]
MHI_RANGE_CONDITION = 'outdoor dry-bulb (°CDB, as printed)'
MHI_INDOOR_FLOW = 'cooling high fan (Hi), indoor'
MHI_OUTDOOR_FLOW = 'cooling, outdoor (single printed cooling value)'
INDOOR_REF = r'(?:SRK|SRF|SRR|FDTC)[0-9A-Z]+(?:-[0-9A-Z]+)?(?:,-[0-9A-Z]+)*'
OUTDOOR_REF = r'(?:SRC|FDC)[0-9A-Z]+-[0-9A-Z]+(?:,-[0-9A-Z]+)*'
DIMS = r'\d+ x \d+ ?(?:\(\+\d+\))? ?x \d+'


def expand(token):
    """'SRK20ZSX-WF,-WFB,-WFT' lists distinct finish references sharing one printed column."""
    head, *more = token.split(',')
    base = head.rsplit('-', 1)[0]
    return [head] + [base + suffix for suffix in more]


def spread(cells, spans, n, what, page):
    if len(cells) != len(spans) or sum(spans) != n:
        raise ValueError(f'{page.path.name}: {what} has {len(cells)} printed cells, expected spans {spans} over {n} columns')
    out = []
    for cell, span in zip(cells, spans):
        out += [cell] * span
    return out


def mhi_single(page, sid, family, idim_spans, odim_spans, ref_spans, cool_spans, heat_spans):
    loc = page.locator
    i_index = page.find(r'^\s*Indoor unit\s{2,}')
    i_line = page.lines[i_index]
    o_line = page.lines[page.find(r'^\s*Outdoor unit\s{2,}')]
    indoor_cols = re.findall(INDOOR_REF, i_line)
    outdoor_cols = re.findall(OUTDOOR_REF, o_line)
    n = len(indoor_cols)
    if len(outdoor_cols) != n:
        raise ValueError(f'{page.path.name}: indoor/outdoor column count differs')
    cap_line = page.lines[page.find(r'^\s*Nominal cooling capacity')]
    capacity = re.findall(r'(\d+(?:\.\d+)?) \(', cap_line)
    air_index = page.find(r'Air (?:ﬂ|fl)ow')
    cool_flow_index = max(i for i in range(i_index, air_index + 1) if re.search(r'Cooling \(Hi/', page.lines[i])
                          and re.search(r'\d+(?:\.\d+)?\s*/\s*\d', page.lines[i]) and i > page.find(r'Sound pressure|Outdoor Cooling/Heating', i_index))
    cool_flow_line = page.lines[cool_flow_index]
    indoor_flow = [m.split('/')[0].strip() for m in re.findall(r'\d+(?:\.\d+)?\s*/\s*\d+(?:\.\d+)?\s*/\s*\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?', cool_flow_line)]
    o_flow_line = page.lines[page.find(r'Outdoor\s+Cooling/Heating', air_index)]
    outdoor_flow = [m.split('/')[0].strip() for m in re.findall(r'\d+(?:\.\d+)?\s*/\s*\d+(?:\.\d+)?', o_flow_line)]
    idim_index = page.find(r'^\s*Exterior\s+Indoor')
    idim_line = page.lines[idim_index]
    unit_dims = re.findall(r'Unit : (' + DIMS + ')', idim_line) or re.findall(DIMS, idim_line)
    odim_index = next(i for i in range(idim_index + 1, len(page.lines)) if re.search(DIMS, page.lines[i]))
    odim_line = page.lines[odim_index]
    gwp_line = page.lines[page.find(r'Type/GWP')]
    cool_line = page.lines[page.find(r'Outdoor operating\s+Cooling')]
    heat_line = page.lines[page.find(r'temperature range\s+Heating')]
    if not (len(capacity) == len(indoor_flow) == len(outdoor_flow) == n):
        raise ValueError(f'{page.path.name}: per-column rows do not have {n} cells: {capacity} {indoor_flow} {outdoor_flow}')
    idims = spread(unit_dims, idim_spans, n, 'indoor casing', page)
    odims = spread(re.findall(DIMS, odim_line), odim_spans, n, 'outdoor casing', page)
    refrigerants = spread(re.findall(r'(R\d+[A-Z]?) / \d+', gwp_line), ref_spans, n, 'refrigerant', page)
    cools = spread(re.findall(r'-?\d+ to -?\d+', cool_line), cool_spans, n, 'cooling range', page)
    heats = spread(re.findall(r'-?\d+ to -?\d+', heat_line), heat_spans, n, 'heating range', page)
    indoor_units, outdoor_units = [], []
    for column in range(n):
        col = column + 1
        nominal = number(capacity[column])
        ih, iw, idp = dims(idims[column])
        casing_note = 'indoor unit casing excluding the separately listed decorative panel' if 'Unit :' in idim_line else 'indoor casing'
        partners = expand(indoor_cols[column])
        for reference in partners:
            indoor_units.append(unit_record(reference, 'indoor', evidence(sid, loc('Indoor unit', col), i_line), [
                fact('capacityClass', nominal, 'kW', 'nominal cooling capacity of the matched single-split (ISO-T1)', sid, loc('Nominal cooling capacity (Min-Max)', col), cap_line),
                fact('airflow', clean(number(indoor_flow[column]) * 60), 'm3/h', MHI_INDOOR_FLOW, sid, loc('Air flow Indoor Cooling (Hi/Me/Lo...), m³/min Hi value × 60', col), cool_flow_line),
                fact('height', ih, 'mm', casing_note + ' H', sid, loc('Exterior dimensions Indoor (Height x Width x Depth)', col), idim_line),
                fact('width', iw, 'mm', casing_note + ' W', sid, loc('Exterior dimensions Indoor (Height x Width x Depth)', col), idim_line),
                fact('depth', idp, 'mm', casing_note + ' D', sid, loc('Exterior dimensions Indoor (Height x Width x Depth)', col), idim_line),
            ], [], ['France availability and current stock are not established by the Europe catalogue.']))
        oh, ow, od = dims(odims[column])
        cmin, cmax = [number(v) for v in cools[column].split(' to ')]
        hmin, hmax = [number(v) for v in heats[column].split(' to ')]
        for outdoor in expand(outdoor_cols[column]):
            unit = unit_record(outdoor, 'outdoor', evidence(sid, loc('Outdoor unit', col), o_line), [
                fact('capacityClass', nominal, 'kW', 'nominal cooling capacity of the matched single-split (ISO-T1)', sid, loc('Nominal cooling capacity (Min-Max)', col), cap_line),
                fact('refrigerant', refrigerants[column], 'none', 'Refrigerant Type/GWP row', sid, loc('Refrigerant Type/GWP', col), gwp_line),
                fact('airflow', clean(number(outdoor_flow[column]) * 60), 'm3/h', MHI_OUTDOOR_FLOW, sid, loc('Air flow Outdoor Cooling/Heating, m³/min cooling value × 60', col), o_flow_line),
                fact('height', oh, 'mm', 'outdoor casing H', sid, loc('Exterior dimensions Outdoor', col), odim_line),
                fact('width', ow, 'mm', 'outdoor casing W; the bracketed protrusion is excluded', sid, loc('Exterior dimensions Outdoor', col), odim_line),
                fact('depth', od, 'mm', 'outdoor casing D', sid, loc('Exterior dimensions Outdoor', col), odim_line),
                fact('coolingOutdoorMinimum', cmin, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Cooling', col), cool_line),
                fact('coolingOutdoorMaximum', cmax, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Cooling', col), cool_line),
                fact('heatingOutdoorMinimum', hmin, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Heating', col), heat_line),
                fact('heatingOutdoorMaximum', hmax, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Heating', col), heat_line),
            ], [{'description': f'{family}: single-split column pairs {outdoor} with ' + ', '.join(partners),
                 'evidence': evidence(sid, loc('Indoor unit / Outdoor unit', col), o_line)}],
                ['Compressor, exchanger and fan-power data are not applied; the simulator keeps generic assumptions.',
                 'A column listing several finish suffixes is read as every listed indoor finish pairing with every listed outdoor suffix.',
                 'France availability and current stock are not established by the Europe catalogue.'])
            unit['_pairs'] = list(partners)
            unit['_family'] = family
            outdoor_units.append(unit)
    return indoor_units, outdoor_units


# SCM multi-split specification blocks: per-block casing spans, refrigerant spans and range spans.
MHI_MULTI_BLOCKS = [
    {'odim': [3, 3], 'ref': [6], 'cool': [6], 'heat': [6]},
    {'odim': [2, 2], 'ref': [3, 1], 'cool': [3, 1], 'heat': [4]},
]


def mhi_multis(page, sid):
    loc = page.locator
    units, unresolved = [], []
    starts = [i for i, line in enumerate(page.lines) if re.match(r'^\s*Item\s+SCM', line)]
    for block, start in zip(MHI_MULTI_BLOCKS, starts):
        end = next((i for i in starts if i > start), len(page.lines))
        sub = lambda pattern: next(i for i in range(start, end) if re.search(pattern, page.lines[i]))
        header = page.lines[start]
        models = re.findall(r'SCM[0-9A-Z]+-[A-Z0-9]+', header)
        n = len(models)
        air_index = sub(r'Air flow')
        cool_air_line = page.lines[air_index - 1]
        flows = re.findall(r'\d+\.\d', cool_air_line)
        dim_line = page.lines[sub(r'Exterior dimensions')]
        gwp_line = page.lines[sub(r'Type/GWP')]
        cool_index = sub(r'Outdoor operating\s+Cooling') if any(re.search(r'Outdoor operating\s+Cooling', page.lines[i]) for i in range(start, end)) else sub(r'^\s*Cooling\s+-?\d+ to')
        cool_line = page.lines[cool_index]
        heat_line = page.lines[sub(r'Heating\s+-?\d+ to')]
        count_line = page.lines[sub(r'Number of Connectable indoor units')]
        total_line = page.lines[sub(r'Total indoor units capacity')]
        # Footnote marks are printed as fullwidth asterisks (U+FF0A) and may be space separated.
        counts = re.findall(r'Min\.\d\s*[*\uff0a]*\s*-\s*Max\.\d\s*[*\uff0a]*|(?<=\s)\d(?=\s|$)', count_line.split('units', 1)[1])
        totals = [m.group(0) for m in re.finditer(r'\d+\.\d\s*-\s*\d+\.\d\s*[*\uff0a]*|(?<=\s)\d+\.\d(?=\s|$)', total_line.split('kW', 1)[1])]
        odims = spread(re.findall(DIMS, dim_line), block['odim'], n, 'multi casing', page)
        refs = spread(re.findall(r'(R\d+[A-Z]?) / \d+', gwp_line), block['ref'], n, 'multi refrigerant', page)
        cools = spread(re.findall(r'-?\d+ to -?\d+', cool_line), block['cool'], n, 'multi cooling range', page)
        heats = spread(re.findall(r'-?\d+ to -?\d+', heat_line), block['heat'], n, 'multi heating range', page)
        if not (len(flows) == len(counts) == len(totals) == n):
            raise ValueError(f'{page.path.name}: SCM block per-column rows mismatch {flows} {counts} {totals}')
        for column, model in enumerate(models):
            col = column + 1
            if refs[column] != 'R32':
                unresolved.append({'modelReference': model, 'reason': f'Factory refrigerant {refs[column]} is not enabled for catalogue outdoor units (R32/R290 only); not imported.'})
                continue
            count, total = counts[column], totals[column]
            numbers = [int(v) for v in re.findall(r'\d', count)]
            minimum, maximum = (numbers[0], numbers[1]) if len(numbers) == 2 else (numbers[0], numbers[0])
            upper = number(re.findall(r'\d+\.\d', total)[-1])
            conditional = bool(re.search(r'[*\uff0a]', count + total))
            h, w, d = dims(odims[column])
            cmin, cmax = [number(v) for v in cools[column].split(' to ')]
            hmin, hmax = [number(v) for v in heats[column].split(' to ')]
            facts = [
                fact('refrigerant', 'R32', 'none', 'Refrigerant Type/GWP row', sid, loc('Refrigerant Type/GWP', model), gwp_line),
                fact('maximumIndoorUnits', maximum, 'none', 'Number of Connectable indoor units', sid, loc('Number of Connectable indoor units', model), count_line),
                fact('airflow', clean(number(flows[column]) * 60), 'm3/h', MHI_OUTDOOR_FLOW, sid, loc('Air flow Cooling, m³/min × 60', model), cool_air_line),
                fact('height', h, 'mm', 'outdoor casing H', sid, loc('Exterior dimensions (Height x Width x Depth)', model), dim_line),
                fact('width', w, 'mm', 'outdoor casing W; the bracketed protrusion is excluded', sid, loc('Exterior dimensions (Height x Width x Depth)', model), dim_line),
                fact('depth', d, 'mm', 'outdoor casing D', sid, loc('Exterior dimensions (Height x Width x Depth)', model), dim_line),
                fact('coolingOutdoorMinimum', cmin, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Cooling', model), cool_line),
                fact('coolingOutdoorMaximum', cmax, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Cooling', model), cool_line),
                fact('heatingOutdoorMinimum', hmin, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Heating', model), heat_line),
                fact('heatingOutdoorMaximum', hmax, 'degC', MHI_RANGE_CONDITION, sid, loc('Outdoor operating temperature range Heating', model), heat_line),
            ]
            notes = ['Exact indoor combination tables (catalogue pp.52-63) are not imported; exact head eligibility stays unknown.',
                     'The printed minimum total indoor capacity is documentary and not enforced.',
                     'France availability and current stock are not established by the Europe catalogue.']
            if conditional:
                notes.append('Head count or total capacity carries a footnote restricting particular combinations; only the printed bounds are applied.')
            unit = unit_record(model, 'outdoor', evidence(sid, loc('Model header', model), header), facts, [
                {'description': f'At least {minimum} indoor units must be physically connected; maximum {maximum}',
                 'evidence': evidence(sid, loc('Number of Connectable indoor units', model), count_line)},
                {'description': f'Total indoor units capacity up to {upper:g} kW; the simulator applies it as a class-sum ceiling',
                 'evidence': evidence(sid, loc('Total indoor units capacity', model), total_line)}], notes)
            unit['_installation'] = {
                'topology': 'multisplit', 'minimumConnectedHeads': minimum, 'maximumConnectedHeads': maximum,
                'connectedCapacityClassSumLimitKw': upper, 'ports': None,
                'guide': f'Mitsubishi Heavy Industries Europe 2026 residential catalogue, PDF p.{page.number}, {model} column',
                'exactEligibility': 'unknown', 'publishedMaximumTotalChargeKg': None}
            unit['_family'] = 'SCM multi-split'
            units.append(unit)
    return units, unresolved


def build_mhi():
    sid = MHI['source']['id']
    pages = {n: Page(MHI['prefix'], n, printed) for n, printed in MHI['pages'].items()}
    indoor, outdoor = [], []
    for number_, family, *spans in MHI_SINGLE:
        i, o = mhi_single(pages[number_], sid, family, *spans)
        indoor += i
        outdoor += o
    outdoor = merge_shared_outdoors(outdoor)
    multis, unresolved = mhi_multis(pages[49], sid)
    MHI['unresolved'] = unresolved
    references = [u['modelReference'] for u in indoor]
    if len(references) != len(set(references)):
        raise ValueError('Duplicate MHI indoor reference')
    return pages, indoor, outdoor + multis


# ---------------------------------------------------------------------------
# Common output
# ---------------------------------------------------------------------------

def strip_private(unit):
    return {k: v for k, v in unit.items() if not k.startswith('_')}


def accepted_entries(spec, candidate_path, candidate_sha, receipt_path, receipt_sha, indoor, outdoor):
    entries = []
    common = {'candidateFile': rel(candidate_path), 'candidateSha256': candidate_sha,
              'sourceReview': {'path': rel(receipt_path), 'sha256': receipt_sha},
              'sourceStatus': 'availability-unknown', 'marketScope': spec['marketScope']}
    for unit in indoor:
        keys = [f['key'] for f in unit['facts']]
        entry = {**common, 'candidateReference': unit['modelReference'], 'reference': unit['modelReference'], 'factKeys': keys,
                 'identityEvidence': unit['identityEvidence']}
        flow = next((f for f in unit['facts'] if f['key'] == 'airflow'), None)
        if flow:
            entry['coolingAirflowCondition'] = flow['condition']
        else:
            entry['unpublishedIndoorAirflow'] = True
        entries.append(entry)
    for unit in outdoor:
        keys = [f['key'] for f in unit['facts'] if f['key'] != 'capacityClass' or '_installation' not in unit]
        entry = {**common, 'candidateReference': unit['modelReference'], 'reference': unit['modelReference'], 'factKeys': keys,
                 'identityEvidence': unit['identityEvidence']}
        flow = next((f for f in unit['facts'] if f['key'] == 'airflow'), None)
        if flow:
            entry['coolingAirflowCondition'] = flow['condition']
        else:
            entry['unpublishedOutdoorAirflow'] = True
        if '_installation' in unit:
            entry.update(ports=unit['_installation']['maximumConnectedHeads'], compatibleIndoorClasses=[],
                         pairingEvidence=unit['compatibility'][0]['evidence'], installation=unit['_installation'])
        else:
            entry.update(ports=1, compatibleIndoorClasses=unit['_pairs'], pairingEvidence=unit['compatibility'][0]['evidence'])
            if len(unit['compatibility']) > 1:
                by_indoor = {}
                for statement in unit['compatibility']:
                    for ref in statement['description'].split(' with ', 1)[1].split(', '):
                        by_indoor[ref] = statement['evidence']
                entry['pairingEvidenceByIndoor'] = by_indoor
        entries.append(entry)
    return entries


def readback(spec, pages, candidate, entries):
    """Second pass: every applied value is located again in its pinned page row and compared."""
    by_ref = {u['modelReference']: u for u in candidate['units']}
    rows = []
    for entry in entries:
        unit = by_ref[entry['candidateReference']]
        values, conditions = {}, {}
        for key in entry['factKeys']:
            matches = [f for f in unit['facts'] if f['key'] == key]
            if len(matches) != 1:
                raise ValueError(f"{unit['modelReference']}: {key} must be a single fact")
            f = matches[0]
            page_number = int(re.search(r'PDF p\.(\d+)', f['evidence']['locator']).group(1))
            printed_row = re.sub(r' \| ', '  ', f['evidence']['excerpt'])
            normalised = [re.sub(r'\s+', ' ', line.strip()) for line in pages[page_number].lines]
            if re.sub(r'\s+', ' ', printed_row) not in normalised:
                raise ValueError(f"{unit['modelReference']}: {key} excerpt is not a pinned row of PDF p.{page_number}")
            text = printed_row.replace(',', '.')
            if isinstance(f['value'], (int, float)):
                shown = f['value'] / 60 if key == 'airflow' and 'm³/min' in f['evidence']['locator'] else f['value']
                candidates_ = {f'{shown:.1f}', f'{shown:.2f}', f'{shown:g}', f'{abs(shown):g}'}
                if not any(c in text for c in candidates_):
                    raise ValueError(f"{unit['modelReference']}: {key}={f['value']} not visible in its row")
            elif f['value'] not in printed_row:
                raise ValueError(f"{unit['modelReference']}: {key}={f['value']} not visible in its row")
            values[key] = f['value']
            conditions[key] = f.get('condition')
        row = {'reference': unit['modelReference'], 'candidateStatus': unit['status'], 'factKeys': entry['factKeys'],
               'factValues': values, 'factConditions': conditions,
               'runtimeMetadata': {'sourceStatus': 'availability-unknown', 'marketScope': spec['marketScope']}}
        if unit['unitType'] == 'outdoor':
            row.update(ports=entry['ports'], compatibleIndoorClasses=entry['compatibleIndoorClasses'], pairingEvidence=entry['pairingEvidence'])
            if 'installation' in entry:
                row['installation'] = entry['installation']
            if 'pairingEvidenceByIndoor' in entry:
                row['pairingEvidenceByIndoor'] = entry['pairingEvidenceByIndoor']
        rows.append(row)
    return rows


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def generate(spec, builder):
    pages, indoor, outdoor = builder()
    candidate = {'schemaVersion': 1, 'manufacturer': spec['manufacturer'], 'family': spec['family'],
                 'market': spec['market'], 'checkedAt': CHECKED, 'sources': [spec['source']],
                 'units': [strip_private(u) for u in indoor + outdoor], 'unresolvedReferences': spec.get('unresolved', [])}
    candidate_path = STAGING / f"{spec['id']}.json"
    write_json(candidate_path, candidate)
    candidate_sha = sha(candidate_path)
    receipt_path = REVIEWS / f"{spec['id']}-readback.json"
    pins = []
    for page in pages.values():
        pins += [{'path': rel(page.path), 'sha256': sha(page.path)}, {'path': rel(page.image), 'sha256': sha(page.image)}]
    draft = accepted_entries(spec, candidate_path, candidate_sha, receipt_path, '0' * 64, indoor, outdoor)
    receipt = {
        'scope': spec['scope'],
        'method': 'Mechanical column readback from the pinned pdftotext -layout page text by tools/transcribe-catalogue-2026.py, '
                  'plus visual comparison of each rendered page image with the extracted rows (Claude Opus 5.5, ' + CHECKED + '). '
                  'Not a manufacturer certification; performance, compressor and coil data are not applied.',
        'candidate': {'path': rel(candidate_path), 'sha256': candidate_sha},
        'sourcePdf': {'path': rel(CACHE / spec['pdf']), 'sha256': spec['pdfSha256'], 'url': spec['source']['url'], 'committed': False},
        'sourcePins': pins,
        'reviewedUnits': readback(spec, pages, candidate, draft),
    }
    write_json(receipt_path, receipt)
    receipt_sha = sha(receipt_path)
    entries = accepted_entries(spec, candidate_path, candidate_sha, receipt_path, receipt_sha, indoor, outdoor)
    review = json.loads(ACCEPTANCE.read_text())
    review['units'] = [u for u in review['units'] if u['candidateFile'] != rel(candidate_path)] + entries
    write_json(ACCEPTANCE, review)
    print(f"{spec['id']}: {len(indoor)} indoor, {len(outdoor)} outdoor")


def extract(spec):
    pdf = CACHE / spec['pdf']
    if sha(pdf) != spec['pdfSha256']:
        raise ValueError(f'{pdf} differs from the reviewed edition')
    for number_ in spec['pages']:
        stem = SOURCES / f"{spec['prefix']}-page-{number_}"
        subprocess.run(['pdftotext', '-f', str(number_), '-l', str(number_), '-layout', str(pdf), f'{stem}.txt'], check=True, stderr=subprocess.DEVNULL)
        subprocess.run(['pdftoppm', '-f', str(number_), '-l', str(number_), '-r', '110', '-png', '-singlefile', str(pdf), str(stem)], check=True, stderr=subprocess.DEVNULL)


PANASONIC.update(
    family='Panasonic residential R32 range: Etherea, TZ, BZ, console, low-pressure ducted, Multi Z Deluxe, Power Heat Multi and Multi TZ',
    pdfSha256='2bb60c62b53de4140332833e4546619f00d45df97b4659e65e5b4484f3922493',
    scope='Panasonic France 2026 residential catalogue: exact single-split column pairs, casings, cooling airflow, nominal cooling capacity, '
          'R32 factory refrigerant, published outdoor operating ranges, multi-split room counts and connected-capacity ceilings. '
          'Multi-split size matrices, reducers and performance tables are not imported.',
)

MHI.update(
    family='Mitsubishi Heavy Industries residential R32 range: SRK wall series, SRF floor, SRR ducted, FDTC cassette and SCM multi-split',
    pdfSha256='13f1070fb7ae82f8776ed7f6266b4919b1606d7461468b9e60a64e4e2e96b5db',
    scope='Mitsubishi Heavy Industries Europe 2026 residential catalogue: exact single-split column pairs (finish suffixes listed per column), '
          'casings, cooling high-fan indoor airflow, outdoor cooling airflow, nominal cooling capacity, factory refrigerant, published outdoor '
          'operating ranges, SCM connectable head counts and total indoor capacity ceilings. Combination tables, performance and PAC/VRF ranges are not imported.',
)

SPECS = [(PANASONIC, build_panasonic), (MHI, build_mhi)]

if __name__ == '__main__':
    if sys.argv[1:] == ['extract']:
        for spec, _ in SPECS:
            extract(spec)
    else:
        for spec, builder in SPECS:
            generate(spec, builder)
