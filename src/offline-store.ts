import type { Inspection } from './model';
import type { Correction } from './follow-up';
export type OfflineJob = { id: string; actor: string; kind: 'draft' | 'correction' | 'comment'; inspection: Inspection; observationId?: string; action?: string; value?: Partial<Correction>; body?: string; state: 'pending' | 'conflict'; error?: string; createdAt: string };
type Entry = { key: string; actor: string; value: unknown; savedAt: number };
function db(): Promise<IDBDatabase> { return new Promise((resolve,reject)=>{const r=indexedDB.open('berry-offline-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('cache',{keyPath:'key'});r.result.createObjectStore('jobs',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
async function access<T>(store: 'cache'|'jobs', mode: IDBTransactionMode, run: (s: IDBObjectStore)=>IDBRequest):Promise<T>{
 const connection=await db();return new Promise((resolve,reject)=>{const tx=connection.transaction(store,mode),r=run(tx.objectStore(store));let value:T;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>{connection.close();resolve(value);};tx.onabort=tx.onerror=()=>{connection.close();reject(tx.error||r.error);};});
}
export async function putOfflineCache(actor:string,key:string,value:unknown){await access('cache','readwrite',s=>s.put({key:`${actor}:${key}`,actor,value,savedAt:Date.now()}));}
export async function getOfflineCache<T>(actor:string,key:string, maxAge=86400000):Promise<T|null>{const item=await access<Entry|undefined>('cache','readonly',s=>s.get(`${actor}:${key}`));return item&&item.actor===actor&&Date.now()-item.savedAt<=maxAge?item.value as T:null;}
export async function clearOfflineCache(actor:string){const entries=await access<Entry[]>('cache','readonly',s=>s.getAll());for(const entry of entries)if(entry.actor===actor)await access('cache','readwrite',s=>s.delete(entry.key));}
export async function offlineJobs(actor:string){return (await access<OfflineJob[]>('jobs','readonly',s=>s.getAll())).filter(j=>j.actor===actor).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export async function saveOfflineJob(job:OfflineJob){await access('jobs','readwrite',s=>s.put(job));window.dispatchEvent(new Event('berry-offline-changed'));}
export async function removeOfflineJob(id:string,actor:string){const jobs=await offlineJobs(actor);if(jobs.some(j=>j.id===id))await access('jobs','readwrite',s=>s.delete(id));window.dispatchEvent(new Event('berry-offline-changed'));}
export async function enqueueOffline(job:Omit<OfflineJob,'id'|'state'|'createdAt'> & {id?:string}){
 const previous=(await offlineJobs(job.actor)).filter(j=>j.state==='pending'&&j.kind===job.kind&&j.inspection.id===job.inspection.id&&j.observationId===job.observationId&&job.kind!=='comment');
 for(const item of previous)await removeOfflineJob(item.id,job.actor);
 const item:OfflineJob={...job,id:job.id||crypto.randomUUID(),state:'pending',createdAt:new Date().toISOString()};await saveOfflineJob(item);return item;
}
let syncing:string|null=null;
export async function synchronizeOffline(actor:string){
 if(syncing||!navigator.onLine)return;syncing=actor;
 try{
  const cloud=await import('./cloud-store');const {supabaseClient}=await import('./supabase');
  const {data:{session}}=await supabaseClient().auth.getSession();if(session?.user.id!==actor)return;
  const blocked=new Set<string>();
  for(const job of await offlineJobs(actor)){
   if(!navigator.onLine)break;
   const identity=await supabaseClient().auth.getSession();if(identity.data.session?.user.id!==actor)break;
   if(job.state==='conflict'||blocked.has(job.inspection.id)){blocked.add(job.inspection.id);continue;}
   try{
    let result:Inspection;
    if(job.kind==='draft')result=await cloud.persistCloudInspection({...job.inspection,pendingSync:false});
    else if(job.kind==='comment'){
     await cloud.cloudRpc('berry_add_followup_comment',{p_id:job.inspection.id,p_observation:job.observationId,p_operation:job.id,p_body:job.body},actor);result=job.inspection;
    }else result=await cloud.applyOfflineCorrection(job);
    await removeOfflineJob(job.id,actor);
    // Rebase only operations queued on this device after its own successful write.
    for(const later of await offlineJobs(actor))if(later.inspection.id===job.inspection.id&&later.state==='pending'&&result.cloudRevision)await saveOfflineJob({...later,inspection:{...later.inspection,cloudRevision:result.cloudRevision}});
    window.dispatchEvent(new Event('berry-cloud-inspections-changed'));
   }catch(error){
    const text=error instanceof Error?error.message:'No se pudo sincronizar.';
    if (/activar/i.test(text)) { if(job.error!==text) await saveOfflineJob({...job,state:'pending',error:text}); blocked.add(job.inspection.id); continue; }
    if(!navigator.onLine||/conexión|conectar|consultar|no pudimos|no se pudo/i.test(text)&&!/otro dispositivo|no tiene acceso|activar/.test(text))break;
    await saveOfflineJob({...job,state:'conflict',error:text});blocked.add(job.inspection.id);
   }
  }
 }finally{syncing=null;window.dispatchEvent(new Event('berry-offline-changed'));}
}
