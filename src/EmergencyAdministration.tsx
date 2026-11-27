import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FireExtinguisher, LoaderCircle, Plus, ShieldCheck } from 'lucide-react';
import { Field } from './components';
import { WorkspacePageHeader } from './WorkspaceUI';
import { emergencyStatus } from './emergency-equipment';
import { EmergencyCatalog } from './EmergencyCatalog';
import { inspectionListToday } from './inspection-list-filters';
import { yoSeguroCatalog } from './yo-seguro';
import type { YoManagement } from './yo-seguro';
import type { CloudProfile } from './cloud-account';
import './emergency-administration.css';
import './emergency-equipment.css';

export default function EmergencyAdministration({ actor, isCurrent, onBusyChange }: { actor: CloudProfile; isCurrent: () => boolean; onBusyChange: (busy: boolean) => void }) {
 const [year,setYear]=useState(()=>inspectionListToday().slice(0,4)),[ready,setReady]=useState<boolean|null>(null),[retry,setRetry]=useState(0);
 const [busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [catalog,setCatalog]=useState<YoManagement[]|null>(null),[editor,setEditor]=useState(false);
 const [download,setDownload]=useState<{url:string;name:string}|null>(null);
 const current=useRef(isCurrent);current.current=isCurrent;
 const flight=useRef(false),active=useRef(true),controller=useRef<AbortController|null>(null),fileURL=useRef('');
 const maxYear=Number(inspectionListToday().slice(0,4));
 const valid=/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=maxYear;
 useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();if(fileURL.current)URL.revokeObjectURL(fileURL.current);};},[]);
 useEffect(()=>{onBusyChange(busy||editor);return()=>onBusyChange(false);},[busy,editor,onBusyChange]);
 useEffect(()=>{
  let listening=true;setReady(null);setError('');
  if(actor.role!=='admin'||!actor.enabled)return;
  void emergencyStatus().then(status=>{if(listening&&current.current())setReady(status.ready&&status.inventory);}).catch(()=>{if(listening&&current.current()){setReady(false);setError('No pudimos verificar el inventario. Revisa la conexión y vuelve a intentarlo.');}});
  return()=>{listening=false;};
 },[actor.id,actor.role,actor.enabled,retry]);
 const generate=async()=>{
  if(flight.current||!ready||!valid||!current.current())return;
  flight.current=true;setBusy(true);setError('');setNotice('');setPhase('Preparando la consulta');setDownload(null);if(fileURL.current){URL.revokeObjectURL(fileURL.current);fileURL.current='';}
  controller.current=new AbortController();
  try{
   const {collectEmergencyExport,verifyEmergencyExportAccess}=await import('./emergency-export-data');
   const data=await collectEmergencyExport({year:Number(year),signal:controller.current.signal,isCurrent:()=>active.current&&current.current(),progress:message=>{if(active.current&&current.current())setPhase(message);}});
   if(!active.current||!current.current())return;
   setPhase('Generando tu Excel');
   const {createEmergencyExport,downloadEmergencyExport}=await import('./emergency-export');
   const file=await createEmergencyExport(data,controller.current.signal);
   if(!active.current||!current.current())return;
   await verifyEmergencyExportAccess({signal:controller.current.signal,isCurrent:()=>active.current&&current.current()});
   if(!active.current||!current.current())return;
   const link=downloadEmergencyExport(file);fileURL.current=link.url;setDownload(link);
   setNotice('Base de '+year+' generada: '+data.equipment.length+' equipos y '+data.reviews.length+' inspecciones de Berry.');
  }catch(problem){if(active.current&&current.current()&&!(problem instanceof DOMException&&problem.name==='AbortError'))setError(problem instanceof Error?problem.message:'No pudimos generar el archivo. Vuelve a intentarlo.');}
  finally{flight.current=false;if(active.current){setBusy(false);setPhase('');}}
 };
 const add=async()=>{
  if(flight.current||!ready)return;
  flight.current=true;setBusy(true);setError('');setNotice('');
  try{
   const rows=catalog||await yoSeguroCatalog();
   if(active.current&&current.current()){setCatalog(rows);setEditor(true);}
  }catch{if(active.current&&current.current())setError('No pudimos cargar las áreas. Vuelve a intentarlo.');}
  finally{flight.current=false;if(active.current)setBusy(false);}
 };
 if(actor.role!=='admin'||!actor.enabled)return null;
 return <section className="emergency-administration" aria-label="Gestión de Extintores">
  <WorkspacePageHeader title="Gestión de Extintores" description="Administra tus equipos y descarga su información actualizada." eyebrow="ADMINISTRACIÓN / EQUIPOS DE EMERGENCIA" icon={<FireExtinguisher/>} actions={<button type="button" className="button button-outline" disabled={busy||!ready} onClick={()=>void add()}><Plus size={17}/>Registrar extintor</button>}/>
  <div className="emergency-export-card">
   <div className="emergency-export-intro"><span className="emergency-export-icon" aria-hidden="true"><FileSpreadsheet size={29}/></span><div><h2>Base de Extintores</h2><p>Genera un Excel con las fichas actuales y las inspecciones del año que elijas.</p></div></div>
   <ul className="emergency-export-sheets"><li>Inventario y control de enero a diciembre</li><li>Detalle de las inspecciones realizadas en Berry</li><li>Antecedentes migrados de la app anterior</li></ul>
   {ready===null?<p role="status" className="emergency-export-status"><LoaderCircle size={17} className="spin"/>Comprobando el inventario…</p>:!ready?<div className="notice"><p>{error||'El inventario estará disponible al terminar la carga inicial en Supabase.'}</p><button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}>Comprobar inventario</button></div>:<form className="emergency-export-controls" onSubmit={event=>{event.preventDefault();void generate();}}>
    <Field label="Año del consolidado" required>{props=><input {...props} required type="number" inputMode="numeric" min={1900} max={maxYear} step={1} value={year} disabled={busy} onChange={event=>{setYear(event.target.value);setNotice('');}}/>}</Field>
    <button type="submit" className="button button-primary" disabled={busy||!valid}>{busy?<LoaderCircle size={17} className="spin"/>:<Download size={17}/>}Descargar base en Excel</button>
   </form>}
   {busy&&<p role="status" className="emergency-export-status"><LoaderCircle size={17} className="spin"/>{phase||'Preparando las áreas…'}</p>}
   {ready&&error&&<p role="alert" className="error-message">{error}</p>}
   {notice&&<p role="status" className="emergency-export-notice"><ShieldCheck size={17}/>{notice}</p>}
   {download&&<a className="text-button emergency-export-download" href={download.url} download={download.name}>Volver a descargar {download.name}</a>}
  </div>
  {editor&&catalog&&<EmergencyCatalog code="" equipment={null} catalog={catalog} inventoryEnabled onClose={()=>setEditor(false)} onSaved={equipment=>{setEditor(false);setNotice('Extintor '+equipment.code+' registrado en Berry Safety.');}}/>}
 </section>;
}
