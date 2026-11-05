import { useEffect, useState } from 'react';
export type MailSession={token:string;expiresAt:number};
const changed='berry-mail-session-changed';
let memory:MailSession|null=null;
export function mailEndpoint(path:string) {
  const configured=import.meta.env.VITE_MAKE_TEST_API_URL?.trim();
  if(!configured)return import.meta.env.DEV?path:'';
  try{
    const url=new URL(configured,window.location.origin);
    if(url.username || url.password || url.search || url.hash || /(^|\.)make\.com$/i.test(url.hostname) || url.pathname!=='/api/integrations/make/test')return '';
    if(url.protocol!=='https:' && !(import.meta.env.DEV && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))return '';
    url.pathname=path;return url.href;
  }catch{return '';}
}
const storageKey=()=>`berry-mail-session-v1:${mailEndpoint('/api/mail/session')}`;
export function readMailSession():MailSession|null {
  let value=memory;
  try{const stored=sessionStorage.getItem(storageKey());if(stored)value=JSON.parse(stored);}catch{/* Use memory if sessionStorage is unavailable. */}
  if(!value || typeof value.token!=='string' || !value.token.startsWith('berry.') || !Number.isFinite(value.expiresAt) || value.expiresAt<=Date.now())return null;
  return value;
}
export function storeMailSession(value:MailSession|null) {
  memory=value;
  try{if(value)sessionStorage.setItem(storageKey(),JSON.stringify(value));else sessionStorage.removeItem(storageKey());}catch{/* Memory still authorizes navigation within this tab. */}
  window.dispatchEvent(new Event(changed));
}
export function useMailSession() {
  const [value,setValue]=useState<MailSession|null>(readMailSession);
  useEffect(()=>{const update=()=>setValue(readMailSession());window.addEventListener(changed,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(changed,update);window.removeEventListener('storage',update);};},[]);
  useEffect(()=>{if(!value)return;const timer=setTimeout(()=>storeMailSession(null),Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[value]);
  return value;
}
