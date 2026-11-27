import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient, supabaseConfig } from './supabase';
import { guestToken } from './yo-seguro';
import type { Evidence } from './model';

export type EmergencyKind = 'extinguisher' | 'eyewash' | 'shower';
export type EmergencyState = 'operational' | 'attention' | 'out_of_service' | 'expired' | 'used' | 'depressurized' | 'overpressurized' | 'disabled';
export const EMERGENCY_STATES:Record<EmergencyState,string>={operational:'Operativo',attention:'Requiere atención',out_of_service:'Fuera de servicio',expired:'Vencido',used:'Usado',depressurized:'Despresurizado',overpressurized:'Sobrepresurizado',disabled:'Deshabilitado'};
export type EmergencyEquipment={id:string;kind:EmergencyKind;code:string;area_id:string|null;management_id:string|null;location:string;serial_number:string;brand:string;agent:string;capacity:string;manufacture_year:number|null;expiry_month:string;last_hydro_date:string|null;next_hydro_date:string|null;enabled:boolean;revision:number;area_name?:string;management_name?:string;owner_management_id?:string|null;owner_name?:string|null;owner_management_name?:string|null;classification?:string;placement_kind?:string;last_hydro_year?:number|null;next_hydro_year?:number|null;legacy_available?:boolean;legacy_years?:{manufacture:string|null;last_hydro:string|null;next_hydro:string|null}|null};
export type EmergencyInspection={id:string;equipment_id:string;management_id:string;area_id:string;inspector_id:string|null;worker_name:string;employee_code:string;submission_source:'guest'|'account';inspection_date:string;state:EmergencyState;notes:string;equipment_snapshot:EmergencyEquipment;signature_path:string;photos:{path:string;name:string;mime:string}[];created_at:string};
export type EmergencyLookup={equipment:EmergencyEquipment;latest:{inspection_date:string;state:EmergencyState|null;state_label?:string;source?:'legacy';date_column?:'H'}|null;canReview:boolean};
export type EmergencyValues={worker_name:string;employee_code:string;inspection_date:string;state:EmergencyState|'';notes:string;area_id?:string;location?:string};
export type EmergencyLegacyRecord={id:string;equipment_id:string;source_row:number;official_date:string|null;previous_date:string|null;state_original:string;notes:string;inspector_code:string;months:Record<string,string|null>;original:Record<string,unknown>;imported_at:string};
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
 if(error.message?.includes('AREA_NOT_AVAILABLE'))return new Error('Selecciona una gerencia y un área usuarias vigentes. Actualiza las áreas si tu selección ya no aparece.');
 if(error.message?.includes('LOCATION_REQUIRED'))return new Error('Completa la ubicación del equipo para registrar esta inspección.');
 if(error.message?.includes('EQUIPMENT_AREA_FIXED')||error.message?.includes('EQUIPMENT_LOCATION_FIXED'))return new Error('La ubicación usuaria ya fue registrada. Actualiza la ficha; Administración puede corregirla.');
 if(error.code==='23505')return new Error('Ese código ya está registrado. Cierra este formulario y busca su ficha.');
 if(error.code==='40001')return new Error('Este registro cambió en otra sesión. Conservamos tu información; consulta la versión actual antes de continuar.');
 if(error.code==='42501')return new Error('No se pudo autorizar esta operación. Comprueba el acceso de tu cuenta o reintenta el envío original.');
 return new Error('No pudimos confirmar la operación. Conservamos la información para que puedas reintentar.');
}
export async function emergencyStatus(){const{data,error}=await publicClient().rpc('berry_emergency_status').abortSignal(AbortSignal.timeout(15000));if(error?.code==='PGRST202')return{ready:false,inventory:false};if(error)throw failure(error);return{ready:['202611250030','202611270031'].includes(data?.version),inventory:data?.version==='202611270031'};}
export async function emergencyReady(){return(await emergencyStatus()).ready;}
export function emergencyYearLabel(value:number|null|undefined,raw?:string|null,allowFuture=false){
 const current=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Lima',year:'numeric'}).format(new Date()));
 if(value)return`${value}${!allowFuture&&value>current?' · por revisar':''}`;
 const source=raw?.trim();return source&&source!=='-'?`${source} · por revisar`:'';
}
export async function lookupEmergency(code:string,kind:EmergencyKind,account:boolean,signal:AbortSignal):Promise<EmergencyLookup|null>{
 const normalized=emergencyCode(code);
 const{data,error}=await publicClient().rpc('berry_emergency_lookup',{p_kind:kind,p_code:normalized}).abortSignal(signal);if(error)throw failure(error);
 let equipment:EmergencyEquipment|undefined=data?.equipment,canReview=false;
 if(account){const result=await supabaseClient().from('berry_emergency_equipment').select('*').eq('code',equipment?.code||normalized).eq('kind',kind).abortSignal(signal).maybeSingle();if(result.error)throw failure(result.error);if(result.data){equipment={...equipment,...result.data,legacy_available:equipment?.legacy_available||!!result.data.import_batch_sha};canReview=true;}}
 if(!equipment)return null;
 return{equipment,latest:data?.latest||null,canReview};
}
export async function emergencyHistory(equipmentId:string,offset=0){const{data,error,count}=await supabaseClient().from('berry_emergency_inspections').select('*',{count:'exact'}).eq('equipment_id',equipmentId).order('inspection_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+9).abortSignal(AbortSignal.timeout(15000));if(error)throw failure(error);return{rows:(data||[]) as EmergencyInspection[],count:count||0};}
export async function emergencyLegacy(equipmentId:string){const{data,error}=await supabaseClient().from('berry_emergency_legacy_records').select('id,equipment_id,source_row,official_date,previous_date,state_original,notes,inspector_code,months,original,imported_at').eq('equipment_id',equipmentId).order('imported_at',{ascending:false}).limit(20).abortSignal(AbortSignal.timeout(15000));if(error)throw failure(error);return(data||[]) as EmergencyLegacyRecord[];}
export async function saveEmergencyEquipment(id:string,expected:number,data:Record<string,unknown>){const result=await supabaseClient().rpc('berry_save_emergency_equipment',{p_id:id,p_expected:expected,p_data:data}).abortSignal(AbortSignal.timeout(20000));if(result.error)throw failure(result.error);if(result.data?.id!==id)throw new Error('No pudimos verificar la ficha guardada. Busca el código antes de repetir el registro.');return result.data as EmergencyEquipment;}
function imageFile(evidence:Evidence,role:'signature'|'photo'):ReviewFile{
 const match=evidence.data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)throw new Error('Usa una imagen PNG, JPG o WebP válida.');
 const raw=atob(match[2]),bytes=Uint8Array.from(raw,letter=>letter.charCodeAt(0));
 if(bytes.length>(role==='signature'?1048576:2097152))throw new Error(role==='signature'?'La firma debe pesar como máximo 1 MB.':'Cada evidencia debe pesar como máximo 2 MB después de prepararla.');
 return{id:evidence.id,role,name:evidence.name.replace(/[\\/\r\n]/g,'_').slice(0,200),mime:match[1],size:bytes.length,blob:new Blob([bytes],{type:match[1]}),uploaded:false};
}
export function prepareEmergencyIntent(equipment:EmergencyEquipment,values:EmergencyValues,signature:Evidence,photos:Evidence[]):EmergencyIntent{const input={...values};if(equipment.area_id)delete input.area_id;if(equipment.location.trim())delete input.location;return{id:crypto.randomUUID(),token:guestToken(),started:false,equipment,values:input,files:[imageFile(signature,'signature'),...photos.map(photo=>imageFile(photo,'photo'))]};}
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
