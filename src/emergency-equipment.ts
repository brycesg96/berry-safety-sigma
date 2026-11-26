import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient, supabaseConfig } from './supabase';
import { guestToken } from './yo-seguro';
import type { Evidence } from './model';

export type EmergencyKind = 'extinguisher' | 'eyewash' | 'shower';
export type EmergencyState = 'operational' | 'attention' | 'out_of_service';
export const EMERGENCY_STATES:Record<EmergencyState,string>={operational:'Operativo',attention:'Requiere atención',out_of_service:'Fuera de servicio'};
export type EmergencyEquipment={id:string;kind:EmergencyKind;code:string;area_id:string;management_id:string;location:string;serial_number:string;brand:string;agent:string;capacity:string;manufacture_year:number|null;expiry_month:string;last_hydro_date:string|null;next_hydro_date:string|null;enabled:boolean;revision:number;area_name?:string;management_name?:string};
export type EmergencyInspection={id:string;equipment_id:string;management_id:string;area_id:string;inspector_id:string|null;worker_name:string;employee_code:string;submission_source:'guest'|'account';inspection_date:string;state:EmergencyState;notes:string;equipment_snapshot:EmergencyEquipment;signature_path:string;photos:{path:string;name:string;mime:string}[];created_at:string};
export type EmergencyLookup={equipment:EmergencyEquipment;latest:{inspection_date:string;state:EmergencyState}|null;canReview:boolean};
export type EmergencyValues={worker_name:string;employee_code:string;inspection_date:string;state:EmergencyState|'';notes:string};
export type EmergencyReceipt={id:string;received:true;received_at:string;equipment_code:string;worker_name:string;inspection_date:string;state:EmergencyState};
type ReviewFile={id:string;role:'signature'|'photo';name:string;mime:string;size:number;blob:Blob;uploaded:boolean};
export type EmergencyIntent={id:string;token:string;started:boolean;equipment:EmergencyEquipment;values:EmergencyValues;files:ReviewFile[]};
let anonymous:SupabaseClient|undefined;
function publicClient(){if(!anonymous){const{url,key}=supabaseConfig();anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'berry-yo-reviso-public'},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)})}});}return anonymous;}
const client=(account:boolean)=>account?supabaseClient():publicClient();
export const emergencyCode=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleUpperCase('es');
function failure(error:{code?:string;message?:string}){
 if(error.code==='PGRST202')return new Error('¡Yo Reviso! está pendiente de activación. Vuelve a intentarlo más tarde.');
 if(error.message?.includes('EQUIPMENT_CONFLICT'))return new Error('La ficha del equipo cambió. Actualiza la ficha y prepara un nuevo envío; conservamos tus datos.');
 if(error.message?.includes('UPLOAD_EXPIRED'))return new Error('Venció el tiempo de este envío. Prepara un nuevo envío para continuar con los mismos datos.');
 if(error.message?.includes('UPLOAD_RATE_LIMIT'))return new Error('Se recibieron muchas revisiones. Espera unos minutos y reintenta; conservamos tus datos.');
 if(error.message?.includes('EQUIPMENT_NOT_AVAILABLE'))return new Error('El equipo o su área ya no están disponibles. Actualiza la ficha antes de continuar.');
 if(error.code==='23505')return new Error('Ese código ya está registrado. Cierra este formulario y busca su ficha.');
 if(error.code==='40001')return new Error('Este registro cambió en otra sesión. Conservamos tu información; consulta la versión actual antes de continuar.');
 if(error.code==='42501')return new Error('No se pudo autorizar esta operación. Comprueba el acceso de tu cuenta o reintenta el envío original.');
 return new Error('No pudimos confirmar la operación. Conservamos la información para que puedas reintentar.');
}
export async function emergencyReady(){const{data,error}=await publicClient().rpc('berry_emergency_status').abortSignal(AbortSignal.timeout(15000));if(error?.code==='PGRST202')return false;if(error)throw failure(error);return data?.version==='202611250030';}
export async function lookupEmergency(code:string,kind:EmergencyKind,account:boolean,signal:AbortSignal):Promise<EmergencyLookup|null>{
 const normalized=emergencyCode(code);
 const{data,error}=await publicClient().rpc('berry_emergency_lookup',{p_kind:kind,p_code:normalized}).abortSignal(signal);if(error)throw failure(error);
 let equipment:EmergencyEquipment|undefined=data?.equipment,canReview=false;
 if(account){const result=await supabaseClient().from('berry_emergency_equipment').select('*').eq('code',normalized).eq('kind',kind).abortSignal(signal).maybeSingle();if(result.error)throw failure(result.error);if(result.data){equipment={...equipment,...result.data};canReview=true;}}
 if(!equipment)return null;
 return{equipment,latest:data?.latest||null,canReview};
}
export async function emergencyHistory(equipmentId:string,offset=0){const{data,error,count}=await supabaseClient().from('berry_emergency_inspections').select('*',{count:'exact'}).eq('equipment_id',equipmentId).order('inspection_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+9).abortSignal(AbortSignal.timeout(15000));if(error)throw failure(error);return{rows:(data||[]) as EmergencyInspection[],count:count||0};}
export async function saveEmergencyEquipment(id:string,expected:number,data:Record<string,unknown>){const result=await supabaseClient().rpc('berry_save_emergency_equipment',{p_id:id,p_expected:expected,p_data:data}).abortSignal(AbortSignal.timeout(20000));if(result.error)throw failure(result.error);if(result.data?.id!==id)throw new Error('No pudimos verificar la ficha guardada. Busca el código antes de repetir el registro.');return result.data as EmergencyEquipment;}
function imageFile(evidence:Evidence,role:'signature'|'photo'):ReviewFile{
 const match=evidence.data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)throw new Error('Usa una imagen PNG, JPG o WebP válida.');
 const raw=atob(match[2]),bytes=Uint8Array.from(raw,letter=>letter.charCodeAt(0));
 if(bytes.length>(role==='signature'?1048576:2097152))throw new Error(role==='signature'?'La firma debe pesar como máximo 1 MB.':'Cada evidencia debe pesar como máximo 2 MB después de prepararla.');
 return{id:evidence.id,role,name:evidence.name.replace(/[\\/\r\n]/g,'_').slice(0,200),mime:match[1],size:bytes.length,blob:new Blob([bytes],{type:match[1]}),uploaded:false};
}
export function prepareEmergencyIntent(equipment:EmergencyEquipment,values:EmergencyValues,signature:Evidence,photos:Evidence[]):EmergencyIntent{return{id:crypto.randomUUID(),token:guestToken(),started:false,equipment,values:{...values},files:[imageFile(signature,'signature'),...photos.map(photo=>imageFile(photo,'photo'))]};}
export async function submitEmergency(intent:EmergencyIntent,account:boolean,onPhase:(phase:string)=>void):Promise<EmergencyReceipt>{
 if(!navigator.onLine)throw new Error('Necesitas conexión para registrar la inspección. Conservamos tus datos en esta pantalla.');
 const api=client(account);intent.started=true;onPhase('Preparando inspección…');
 const{data:ticket,error}=await api.rpc('berry_begin_emergency_inspection',{p_id:intent.id,p_token:intent.token,p_kind:intent.equipment.kind,p_code:intent.equipment.code,p_expected:intent.equipment.revision,p_input:{...intent.values,files:intent.files.map(({id,role,name,mime,size})=>({id,role,name,mime,size}))}}).abortSignal(AbortSignal.timeout(20000));
 if(error)throw failure(error);if(ticket?.id!==intent.id||!Array.isArray(ticket.files)||ticket.files.length!==intent.files.length)throw new Error('No pudimos verificar los permisos de esta inspección. Reintenta sin cambiar los archivos.');
 for(const[index,file]of intent.files.entries()){
  const ext=file.mime==='image/jpeg'?'jpg':file.mime==='image/webp'?'webp':'png',path=`public/${intent.id}/${intent.token}/${file.id}.${ext}`;
  if(!ticket.files.some((entry:{id:string;path:string})=>entry.id===file.id&&entry.path===path))throw new Error('El permiso de un archivo no corresponde al envío. Reintenta la inspección original.');
  if(!file.uploaded&&!ticket.completed){onPhase(`Guardando evidencia ${index+1} de ${intent.files.length}…`);const result=await api.storage.from('berry-emergency-evidence').upload(path,file.blob,{contentType:file.mime,upsert:false});if(result.error&&!['409','Duplicate'].includes(String((result.error as {statusCode?:string}).statusCode||result.error.name)))throw failure(result.error);file.uploaded=true;}
 }
 onPhase('Confirmando inspección…');const result=await api.rpc('berry_finish_emergency_inspection',{p_id:intent.id,p_token:intent.token}).abortSignal(AbortSignal.timeout(20000));if(result.error)throw failure(result.error);
 if(result.data?.received!==true||result.data.id!==intent.id||!Number.isFinite(Date.parse(result.data.received_at)))throw new Error('Falta confirmar la recepción. Reintenta para verificar el mismo envío, sin duplicarlo.');return result.data as EmergencyReceipt;
}
export async function emergencyImage(path:string){const{data,error}=await supabaseClient().storage.from('berry-emergency-evidence').download(path);if(error||!data)throw new Error('No pudimos abrir la imagen. Revisa tu conexión y tu acceso a esta gerencia.');return URL.createObjectURL(data);}
