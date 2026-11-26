import { productivityReady } from './productivity';
import { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Send, History } from 'lucide-react';
import { supabaseClient } from './supabase';
import { cloudRpc } from './cloud-store';
import { enqueueOffline } from './offline-store';
import { addLocalComment } from './follow-up';
import type { Inspection } from './model';
import { usePendingChanges } from './manual-save';
export type FollowUpEvent={id:string;inspection_id:string;observation_id:string;actor_id:string;actor_name:string;action:string;state?:string;decision?:string;body:string;created_at:string};
const eventLabels:Record<string,string>={save:'Avance guardado',submit:'Levantamiento enviado a revisión',state:'Estado actualizado',approve:'Levantamiento aprobado',changes:'Correcciones solicitadas',comment:'Comentario'};
const stamp=(date:string)=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'}).format(new Date(date));
export function FollowUpConversation({inspection,observationId,actor,readOnly,onChange}:{inspection:Inspection;observationId:string;actor:{id:string;name:string};readOnly:boolean;onChange:(d:Inspection)=>void}){
 const [events,setEvents]=useState<FollowUpEvent[]>([]),[body,setBody]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[available,setAvailable]=useState(true),[limit,setLimit]=useState(30),[retry,setRetry]=useState(0);
 const approved=inspection.delivery?.corrections[observationId]?.decision==='approved';
 const canWrite=!readOnly&&!approved;
 const pending=useRef<{body:string;id:string}|null>(null),lock=useRef(false);usePendingChanges(canWrite&&!!body.trim()||busy);
 useEffect(()=>{
  let active=true;
  if(inspection.storage!=='cloud'){setEvents((inspection.delivery?.timeline||[]).filter(e=>e.observation_id===observationId).reverse());return;}
  const load=async()=>{if(!productivityReady()){setAvailable(false);return;}if(!navigator.onLine||document.visibilityState==='hidden')return;const {data,error}=await supabaseClient().from('berry_followup_events').select('*').eq('inspection_id',inspection.id).eq('observation_id',observationId).order('created_at',{ascending:false}).order('id').limit(limit);if(!active)return;if(error){setAvailable(false);return;}setAvailable(true);setEvents(data as FollowUpEvent[]);};
  void load();const timer=setInterval(()=>void load(),20000);window.addEventListener('focus',load);window.addEventListener('berry-cloud-inspections-changed',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('berry-cloud-inspections-changed',load);};
 },[inspection.id,inspection.updatedAt,inspection.delivery?.revision,observationId,limit,retry]);
 const send=async()=>{
  if(!canWrite||lock.current||!body.trim())return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(!pending.current||pending.current.body!==body)pending.current={body,id:crypto.randomUUID()};
   if(inspection.storage!=='cloud'){onChange(await addLocalComment(inspection,observationId,actor.id,body,pending.current.id));}
   else if(!navigator.onLine){await enqueueOffline({id:pending.current.id,actor:actor.id,kind:'comment',inspection,observationId,body});setNotice('Comentario guardado en este dispositivo. Se enviará al recuperar la conexión.');}
   else{await cloudRpc('berry_add_followup_comment',{p_id:inspection.id,p_observation:observationId,p_operation:pending.current.id,p_body:body},actor.id);setNotice('Comentario enviado.');setRetry(v=>v+1);}
   setBody('');pending.current=null;
  }catch(e){setError(e instanceof Error?e.message:'No se pudo enviar el comentario.');}finally{lock.current=false;setBusy(false);}
 };
 const comments=[...events].reverse().filter(e=>e.body.trim()),note=inspection.delivery?.corrections[observationId]?.note;
 if(approved&&!comments.length&&!note&&available)return null;
 return <section className="correction-conversation" aria-label="Conversación y seguimiento">
  <h4>{approved?<History size={16}/>:<MessageSquareText size={16}/>} {approved?'Conversación registrada':'¿Tienes dudas?, conversa con el inspector...'}</h4>
  {note&&!events.some(e=>['approve','changes'].includes(e.action)&&e.body===note)&&<div className="correction-review-message"><strong>{inspection.inspector}</strong><p>{note}</p><small>Comentario conservado del revisor.</small></div>}
  {comments.map(event=><article key={event.id} className={`correction-review-message ${event.actor_id===actor.id?'comment-own':''}`}><div className="correction-message-author"><strong>{event.actor_name}</strong><span>{event.actor_id===inspection.ownerId?'Responsable de la inspección':'Responsable del levantamiento'}</span><time dateTime={event.created_at}>{stamp(event.created_at)}</time></div><p>{event.body}</p></article>)}
  {canWrite&&available&&<div className="conversation-composer"><label>Escribir comentario<textarea value={body} maxLength={5000} rows={2} disabled={busy} onChange={e=>{setBody(e.target.value);setNotice('');}} placeholder="Escribe una consulta o respuesta sobre esta observación."/></label><button className="button button-outline" disabled={busy||!body.trim()} onClick={()=>void send()}><Send size={15}/>{busy?'Enviando…':'Enviar comentario'}</button></div>}
  {!available&&<p className="inline-note">El historial de conversación está pendiente de activación o no pudo consultarse.</p>}
  {!approved&&<details className="correction-history"><summary><History size={15}/>Historial de estados y movimientos</summary>{events.filter(e=>e.action!=='comment').map(event=><p key={event.id}><strong>{eventLabels[event.action]||event.action}</strong>{event.state?` · ${event.state}`:''}<br/>{event.actor_name} · <time dateTime={event.created_at}>{stamp(event.created_at)}</time></p>)}{!events.some(e=>e.action!=='comment')&&<p>Sin información por el momento.</p>}</details>}
  {events.length>=limit&&<button className="text-button" onClick={()=>setLimit(n=>n+30)}>Cargar movimientos anteriores</button>}
  {!approved&&error&&<p className="error-message" role="alert">{error}</p>}{!approved&&notice&&<p role="status">{notice}</p>}
 </section>;
}
