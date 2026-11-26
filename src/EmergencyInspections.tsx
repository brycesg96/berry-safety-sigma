import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Eye, FireExtinguisher, LoaderCircle, Pencil, Plus, Search, ShieldCheck, ShowerHead } from 'lucide-react';
import { Brand, Field, Modal } from './components';
import { HortifrutLogo } from './HortifrutLogo';
import type { DemoAccount } from './accounts';
import { formatDate } from './model';
import { yoSeguroCatalog } from './yo-seguro';
import type { YoManagement } from './yo-seguro';
import { organizationLabel } from './organization-label';
import { EMERGENCY_STATES, emergencyReady, lookupEmergency } from './emergency-equipment';
import type { EmergencyEquipment, EmergencyKind, EmergencyLookup } from './emergency-equipment';
import { EmergencyReviewForm } from './EmergencyReviewForm';
import { EmergencyCatalog } from './EmergencyCatalog';
import { EmergencyHistory } from './EmergencyHistory';
import './emergency-equipment.css';

const kinds=[{id:'extinguisher',label:'Extintores',icon:FireExtinguisher},{id:'eyewash',label:'Lavaojos',icon:Eye},{id:'shower',label:'Duchas lavaojos',icon:ShowerHead}] as const;
export default function EmergencyInspections({actor,admin=false,onBack,onBusyChange=()=>{}}:{actor?:DemoAccount;admin?:boolean;onBack:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const[kind,setKind]=useState<EmergencyKind>('extinguisher'),[code,setCode]=useState(''),[ready,setReady]=useState<boolean|null>(null),[retry,setRetry]=useState(0),[catalog,setCatalog]=useState<YoManagement[]>([]),[catalogError,setCatalogError]=useState('');
 const[result,setResult]=useState<EmergencyLookup|null|undefined>(),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[hasEdits,setHasEdits]=useState(false),[busy,setBusy]=useState(false),[historyOpen,setHistoryOpen]=useState(!!actor);
 const[editor,setEditor]=useState<{equipment:EmergencyEquipment|null}|null>(null),[navigation,setNavigation]=useState<'back'|'change'|EmergencyKind|null>(null);
 const sequence=useRef(0),codeInput=useRef<HTMLInputElement>(null);
 const isAdmin=!!actor&&admin;
 useEffect(()=>{let active=true;setReady(null);setError('');void emergencyReady().then(value=>{if(active)setReady(value);}).catch(problem=>{if(active){setReady(false);setError(problem instanceof Error?problem.message:'No pudimos abrir ¡Yo Reviso!.');}});if(isAdmin){setCatalogError('');void yoSeguroCatalog().then(rows=>{if(active)setCatalog(rows);}).catch(()=>{if(active)setCatalogError('No pudimos cargar las áreas para registrar equipos.');});}return()=>{active=false;};},[isAdmin,retry]);
 useEffect(()=>{if(actor)return;const previous=document.title;document.title='¡Yo Reviso! · Berry Safety';return()=>{document.title=previous;};},[actor]);
 useEffect(()=>{if(!ready||!code.trim()||kind!=='extinguisher'){setLoading(false);return;}const controller=new AbortController(),request=++sequence.current;setLoading(true);setError('');const timer=setTimeout(()=>{void lookupEmergency(code,kind,!!actor,controller.signal).then(found=>{if(!controller.signal.aborted&&sequence.current===request)setResult(found);}).catch(problem=>{if(!controller.signal.aborted&&sequence.current===request){setError(problem instanceof Error?problem.message:'No pudimos buscar el equipo.');setResult(undefined);}}).finally(()=>{if(!controller.signal.aborted&&sequence.current===request)setLoading(false);});},450);return()=>{clearTimeout(timer);controller.abort();};},[ready,code,kind,refresh,actor?.id]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 const applyNavigation=(target:NonNullable<typeof navigation>)=>{if(target==='back'){onBack();return;}sequence.current++;setCode('');setResult(undefined);setHasEdits(false);if(target!=='change')setKind(target);setError('');if(target==='change')setTimeout(()=>codeInput.current?.focus({preventScroll:true}),0);};
 const navigate=(target:NonNullable<typeof navigation>)=>{if(busy)return;if(hasEdits)setNavigation(target);else applyNavigation(target);};
 const current=kinds.find(item=>item.id===kind)!;
 const Content=actor?'section':'main';
 return <div className={`er-page${actor?'':' er-public-page'}`}>
  {!actor&&<header className="er-public-header"><Brand/><HortifrutLogo onDark/></header>}
  <Content className="er-workspace" aria-label="Inspección de equipos de emergencia">
   <button className="button button-back" disabled={busy} onClick={()=>navigate('back')}><ArrowLeft size={17}/>Volver a Yo Seguro</button>
   <div className="er-heading"><div><span className="er-eyebrow"><ShieldCheck size={15} aria-hidden="true"/>CUIDAR TAMBIÉN ES REVISAR</span><h1>¡Yo Reviso!</h1><p>Inspección de Equipos de Emergencia</p></div><span className="er-access-label">{actor?'Registro y consulta':'Registra tu revisión'}</span></div>
   {error&&!ready&&<p className="error-message" role="alert">{error}</p>}
   {ready===null?<p className="er-loading" role="status"><LoaderCircle size={20} className="spin"/>Preparando ¡Yo Reviso!…</p>:!ready?<div className="er-card er-unavailable"><FireExtinguisher size={34}/><h2>Estamos habilitando ¡Yo Reviso!</h2><p>La inspección de equipos estará disponible al terminar la preparación.</p><button className="button button-outline" onClick={()=>setRetry(value=>value+1)}>Comprobar disponibilidad</button></div>:<>
    <div className="er-kind-grid" role="group" aria-label="Equipo a inspeccionar">{kinds.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} className="er-kind" data-kind={item.id} aria-label={item.label} aria-pressed={kind===item.id} disabled={busy} onClick={()=>{if(item.id!==kind)navigate(item.id);}}><span><Icon size={29} aria-hidden="true"/></span><div><strong>{item.label}</strong><small>{item.id==='extinguisher'?'Disponible':'Formato pendiente'}</small></div><ArrowRight size={17} aria-hidden="true"/></button>;})}</div>
    {kind!=='extinguisher'?<div className="er-card er-pending"><current.icon size={38} aria-hidden="true"/><h2>{current.label}</h2><p>Este formato todavía no está habilitado. Por ahora puedes revisar extintores.</p><span className="er-pending-label">Formato pendiente</span></div>:<>
     <section className="er-lookup er-card" aria-label="Buscar equipo por código"><div className="er-lookup-copy"><h2>Un código. Toda su ficha.</h2><p>Escribe el código exacto del extintor para cargar sus datos y la última revisión.</p></div><div className="er-code-field"><Field label="Código del equipo">{props=><div className="er-code-input"><Search size={19} aria-hidden="true"/><input {...props} ref={codeInput} type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={80} readOnly={busy||hasEdits} value={code} onChange={event=>{sequence.current++;setCode(event.target.value);setResult(undefined);setError('');}} placeholder="Ej. EXT-001"/></div>}</Field>{!!code&&<button type="button" className="text-button" disabled={busy} onClick={()=>navigate('change')}>Cambiar equipo</button>}</div>{isAdmin&&<button className="button button-outline" disabled={busy||hasEdits||!catalog.length} onClick={()=>setEditor({equipment:null})}><Plus size={17}/>Registrar equipo</button>}</section>
     {catalogError&&<div className="notice"><p>{catalogError}</p><button className="text-button" onClick={()=>setRetry(value=>value+1)}>Reintentar áreas</button></div>}
     {loading&&<p className="er-loading" role="status"><LoaderCircle size={17} className="spin"/>Buscando equipo…</p>}
     {error&&<div className="er-card"><p className="error-message" role="alert">{error}</p><button className="button button-outline" onClick={()=>setRefresh(value=>value+1)}>Reintentar búsqueda</button></div>}
     {!loading&&result===null&&<div className="er-card er-not-found"><h2>No encontramos ese código</h2><p>Revisa la codificación del equipo. Si aún no tiene ficha, la persona encargada debe registrarlo.</p>{isAdmin&&<button className="button button-outline" disabled={!catalog.length} onClick={()=>setEditor({equipment:null})}>Registrar este extintor</button>}</div>}
     {result&&<>
      <div className="er-context-grid"><EquipmentFacts equipment={result.equipment} onEdit={isAdmin?()=>setEditor({equipment:result.equipment}):undefined} editDisabled={hasEdits||busy}/><aside className="er-last-review er-card"><span className="er-eyebrow">ÚLTIMA INSPECCIÓN</span>{result.latest?<><strong className="er-last-date">{formatDate(result.latest.inspection_date)}</strong><span className={`er-state er-state-${result.latest.state}`}>{EMERGENCY_STATES[result.latest.state]}</span><p>Estado registrado en esa revisión.</p></>:<><strong className="er-last-date">Sin revisión disponible</strong><p>La primera inspección registrada aparecerá aquí.</p></>}{actor&&result.canReview&&<button className="button button-outline" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(value=>!value)}><ClipboardList size={17}/>{historyOpen?'Ocultar historial':'Ver historial y detalle'}</button>}</aside></div>
      {actor&&result.canReview&&historyOpen&&<EmergencyHistory equipmentId={result.equipment.id} revision={refresh}/>}
      {!result.equipment.enabled?<p className="notice" role="status">Este equipo fue retirado del catálogo. Su historial se conserva.</p>:<EmergencyReviewForm key={result.equipment.id} equipment={result.equipment} actor={actor} onDirtyChange={setHasEdits} onBusyChange={setBusy} refreshing={loading} onRegistered={()=>setRefresh(value=>value+1)} onRefresh={()=>setRefresh(value=>value+1)}/>}
     </>}
    </>}
   </>}
   {!actor&&<p className="er-footer">¡Yo Reviso! · Una revisión que ayuda a cuidar a todos.</p>}
  </Content>
  {editor&&<EmergencyCatalog equipment={editor.equipment} code={code} catalog={catalog} onClose={()=>setEditor(null)} onSaved={equipment=>{setEditor(null);setCode(equipment.code);setRefresh(value=>value+1);}}/>}
  {navigation&&<Modal title="Tienes una inspección en curso" onClose={()=>setNavigation(null)}><p className="modal-description">Si continúas, descartarás los datos y archivos de esta revisión que todavía no tiene confirmación.</p><div className="modal-actions"><button className="button button-outline" onClick={()=>setNavigation(null)}>Seguir revisando</button><button className="button button-primary er-primary" onClick={()=>{const target=navigation;setNavigation(null);applyNavigation(target);}}>Descartar y continuar</button></div></Modal>}
 </div>;
}
function EquipmentFacts({equipment,onEdit,editDisabled}:{equipment:EmergencyEquipment;onEdit?:()=>void;editDisabled:boolean}){
 const month=equipment.expiry_month?new Intl.DateTimeFormat('es-PE',{month:'long',year:'numeric',timeZone:'America/Lima'}).format(new Date(`${equipment.expiry_month}-15T12:00:00Z`)):'';
 return <section className="er-equipment-facts er-card" aria-label="Ficha del equipo"><div className="er-facts-title"><span className="er-equipment-code"><FireExtinguisher size={21} aria-hidden="true"/>{equipment.code}</span>{onEdit&&<button className="text-button" disabled={editDisabled} onClick={onEdit}><Pencil size={16}/>Editar ficha</button>}</div><p className="er-location">{equipment.location}</p>{equipment.area_name&&<p className="er-muted">{organizationLabel(equipment.area_name)} · {organizationLabel(equipment.management_name)}</p>}<dl>{[['N° de serie',equipment.serial_number],['Marca',equipment.brand],['Tipo / agente',equipment.agent],['Capacidad',equipment.capacity],['Año de fabricación',equipment.manufacture_year?.toString()],['Vencimiento',month],['Última prueba hidrostática',equipment.last_hydro_date?formatDate(equipment.last_hydro_date):''],['Próxima prueba hidrostática',equipment.next_hydro_date?formatDate(equipment.next_hydro_date):'']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'No registrado'}</dd></div>)}</dl></section>;
}
