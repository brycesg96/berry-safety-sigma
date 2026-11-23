import { SafetySubmissionCard } from './SafetySubmissionCard';
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, Download, FileText, FolderOpen, LockKeyhole, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Field, Modal } from './components';
import { Select } from './Select';
import { organizationLabel } from './organization-label';
import { LoadingState } from './LoadingState';
import { usePendingChanges } from './manual-save';
import { archiveSafetyDocument, listSafetyDocuments, SAFETY_LABELS, safetyFile, safetySubmissionKey, subscribeSafetyDocuments } from './safety-documents';
import type { SafetyDocument } from './safety-documents';
import { yoSeguroCatalog, yoSeguroScope } from './yo-seguro';
import type { YoManagement, YoScope } from './yo-seguro';

export default function SafetyDocuments({actor,admin,onBusyChange}:{actor:string;admin:boolean;onBusyChange:(busy:boolean)=>void}) {
 const [ready,setReady]=useState<boolean|null>(null),[loading,setLoading]=useState(true),[fetching,setFetching]=useState(false),[busy,setBusy]=useState(false);
 const [scope,setScope]=useState<YoScope|null>(null),[catalog,setCatalog]=useState<YoManagement[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[rows,setRows]=useState<SafetyDocument[]>([]),[count,setCount]=useState(0),[hasMore,setHasMore]=useState(false),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
 const [query,setQuery]=useState(''),[applied,setApplied]=useState(''),[types,setTypes]=useState<string[]>([]),[management,setManagement]=useState(''),[area,setArea]=useState('');
 const [removing,setRemoving]=useState<SafetyDocument|null>(null);
 const [preview,setPreview]=useState<{url:string;document:SafetyDocument}|null>(null),[online,setOnline]=useState(navigator.onLine);
 const queryKey=useRef(''),cursors=useRef({key:'',offsets:[0]}),refreshWorking=useRef(false);
 const locked=useRef(false),live=useRef(true),urls=useRef(new Set<string>());
 usePendingChanges(busy);
 useEffect(()=>{live.current=true;const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{live.current=false;window.removeEventListener('online',update);window.removeEventListener('offline',update);urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{
  let active=true;
  const key=JSON.stringify([actor,types,management,area,applied,page]);
  setLoading(queryKey.current!==key);setFetching(true);refreshWorking.current=true;setError('');
  void(async()=>{try{
   const access=await yoSeguroScope();if(!active)return;
   setScope(access);setReady(!!access);
   if(access){
    const authorized=access.admin?management:access.management_id||'';
    const filterKey=JSON.stringify([actor,types,authorized,area,applied]);
    if(cursors.current.key!==filterKey){cursors.current={key:filterKey,offsets:[0]};if(page!==0){setPage(0);return;}}
    const offset=cursors.current.offsets[page]||0;
    const [nodes,result]=await Promise.all([yoSeguroCatalog(),listSafetyDocuments({types,query:applied,offset,management:authorized,area})]);
    if(active){setCatalog(nodes);setRows(result.rows);setCount(result.count);setHasMore(result.nextOffset<result.count);cursors.current.offsets[page+1]=result.nextOffset;queryKey.current=key;}
   }
  }catch(problem){if(active){setRows([]);setCount(0);setHasMore(false);setError(problem instanceof Error?problem.message:'No pudimos consultar los documentos.');}}
  finally{if(active){setLoading(false);setFetching(false);refreshWorking.current=false;}}})();
  return()=>{active=false;refreshWorking.current=false;};
 },[actor,types,management,area,applied,page,revision]);
 useEffect(()=>{if(!ready)return;return subscribeSafetyDocuments(()=>{if(!refreshWorking.current)setRevision(n=>n+1);});},[actor,ready]);

 async function run(action:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');try{await action();}catch(problem){if(live.current)setError(problem instanceof Error?problem.message:'No se pudo completar la operación.');}finally{locked.current=false;if(live.current)setBusy(false);}}
 const closePreview=()=>{if(preview){URL.revokeObjectURL(preview.url);urls.current.delete(preview.url);}setPreview(null);};
 const openFile=(document:SafetyDocument,download=false)=>run(async()=>{const blob=await safetyFile(document);if(!live.current)return;const url=URL.createObjectURL(blob);urls.current.add(url);if(download){const link=window.document.createElement('a');link.href=url;link.download=document.file_name;link.click();window.setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},1000);}else setPreview({url,document});});
 const all=admin&&scope?.admin,selectedManagement=all?management:scope?.management_id||'';
 const available=catalog.filter(m=>!selectedManagement||m.id===selectedManagement);
 const submissions=new Map<string,SafetyDocument[]>();
 for(const document of rows){const key=safetySubmissionKey(document);if(!submissions.has(key))submissions.set(key,[]);submissions.get(key)!.push(document);}
 const groups=new Map<string,{management:string;area:string;submissions:SafetyDocument[][]}>();
 for(const documents of submissions.values()){
  const document=documents[0],key=`${document.management_id||''}/${document.area_id||''}`,management=catalog.find(m=>m.id===document.management_id),area=management?.areas.find(a=>a.id===document.area_id);
  if(!groups.has(key))groups.set(key,{management:organizationLabel(management?.name||document.management_name)||'Sin gerencia asignada',area:organizationLabel(area?.name||document.area_name)||'Sin área asignada',submissions:[]});
  groups.get(key)!.submissions.push(documents);
 }

 return <section className="safety-documents yo-library-page" aria-label="Yo Seguro">
  <div className="yo-library-hero"><div><span className="yo-access-tag"><ShieldCheck size={15}/>DOCUMENTOS DE SEGURIDAD</span><h1>Yo Seguro</h1><p>Los documentos del equipo, organizados por área.<br/>Consulta ATS, PETAR y checklists de {all?'todas las gerencias.':'tu gerencia.'}</p></div><div className="yo-library-scope"><span><Building2 size={21}/>{all?'Vista de Administración':organizationLabel(scope?.management_name)||'Gerencia autorizada'}</span><small><LockKeyhole size={14}/>Consulta con cuenta</small></div></div>
  {!online&&<p className="notice" role="status">Necesitas conexión para consultar y descargar documentos.</p>}
  {error&&!removing&&<p className="error-message safety-notice" role="alert">{error}</p>}{notice&&<p className="save-confirmation" role="status"><Check size={17}/>{notice}</p>}
  {ready===false?<div className="safety-unavailable"><FileText size={32}/><h2>Yo Seguro está en preparación</h2><p>La recepción sin cuenta y la consulta por gerencia se habilitarán cuando Administración termine la activación.</p><button className="button button-outline" onClick={()=>setRevision(n=>n+1)}>Comprobar disponibilidad<RefreshCw size={16}/></button></div>:<>
  {scope&&!all&&!scope.management_id&&<p className="notice">Tu cuenta no tiene una gerencia autorizada activa para Yo Seguro. Solicita a Administración que revise este permiso. Tus registros anteriores siguen disponibles.</p>}
  <section className="safety-library" aria-label="Consulta de Documentos"><div className="safety-library-heading"><div><h2>Consulta de Documentos</h2><p>Consulta los documentos de gestión de seguridad enviados a la plataforma.</p><small className="yo-live-label"><span/>Actualización automática</small></div><button className="button button-outline" disabled={busy||fetching} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16} className={fetching?'spin':undefined}/>Actualizar lista</button></div>
   <form className="yo-library-filters" onSubmit={event=>{event.preventDefault();setApplied(query);setPage(0);}}>
    {all&&<Field label="Gerencia">{props=><Select {...props} searchable value={management} onChange={value=>{setManagement(value);setArea('');setPage(0);}} options={[{value:'',label:'Todas las gerencias'},...catalog.map(m=>({value:m.id,label:organizationLabel(m.name)}))]}/>}</Field>}
    <Field label="Área">{props=><Select {...props} searchable value={area} onChange={value=>{setArea(value);setPage(0);}} options={[{value:'',label:'Todas las áreas'},...available.flatMap(m=>m.areas.map(a=>({value:a.id,label:organizationLabel(a.name),description:all&&!management?organizationLabel(m.name):undefined})))]}/>}</Field>
    <Field label="Tipo">{props=><Select {...props} multiple value={types} onChange={value=>{setTypes(value);setPage(0);}} placeholder="Todos los tipos" options={Object.entries(SAFETY_LABELS).map(([value,label])=>({value,label}))}/>}</Field>
    <Field label="Buscar por persona">{props=><div className="safety-search"><Search size={17}/><input {...props} type="search" value={query} maxLength={160} onChange={event=>setQuery(event.target.value)} placeholder="Nombre de quien envió los documentos"/></div>}</Field><button className="button button-outline" type="submit">Buscar</button>
   </form>
   {!loading&&count>0&&<p className="yo-results-count">{submissions.size} {submissions.size===1?'envío en esta página':'envíos en esta página'}{types.length>0&&<span> · Cada envío incluye todos sus archivos, también los de otros tipos.</span>}</p>}
   {loading?<LoadingState label="Consultando Yo Seguro…"/>:rows.length?<div className="safety-document-list">{Array.from(groups).map(([key,group])=><section className="yo-area-group" key={key} aria-label={group.area}><header><span className="yo-area-symbol"><FolderOpen size={21}/></span><div><small>{group.management}</small><h3>{group.area}</h3></div></header>{group.submissions.map(documents=><SafetySubmissionCard key={safetySubmissionKey(documents[0])} documents={documents} admin={!!all} busy={busy} onOpen={(document,download)=>void openFile(document,download)} onRemove={document=>{setRemoving(document);setError('');}}/>)}</section>)}</div>:<div className="safety-empty"><FolderOpen size={32}/><h3>{applied||types.length||area||management?'Sin coincidencias':'Aún no hay documentos para mostrar'}</h3><p>{applied||types.length||area||management?'Prueba con otros filtros o el nombre de otra persona.':'Los documentos enviados a las áreas de tu gerencia aparecerán aquí.'}</p></div>}
   {count>0&&<div className="safety-pagination"><span>Página {page+1}</span><div><button className="button button-outline" disabled={fetching||busy||page===0} onClick={()=>setPage(n=>n-1)}>Anterior</button><button className="button button-outline" disabled={fetching||busy||!hasMore} onClick={()=>setPage(n=>n+1)}>Siguiente</button></div></div>}
  </section></>}
  {preview&&<Modal wide title={preview.document.title} onClose={closePreview}>{preview.document.mime_type==='application/pdf'?<iframe className="safety-preview" title={`Vista previa de ${preview.document.title}`} src={preview.url}/>:<img className="safety-preview-image" src={preview.url} alt={preview.document.title}/>}<div className="modal-actions"><button className="button button-outline" onClick={closePreview}>Cerrar</button><a className="button button-primary" href={preview.url} download={preview.document.file_name}><Download size={17}/>Descargar archivo</a></div></Modal>}
  {removing&&<Modal title="Retirar documento" onClose={()=>!busy&&setRemoving(null)}><p className="modal-description">Se retirará <strong>{removing.title}</strong> de la lista activa. Su registro se conserva para trazabilidad.</p>{error&&<p role="alert" className="error-message">{error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={()=>setRemoving(null)}><X size={16}/>Conservar</button><button className="button button-danger" disabled={busy} onClick={()=>void run(async()=>{await archiveSafetyDocument(removing);if(live.current){setRemoving(null);setNotice('Documento retirado de la lista.');setRevision(n=>n+1);}})}>Retirar documento</button></div></Modal>}
 </section>;
}
