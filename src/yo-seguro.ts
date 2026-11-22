import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient, supabaseConfig } from './supabase';
import { prepareSafetyFile } from './safety-documents';
import type { CloudProfile } from './cloud-account';
import type { SafetyKind, UploadIntent } from './safety-documents';

export type YoManagement = { id: string; name: string; areas: { id: string; name: string }[] };
export type YoScope = { admin: boolean; management_id: string | null; management_name: string };
export type GuestValues = { worker: string; management: string; area: string; kind: SafetyKind; title: string; date: string; workplace: string };
export type GuestIntent = UploadIntent & { token: string; path?: string };
let guest: SupabaseClient | undefined;
// This client never reads, creates or changes the account session saved in this browser.
function guestClient() {
 if (!guest) { const { url,key }=supabaseConfig();guest=createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'berry-yo-seguro-public'},
  global:{fetch:(input,init)=>{const signal=init?.signal;const timeout=AbortSignal.timeout(90000);return fetch(input,{...init,signal:signal?AbortSignal.any([signal,timeout]):timeout});}},
 }); }
 return guest;
}
function problem(error: { code?: string; message?: string }) {
 if(error.code==='PGRST202')return new Error('Yo Seguro está pendiente de activación. Vuelve a intentarlo más tarde.');
 if(error.message?.includes('UPLOAD_RATE_LIMIT'))return new Error('Se recibieron muchos envíos. Espera unos minutos y vuelve a intentarlo; conservamos tu selección.');
 if(error.message?.includes('UPLOAD_EXPIRED'))return new Error('Venció el tiempo de este envío. Pulsa Empezar de nuevo y vuelve a seleccionar el archivo.');
 if(error.message?.includes('AREA_NOT_AVAILABLE'))return new Error('El área ya no está disponible. Empieza de nuevo y actualiza la lista de áreas.');
 if(error.code==='40001')return new Error('Los datos de este intento cambiaron. Reintenta con los mismos datos o empieza un envío nuevo.');
 return new Error('No pudimos confirmar el envío. Conservamos tus datos y archivo para que puedas reintentarlo sin duplicar el registro.');
}
export async function yoSeguroCatalog():Promise<YoManagement[]> {
 const { data,error }=await guestClient().rpc('berry_yo_seguro_catalog').abortSignal(AbortSignal.timeout(15000));
 if(error)throw problem(error);
 if(data?.version!=='202611220025'||!Array.isArray(data.catalog)||data.catalog.some((m:YoManagement)=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!Array.isArray(m.areas)||m.areas.some(a=>!a||typeof a.id!=='string'||typeof a.name!=='string')))throw new Error('No pudimos verificar las áreas de Yo Seguro. Actualiza la lista antes de continuar.');
 return data.catalog;
}
export async function yoSeguroScope():Promise<YoScope|null> {
 const { data,error }=await supabaseClient().rpc('berry_yo_seguro_scope');
 if(error?.code==='PGRST202')return null;
 if(error)throw new Error('No pudimos verificar tu acceso a Yo Seguro. Revisa la conexión y vuelve a entrar.');
 if(data?.version!=='202611220025'||typeof data.admin!=='boolean'||(data.management_id!==null&&typeof data.management_id!=='string')||typeof data.management_name!=='string')throw new Error('No pudimos verificar la gerencia de tu cuenta.');
 return data;
}
export async function prepareGuestFile(file:File):Promise<GuestIntent> {
 const intent=await prepareSafetyFile(file);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
 return {...intent,token};
}
export async function sendGuestDocument(intent:GuestIntent,values:GuestValues,onPhase:(phase:string)=>void):Promise<string> {
 if(!navigator.onLine)throw new Error('Necesitas conexión para enviar el documento. Tu selección sigue en este formulario.');
 const client=guestClient();intent.started=true;
 onPhase('Preparando envío…');
 const { data:ticket,error:ticketError }=await client.rpc('berry_begin_yo_seguro_upload',{
  p_id:intent.id,p_token:intent.token,p_area:values.area,p_worker:values.worker.trim(),p_kind:values.kind,
  p_title:values.title.trim(),p_date:values.date,p_workplace:values.workplace.trim(),p_file_name:intent.file.name.replace(/[\\/\r\n]/g,'_').slice(0,200),p_mime:intent.mime,p_size:intent.file.size,
 }).abortSignal(AbortSignal.timeout(20000));
 if(ticketError)throw problem(ticketError);
 if(ticket?.id!==intent.id||typeof ticket.path!=='string'||!ticket.path.startsWith(`public/${intent.id}/${intent.token}/`))throw new Error('No pudimos verificar el permiso de este envío. Vuelve a intentarlo.');
 intent.path=ticket.path;
 if(!intent.uploaded&&!ticket.completed){
  onPhase('Subiendo documento…');
  const {error}=await client.storage.from('berry-safety-documents').upload(ticket.path,intent.file,{contentType:intent.mime,upsert:false});
  if(error&&!['409','Duplicate'].includes(String((error as {statusCode?:string}).statusCode||error.name)))throw problem(error);
  intent.uploaded=true;
 }
 onPhase('Confirmando recepción…');
 const {data,error}=await client.rpc('berry_finish_yo_seguro_upload',{p_id:intent.id,p_token:intent.token}).abortSignal(AbortSignal.timeout(20000));
 if(error)throw problem(error);
 if(data?.received!==true||data.id!==intent.id)throw new Error('No pudimos confirmar la recepción. Reintenta el mismo envío.');
 return `YS-${intent.id.slice(0,8).toUpperCase()}`;
}

export async function setYoSeguroAccess(account:CloudProfile,management:string|null,expected:string|null):Promise<CloudProfile> {
 const {data,error}=await supabaseClient().rpc('berry_set_yo_seguro_access',{p_user:account.id,p_expected:expected,p_management:management});
 if(error)throw error.code==='40001'?new Error('La gerencia autorizada cambió en otra sesión. Actualiza el usuario antes de guardar.'):error.code==='42501'?new Error('Solo Administración puede cambiar la gerencia autorizada.'):problem(error);
 if(data?.id!==account.id||data.yo_seguro_management_id!==management||typeof data.full_name!=='string')throw new Error('No pudimos verificar el cambio de acceso. Actualiza la lista.');
 return data as CloudProfile;
}

export async function yoSeguroAccountAccess(user:string):Promise<string|null> {
 const {data,error}=await supabaseClient().rpc('berry_yo_seguro_account_access',{p_user:user});
 if(error)throw problem(error);
 if(data?.user_id!==user||(data.management_id!==null&&typeof data.management_id!=='string'))throw new Error('No pudimos verificar la gerencia autorizada.');
 return data.management_id;
}
