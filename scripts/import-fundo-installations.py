#!/usr/bin/env python3
"""Extract reviewed physical locations, never workbook instructions or macros."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import uuid

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = uuid.UUID('28ba8c86-d342-49de-a3e6-faf99f5a2acc')
CONNECTORS = {'a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'y'}
ACRONYMS = {'SIGMA', 'CAE', 'TI', 'HUB', 'CAT', 'SS.GG', 'SS.GG.', 'PTA', 'PTAP', 'HIJK', 'EF', 'LM', 'PQ', 'RS', 'TUVW', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'}
SPELLINGS = {unicodedata.normalize('NFD', word).encode('ascii', 'ignore').decode(): word for word in [
    'almacén', 'armonía', 'atención', 'agrícola', 'agrícolas', 'automatización',
    'bioseguridad', 'capacitación', 'capacitaciones', 'construcción', 'eléctrico',
    'genética', 'ilusión', 'impulsión', 'inducción', 'inducciones', 'lavandería',
    'mecánico', 'módulo', 'producción', 'proyección', 'proyecciones', 'químicos',
    'reunión', 'sólidos', 'tópico',
]}


def text(value):
    return ' '.join(str(value or '').split())


def key(value):
    return ''.join(c for c in unicodedata.normalize('NFD', text(value)).casefold() if not unicodedata.combining(c))


def label(value):
    value = text(value).rstrip(' .')
    value = re.sub(r',\s*', ', ', value)
    value = re.sub(r'\s*/\s*', ' / ', value)
    value = re.sub(r'\b2do\b', '2.º', value, flags=re.I)
    first = True

    def word(match):
        nonlocal first
        token = match.group(); initial = first; first = False
        if re.fullmatch(r'm3', token, re.I):
            return 'm³'
        if token.upper() in ACRONYMS or re.fullmatch(r'[A-Z]\d+', token, re.I):
            return token.upper()
        # Letters identify modules, not prose. Keep A, B, C… and reservoir K.
        if len(token) == 1 and token.upper() in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' and token.lower() not in {'y', 'e'}:
            return token.upper()
        # E is a module identifier in a comma-separated list, otherwise a connector.
        if token.upper() == 'E' and value[:match.start()].rstrip().endswith(','):
            return 'E'
        lower = SPELLINGS.get(key(token), token.lower())
        if not initial and lower in CONNECTORS:
            return lower
        return lower[:1].upper() + lower[1:]

    return re.sub(r'[\w]+(?:\.[A-Za-z]+)*\.?', word, value, flags=re.UNICODE)


def extract(path):
    book = openpyxl.load_workbook(path, data_only=True)
    if len(book.worksheets) != 3:
        raise ValueError('Se esperaban exactamente tres hojas del programa de Fundo.')
    base = json.loads((ROOT / 'src/location-seed.json').read_text())
    site = next(node for node in base if node['kind'] == 'site' and node['name'] == 'Fundo')
    existing = {key(node['name']): node for node in base if node['parent_id'] == site['id'] and node['kind'] == 'zone'}
    zones, accepted, excluded, duplicates = {}, {}, [], []
    candidates = 0
    for sheet in book:
        if key(sheet.cell(8, 6).value) != 'puntos a inspeccionar' or key(sheet.cell(8, 7).value) != 'ubicacion':
            raise ValueError(f'Encabezados desconocidos en {sheet.title}.')
        for row in range(10, sheet.max_row + 1):
            point = sheet.cell(row, 6).value
            if not isinstance(sheet.cell(row, 2).value, (int, float)) or point is None:
                continue
            source = dict(sheet=sheet.title, row=row, category=text(sheet.cell(row, 5).value), point=text(point), zone=text(sheet.cell(row, 7).value))
            if key(source['category']) == 'actividades fundo':
                excluded.append(source)
                continue
            if not source['zone'] or not source['point']:
                raise ValueError(f'Relación incompleta en {sheet.title}, fila {row}.')
            candidates += 1
            zone_key = key(source['zone'])
            if zone_key not in zones:
                old = existing.get(zone_key)
                zones[zone_key] = dict(id=old['id'] if old else str(uuid.uuid5(NAMESPACE, 'zone/' + zone_key)), name=old['name'] if old else label(source['zone']), installations=[])
            identity = (zone_key, key(source['point']))
            if identity in accepted:
                accepted[identity]['sources'].append(source)
                duplicates.append(source)
                continue
            node = dict(id=str(uuid.uuid5(NAMESPACE, 'installation/' + '/'.join(identity))), name=label(source['point']))
            zones[zone_key]['installations'].append(node)
            accepted[identity] = dict(**node, zone=zones[zone_key]['name'], zoneId=zones[zone_key]['id'], sources=[source])
    book.close()
    dataset = dict(version='fundo-programa-2026-v1', siteId=site['id'], siteName='Fundo', zones=list(zones.values()))
    report = dict(source=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), sheets=[s.title for s in book],
                  columns=dict(installation='F: Puntos a inspeccionar', zone='G: Ubicación', exclusion='E: Instalación = Actividades Fundo'),
                  counts=dict(zones=len(zones), installations=len(accepted), candidates=candidates, excluded=len(excluded), duplicates=len(duplicates)),
                  installations=list(accepted.values()), excluded=excluded, duplicates=duplicates)
    return dataset, report


def write(path, review):
    dataset, report = extract(path)
    (ROOT / 'src/fundo-installations.json').write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'reference/fundo-installations-import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    review.parent.mkdir(parents=True, exist_ok=True)
    book = openpyxl.Workbook(); sheet = book.active; sheet.title = 'Instalaciones de Fundo'
    sheet.append(['Sede', 'Zona', 'Instalación', 'Hoja de origen', 'Fila de origen'])
    for item in report['installations']:
        sheet.append(['Fundo', item['zone'], item['name'], '; '.join(dict.fromkeys(s['sheet'] for s in item['sources'])), '; '.join(str(s['row']) for s in item['sources'])])
    sheet.freeze_panes = 'C2'; sheet.auto_filter.ref = sheet.dimensions
    for column, width in zip('ABCDE', [16, 30, 100, 28, 22]): sheet.column_dimensions[column].width = width
    for row in sheet:
        for cell in row:
            cell.font = openpyxl.styles.Font(name='Aptos', size=11, bold=cell.row == 1, color='FFFFFF' if cell.row == 1 else '173E35')
            cell.fill = openpyxl.styles.PatternFill('solid', fgColor='27674F' if cell.row == 1 else 'F2F6EE' if cell.row % 2 == 0 else 'FFFFFF')
            cell.alignment = openpyxl.styles.Alignment(vertical='top', wrap_text=True)
        sheet.row_dimensions[row[0].row].height = 32 if row[0].row == 1 else 35
    book.save(review)
    print(json.dumps(report['counts'], ensure_ascii=False))
    print(review)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--review', type=Path, default=Path('/workspace/artifacts/berry-safety/INSTALACIONES_FUNDO_2026.xlsx'))
    args = parser.parse_args()
    write(args.source, args.review)
