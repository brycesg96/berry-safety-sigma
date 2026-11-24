import { ChevronDown, Download, Eye, FileText, Paperclip, Trash2, UserRound } from 'lucide-react';
import { SAFETY_LABELS } from './safety-documents';
import type { SafetyDocument, SafetyKind } from './safety-documents';

const received = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function SafetySubmissionCard({ documents, admin, busy, onOpen, onRemove }: {
  documents: SafetyDocument[]; admin: boolean; busy: boolean;
  onOpen: (document: SafetyDocument, download?: boolean) => void;
  onRemove: (document: SafetyDocument) => void;
}) {
  const first = documents[0];
  const kinds = (['ATS', 'PETAR', 'CHECKLIST'] as SafetyKind[]).map(kind => ({ kind, count: documents.filter(file => file.kind === kind).length })).filter(item => item.count);
  return <article className="safety-submission" aria-label={`Envío de ${first.owner_name}: ${first.title}`} data-submission-id={first.batch_id || first.id}>
    <details className="safety-submission-disclosure">
    <summary className="safety-submission-heading"><span className="safety-submission-person"><UserRound size={23}/></span><div className="safety-submission-details"><span className="safety-submission-eyebrow">Enviado por</span><h4>{first.owner_name}</h4><p>{first.title}</p><small>Recibido el {received.format(new Date(first.created_at))}{first.workplace ? ` · ${first.workplace}` : ''}</small></div><div className="safety-submission-overview"><div className="safety-submission-types" aria-label="Tipos de documentos incluidos">{kinds.map(({ kind, count }) => <span key={kind}>{SAFETY_LABELS[kind]}{count > 1 && <b>{count}</b>}</span>)}</div><span className="safety-submission-attachment-count"><Paperclip size={15} aria-hidden="true"/>{documents.length} {documents.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}<ChevronDown size={18} className="safety-submission-chevron" aria-hidden="true"/></span></div></summary>
    <ul className="safety-submission-files" aria-label="Archivos adjuntos">{documents.map(document => <li className="safety-document-row" key={document.id}>
      <span className="safety-file-icon"><FileText size={21}/></span><div className="safety-document-info"><span className="safety-kind">{SAFETY_LABELS[document.kind]}</span><strong>{document.file_name}</strong><small>{size(document.file_size)}</small></div>
      <div className="safety-document-actions"><button className="button button-outline" disabled={busy} aria-label={document.batch_id ? `Ver archivo ${document.file_name}` : undefined} onClick={() => onOpen(document)}><Eye size={16}/>Ver archivo</button><button className="icon-button" disabled={busy} aria-label={`Descargar ${document.batch_id ? document.file_name : document.title}`} onClick={() => onOpen(document, true)}><Download size={18}/></button>{admin && <button className="icon-button delete-button" disabled={busy} aria-label={`Retirar ${document.batch_id ? document.file_name : document.title}`} onClick={() => onRemove(document)}><Trash2 size={17}/></button>}</div>
    </li>)}</ul>
    </details>
  </article>;
}
