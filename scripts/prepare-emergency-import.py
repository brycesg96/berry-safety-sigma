#!/usr/bin/env python3
"""Prepare a private extinguisher import. Never connects to or changes a database."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import openpyxl
from openpyxl.styles import Font, PatternFill

ROOT = Path(__file__).resolve().parents[1]


def text(value):
    if value is None:
        return ''
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    return str(value)


def key(value):
    return re.sub(r'[-\s]+', '', text(value).strip().upper())


def folded(value):
    return ''.join(c for c in unicodedata.normalize('NFD', text(value)) if not unicodedata.combining(c)).strip().lower()


def year(value):
    value = text(value).strip()
    return int(value) if re.fullmatch(r'\d{4}', value) and 1900 <= int(value) <= 2100 else None


def date(value):
    if value is None or value == '':
        return None
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', text(value).strip()):
        return dt.date.fromisoformat(text(value).strip()).isoformat()
    raise ValueError('La columna H debe contener una fecha de Excel o una fecha ISO inequívoca.')


def prepare(source, catalog, excluded):
    workbook = openpyxl.load_workbook(source, data_only=False)
    sheet = workbook['2026']
    headers = [cell.value for cell in sheet[1]]
    if len(headers) != 32 or headers[7] != 'FECHA DE INSPECCIÓN' or 'Noviembre' not in headers:
        raise ValueError('La estructura no corresponde al consolidado confirmado: 32 columnas y H=FECHA DE INSPECCIÓN.')
    managements = {folded(re.sub(r'^GERENCIA(?:\s+DE)?\s+', '', m['name'])): m for m in catalog}
    aliases = {'rrhh': 'recursos humanos', 'gaf': 'adm y finanzas'}
    month_names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre']
    months = {'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'sep': 9, 'set': 9, 'oct': 10, 'nov': 11, 'dic': 12}
    output, removed, seen, changes = [], [], set(), []
    for number, values in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        if not any(value is not None for value in values):
            continue
        row = dict(zip(headers, values))
        code = re.sub(r'\s*-\s*', '-', text(row[headers[0]]).strip().upper())
        serial = text(row['N° SERIE']).strip()
        if (key(code), serial.upper()) in excluded:
            removed.append({'source_row': number, 'code': code, 'serial_number': serial})
            continue
        if not code or key(code) in seen:
            raise ValueError(f'Código vacío o duplicado sin resolver en fila {number}: {code}')
        seen.add(key(code))
        official = date(row[headers[7]])
        old_november = text(row['Noviembre'])
        # Explicit user decision: November repeats H even when H belongs to another month.
        row['Noviembre'] = row[headers[7]]
        if old_november != text(row['Noviembre']):
            changes.append({'source_row': number, 'code': code, 'old': old_november, 'new': official})
        owner = text(row['Gerencia']).strip()
        candidate = managements.get(aliases.get(folded(owner), folded(re.sub(r'^Gerencia(?:\s+de)?\s+', '', owner, flags=re.I))))
        mv, av = months.get(folded(row['MV'])), year(row['AV'])
        component_expiry = f'{av:04d}-{mv:02d}' if mv and av else None
        expiry_match = re.fullmatch(r'([a-z]+)[- ](\d{4})', folded(row['FECHA DE VENCIMIENTO']))
        displayed_expiry = f'{int(expiry_match[2]):04d}-{months[expiry_match[1]]:02d}' if expiry_match and expiry_match[1] in months else None
        expiry = displayed_expiry or component_expiry
        if displayed_expiry and component_expiry and displayed_expiry != component_expiry:
            expiry = None
        original = {field: (text(value) if isinstance(value, (dt.datetime, dt.date)) else value) for field, value in row.items()}
        output.append({
            'source_row': number, 'code': code, 'kind': 'extinguisher',
            'location': text(row[headers[5]]).strip(), 'serial_number': serial,
            'brand': text(row['MARCA']).strip(), 'agent': text(row['TIPO']).strip(),
            'capacity': text(row['CAPACIDAD']).strip(), 'manufacture_year': year(row['AÑO DE FABRICACIÓN']),
            'last_hydro_year': year(row['ÚLTIMA PRUEBA HIDRÓSTATICA']), 'next_hydro_year': year(row['PRÓXIMA PRUEBA HIDRÓSTATICA']),
            'expiry_month': expiry or '', 'owner_management_id': candidate['id'] if candidate else None,
            'owner_name': owner, 'classification': text(row['FILTRO']).strip(), 'placement_kind': text(row['Fuente']).strip(),
            'enabled': 'PRUEBA' not in code,
            'legacy': {'official_date': official, 'previous_date': date(row['fecha última inspección']),
                       'state': text(row['ESTADO']).strip(), 'notes': text(row['OBSERVACIÓN']),
                       'inspector_code': text(row['FIRMA INSPECTOR']),
                       'months': {name: official if name == 'Noviembre' else text(row[name]) for name in month_names},
                       'original': original},
        })
    workbook.close()
    return headers, output, removed, changes


def write(source, catalog_path, output_dir, excluded):
    if output_dir.resolve().is_relative_to(ROOT):
        raise ValueError('La salida contiene datos privados: elige una carpeta fuera del repositorio público.')
    catalog = json.loads(catalog_path.read_text())['catalog']
    headers, records, removed, changes = prepare(source, catalog, excluded)
    if len(removed) != len(excluded):
        raise ValueError('Cada exclusión confirmada debe coincidir exactamente con una fila.')
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    batch_sha = hashlib.sha256(payload.encode()).hexdigest()
    manifest = {'source_file': source.name, 'source_sha256': source_sha, 'prepared_sha256': batch_sha,
                'source_rows': len(records) + len(removed), 'records': len(records), 'excluded': removed,
                'retained_for_excluded_codes': [{'code': r['code'], 'serial_number': r['serial_number']} for r in records if key(r['code']) in {code for code, _ in excluded}],
                'official_date_column': 'H', 'november_rule': 'COPY_H_INCLUDING_EMPTY_AND_NON_NOVEMBER_DATES',
                'november_changes': len(changes), 'user_assignments': 'CAPTURE_IN_PLATFORM', 'production_changes': False}
    (output_dir/'inventario-confirmado.json').write_text(payload + '\n')
    (output_dir/'decisiones-y-validacion.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (output_dir/'cambios-noviembre.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n')
    workbook = openpyxl.Workbook(); sheet = workbook.active; sheet.title = '2026'
    sheet.append(headers)
    for record in records:
        row = record['legacy']['original']
        values = [row[field] for field in headers]
        for index in (7, 20, 31):
            if values[index]:
                values[index] = dt.datetime.fromisoformat(values[index])
        sheet.append(values)
    sheet.freeze_panes = 'A2'; sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.fill = PatternFill('solid', fgColor='244B38'); cell.font = Font(color='FFFFFF', bold=True)
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, str): cell.data_type = 's'
            elif isinstance(cell.value, (dt.datetime, dt.date)): cell.number_format = 'dd/mm/yyyy'
    workbook.save(output_dir/'BD-extintores-confirmada.xlsx')
    migration = (ROOT/'supabase/migrations/202611270031_emergency_inventory.sql').read_text()
    delimiter = '$inventory_' + batch_sha[:16] + '$'
    if delimiter in payload:
        raise ValueError('Delimitador inesperado en datos de origen.')
    script = migration + f'\n-- Carga privada. No incorporar este archivo al repositorio público.\nbegin;\nselect berry_private.import_emergency_inventory(\n\'{batch_sha}\',\'{source_sha}\',\n{delimiter}{payload}{delimiter}::jsonb\n) as resultado_carga;\ncommit;\nselect public.berry_emergency_status()->>\'version\' as yo_reviso_version,\n  count(*) as extintores_importados,\n  bool_and((months->>\'Noviembre\') is not distinct from official_date::text) as noviembre_igual_a_h\nfrom public.berry_emergency_legacy_records where batch_sha=\'{batch_sha}\';\n'
    (output_dir/'31-cargar-extintores.sql').write_text(script)
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path); parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--exclude', nargs=2, action='append', default=[], metavar=('CODE', 'SERIAL'))
    args = parser.parse_args()
    write(args.source, args.catalog, args.output, {(key(code), serial.strip().upper()) for code, serial in args.exclude})
