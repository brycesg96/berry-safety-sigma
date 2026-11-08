import JSZip from 'jszip';
import type { Evidence, Inspection } from './model';
import { formatInspectionTime } from './inspection-time';
import { closingRemarksOf, registrationPeople } from './registration';
import { confirmedInspectionCode } from './inspection-code';

// Patch the original OOXML package rather than round-tripping it through a
// workbook model: printer binaries, valuation sheet, styles and logo survive.
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const D = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const C = 'http://schemas.openxmlformats.org/package/2006/content-types';
const EMU = 9525;
const RISK_LABELS = { baja: 'Bajo', media: 'Medio', alta: 'Alto' } as const;
const ENTRY_DATE = new Date('2026-01-01T00:00:00Z');
let template: Promise<ArrayBuffer> | undefined;

function elements(parent: Document | Element, namespace: string, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(namespace, name));
}
function first(parent: Document | Element, namespace: string, name: string): Element {
  const value = elements(parent, namespace, name)[0];
  if (!value) throw new Error('La plantilla de Excel está incompleta.');
  return value;
}
function parse(value: string): XMLDocument {
  const document = new DOMParser().parseFromString(value, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('No se pudo leer la plantilla de Excel.');
  return document;
}
function node(document: Document, ns: string, name: string, attributes: Record<string, string | number> = {}, text?: string): Element {
  const result = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, String(value));
  if (text !== undefined) result.textContent = text;
  return result;
}
function shifted(reference: string, extra: number): string {
  return reference.replace(/(\$?[A-Z]+\$?)(\d+)/g, (_, column, row) => `${column}${Number(row) >= 24 ? Number(row) + extra : row}`);
}
function printedDate(value: string): string {
  return value ? value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') : '';
}

class InspectionForm {
  readonly data: Element;
  readonly widths: number[];
  private readonly cells = new Map<string, Element>();
  private readonly adaptedStyles = new Map<string, string>();
  private pictureId: number;

  constructor(readonly zip: JSZip, readonly sheet: XMLDocument, readonly drawing: XMLDocument,
    readonly relations: XMLDocument, readonly types: XMLDocument, readonly styles: XMLDocument) {
    this.data = first(sheet, S, 'sheetData');
    this.widths = Array.from({ length: 12 }, (_, index) => {
      const column = elements(sheet, S, 'col').find(c => Number(c.getAttribute('min')) <= index + 1 && Number(c.getAttribute('max')) >= index + 1);
      // Character widths converted to pixels with Arial's 7-pixel max digit.
      return Math.floor(((256 * Number(column?.getAttribute('width') || 8.43) + Math.floor(128 / 7)) / 256) * 7);
    });
    this.pictureId = Math.max(0, ...elements(drawing, D, 'cNvPr').map(p => Number(p.getAttribute('id'))));
    this.indexCells();
  }

  private indexCells() {
    this.cells.clear();
    for (const cell of elements(this.sheet, S, 'c')) this.cells.set(cell.getAttribute('r')!, cell);
  }

  extendObservations(count: number) {
    const extra = Math.max(0, count - 5);
    if (!extra) return;
    const rows = elements(this.data, S, 'row');
    const last = rows.find(row => row.getAttribute('r') === '24')!;
    const interior = rows.find(row => row.getAttribute('r') === '23')!.cloneNode(true) as Element;
    // The last original record carries the bottom border; keep it last.
    interior.setAttribute('ht', last.getAttribute('ht')!);
    for (const row of rows) {
      const position = Number(row.getAttribute('r'));
      if (position >= 24) {
        row.setAttribute('r', String(position + extra));
        for (const cell of elements(row, S, 'c')) cell.setAttribute('r', shifted(cell.getAttribute('r')!, extra));
      }
    }
    const merges = first(this.sheet, S, 'mergeCells');
    for (const merge of elements(merges, S, 'mergeCell')) merge.setAttribute('ref', shifted(merge.getAttribute('ref')!, extra));
    for (let rowNumber = 24; rowNumber < 24 + extra; rowNumber++) {
      const row = interior.cloneNode(true) as Element;
      row.setAttribute('r', String(rowNumber));
      for (const cell of elements(row, S, 'c')) cell.setAttribute('r', cell.getAttribute('r')!.replace(/\d+$/, String(rowNumber)));
      this.data.insertBefore(row, last);
      for (const [left, right] of [['A', 'C'], ['G', 'H'], ['K', 'L']]) merges.appendChild(node(this.sheet, S, 'mergeCell', { ref: `${left}${rowNumber}:${right}${rowNumber}` }));
    }
    merges.setAttribute('count', String(elements(merges, S, 'mergeCell').length));
    // Keep the template's existing dropdowns and color formulas on added rows.
    for (const tag of ['conditionalFormatting', 'dataValidation']) {
      for (const element of elements(this.sheet, S, tag)) element.setAttribute('sqref', shifted(element.getAttribute('sqref')!, extra));
    }
    first(this.sheet, S, 'dimension').setAttribute('ref', `A1:P${36 + extra}`);
    this.indexCells();
  }

