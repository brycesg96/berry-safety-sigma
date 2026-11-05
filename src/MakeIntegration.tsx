import { useRef, useState } from 'react';
import { CheckCircle2, FlaskConical, Info, LoaderCircle, Send } from 'lucide-react';
import { MailSessionSettings } from './MailSessionSettings';
import { mailEndpoint, storeMailSession, useMailSession } from './mail-session';
import { SectionTitle } from './components';

type Receipt = { ok: boolean; receipt?: 'http_accepted' | 'rejected' | 'unconfirmed'; request_id?: string; upstream_status?: number; submitted_at?: string; email_requested?: boolean; message?: string; code?: string };
export function MakeIntegration() {
  const endpoint = mailEndpoint('/api/integrations/make/test');
  const session = useMailSession();
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Receipt | null>(null);
  const pending = useRef(false); const requestId = useRef<string | null>(null);
  async function sendTest() {
    if (!endpoint || !session || pending.current) return;
    pending.current = true; setBusy(true); setReceipt(null);
    requestId.current ||= crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.token}`, 'Idempotency-Key': requestId.current }, body: JSON.stringify({ action: 'make.test' }), signal: AbortSignal.timeout(15000), credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if(response.status===401)storeMailSession(null);
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') throw new Error();
      const result = data as Receipt;
      if (response.ok && result.ok === true && result.receipt === 'http_accepted' && Number.isInteger(result.upstream_status) && result.upstream_status! >= 200 && result.upstream_status! < 300 && result.request_id === requestId.current && result.email_requested === false) {
        setReceipt({ ok: true, receipt: 'http_accepted', request_id: result.request_id, upstream_status: result.upstream_status, submitted_at: result.submitted_at });
      } else {
        const messages: Record<string, string> = { UNAUTHORIZED: 'La sesión de envíos terminó. Actívala de nuevo arriba.', TEST_DISABLED: 'La prueba de Make está desactivada en el servidor.', RATE_LIMITED: 'Se alcanzó el límite de pruebas. Espera un minuto.', ORIGIN_NOT_ALLOWED: 'El servidor todavía no permite el origen de esta aplicación.', MAKE_REJECTED: result.upstream_status === 410 ? 'Make devolvió HTTP 410 (Gone). Revisa que el Custom webhook esté activo y que su URL sea la vigente.' : 'Make rechazó la solicitud. Revisa la configuración del escenario.' };
        setReceipt({ ok: false, receipt: result.receipt === 'rejected' ? 'rejected' : 'unconfirmed', request_id: requestId.current, upstream_status: result.upstream_status, message: messages[result.code || ''] || 'No se pudo confirmar la recepción. Revisa el historial de Make antes de repetir.' });
      }
    } catch {
      setReceipt({ ok: false, receipt: 'unconfirmed', request_id: requestId.current, message: 'No se pudo confirmar la recepción. Revisa el servidor y el historial de Make antes de repetir.' });
    } finally { pending.current = false; setBusy(false); }
  }
  return <div className="form-card make-integration"><div className="form-body">
    <SectionTitle icon={<FlaskConical size={19}/>} title="Prueba de conexión con Make" subtitle="Envía un ejemplo ficticio sin modificar tus inspecciones."/>
    <div className="notice"><Info size={18}/><p>El JSON solicita <strong>send_email: false</strong> y usa destinatarios ficticios. Antes de Outlook en Make, añade un filtro: send_email = true y mode distinto de test. Esta prueba no pasa ese filtro; el indicador por sí solo no detiene Outlook.</p></div>
    <div className="make-sample"><h3>Datos de ejemplo que recibirá Make</h3><dl><div><dt>Inspección</dt><dd>IH-año-001 · Fecha de Perú · Código de ejemplo, sin reserva</dd></div><div><dt>Fundo y área</dt><dd>Fundo de prueba - Armonía 2 · Taller de Maquinaria</dd></div><div><dt>Personas</dt><dd>Ana de Prueba (inspector) · Juan de Prueba (responsable)</dd></div><div><dt>Destinatarios</dt><dd>Para, CC y CCO con direcciones @example.invalid</dd></div><div><dt>Mensaje</dt><dd>Asunto de prueba, cuerpo HTML y Excel ficticio para configurar los campos de Make</dd></div></dl></div>
    {!endpoint ? <p className="notice" role="status">API de pruebas pendiente de alojamiento.</p> : <MailSessionSettings/>}
    <div className="make-actions"><button type="button" className="button button-primary" disabled={!endpoint || !session || busy} onClick={() => void sendTest()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}Probar conexión con Make</button>{receipt && <button type="button" className="button button-outline" disabled={busy} onClick={() => { requestId.current = null; setReceipt(null); }}>Preparar otra prueba</button>}</div>
    {receipt && <div className={`notice ${receipt.ok ? 'make-accepted' : 'notice-error'}`} role={receipt.ok ? 'status' : 'alert'}>{receipt.ok ? <CheckCircle2 size={20}/> : <Info size={20}/>}<div><strong>{receipt.ok ? `Make aceptó la solicitud (HTTP ${receipt.upstream_status}).` : receipt.receipt === 'rejected' && Number.isInteger(receipt.upstream_status) ? `Make rechazó la solicitud (HTTP ${receipt.upstream_status}).` : 'Recepción no confirmada'}</strong><p>{receipt.ok ? 'Esto confirma la aceptación HTTP, no la ejecución completa del escenario ni el envío de correo.' : receipt.message}</p>{receipt.request_id && <small>ID de prueba: {receipt.request_id}</small>}</div></div>}
  </div></div>;
}
