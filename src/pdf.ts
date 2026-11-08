import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type { Inspection } from './model';
import { inspectionClosed } from './follow-up';
import { buildExcel } from './export';
import { registrationPeople } from './registration';

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const D = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const all = (node: Document | Element, ns: string, name: string) => Array.from(node.getElementsByTagNameNS(ns, name));
const child = (node: Element | undefined, name: string) => node ? all(node, S, name)[0] : undefined;
const number = (node: Element | undefined, key: string, fallback = 0) => Number(node?.getAttribute(key) ?? fallback);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const offsets = (values: number[]) => values.map((_, index) => sum(values.slice(0, index)));
type Range = { left: number; top: number; right: number; bottom: number };

function position(reference: string) {
  const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(reference);
  if (!match) throw new Error('Referencia inválida en la plantilla.');
  return { column: [...match[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1, row: Number(match[2]) - 1 };
}
function range(reference: string): Range {
  const [start, end = start] = reference.split(':').map(position);
  return { left: start.column, top: start.row, right: end.column, bottom: end.row };
}
const contains = (area: Range, column: number, row: number) => column >= area.left && column <= area.right && row >= area.top && row <= area.bottom;
async function xml(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) throw new Error('La plantilla del informe está incompleta.');
  const doc = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('No se pudo leer el informe.');
  return doc;
}
function base64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(binary);
}
let fonts: Promise<Uint8Array[]> | undefined;
function reportFonts() {
  return fonts ||= Promise.all(['Regular', 'Bold'].map(async style => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/report/LiberationSans-${style}.ttf`, { credentials: 'omit' });
    if (!response.ok) throw new Error('No se pudo cargar la tipografía del PDF. Vuelve a intentarlo.');
    return new Uint8Array(await response.arrayBuffer());
  })).catch(error => { fonts = undefined; throw error; });
}

// Render the printable V.01 sheet from the very same completed XLSX package.
// The original form, styles, merged cells and image anchors remain the source.
export async function buildPdf(inspection: Inspection) {
  if (!inspectionClosed(inspection)) throw new Error('El PDF está disponible cuando la inspección está cerrada.');
  const file = await buildExcel(inspection);
  const zip = await JSZip.loadAsync(file.bytes);
  const [sheet, styles, strings, theme, drawing, relations, fontFiles] = await Promise.all([
    xml(zip, 'xl/worksheets/sheet1.xml'), xml(zip, 'xl/styles.xml'), xml(zip, 'xl/sharedStrings.xml'),
    xml(zip, 'xl/theme/theme1.xml'), xml(zip, 'xl/drawings/drawing1.xml'), xml(zip, 'xl/drawings/_rels/drawing1.xml.rels'), reportFonts(),
  ]);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
  for (const [index, style] of ['normal', 'bold'].entries()) {
    pdf.addFileToVFS(`Report-${style}.ttf`, base64(fontFiles[index]));
    pdf.addFont(`Report-${style}.ttf`, 'Report', style);
  }
  pdf.setProperties({ title: `Registro de inspección - ${inspection.area}`, subject: 'Inspección cerrada', creator: 'Berry Safety', author: inspection.inspector });
  // Closed PDFs omit unused signer rows; the XLSX keeps the original form.
  const lastRow = 33 + Math.max(0, inspection.observations.length - 5) + registrationPeople(inspection).length;
  const columns = all(sheet, S, 'col');
  const widths = Array.from({ length: 12 }, (_, index) => {
    const col = columns.find(c => number(c, 'min') <= index + 1 && number(c, 'max') >= index + 1);
    return Math.floor(((256 * number(col, 'width', 8.43) + Math.floor(128 / 7)) / 256) * 7) * 0.75;
  });
  const sheetRows = all(sheet, S, 'row');
  const heights = Array.from({ length: lastRow }, (_, index) => number(sheetRows.find(r => number(r, 'r') === index + 1), 'ht', 15));
  const xs = offsets(widths);
  const merged = all(sheet, S, 'mergeCell').map(m => range(m.getAttribute('ref')!));
  const formats = Array.from(all(styles, S, 'cellXfs')[0].children);
  const fontStyles = Array.from(all(styles, S, 'fonts')[0].children);
  const fills = Array.from(all(styles, S, 'fills')[0].children);
  const borders = Array.from(all(styles, S, 'borders')[0].children);
  const differential = Array.from(all(styles, S, 'dxfs')[0].children);
  const shared = all(strings, S, 'si').map(si => all(si, S, 't').map(t => t.textContent || '').join(''));
  const colorScheme = all(theme, A, 'clrScheme')[0];
  const themeColors = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(name => {
    const color = all(colorScheme, A, name)[0]?.firstElementChild;
    return color?.getAttribute('lastClr') || color?.getAttribute('val') || '000000';
  });
  function color(node: Element | undefined, fallback = '000000') {
    if (!node) return `#${fallback}`;
    const hex = node.getAttribute('rgb')?.slice(-6) || (node.hasAttribute('theme') ? themeColors[number(node, 'theme')] : node.getAttribute('indexed') === '9' ? 'FFFFFF' : fallback);
    const tint = number(node, 'tint');
    const rgb = [0, 2, 4].map(index => {
      const value = parseInt(hex.slice(index, index + 2), 16);
      return Math.round(tint < 0 ? value * (1 + tint) : value + (255 - value) * tint).toString(16).padStart(2, '0');
    });
    return `#${rgb.join('')}`;
  }
  const conditionals = all(sheet, S, 'conditionalFormatting').map(cf => ({
    areas: cf.getAttribute('sqref')!.split(/\s+/).map(range), rules: all(cf, S, 'cfRule'),
  }));
  const cells = all(sheet, S, 'c').map(element => {
    const { column, row } = position(element.getAttribute('r')!);
    const text = element.getAttribute('t') === 's' ? shared[Number(child(element, 'v')?.textContent)] || '' : element.getAttribute('t') === 'inlineStr' ? all(element, S, 't').map(t => t.textContent || '').join('') : child(element, 'v')?.textContent || '';
    const style = formats[number(element, 's')];
    const area = merged.find(m => contains(m, column, row)) || { left: column, right: column, top: row, bottom: row };
    const rule = conditionals.filter(cf => cf.areas.some(a => contains(a, column, row))).flatMap(cf => cf.rules).find(r => r.getAttribute('type') === 'containsText' && text.toLowerCase().includes((r.getAttribute('text') || '\0').toLowerCase()));
    const override = rule ? differential[number(rule, 'dxfId')] : undefined;
    return { column, row, text, style, area, override };
  }).filter(c => c.column < 12 && c.row < lastRow);
  const margins = all(sheet, S, 'pageMargins')[0];
  const top = number(margins, 'top', 0.315) * 72, bottom = number(margins, 'bottom', 0.315) * 72;
  const availableWidth = pdf.internal.pageSize.getWidth() - (number(margins, 'left', 0.158) + number(margins, 'right', 0.158)) * 72;
  const scale = Math.min(number(all(sheet, S, 'pageSetup')[0], 'scale', 30) / 100, availableWidth / sum(widths));
  const left = (pdf.internal.pageSize.getWidth() - sum(widths) * scale) / 2;
  const capacity = pdf.internal.pageSize.getHeight() - top - bottom;
  const pages: number[][] = [[]];
  let used = 0;
  for (let row = 0; row < lastRow;) {
    let end = row;
    // Never split a merged cell or a photographic record between pages.
    for (let previous = -1; previous !== end;) {
      previous = end;
      for (const merge of merged) if (merge.top <= end && merge.bottom >= row) end = Math.max(end, merge.bottom);
    }
    const group = Array.from({ length: end - row + 1 }, (_, i) => row + i);
    const height = sum(group.map(r => heights[r])) * scale;
    if (used + height > capacity && pages[pages.length - 1].length) {
      const header = row >= 19 && row < 24 + Math.max(0, inspection.observations.length - 5) ? [0, 1, 2, 17, 18] : [0, 1, 2];
      pages.push(header); used = sum(header.map(r => heights[r])) * scale;
    }
    pages[pages.length - 1].push(...group); used += height; row = end + 1;
  }
  const pictures = await Promise.all(Array.from(drawing.documentElement.children).map(async anchor => {
    const from = all(anchor, D, 'from')[0], to = all(anchor, D, 'to')[0];
    const coordinate = (node: Element, key: string) => Number(all(node, D, key)[0]?.textContent || 0);
    const column = coordinate(from, 'col'), row = coordinate(from, 'row');
    const x = coordinate(from, 'colOff') / 12700, y = coordinate(from, 'rowOff') / 12700;
    const ext = all(anchor, D, 'ext')[0];
    const width = ext ? number(ext, 'cx') / 12700 : sum(widths.slice(column, coordinate(to, 'col'))) + coordinate(to, 'colOff') / 12700 - x;
    const height = ext ? number(ext, 'cy') / 12700 : sum(heights.slice(row, coordinate(to, 'row'))) + coordinate(to, 'rowOff') / 12700 - y;
    const id = all(anchor, A, 'blip')[0].getAttributeNS(R, 'embed');
    const target = all(relations, P, 'Relationship').find(r => r.getAttribute('Id') === id)?.getAttribute('Target');
    const path = target?.replace(/^\.\.\//, 'xl/');
    const media = path && zip.file(path);
    if (!media) throw new Error('No se pudo incluir una evidencia en el PDF.');
    return { column, row, x, y, width, height, path, bytes: await media.async('uint8array') };
  }));
  for (const [pageIndex, rows] of pages.entries()) {
    if (pageIndex) pdf.addPage();
    const ys = new Map(rows.map((row, i) => [row, top + sum(rows.slice(0, i).map(r => heights[r])) * scale]));
    const visible = cells.filter(c => ys.has(c.row));
    for (const cell of visible) {
      if (cell.area.left !== cell.column || cell.area.top !== cell.row) continue;
      const fill = child(cell.override, 'fill') || fills[number(cell.style, 'fillId')];
      const pattern = child(fill, 'patternFill');
      const fillColor = child(pattern, 'fgColor') || child(pattern, 'bgColor');
      if (fillColor && (child(cell.override, 'fill') || pattern?.getAttribute('patternType') === 'solid')) {
        pdf.setFillColor(color(fillColor, 'FFFFFF'));
        pdf.rect(left + xs[cell.column] * scale, ys.get(cell.row)!, sum(widths.slice(cell.area.left, cell.area.right + 1)) * scale, sum(heights.slice(cell.area.top, cell.area.bottom + 1)) * scale, 'F');
      }
    }
    for (const cell of visible) {
      const border = borders[number(cell.style, 'borderId')];
      const x = left + xs[cell.column] * scale, y = ys.get(cell.row)!, w = widths[cell.column] * scale, h = heights[cell.row] * scale;
      for (const [side, line] of Object.entries({ left: [x, y, x, y + h], right: [x + w, y, x + w, y + h], top: [x, y, x + w, y], bottom: [x, y + h, x + w, y + h] })) {
        if (side === 'left' && cell.column !== cell.area.left || side === 'right' && cell.column !== cell.area.right || side === 'top' && cell.row !== cell.area.top || side === 'bottom' && cell.row !== cell.area.bottom) continue;
        const edge = child(border, side), style = edge?.getAttribute('style');
        if (!style) continue;
        pdf.setDrawColor(color(child(edge, 'color')));
        pdf.setLineWidth((style === 'medium' ? 1.5 : style === 'thick' ? 2.25 : style === 'hair' ? 0.25 : 0.75) * scale);
        pdf.line(line[0], line[1], line[2], line[3]);
      }
    }
    for (const cell of visible) {
      if (!cell.text || cell.area.left !== cell.column || cell.area.top !== cell.row) continue;
      const font = fontStyles[number(cell.style, 'fontId')];
      pdf.setFont('Report', child(font, 'b') ? 'bold' : 'normal');
      pdf.setTextColor(color(child(child(cell.override, 'font'), 'color') || child(font, 'color')));
      const alignment = child(cell.style, 'alignment');
      const align = alignment?.getAttribute('horizontal') === 'center' ? 'center' : alignment?.getAttribute('horizontal') === 'right' ? 'right' : 'left';
      const pad = 3 * scale;
      const w = sum(widths.slice(cell.area.left, cell.area.right + 1)) * scale - pad * 2;
      const h = sum(heights.slice(cell.area.top, cell.area.bottom + 1)) * scale - pad * 2;
      let size = number(child(font, 'sz'), 'val', 11) * scale;
      let lines: string[] = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        pdf.setFontSize(size); lines = pdf.splitTextToSize(cell.text.replace(/\t/g, ' '), w);
        if (lines.length * size * 1.15 <= h) break;
        size *= Math.min(0.9, h / (lines.length * size * 1.15));
      }
      const x = left + xs[cell.column] * scale + pad + (align === 'center' ? w / 2 : align === 'right' ? w : 0);
      const vertical = alignment?.getAttribute('vertical');
      const y = ys.get(cell.row)! + pad + (vertical === 'center' ? Math.max(0, (h - lines.length * size * 1.15) / 2) : vertical === 'top' ? 0 : Math.max(0, h - lines.length * size * 1.15));
      pdf.text(lines, x, y, { align, baseline: 'top', lineHeightFactor: 1.15 });
    }
    for (const picture of pictures) if (ys.has(picture.row)) {
      pdf.addImage(picture.bytes, picture.path!.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG', left + (xs[picture.column] + picture.x) * scale, ys.get(picture.row)! + picture.y * scale, picture.width * scale, picture.height * scale, picture.path, 'FAST');
    }
    pdf.setFont('Report', 'normal'); pdf.setFontSize(7); pdf.setTextColor('#52634f');
    pdf.text(`${pageIndex + 1} / ${pages.length}`, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 8, { align: 'center' });
  }
  return { name: file.name.replace(/\.xlsx$/, '.pdf'), bytes: new Uint8Array(pdf.output('arraybuffer')) };
}

export async function exportPdf(inspection: Inspection) {
  const file = await buildPdf(inspection);
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: 'application/pdf' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
