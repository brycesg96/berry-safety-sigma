import { useEffect, useState } from 'react';
import { History, LoaderCircle } from 'lucide-react';
import { formatDate } from './model';
import { emergencyLegacy } from './emergency-equipment';
import type { EmergencyLegacyRecord } from './emergency-equipment';

const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre'];
const displayDate=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?formatDate(value):value||'Sin registro';

export function EmergencyLegacyPanel({equipmentId}:{equipmentId:string}){
 const [rows,setRows]=useState<EmergencyLegacyRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');void emergencyLegacy(equipmentId).then(result=>{if(active)setRows(result);}).catch(problem=>{if(active)setError(problem instanceof Error?problem.message:'No pudimos consultar los antecedentes.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[equipmentId,retry]);
 if(loading)return <p className="er-muted" role="status"><LoaderCircle size={16} className="spin"/> Consultando antecedentes…</p>;
 if(error)return <div className="er-card"><p className="error-message" role="alert">{error}</p><button className="text-button" onClick={()=>setRetry(value=>value+1)}>Reintentar antecedentes</button></div>;
 if(!rows.length)return null;
 return <section className="er-card er-legacy" aria-label="Antecedentes de la base anterior">{rows.map(row=><details key={row.id}><summary><History size={19} aria-hidden="true"/><span><strong>Datos de la base anterior</strong><small>{row.official_date?displayDate(row.official_date):'Fecha oficial no consignada'} · {row.state_original&&row.state_original!=='-'?row.state_original:'Sin estado consignado'}</small></span></summary>
  <div className="er-legacy-body"><dl className="er-legacy-summary"><div><dt>Última inspección oficial · columna H</dt><dd>{displayDate(row.official_date)}</dd></div><div><dt>Identificador del inspector en origen</dt><dd>{row.inspector_code||'No consignado'}</dd></div><div><dt>Estado de origen</dt><dd>{row.state_original||'No consignado'}</dd></div><div><dt>Fila del consolidado original</dt><dd>{row.source_row}</dd></div></dl>
  {row.notes&&<div className="er-legacy-note"><strong>Observación de origen</strong><p>{row.notes}</p></div>}
  <h3>Fechas del consolidado</h3><p className="er-muted">Noviembre conserva la fecha oficial de H. Los demás meses mantienen lo registrado en el archivo.</p><dl className="er-legacy-months">{months.map(month=><div key={month}><dt>{month}</dt><dd>{displayDate(row.months[month]||null)}</dd></div>)}</dl>
  <details className="er-legacy-original"><summary>Ver la ficha importada</summary><dl>{Object.entries(row.original).map(([field,value])=><div key={field}><dt>{field}</dt><dd>{value===null||value===''?'No consignado':String(value)}</dd></div>)}</dl></details>
  <p className="er-muted">El archivo de origen no incluye fotografías ni firmas gráficas de estas revisiones.</p></div>
 </details>)}</section>;
}