  text(reference: string, value: string) {
    const cell = this.cells.get(reference);
    if (!cell) throw new Error(`No se encontró la celda ${reference} del informe.`);
    const content = node(this.sheet, S, 'is');
    const text = node(this.sheet, S, 't', {}, value);
    text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    content.appendChild(text);
    cell.replaceChildren(content);
    cell.setAttribute('t', 'inlineStr'); // User text is never a formula.
  }

  wrap(reference: string) {
    const cell = this.cells.get(reference)!;
    const original = cell.getAttribute('s') || '0';
    let style = this.adaptedStyles.get(original);
    if (!style) {
      const formats = first(this.styles, S, 'cellXfs');
      const copy = elements(formats, S, 'xf')[Number(original)].cloneNode(true) as Element;
      const alignment = elements(copy, S, 'alignment')[0] || copy.appendChild(node(this.styles, S, 'alignment'));
      alignment.setAttribute('wrapText', '1');
      copy.setAttribute('applyAlignment', '1');
      style = String(formats.children.length);
      formats.appendChild(copy);
      formats.setAttribute('count', String(formats.children.length));
      this.adaptedStyles.set(original, style);
    }
    cell.setAttribute('s', style);
  }

  enlargeSignatureRow(row: number) {
    const element = elements(this.data, S, 'row').find(value => value.getAttribute('r') === String(row));
    if (!element) throw new Error('No se encontró la fila de la firma.');
    element.setAttribute('ht', String(Number(element.getAttribute('ht') || 15) * 3));
    element.setAttribute('customHeight', '1');
  }

  private height(row: number): number {
    const value = elements(this.data, S, 'row').find(r => r.getAttribute('r') === String(row));
    return Number(value?.getAttribute('ht') || 15) * 96 / 72;
  }

