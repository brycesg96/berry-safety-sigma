import { productivityReady } from './productivity';
import { useEffect, useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import type { Inspection } from './model';
import { supabaseClient } from './supabase';
type MailRow={request_id:string;email:string;state:string;provider_id:string|null;detail:string;occurred_at:string};
const labels:Record<string,string>={requested:'Solicitud registrada',submitted:'Aceptado por Outlook',delivered:'Entrega confirmada',bounced:'Rechazado',deferred:'Entrega aplazada'};
export function MailTracking({inspection,actorId}:{inspection:Inspection;actorId:string}){
 const [rows,setRows]=useState<MailRow[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{if(inspection.storage!=='cloud')return;if(!productivityReady()){setError('El seguimiento individual está pendiente de activación.');return;}let active=true;setLoading(true);void supabaseClient().from('berry_mail_recipients').select('*').eq('inspection_id',inspection.id).order('occurred_at',{ascending:false}).limit(200).then(({data,error})=>{if(!active)return;setRows((data||[]) as MailRow[]);setError(error?'El seguimiento individual está pendiente de activación o no pudo consultarse.':'');setLoading(false);});return()=>{active=false;};},[inspection.id,retry,actorId]);
 const latest=[...new Map([...rows].reverse().map(row=>[row.email,row])).values()];
 return <details className="mail-tracking"><summary><Mail size={16}/>Seguimiento de correos</summary><p>«Entrega confirmada» solo aparece cuando el proveedor informa la entrega. La aceptación del envío no garantiza la recepción.</p><button className="text-button" disabled={loading||!navigator.onLine} onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>Actualizar estado</button>{error&&<p>{error}</p>}{latest.length?<ul>{latest.map(row=><li key={row.email}><strong>{row.email}</strong><span className={`mail-state mail-state-${row.state}`}>{labels[row.state]||'Sin confirmar'}</span><small>{new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'}).format(new Date(row.occurred_at))}</small>{row.detail&&<p>{row.detail}</p>}</li>)}</ul>:<p>{inspection.emailDelivery?.state==='accepted'?'Solicitud aceptada por el servicio. La entrega por destinatario aún no está confirmada.':'No hay una confirmación individual registrada.'}</p>}</details>;
}
