import { LoaderCircle } from 'lucide-react';
export function LoadingState({ label }: { label: string }) {
 return <div className="loading-panel" role="status" aria-live="polite"><p><LoaderCircle size={18} className="spin" aria-hidden="true"/>{label}</p><div className="loading-skeleton" aria-hidden="true"><span/><span/><span/></div></div>;
}
