import type { Inspection } from './model';
import type { Correction } from './follow-up';

/** Resolve the recorded actor, including old reports that stored the first recipient's name. */
export function correctionAuthorName(inspection: Inspection, correction?: Correction, directory: readonly { id: string; name: string }[] = []) {
  if (!correction) return '';
  return directory.find(person => person.id === correction.actorId)?.name
    || inspection.responsibles.find(person => (person.personId || person.id) === correction.actorId)?.name
    || correction.responsibleName || '';
}
