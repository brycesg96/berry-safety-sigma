import { readFile } from 'node:fs/promises';
import { eventSignature } from '../server/notifications.mjs';
const secret=process.env.MAIL_EVENTS_SECRET||'',endpoint=new URL(process.env.BERRY_MAIL_EVENTS_ENDPOINT||'https://berry-safety-api.onrender.com/api/mail/events');
if(secret.length<32||endpoint.protocol!=='https:'||endpoint.pathname!=='/api/mail/events'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!process.argv[2])throw Error('Configura el secreto privado y proporciona el archivo JSON del evento confirmado por el proveedor.');
const body=await readFile(process.argv[2],'utf8');JSON.parse(body);
const timestamp=String(Math.floor(Date.now()/1000));
const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Berry-Timestamp':timestamp,'X-Berry-Signature':`sha256=${eventSignature(secret,timestamp,body)}`},body,redirect:'error',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`No se confirmó el evento (HTTP ${response.status}). Reintenta el mismo event_id después de revisar la causa.`);
const result=await response.json();console.log(JSON.stringify({ok:result.ok,duplicate:result.duplicate}));
