import { useEffect, useRef } from 'react';
import { ArrowRight, Check, CheckCheck, ClipboardCheck, FileCheck2, HeartHandshake, Leaf, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import type { SafetyKind } from './safety-documents';
import { SAFETY_LABELS } from './safety-documents';

/** An illustration of the workflow, never a simulated record or dashboard. */
export function SafetyScene({ selected = ['ATS', 'PETAR', 'CHECKLIST'], ready = false }: { selected?: SafetyKind[]; ready?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    void import('./safety-scene-motion').then(({ installSafetySceneMotion }) => {
      if (!cancelled && root.current) dispose = installSafetySceneMotion(root.current);
    }).catch(() => { /* The complete illustration is visible without motion. */ });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className="safety-scene" ref={root} aria-hidden="true">
    <div className="safety-scene-halo"/>
    <div className="safety-scene-frame">
      <div className="safety-scene-top"><span><ShieldCheck size={18}/>berry.</span><small>YO SEGURO</small><i/></div>
      <div className="safety-scene-caption"><span>Un buen día empieza</span><strong>con un trabajo seguro.</strong></div>
      <div className="safety-scene-papers">{(['ATS', 'PETAR', 'CHECKLIST'] as const).map((kind, index) => <div className={`safety-scene-paper safety-scene-paper-${index}${selected.includes(kind) ? ' is-selected' : ''}`} key={kind}>
        <span className="safety-scene-paper-icon">{kind === 'ATS' ? <ShieldCheck size={24}/> : kind === 'PETAR' ? <FileCheck2 size={24}/> : <ClipboardCheck size={24}/>}</span>
        <strong>{SAFETY_LABELS[kind]}</strong><span className="safety-scene-lines"><i/><i/><i/></span><span className="safety-scene-paper-check"><Check size={12}/></span>
      </div>)}</div>
      <div className="safety-scene-bottom"><span><ShieldCheck size={15}/>{ready ? 'Listo para enviar' : 'Cada tarea cuenta'}</span><span>Tu seguridad, primero<Leaf size={13}/></span></div>
    </div>
    <div className="safety-scene-note safety-scene-note-top"><span><HeartHandshake size={21}/></span><div><strong>Nos cuidamos juntos.</strong><small>En cada paso, en cada tarea.</small></div></div>
    <div className="safety-scene-note safety-scene-note-bottom"><span><CheckCheck size={24}/></span><div><strong>{ready ? 'Todo preparado.' : 'Lo que haces importa.'}</strong><small>{ready ? 'Revisa y envía tus documentos.' : 'La prevención empieza contigo.'}</small></div></div>
  </div>;
}

export function SafetyWelcome({ onGuestAccess, disabled }: { onGuestAccess?: () => void; disabled: boolean }) {
  return <section className="safety-welcome" aria-label="Bienvenido a Berry Safety">
    <span className="safety-welcome-eyebrow"><span/>Un equipo. Un mismo cuidado.</span>
    <p className="safety-welcome-title">La seguridad<br/>{' '}empieza <em>contigo.</em></p>
    <p className="safety-welcome-copy">Observa, actúa y cuida a tu equipo. Un solo espacio para tus inspecciones, acciones correctivas y documentos de seguridad.</p>
    <SafetyScene/>
    {onGuestAccess && <div className="safety-welcome-guest"><span className="safety-welcome-guest-icon"><Upload size={22}/></span><div><strong>¿Vienes a enviar tus documentos?</strong><p>Tu ATS, PETAR o checklist tiene su espacio.</p></div><button type="button" className="button" disabled={disabled} onClick={onGuestAccess}>Ir a Yo Seguro<ArrowRight size={17}/></button></div>}
    <div className="safety-welcome-signature"><ShieldCheck size={15}/>Seguridad que se construye entre todos.<span>Berry Safety · Hortifrut</span></div>
  </section>;
}

export function SafetyDocumentHelp() {
  return <section className="safety-document-help" aria-labelledby="safety-document-help-title"><div><span className="safety-help-eyebrow"><Sparkles size={15}/>Te acompañamos</span><h2 id="safety-document-help-title">Todo claro, antes de enviar.</h2><p>Resolvamos esas pequeñas dudas.</p></div><div className="safety-help-questions">
    <details><summary>¿Necesito una cuenta?<ArrowRight size={17}/></summary><p>Puedes enviar tus documentos desde Yo Seguro con tu nombre, área y lugar de trabajo. La consulta de documentos se realiza con una cuenta autorizada.</p></details>
    <details><summary>¿Puedo adjuntar varios documentos?<ArrowRight size={17}/></summary><p>Sí. Marca ATS, PETAR o Checklist y añade uno o varios archivos en cada tipo. Todos compartirán la misma actividad, Sede y Lugar de Trabajo. Se admiten PDF, JPG, PNG y WebP de hasta 10 MB por archivo y 50 archivos por envío.</p></details>
    <details><summary>¿Cómo sé que se recibieron?<ArrowRight size={17}/></summary><p>Al terminar verás tu constancia con la cantidad de documentos y la fecha y hora de recepción. Espera esa confirmación antes de salir. Si hay un problema de conexión, puedes reintentar desde el mismo formulario.</p></details>
  </div></section>;
}
