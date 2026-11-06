"""Create the distributable blank form without rebuilding Excel's formatting.

Usage: python scripts/prepare-inspection-template.py ORIGINAL.xlsx
The annotated copy is documentation, never the source of the production form.
"""
from pathlib import Path
import re
import sys
from xml.dom import minidom
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
D = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'


def prepare(source, destination):
    with ZipFile(source) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    sheet = minidom.parseString(parts['xl/worksheets/sheet1.xml'])
    editable = {'B5', 'A11', 'D11', 'G11', 'J11', 'A14', 'D14', 'F14', 'I14', 'A16', 'A26', 'A29'}
    for cell in sheet.getElementsByTagNameNS(S, 'c'):
        reference = cell.getAttribute('r')
        row = int(re.search(r'\d+', reference)[0])
        if reference in editable or 20 <= row <= 24:
            for child in list(cell.childNodes):
                cell.removeChild(child)
            cell.removeAttribute('t') if cell.hasAttribute('t') else None
    parts['xl/worksheets/sheet1.xml'] = sheet.toxml(encoding='UTF-8')

    # Only the fixed logo belongs in the blank form. Remove sample evidence,
    # including pictures parked outside the print area in the source workbook.
    drawing = minidom.parseString(parts['xl/drawings/drawing1.xml'])
    keep = set()
    for anchor in list(drawing.documentElement.childNodes):
        if anchor.nodeType != anchor.ELEMENT_NODE:
            continue
        origin = anchor.getElementsByTagNameNS(D, 'from')[0]
        column = int(origin.getElementsByTagNameNS(D, 'col')[0].firstChild.data)
        row = int(origin.getElementsByTagNameNS(D, 'row')[0].firstChild.data)
        if column == 0 and row < 3:
            keep.update(b.getAttributeNS(R, 'embed') for b in anchor.getElementsByTagNameNS(A, 'blip'))
        else:
            drawing.documentElement.removeChild(anchor)
    parts['xl/drawings/drawing1.xml'] = drawing.toxml(encoding='UTF-8')
    relationships = minidom.parseString(parts['xl/drawings/_rels/drawing1.xml.rels'])
    media = set()
    for rel in list(relationships.getElementsByTagNameNS(P, 'Relationship')):
        if rel.getAttribute('Id') in keep:
            media.add('xl/' + rel.getAttribute('Target').removeprefix('../'))
        else:
            rel.parentNode.removeChild(rel)
    parts['xl/drawings/_rels/drawing1.xml.rels'] = relationships.toxml(encoding='UTF-8')
    for name in list(parts):
        if name.startswith('xl/media/') and name not in media:
            del parts[name]

    # Keep shared-string indices stable for the untouched valuation sheet, but
    # remove unused example descriptions from the downloadable blank package.
    used = set()
    for name in ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']:
        doc = minidom.parseString(parts[name])
        for cell in doc.getElementsByTagNameNS(S, 'c'):
            if cell.getAttribute('t') == 's':
                used.add(int(cell.getElementsByTagNameNS(S, 'v')[0].firstChild.data))
    strings = minidom.parseString(parts['xl/sharedStrings.xml'])
    for index, item in enumerate(strings.getElementsByTagNameNS(S, 'si')):
        if index not in used:
            for child in list(item.childNodes):
                item.removeChild(child)
            item.appendChild(strings.createElementNS(S, 't'))
    parts['xl/sharedStrings.xml'] = strings.toxml(encoding='UTF-8')

    # Local author paths and editing history are not needed to use this form.
    book = minidom.parseString(parts['xl/workbook.xml'])
    for tag in ['AlternateContent', 'revisionPtr']:
        for node in list(book.getElementsByTagName('*')):
            if node.localName == tag:
                node.parentNode.removeChild(node)
    parts['xl/workbook.xml'] = book.toxml(encoding='UTF-8')
    parts['docProps/core.xml'] = b'<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>'
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in parts.items():
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            archive.writestr(entry, data)
    print(f'Blank template: {destination} ({destination.stat().st_size} bytes)')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]), Path(__file__).resolve().parents[1] / 'public/templates/inspection.xlsx')
