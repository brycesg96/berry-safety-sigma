import type { CellValue, Workbook } from 'exceljs';
import type { EmergencyExportData } from './emergency-export-data';
import type { EmergencyLegacyRecord } from './emergency-equipment';
import { EMERGENCY_STATES } from './emergency-states';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'];
const GREEN = 'FF244B38', LIGHT = 'FFF0F5E9', INK = 'FF183F32';
const originalHeaders = ['N° DE EXTINTOR','FILTRO','Fuente','Gerencia','Gerencia Usuaria','UBICACIÓN (Edificio/Piso/Área)','FIRMA INSPECTOR','FECHA DE INSPECCIÓN','TIPO','CAPACIDAD','N° SERIE','MARCA','AÑO DE FABRICACIÓN','ÚLTIMA PRUEBA HIDRÓSTATICA','PRÓXIMA PRUEBA HIDRÓSTATICA','FECHA DE VENCIMIENTO','ESTADO','OBSERVACIÓN','MV','AV','fecha última inspección','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre'];
type Column = { label: string; width: number; format?: string };
const column = (label: string, width = 23, format?: string): Column => ({ label, width, format });
const plain = (value: unknown): CellValue => value === null || value === undefined ? '' : typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
const date = (value?: string | null): CellValue => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : value || '';
const timestamp = (value: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

function table(book: Workbook, name: string, description: string, columns: Column[], rows: CellValue[][], generated: string) {
 const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, xSplit: 1, showGridLines: false }] });
 sheet.properties.tabColor = { argb: GREEN };
 columns.forEach((col, index) => { sheet.getColumn(index + 1).width = col.width; });
 for (const [row, text] of [[1,'BERRY SAFETY · ¡YO REVISO!'],[2,name],[3,description],[4,generated]] as const) {
  sheet.mergeCells(row, 1, row, columns.length);
  const cell = sheet.getCell(row, 1); cell.value = text;
  cell.font = { name: 'Aptos', size: row === 2 ? 19 : 10, bold: row < 3, color: { argb: row === 1 ? 'FFFFFFFF' : INK } };
  if (row === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  cell.alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(row).height = row === 3 ? 35 : row === 2 ? 31 : 23;
 }
 columns.forEach((col,index) => {
  const cell = sheet.getCell(5,index+1); cell.value = col.label;
  cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  cell.alignment = { vertical: 'middle', wrapText: true };
 });
 sheet.getRow(5).height = 34;
 rows.forEach((values,index) => {
  const row = sheet.getRow(index+6);
  values.forEach((value,col) => {
   const cell = row.getCell(col+1); cell.value = value;
   cell.font = { name: 'Aptos', size: 10, color: { argb: INK } };
   cell.alignment = { vertical: 'top', wrapText: true };
   if (index%2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
   if (columns[col].format) cell.numFmt = columns[col].format;
  });
  row.height = 34;
 });
 sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5,rows.length+5), column: columns.length } };
 sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' };
 sheet.headerFooter.oddFooter = '&LBerry Safety&RPágina &P de &N';
 return sheet;
}

function newestLegacy(rows: EmergencyLegacyRecord[]) {
 const originals = new Map<string, EmergencyLegacyRecord>(), inspections = new Map<string, EmergencyLegacyRecord>();
 for (const row of rows) {
  const old = originals.get(row.equipment_id);
  if (!old || row.imported_at > old.imported_at || row.imported_at === old.imported_at && row.id > old.id) originals.set(row.equipment_id,row);
  const previous = inspections.get(row.equipment_id);
  if (row.official_date && (!previous?.official_date || row.official_date > previous.official_date)) inspections.set(row.equipment_id,row);
 }
 return { originals, inspections };
}

