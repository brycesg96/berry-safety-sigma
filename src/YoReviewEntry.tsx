import { ArrowUpRight, FireExtinguisher } from 'lucide-react';
import './emergency-equipment.css';
export function YoReviewEntry({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){return <button type="button" className="yo-review-entry" disabled={disabled} onClick={onClick}><span className="er-entry-icon"><FireExtinguisher size={25} aria-hidden="true"/></span><span><strong>¡Yo Reviso!</strong><small>Inspección de Equipos de Emergencia</small></span><ArrowUpRight size={20} aria-hidden="true"/></button>;}
