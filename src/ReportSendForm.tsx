import { useRef, useState } from 'react';
import { Info, LoaderCircle, Send } from 'lucide-react';
import { Field } from './components';
import type { Inspection } from './model';
import { inspectionCopies } from './accounts';
import { buildExcel } from './export';
import { saveEmailReceipt } from './follow-up';
function endpoint() {
  const configured = import.meta.env.VITE_MAKE_TEST_API_URL?.trim();
  if (!configured) return import.meta.env.DEV ? '/api/inspections/send' : '';
  try {
    const url = new URL(configured, window.location.origin);
    if (url.username || url.password || url.search || url.hash || /(^|\.)make\.com$/i.test(url.hostname) || url.pathname !== '/api/integrations/make/test') return '';
    if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) return '';
    url.pathname = '/api/inspections/send'; return url.href;
  } catch { return ''; }
}
export function ReportSendForm({ inspection, actorId, onPrepare, onChange, onBusyChange }: { inspection: Inspection; actorId: string; onPrepare: () => Promise<Inspection>; onChange: (d: Inspection) => void; onBusyChange?: (busy: boolean) => void }) {
  const [token,setToken]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const lock=useRef(false), api=endpoint(), receipt=inspection.emailDelivery;
  const cc=receipt ? inspection.emailCc ?? inspectionCopies(inspection.responsibles) : inspectionCopies(inspection.responsibles);
  const accepted=receipt?.state==='accepted';
  async function submit() {
    if(lock.current || !api || !token.trim() || accepted || cc.length>50 || inspection.responsibles.length>50)return;
    lock.current=true;setBusy(true);onBusyChange?.(true);setError('');let frozen:Inspection|null=null;
    const request = async (body: unknown) => {
      const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token.trim()}`,'Idempotency-Key':inspection.id},body:JSON.stringify(body),signal:AbortSignal.timeout(60000),credentials:'omit',redirect:'error',cache:'no-store'});
      const data=await response.json();return {response,data};
    };
    try {
      const check=await request({action:'inspection.check'});
      if(!check.response.ok || check.data.enabled!==true) {
        const messages:Record<string,string>={REPORTS_DISABLED:'Falta habilitar MAKE_REPORTS_ENABLED=true en Render, después de mapear Para, CC y el adjunto en Make.',UNAUTHORIZED:'La clave de API no es válida.',ORIGIN_NOT_ALLOWED:'Render no permite la conexión desde esta web.',RATE_LIMITED:'Espera un minuto antes de repetir.'};
        throw new Error(messages[check.data.code] || 'No se pudo comprobar el servicio. El informe conserva su estado actual.');
      }
      const file=await buildExcel(inspection);
      if(file.bytes.length>3*1024*1024)throw new Error('El Excel supera 3 MB. Reduce las fotos antes de enviar.');
      let binary='';for(let i=0;i<file.bytes.length;i+=32768)binary+=String.fromCharCode(...file.bytes.subarray(i,i+32768));
      frozen=await onPrepare();
      frozen=await saveEmailReceipt(frozen,actorId,{state:'pending',requestId:frozen.id,updatedAt:new Date().toISOString()});
      const {response,data}=await request({action:'inspection.send',inspection:{id:frozen.id,date:frozen.date,area:frozen.area,facility:frozen.facility,objective:frozen.objective,inspector:{name:frozen.inspector,email:frozen.inspectorEmail},responsibles:frozen.responsibles.map(p=>({name:p.name,email:p.email})),cc:frozen.emailCc || cc,observationCount:frozen.observations.length},attachment:{contentBase64:btoa(binary)}});
      const success=response.ok && data.ok===true && data.receipt==='http_accepted' && data.request_id===frozen.id && data.email_requested===true && Number.isInteger(data.upstream_status) && data.upstream_status>=200 && data.upstream_status<300;
      const state=success?'accepted':data.receipt==='rejected'?'rejected':'unconfirmed';
      const message=success?'Make aceptó el informe y el Excel. Resultado de Outlook pendiente de confirmación.':data.code==='REPORT_CHANGED'?'La API tiene otro intento de esta inspección. Revisa Make antes de enviar otra versión.':'No se confirmó la recepción correcta. Revisa el historial de Make antes de reenviar.';
      frozen=await saveEmailReceipt(frozen,actorId,{state,requestId:frozen.id,updatedAt:new Date().toISOString(),upstreamStatus:data.upstream_status,message});
      onChange(frozen);if(!success)setError(message);
    } catch(e) {
      const message=e instanceof Error?e.message:'No se pudo completar el envío.';setError(message);
      if(frozen){try{frozen=await saveEmailReceipt(frozen,actorId,{state:'unconfirmed',requestId:frozen.id,updatedAt:new Date().toISOString(),message:'Recepción no confirmada. Revisa Make antes de reenviar.'});onChange(frozen);}catch{setError('El resultado no pudo guardarse. Revisa Make antes de repetir para evitar duplicados.');}}
    } finally {lock.current=false;setBusy(false);onBusyChange?.(false);}
  }
  return <div className="report-send-form">
    <p>Se enviará un mensaje general y el informe Excel adjunto a todos los responsables seleccionados.</p>
    <p><strong>CC · Jefes y gerentes:</strong> {cc.length?cc.join(', '):'Sin correos asociados'}</p>
    <p className="local-admin-note">El Excel utiliza el formato provisional actual. El código definitivo y la sincronización de levantamientos entre dispositivos siguen pendientes.</p>
    {accepted?<p className="notice" role="status">Make aceptó el informe (HTTP {receipt.upstreamStatus}). La recepción del correo por Outlook aún no está confirmada.</p>:<>
      {receipt && <p className="notice" role="status">{receipt.state==='pending'?'Hay un intento pendiente. Revisa Make antes de repetir.':receipt.message || 'Recepción no confirmada.'} Se conserva el mismo ID para consultar el intento, sin reenvíos automáticos.</p>}
      {api?<Field label="Clave de API para enviar el informe" hint="La misma clave de Render utilizada en la prueba. Solo se mantiene en esta pantalla.">{p=><input {...p} type="password" autoComplete="off" value={token} maxLength={512} disabled={busy} onChange={e=>setToken(e.target.value)}/>}</Field>:<p className="notice">Falta conectar el backend de correo.</p>}
      <button type="button" className="button button-primary full-width" disabled={busy || !api || !token.trim() || cc.length>50 || inspection.responsibles.length>50} onClick={()=>void submit()}>{busy?<LoaderCircle className="spin" size={16}/>:<Send size={16}/>} {receipt?'Revisar recepción en Make':'Enviar informe por correo'}</button>
    </>}
    {(cc.length>50 || inspection.responsibles.length>50) && <p className="notice notice-error" role="alert">Se permiten hasta 50 destinatarios Para y 50 en CC por informe. Ajusta las asociaciones antes de enviar.</p>}
    {error && <p className="notice notice-error" role="alert"><Info size={16}/>{error}</p>}
  </div>;
}