export async function buildEmergencyWorkbook(data: EmergencyExportData) {
 const { default: ExcelJS } = await import('exceljs');
 const book = new ExcelJS.Workbook(); book.creator = 'Berry Safety'; book.created = new Date(data.generatedAt);
 const stamp = 'Generado el ' + timestamp(data.generatedAt) + ' · Hora de Lima';
 const equipment = [...data.equipment].sort((a,b) => a.code.localeCompare(b.code,'es',{numeric:true}));
 const byId = new Map(equipment.map(row => [row.id,row]));
 const organizations = new Map(data.organizations.map(row => [row.id,row.name]));
 const { originals, inspections: oldInspections } = newestLegacy(data.legacy);
 const latest = new Map(data.latest.map(row => [row.equipment_id,row]));
 const months = new Map(data.months.map(row => [row.equipment_id + ':' + row.inspection_date.slice(5,7),row]));
 const names = (id?: string | null, fallback = '') => id ? organizations.get(id) || fallback || 'Sin nombre disponible' : fallback;
 const columns = [
  column('N° de Extintor',18,'@'),column('Clasificación'),column('Emplazamiento'),
  column('Gerencia Responsable',30),column('Gerencia Usuaria',30),column('Área Usuaria',28),column('Ubicación (Edificio / Piso / Área)',40),
  column('N° de Serie',20,'@'),column('Marca'),column('Tipo / Agente',19),column('Capacidad',16),
  column('Año de Fabricación',19),column('Vencimiento (Mes y Año)',22,'@'),
  column('Última Prueba Hidrostática',24),column('Próxima Prueba Hidrostática',24),
  column('Fecha de Última Inspección',23,'dd/mm/yyyy'),column('Estado del Equipo',22),
  column('Responsable de la Última Inspección',33),column('Legajo / Identificador',23,'@'),
  column('Observación de la Última Inspección',45),column('Origen de la Última Inspección',25),column('Estado del Catálogo',22),
  ...MONTHS.map(month => column(month,17,'dd/mm/yyyy')),
 ];
 const rows: CellValue[][] = equipment.map(row => {
  const original = originals.get(row.id)?.original || {}, previous = oldInspections.get(row.id), review = latest.get(row.id);
  const native = review && (!previous?.official_date || review.inspection_date >= previous.official_date) ? review : undefined;
  const technical = (value: string | null, year: number | null | undefined, field: string): CellValue => value ? date(value) : year || plain(original[field]);
  return [
   row.code,row.classification || '',row.placement_kind || '',names(row.owner_management_id,row.owner_name || ''),
   names(row.management_id,'Pendiente de levantar en campo'),names(row.area_id,'Pendiente de levantar en campo'),row.location,
   row.serial_number,row.brand,row.agent,row.capacity,row.manufacture_year || plain(original['AÑO DE FABRICACIÓN']),row.expiry_month || '',
   technical(row.last_hydro_date,row.last_hydro_year,'ÚLTIMA PRUEBA HIDRÓSTATICA'),technical(row.next_hydro_date,row.next_hydro_year,'PRÓXIMA PRUEBA HIDRÓSTATICA'),
   date(native?.inspection_date || previous?.official_date),native ? EMERGENCY_STATES[native.state] : previous?.state_original || '',
   native?.worker_name || '',native?.employee_code || previous?.inspector_code || '',native?.notes || (!native ? previous?.notes || '' : ''),
   native ? 'Berry Safety' : previous ? 'Base anterior · fecha H' : '',row.enabled ? 'Activo' : 'Retirado / Deshabilitado',
   ...MONTHS.map((_,index) => date(months.get(row.id + ':' + String(index+1).padStart(2,'0'))?.inspection_date)),
  ];
 });
 const summary = book.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
 summary.getColumn(1).width = 36; summary.getColumn(2).width = 100;
 const info = [
  ['BERRY SAFETY','BASE DE EXTINTORES'],['Año del consolidado',data.year],['Generado',timestamp(data.generatedAt) + ' · Lima'],
  ['Equipos en el inventario',equipment.length],['Equipos activos',equipment.filter(row=>row.enabled).length],
  ['Inspecciones Berry del año',data.reviews.length],['Antecedentes migrados',data.legacy.length],
  ['Inventario','Fichas actuales al momento de descargar. Incluye equipos activos y retirados.'],
  ['Meses','Última fecha de inspección por mes del año seleccionado. La nota de cada celda identifica su origen.'],
  ['Base anterior','Solo H es la inspección oficial migrada. Los valores originales quedan en Antecedentes Migrados.'],
  ['Inspecciones Berry','Cada fila identifica a la persona que realizó la revisión, con la ficha capturada en ese momento.'],
  ['Archivos','Las firmas y fotografías se consultan en Berry; este Excel contiene los datos, sin descargar imágenes.'],
  ['Origen de los datos','Tablas actuales de Berry Safety. No se consulta el archivo Excel usado para la migración.'],
 ];
 info.forEach((values,index) => {
  const row=summary.addRow(values);row.height=index>6?40:28;
  row.eachCell(cell=>{cell.font={name:'Aptos',size:index===0?15:11,bold:index===0,color:{argb:INK}};cell.alignment={vertical:'middle',wrapText:true};});
 });
 const inventory = table(book,'Inventario '+data.year,'Fichas actuales y última inspección por mes de '+data.year+'. Antecedentes originales en hoja separada.',columns,rows,stamp);
 equipment.forEach((row,index) => {
  [14,15].forEach(col => { if(inventory.getCell(index+6,col).value instanceof Date)inventory.getCell(index+6,col).numFmt='dd/mm/yyyy'; });
  for(let month=1;month<=12;month++){
   const value=months.get(row.id+':'+String(month).padStart(2,'0'));
   if(value)inventory.getCell(index+6,22+month).note=value.source==='berry'?'Inspección registrada en Berry Safety':'Antecedente migrado · fecha oficial H';
  }
 });
 const reviews=[...data.reviews].sort((a,b)=>a.inspection_date.localeCompare(b.inspection_date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 table(book,'Inspecciones Berry','Inspecciones realizadas en '+data.year+'. Una fila por registro; las revisiones anteriores se conservan.',[
  column('ID de Inspección',39,'@'),column('N° de Extintor',18,'@'),column('Fecha de Inspección',23,'dd/mm/yyyy'),column('Estado',23),
  column('Responsable',35),column('Legajo',20,'@'),column('Registro',17),column('Observaciones',50),
  column('Ubicación Registrada',40),column('Serie Registrada',22,'@'),column('Marca Registrada'),column('Tipo / Agente Registrado'),column('Capacidad Registrada'),
  column('Recibido en Berry (Lima)',25),
 ],reviews.map(row=>[row.id,row.code||byId.get(row.equipment_id)?.code||'',date(row.inspection_date),EMERGENCY_STATES[row.state],row.worker_name||'',row.employee_code||'',row.submission_source==='guest'?'Sin cuenta':'Con cuenta',row.notes||'',row.location||'',row.serial_number||'',row.brand||'',row.agent||'',row.capacity||'',timestamp(row.created_at)]),stamp);
 const antecedentColumns = [column('Código Berry',18,'@'),column('Fecha Oficial H',22,'dd/mm/yyyy'),...originalHeaders.map(field=>column(field,field==='OBSERVACIÓN'||field.startsWith('UBICACIÓN')?45:25,'@'))];
 table(book,'Antecedentes Migrados','Datos migrados de la app anterior, separados de las inspecciones creadas en Berry. Noviembre conserva H.',antecedentColumns,
  [...data.legacy].sort((a,b)=>(byId.get(a.equipment_id)?.code||'').localeCompare(byId.get(b.equipment_id)?.code||'')||a.source_row-b.source_row).map(row=>[byId.get(row.equipment_id)?.code||'',date(row.official_date),...originalHeaders.map(field=>plain(row.original[field]))]),stamp);
 const buffer=await book.xlsx.writeBuffer();
 return { name:'BASE_EXTINTORES_BERRY_'+data.year+'.xlsx',bytes:new Uint8Array(buffer) };
}
