import { useLayoutEffect, useRef } from 'react';
import type { Inspection } from './model';

const pending = new Set<symbol>();
export const unsavedMessage = 'Hay cambios sin guardar.';
export function hasPendingChanges() { return pending.size > 0; }
export function usePendingChanges(dirty: boolean) {
  const key = useRef(Symbol('manual-save'));
  useLayoutEffect(() => {
    const id = key.current;
    if (dirty) pending.add(id); else pending.delete(id);
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (dirty) window.addEventListener('beforeunload', unload);
    return () => { pending.delete(id); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
}

// Navigation, transport metadata and display defaults are not form edits.
export function inspectionEditKey(draft: Inspection) {
  const { pendingManualSave, updatedAt, cloudRevision, storage, step, status, initialReportTexts, finalExcelStored, archiveEditOperation, ...fields } = draft;
  return JSON.stringify({ ...fields, registrationDetails: Object.fromEntries(Object.entries(draft.registrationDetails || {}).map(([id, record]) => {
    const { initialJobTitle, ...content } = record;
    return [id, content];
  })) });
}
