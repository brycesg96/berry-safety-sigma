#!/usr/bin/env python3
"""Read IPERC as data; generate a reviewable seed without contacting any service."""
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
NAMESPACE = uuid.UUID('de5a1d2e-6609-4d77-861b-87d76d62bf25')
EXCLUDED_OPERATORS = {'operador cctv', 'operador de maquinaria'}


def text(value):
    return ' '.join(str(value or '').split())


def key(value):
    return ''.join(c for c in unicodedata.normalize('NFD', text(value)).casefold() if not unicodedata.combining(c))


def extract(path):
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    summary = next(sheet for sheet in book if sheet.sheet_state == 'visible')
    excluded_managements = [text(row[0].value) for row in summary.iter_rows(max_col=1)
                            if row[0].value and row[0].fill.fgColor.type == 'rgb'
                            and row[0].fill.fgColor.rgb.upper()[-6:] == 'FFC000']
    excluded_keys = {key(value) for value in excluded_managements}
    classification = collections.defaultdict(set)
    for row in book['BD Puestos'].iter_rows(min_row=2, max_col=9, values_only=True):
        if row[1] and row[2] and row[3]:
            classification[tuple(key(v) for v in row[1:4])].add(key(row[4]))
    accepted, rejected, duplicates = {}, [], []
    for number, row in enumerate(book['Puestos O'].iter_rows(min_row=2, max_col=8, values_only=True), 2):
        if not any(row):
            continue
        management, area, position, condition, _, validity, *_ = map(text, row)
        triple = (management, area, position)
        normalized = tuple(map(key, triple))
        reason = None
        if key(management) in excluded_keys:
            reason = 'gerencia_naranja'
        elif not all(triple):
            reason = 'relacion_incompleta'
        elif key(condition) != 'empleado' or classification.get(normalized) != {'empleado'}:
            reason = 'no_empleado_segun_clasificacion'
        elif re.search(r'\bpracticantes?\b', key(position)):
            reason = 'puesto_de_practicante'
        elif key(validity) != 'activo':
            reason = 'no_vigente'
        elif key(position) in EXCLUDED_OPERATORS or re.search(r'\b(obrero|operario|peon)(s|es)?\b', key(position)):
            reason = 'puesto_operativo_excluido_por_el_usuario'
        item = dict(row=number, management=management, area=area, position=position)
        if reason:
            rejected.append(dict(item, reason=reason))
        elif normalized in accepted:
            duplicates.append(item)
        else:
            accepted[normalized] = item
    nodes, managements, areas = [], {}, {}
    for normalized, item in sorted(accepted.items()):
        management, area, position = (item[k] for k in ['management', 'area', 'position'])
        if normalized[0] not in managements:
            managements[normalized[0]] = str(uuid.uuid5(NAMESPACE, 'management/' + normalized[0]))
            nodes.append(dict(id=managements[normalized[0]], parent_id=None, kind='management', name=management, enabled=True, revision=1))
        area_key = normalized[:2]
        if area_key not in areas:
            areas[area_key] = str(uuid.uuid5(NAMESPACE, 'area/' + '/'.join(area_key)))
            nodes.append(dict(id=areas[area_key], parent_id=managements[normalized[0]], kind='area', name=area, enabled=True, revision=1))
        nodes.append(dict(id=str(uuid.uuid5(NAMESPACE, 'position/' + '/'.join(normalized))), parent_id=areas[area_key], kind='position', name=position, enabled=True, revision=1))
    report = dict(source=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), summary_sheet=summary.title,
                  detail_sheet='Puestos O', classification_sheet='BD Puestos',
                  excluded_managements=excluded_managements, counts=dict(managements=len(managements), areas=len(areas), positions=len(accepted),
                  excluded=len(rejected), duplicates=len(duplicates), reasons=dict(collections.Counter(item['reason'] for item in rejected))),
                  excluded_rows=rejected, duplicate_rows=duplicates)
    book.close()
    return nodes, report


def write(path):
    nodes, report = extract(path)
    (ROOT / 'src/organization-seed.json').write_text(json.dumps(nodes, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'reference/organization-import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    migration = ROOT / 'supabase/migrations/202611150014_organization_catalog.sql'
    if migration.exists():
        start, end = '-- BEGIN IMPORTED ORGANIZATION SEED', '-- END IMPORTED ORGANIZATION SEED'
        sql = migration.read_text()
        data = json.dumps(nodes, ensure_ascii=False, separators=(',', ':')).replace("'", "''")
        body = f"""{start}
do $$ begin
 if not exists(select 1 from berry_private.organization_seed_versions where version='iperc-2026-20261115') then
  insert into public.berry_organization(id,parent_id,kind,name,enabled)
   select id::uuid,parent_id::uuid,kind,name,enabled
   from jsonb_to_recordset('{data}'::jsonb) as n(id text,parent_id text,kind text,name text,enabled boolean)
   on conflict(id) do nothing;
  insert into berry_private.organization_seed_versions(version) values('iperc-2026-20261115');
 end if;
end $$;
{end}"""
        before, remainder = sql.split(start, 1)
        _, after = remainder.split(end, 1)
        migration.write_text(before + body + after)
    print(json.dumps(dict(**report['counts'], excluded_managements=report['excluded_managements']), ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    write(parser.parse_args().source)
