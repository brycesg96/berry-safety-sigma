import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient, supabaseConfig } from './supabase';
import { prepareSafetyFile } from './safety-documents';
import type { CloudProfile } from './cloud-account';
import type { SafetyKind, UploadIntent } from './safety-documents';

export type YoManagement = { id: string; name: string; areas: { id: string; name: string }[] };
export type YoScope = { admin: boolean; management_id: string | null; management_name: string };
export type GuestValues = { worker: string; management: string; area: string; title: string; site: string; zone: string; facility: string };
export type YoSite = { id: string; name: string; zones: {id:string;name:string;facilities:{id:string;name:string}[]}[] };
export type BatchIntent = { id:string; token:string; started:boolean; files:GuestIntent[] };
export type GuestReceipt = {code:string;receivedAt:string;count:number};
export type GuestIntent = UploadIntent & { kind:SafetyKind; path?:string };
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
 if(error.message?.includes('LOCATION_NOT_AVAILABLE'))return new Error('La Sede, Zona o Instalación ya no están disponibles. Empieza de nuevo y actualiza las listas.');
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
export async function yoSeguroLocations():Promise<YoSite[]> {
 const {data,error}=await guestClient().rpc('berry_yo_seguro_workplaces').abortSignal(AbortSignal.timeout(15000));
 if(error)throw problem(error);
 if(data?.version!=='202611250029'||!Array.isArray(data.sites)||data.sites.some((site:YoSite)=>!site||typeof site.id!=='string'||typeof site.name!=='string'||!Array.isArray(site.zones)||site.zones.some(zone=>!zone||typeof zone.id!=='string'||typeof zone.name!=='string'||!Array.isArray(zone.facilities)||zone.facilities.some(f=>!f||typeof f.id!=='string'||typeof f.name!=='string'))))throw new Error('No pudimos verificar las Sedes, Zonas e Instalaciones. Actualiza las listas.');
 return data.sites;
}
export const guestToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('');
export const formatWorkerName=(name:string)=>name.toLocaleLowerCase('es').replace(/(^|[\s'-])(\p{L})/gu,(_,separator:string,letter:string)=>separator+letter.toLocaleUpperCase('es'));
export async function prepareGuestFile(file:File,kind:SafetyKind):Promise<GuestIntent> {
 return {...await prepareSafetyFile(file),kind};
}
export async function sendGuestDocuments(batch:BatchIntent,values:GuestValues,onPhase:(phase:string)=>void):Promise<GuestReceipt> {
 if(!navigator.onLine)throw new Error('Necesitas conexión para enviar los documentos. Conservamos tu selección en este formulario.');
 const client=guestClient();batch.started=true;onPhase('Preparando envío…');
 const {data:ticket,error:ticketError}=await client.rpc('berry_begin_yo_seguro_batch_at_facility',{
  p_id:batch.id,p_token:batch.token,p_area:values.area,p_worker:values.worker.trim(),p_title:values.title.trim(),p_site:values.site,p_zone:values.zone,p_facility:values.facility,
  p_files:batch.files.map(file=>({id:file.id,kind:file.kind,file_name:file.file.name.replace(/[\\/\r\n]/g,'_').slice(0,200),mime:file.mime,size:file.file.size})),
 }).abortSignal(AbortSignal.timeout(20000));
 if(ticketError)throw problem(ticketError);
 if(ticket?.id!==batch.id||!Array.isArray(ticket.files)||ticket.files.length!==batch.files.length)throw new Error('No pudimos verificar los permisos del envío. Reintenta conservando los archivos.');
 for(const [index,file]of batch.files.entries()){
  const permit=ticket.files.find((entry:{id:string;path:string})=>entry.id===file.id);
  const path=`public/${file.id}/${batch.token}/documento.${file.extension}`;
  if(permit?.path!==path)throw new Error('No pudimos verificar el permiso de uno de los archivos. Reintenta el envío.');
  file.path=path;
  if(!file.uploaded&&!ticket.completed){
   onPhase(`Subiendo archivo ${index+1} de ${batch.files.length}…`);
   const {error}=await client.storage.from('berry-safety-documents').upload(path,file.file,{contentType:file.mime,upsert:false});
   if(error&&!['409','Duplicate'].includes(String((error as {statusCode?:string}).statusCode||error.name)))throw problem(error);
   file.uploaded=true;
  }
 }
 onPhase('Confirmando recepción…');
 const {data,error}=await client.rpc('berry_finish_yo_seguro_batch',{p_id:batch.id,p_token:batch.token}).abortSignal(AbortSignal.timeout(20000));
 if(error)throw problem(error);
 if(data?.received!==true||data.id!==batch.id||data.count!==batch.files.length||typeof data.received_at!=='string'||!Number.isFinite(Date.parse(data.received_at)))throw new Error('No pudimos confirmar la recepción. Reintenta el mismo envío.');
 return {code:`YS-${batch.id.slice(0,8).toUpperCase()}-${batch.id.slice(-8).toUpperCase()}`,receivedAt:data.received_at,count:data.count};
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
