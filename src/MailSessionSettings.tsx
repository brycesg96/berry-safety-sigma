import { useState } from 'react';
import { Field } from './components';
import { mailEndpoint, storeMailSession, useMailSession } from './mail-session';
export function MailSessionSettings() {
  const session=useMailSession(), [key,setKey]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const endpoint=mailEndpoint('/api/mail/session');
  async function activate(){
    if(busy || !key.trim() || !endpoint)return;
    setBusy(true);setError('');
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key.trim()}`},body:JSON.stringify({action:'session.create'}),signal:AbortSignal.timeout(60000),redirect:'error',credentials:'omit',cache:'no-store'});
      const data=await response.json();const expiresAt=Date.parse(data.expires_at);
      if(!response.ok || data.ok!==true || typeof data.access_token!=='string' || !data.access_token.startsWith('berry.') || !Number.isFinite(expiresAt) || expiresAt<=Date.now() || expiresAt>Date.now()+9*60*60*1000)throw new Error(data.code==='UNAUTHORIZED'?'La clave de configuración no es válida.':data.code==='RATE_LIMITED'?'Espera un minuto antes de repetir.':response.status===404?'Actualiza el backend en Render con Manual Deploy → Deploy latest commit.':'No se pudo activar la sesión. Revisa que Render esté disponible.');
      storeMailSession({token:data.access_token,expiresAt});
    }catch(e){setError(e instanceof Error && e.name==='Error'?e.message:'No se pudo conectar con Render para activar los envíos.');}
    finally{setKey('');setBusy(false);}
  }
  return <section className="mail-session-settings"><h3>Activación de envíos</h3>
    {session?<><p className="notice" role="status">Envíos habilitados en esta pestaña hasta las {new Intl.DateTimeFormat('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}).format(session.expiresAt)}. Puedes enviar varios informes sin volver a introducir la clave.</p><button type="button" className="button button-outline" onClick={()=>storeMailSession(null)}>Desactivar en esta pestaña</button></>:<>
      <p>Activa los envíos una vez para esta sesión de pruebas. La autorización dura ocho horas y se conserva al recargar esta pestaña.</p>
      <Field label="Clave de configuración" hint="Usa MAKE_TEST_API_TOKEN de Render una sola vez. La clave no se guarda.">{p=><input {...p} type="password" autoComplete="off" value={key} maxLength={512} disabled={busy} onChange={e=>setKey(e.target.value)}/>}</Field>
      <button type="button" className="button button-primary" disabled={busy || !key.trim() || !endpoint} onClick={()=>void activate()}>{busy?'Activando…':'Activar envíos'}</button>
    </>}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
  </section>;
}
