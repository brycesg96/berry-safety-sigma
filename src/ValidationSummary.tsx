import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
export function ValidationSummary({ errors, root }: { errors: Record<string, string>; root: RefObject<HTMLDivElement | null> }) {
 const [links,setLinks]=useState<{id:string;label:string}[]>([]);
 useLayoutEffect(()=>{setLinks(Array.from(root.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') || []).filter(element=>element.id).map(element=>{
  const associated=root.current?.querySelector(`label[for="${CSS.escape(element.id)}"]`);
  const label=associated?.textContent || element.getAttribute('aria-label') || element.querySelector('legend')?.textContent || 'Campo pendiente';
  const number=element.closest('.responsible-row')?.querySelector('.responsible-number')?.textContent;
  return {id:element.id,label:`${number?`Responsable ${number} — `:''}${label.replace('*','').trim()}`};
 }));},[errors,root]);
 if(!Object.keys(errors).length)return null;
 return <section className="validation-summary" role="alert" aria-label="Campos por completar"><strong>Revisa estos datos para continuar</strong><ul>{links.length?links.map(link=><li key={link.id}><a href={`#${link.id}`} onClick={event=>{event.preventDefault();const field=document.getElementById(link.id);field?.scrollIntoView({block:'center',behavior:'instant'});(field?.matches('fieldset')?field.querySelector<HTMLInputElement>('input'):field)?.focus({preventScroll:true});}}>{link.label}</a></li>):<li>Completa los requisitos indicados en este paso.</li>}</ul></section>;
}
