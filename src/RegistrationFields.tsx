import { useContext, useState } from 'react';
import { ImagePlus, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { Field } from './components';
import type { Inspection } from './model';
import { prepareSignature } from './registration';
import { readAccounts } from './accounts';
import type { RegistrationDetails } from './registration';
import { AccountDirectory } from './AccountDirectory';

export function RegistrationFields({ draft, personId, email, fallbackJobTitle = '', onChange }: { draft: Inspection; personId: string; email: string; fallbackJobTitle?: string; onChange: (id: string, data: RegistrationDetails) => void }) {
  const directory = useContext(AccountDirectory);
  const person = (directory || readAccounts()).find(a => a.id === personId || a.email.toLowerCase() === email.toLowerCase());
  const stored = draft.registrationDetails?.[personId];
  const jobTitle = person ? person.jobTitle : fallbackJobTitle;
  const value = draft.delivery && stored ? stored : { ...stored, jobTitle, initialJobTitle: jobTitle, date: stored?.date ?? draft.date };
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <div className="registration-fields"><div className="registration-person-data"><Field label="Cargo">{props => <div className="input-icon locked-profile-control"><LockKeyhole size={16} aria-hidden="true"/><input {...props} value={value.jobTitle} readOnly aria-readonly="true" placeholder="Sin cargo registrado" title="Cargo del perfil del responsable. No se puede editar en la inspección."/></div>}</Field><Field label="Fecha">{props => <input {...props} type="date" disabled={busy} value={value.date} onChange={e => onChange(personId, { ...value, date: e.target.value })}/>}</Field></div>
    <div className="registration-signature"><span>Firma</span>{value.signature ? <div className="signature-preview"><img src={value.signature.data} alt="Firma adjunta del responsable"/><button type="button" className="icon-button" aria-label="Quitar firma" onClick={() => onChange(personId, { ...value, signature: undefined })}><X size={15}/></button></div> : <label className="button button-outline evidence-upload">{busy ? <LoaderCircle className="spin" size={16}/> : <ImagePlus size={16}/>}Adjuntar firma<input aria-label="Adjuntar firma" type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setBusy(true); setError(''); try { const signature = await prepareSignature(file); onChange(personId, { ...value, signature }); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la firma.'); } finally { setBusy(false); } }}/></label>}{error && <p className="error-message" role="alert">{error}</p>}</div>
  </div>;
}