  async pictures(photos: Evidence[], row: number, column: number, span = 1, signature = false) {
    if (!photos.length) return;
    if (photos.length > 8) throw new Error('Cada observación admite un máximo de ocho fotos.');
    const images = await Promise.all(photos.map(async photo => {
      const image = new Image();
      image.src = photo.data;
      try { await image.decode(); } catch { throw new Error(`No se pudo incluir la imagen «${photo.name}» en el Excel.`); }
      return image;
    }));
    const label = signature ? 45 : 0;
    const width = this.widths.slice(column, column + span).reduce((sum, w) => sum + w, 0) - 12 - label;
    const height = this.height(row) - 12;
    let best = { columns: 1, width: 0, height: 0, score: -1 };
    for (let columns = 1; columns <= photos.length; columns++) {
      const rows = Math.ceil(photos.length / columns);
      const tileWidth = (width - (columns - 1) * 4) / columns;
      const tileHeight = (height - (rows - 1) * 4) / rows;
      const score = images.reduce((sum, image) => {
        const scale = Math.min(tileWidth / image.naturalWidth, tileHeight / image.naturalHeight);
        return sum + image.naturalWidth * image.naturalHeight * scale * scale;
      }, 0);
      if (score > best.score) best = { columns, width: tileWidth, height: tileHeight, score };
    }
    for (const [index, image] of images.entries()) {
      const scale = Math.min(best.width / image.naturalWidth, best.height / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      const x = 6 + label + (index % best.columns) * (best.width + 4) + (best.width - w) / 2;
      const y = 6 + Math.floor(index / best.columns) * (best.height + 4) + (best.height - h) / 2;
      // Enough pixels for printing, without multi-megabyte originals for tiny
      // thumbnails. Signatures keep their transparent background.
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, w * 2 / image.naturalWidth, h * 2 / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudieron procesar las imágenes del informe.');
      if (!signature) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const extension = signature ? 'png' : 'jpeg';
      const data = canvas.toDataURL(`image/${extension}`, 0.85).split(',')[1];
      this.embed(data, extension, row, column, x, y, w, h, signature ? 'Firma' : `Observación ${row - 19} · Foto ${index + 1}`);
    }
  }

  private embed(base64: string, extension: string, row: number, column: number, x: number, y: number, width: number, height: number, name: string) {
    const id = ++this.pictureId;
    const media = `berryInspection${id}.${extension}`;
    const relationship = `rIdBerryImage${id}`;
    this.zip.file(`xl/media/${media}`, base64, { base64: true, date: ENTRY_DATE, createFolders: false });
    this.relations.documentElement.appendChild(node(this.relations, P, 'Relationship', { Id: relationship, Type: `${R}/image`, Target: `../media/${media}` }));
    if (!elements(this.types, C, 'Default').some(d => d.getAttribute('Extension') === extension)) {
      this.types.documentElement.appendChild(node(this.types, C, 'Default', { Extension: extension, ContentType: `image/${extension}` }));
    }
    // Normalize offsets when a merged cell crosses several physical columns.
    let anchorColumn = column, offset = x;
    while (anchorColumn < column + 2 && offset >= this.widths[anchorColumn]) offset -= this.widths[anchorColumn++];
    const document = this.drawing;
    // Drawing anchors are floating pictures above the sheet, never cell values.
    const anchor = node(document, D, 'xdr:oneCellAnchor');
    const from = node(document, D, 'xdr:from');
    for (const [tag, value] of [['col', anchorColumn], ['colOff', Math.round(offset * EMU)], ['row', row - 1], ['rowOff', Math.round(y * EMU)]] as const) from.appendChild(node(document, D, `xdr:${tag}`, {}, String(value)));
    anchor.appendChild(from);
    anchor.appendChild(node(document, D, 'xdr:ext', { cx: Math.round(width * EMU), cy: Math.round(height * EMU) }));
    const picture = node(document, D, 'xdr:pic');
    const nonVisual = node(document, D, 'xdr:nvPicPr');
    nonVisual.appendChild(node(document, D, 'xdr:cNvPr', { id, name, descr: name }));
    const locks = node(document, D, 'xdr:cNvPicPr');
    locks.appendChild(node(document, A, 'a:picLocks', { noChangeAspect: 1 }));
    nonVisual.appendChild(locks);
    picture.appendChild(nonVisual);
    const fill = node(document, D, 'xdr:blipFill');
    const blip = node(document, A, 'a:blip');
    blip.setAttributeNS(R, 'r:embed', relationship);
    fill.appendChild(blip);
    const stretch = node(document, A, 'a:stretch');
    stretch.appendChild(node(document, A, 'a:fillRect'));
    fill.appendChild(stretch);
    picture.appendChild(fill);
    const shape = node(document, D, 'xdr:spPr');
    const transform = node(document, A, 'a:xfrm');
    transform.appendChild(node(document, A, 'a:off', { x: 0, y: 0 }));
    transform.appendChild(node(document, A, 'a:ext', { cx: Math.round(width * EMU), cy: Math.round(height * EMU) }));
    shape.appendChild(transform);
    const geometry = node(document, A, 'a:prstGeom', { prst: 'rect' });
    geometry.appendChild(node(document, A, 'a:avLst'));
    shape.appendChild(geometry);
    picture.appendChild(shape);
    anchor.appendChild(picture);
    anchor.appendChild(node(document, D, 'xdr:clientData'));
    document.documentElement.appendChild(anchor);
  }
}

export async function fillInspectionTemplate(d: Inspection): Promise<Uint8Array> {
  template ||= fetch(`${import.meta.env.BASE_URL}templates/inspection.xlsx`).then(response => {
    if (!response.ok) throw new Error('No se pudo descargar la plantilla de Excel.');
    return response.arrayBuffer();
  }).catch(error => { template = undefined; throw error; });
  const zip = await JSZip.loadAsync(await template);
  const paths = ['xl/worksheets/sheet1.xml', 'xl/drawings/drawing1.xml', 'xl/drawings/_rels/drawing1.xml.rels', '[Content_Types].xml', 'xl/styles.xml', 'xl/workbook.xml'];
  const documents = await Promise.all(paths.map(async path => {
    const part = zip.file(path);
    if (!part) throw new Error('La plantilla de Excel está incompleta.');
    return parse(await part.async('string'));
  }));
  const [sheet, drawing, relations, types, styles, book] = documents;
  const form = new InspectionForm(zip, sheet, drawing, relations, types, styles);
  form.extendObservations(d.observations.length);
  const extra = Math.max(0, d.observations.length - 5);
  form.text('B5', confirmedInspectionCode(d) || 'PENDIENTE DE REGISTRO');
  form.text('A11', d.area);
  form.text('D11', printedDate(d.date));
  form.text('G11', d.responsibles.map(p => p.name).join('\n'));
  const people = registrationPeople(d);
  form.text('J11', people.map(p => p.name).join('\n'));
  form.text('A14', formatInspectionTime(d.inspectionTime, d.inspectionPeriod));
  form.text('D14', d.type === 'Planeada' ? 'X' : '');
  form.text('F14', d.type === 'No planeada' ? 'X' : '');
  form.text('I14', d.type === 'Otro' ? d.otherType : '');
  form.text('A16', d.objective);
  for (const [index, observation] of d.observations.entries()) {
    const row = 20 + index;
    const correction = d.delivery?.corrections[observation.id];
    form.text(`A${row}`, observation.description);
    if (!Object.hasOwn(RISK_LABELS, observation.severity)) throw new Error('Selecciona un nivel de riesgo válido para cada observación.');
    form.text(`E${row}`, RISK_LABELS[observation.severity]);
    form.text(`F${row}`, [observation.correctiveAction, correction?.action?.trim() ? `Acción realizada:\n${correction.action}` : '', correction?.note?.trim() ? `Observación del revisor:\n${correction.note}` : ''].filter(Boolean).join('\n\n'));
    form.text(`G${row}`, correction?.responsibleName ?? d.responsibles[0]?.name ?? '');
    form.text(`I${row}`, correction?.state || 'Pendiente');
    form.text(`J${row}`, printedDate(correction?.date || observation.dueDate));
    await form.pictures(observation.photos, row, 3);
    if (correction) await form.pictures(correction.photos, row, 10, 2);
  }
  form.text(`A${26 + extra}`, d.unfavorableCause || '');
  form.text(`A${29 + extra}`, closingRemarksOf(d));
  for (let index = 0; index < people.length; index++) form.enlargeSignatureRow(34 + extra + index);
  for (const [index, person] of people.entries()) {
    const row = 34 + extra + index;
    const details = d.registrationDetails?.[person.id];
    form.text(`A${row}`, `Nombre: ${person.name}`);
    form.text(`E${row}`, `Cargo: ${details?.jobTitle ?? ('jobTitle' in person ? person.jobTitle : '') ?? ''}`);
    form.text(`H${row}`, `Fecha: ${printedDate(details?.date || d.date)}`);
    for (const column of ['A', 'E', 'H']) form.wrap(`${column}${row}`);
    if (details?.signature) await form.pictures([details.signature], row, 9, 3, true);
  }
  first(book, S, 'definedName').textContent = `V.01!$A$1:$L$${36 + extra}`;
  const serializer = new XMLSerializer();
  for (const [index, path] of paths.entries()) zip.file(path, serializer.serializeToString(documents[index]), { date: ENTRY_DATE, createFolders: false });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
