import { useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Field, Modal } from './components';
import { Select } from './Select';
import { usePendingChanges } from './manual-save';
import { organizationLabel } from './organization-label';
import { inspectionListToday } from './inspection-list-filters';
import type { YoManagement } from './yo-seguro';
import { emergencyCode, saveEmergencyEquipment } from './emergency-equipment';
import type { EmergencyEquipment } from './emergency-equipment';

export function EmergencyCatalog({equipment,code,catalog,onClose,onSaved}:{equipment:EmergencyEquipment|null;code:string;catalog:YoManagement[];onClose:()=>void;onSaved:(equipment:EmergencyEquipment)=>void}){
 const id=useRef(equipment?.id||crypto.randomUUID());
 const initial=useRef({code:equipment?.code||emergencyCode(code),kind:'extinguisher',area_id:equipment?.area_id||'',location:equipment?.location||'',serial_number:equipment?.serial_number||'',brand:equipment?.brand||'',agent:equipment?.agent||'',capacity:equipment?.capacity||'',manufacture_year:equipment?.manufacture_year?.toString()||'',expiry_month:equipment?.expiry_month||'',last_hydro_date:equipment?.last_hydro_date||'',next_hydro_date:equipment?.next_hydro_date||'',enabled:equipment?.enabled??true});
 const [values,setValues]=useState(initial.current),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false);
 usePendingChanges(JSON.stringify(values)!==JSON.stringify(initial.current)||busy);
 const update=(key:keyof typeof values,value:string|boolean)=>{setValues(previous=>({...previous,[key]:value}));setError('');};
 const valid=!!values.code.trim()&&!!values.area_id&&!!values.location.trim();
 const text=(key:'serial_number'|'brand'|'agent'|'capacity',label:string,placeholder='')=><Field label={label}>{props=><input {...props} maxLength={160} readOnly={busy} value={values[key]} placeholder={placeholder} onChange={event=>update(key,event.target.value)}/>}</Field>;
 return <Modal title={equipment?'Editar ficha del extintor':'Registrar extintor'} wide onClose={()=>!busy&&onClose()}>
  <p className="modal-description">Esta ficha se cargará al buscar el código. Los cambios conservan las inspecciones anteriores.</p>
  <form className="er-catalog-form" onSubmit={event=>{event.preventDefault();if(!valid||flight.current)return;flight.current=true;setBusy(true);setError('');void saveEmergencyEquipment(id.current,equipment?.revision||0,{...values,manufacture_year:values.manufacture_year?Number(values.manufacture_year):null}).then(onSaved).catch(problem=>setError(problem instanceof Error?problem.message:'No pudimos guardar la ficha.')).finally(()=>{flight.current=false;setBusy(false);});}}>
   <div className="er-form-grid"><Field label="Código" required hint={equipment?'El código identifica este equipo y se conserva.':undefined}>{props=><input {...props} required maxLength={80} readOnly={busy||!!equipment} value={values.code} onChange={event=>update('code',event.target.value)} placeholder="Ej. EXT-001"/>}</Field><Field label="Área del equipo" required>{props=><Select {...props} searchable disabled={busy} value={values.area_id} onChange={value=>update('area_id',value)} placeholder="Selecciona el área" options={catalog.flatMap(management=>management.areas.map(area=>({value:area.id,label:organizationLabel(area.name),group:organizationLabel(management.name)})))}/>}</Field></div>
   <Field label="Ubicación (edificio, piso o área)" required>{props=><input {...props} required maxLength={250} readOnly={busy} value={values.location} onChange={event=>update('location',event.target.value)} placeholder="Ej. Taller de mantenimiento · Piso 1"/>}</Field>
   <div className="er-form-grid">{text('serial_number','N° de serie')}{text('brand','Marca')}{text('agent','Tipo / agente extintor','Ej. PQS')}{text('capacity','Capacidad','Ej. 6 kg')}<Field label="Año de fabricación">{props=><input {...props} type="number" min={1900} max={Number(inspectionListToday().slice(0,4))} readOnly={busy} value={values.manufacture_year} onChange={event=>update('manufacture_year',event.target.value)}/>}</Field><Field label="Vencimiento (mes y año)">{props=><input {...props} type="month" readOnly={busy} value={values.expiry_month} onChange={event=>update('expiry_month',event.target.value)}/>}</Field><Field label="Última prueba hidrostática">{props=><input {...props} type="date" readOnly={busy} value={values.last_hydro_date} onChange={event=>update('last_hydro_date',event.target.value)}/>}</Field><Field label="Próxima prueba hidrostática">{props=><input {...props} type="date" min={values.last_hydro_date||undefined} readOnly={busy} value={values.next_hydro_date} onChange={event=>update('next_hydro_date',event.target.value)}/>}</Field></div>
   <label className="er-enabled"><input type="checkbox" checked={values.enabled} disabled={busy} onChange={event=>update('enabled',event.target.checked)}/>Equipo activo en el catálogo</label>
   {error&&<p className="error-message" role="alert">{error}</p>}
   <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary er-primary" disabled={busy||!valid}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>}Guardar ficha</button></div>
  </form>
 </Modal>;
}
