import type { ReactNode } from 'react';
import { BarChart3, Building2, Check, ChevronRight, FireExtinguisher, UserRound, UsersRound } from 'lucide-react';

export function WorkspacePageHeader({title,description,eyebrow,icon,steps,stepsLabel,actions,children}:{title:string;description:string;eyebrow:string;icon:ReactNode;steps?:string[];stepsLabel?:string;actions?:ReactNode;children?:ReactNode}){
 return <header className="page-heading workspace-page-heading"><div className="workspace-heading-main"><span className="workspace-heading-icon" aria-hidden="true">{icon}</span><div className="workspace-heading-copy"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p>{children}</div>{actions&&<div className="workspace-heading-actions">{actions}</div>}</div>{steps&&<ul className="workspace-heading-steps" aria-label={stepsLabel}>{steps.map(step=><li key={step}><Check size={14} aria-hidden="true"/>{step}</li>)}</ul>}</header>;
}

type StateOption<T extends string>={value:T;label:string;icon:ReactNode;count:number};
export function WorkspaceStateFilters<T extends string>({options,value,onChange,label,announceCounts=false,className=''}:{options:StateOption<T>[];value:T;onChange:(value:T)=>void;label:string;announceCounts?:boolean;className?:string}){
 return <div className={`workspace-state-tabs ${className}`} role="group" aria-label={label}>{options.map(option=><button type="button" key={option.value} className="workspace-state-tab inspection-stat" data-filter={option.value} aria-pressed={value===option.value} aria-label={announceCounts?`${option.label}: ${option.count}`:option.label} onClick={()=>onChange(option.value)}><span className="workspace-state-icon" aria-hidden="true">{option.icon}</span><span className="workspace-state-name">{option.label}</span><strong className="workspace-state-count">{option.count}</strong></button>)}</div>;
}

export function WorkspaceSummary({items,label,loading=false,className=''}:{items:{label:string;value:number;icon?:ReactNode}[];label:string;loading?:boolean;className?:string}){
 return <dl className={`workspace-summary ${className}`} aria-label={label} aria-busy={loading}>{items.map(item=><div key={item.label}><dt>{item.icon&&<span aria-hidden="true">{item.icon}</span>}{item.label}</dt><dd>{loading?'—':item.value}</dd></div>)}</dl>;
}

type AdminSection='profile'|'admin'|'dashboard'|'organization'|'emergency';
const adminSections=[{id:'admin',label:'Gestión de Usuarios',title:'Usuarios',description:'Cuentas y accesos',icon:UsersRound},{id:'organization',label:'Gestión De Áreas E Instalaciones',title:'Áreas e Instalaciones',description:'Estructura y ubicaciones',icon:Building2},{id:'dashboard',label:'Gestión de Inspecciones',title:'Inspecciones',description:'Avance e informes',icon:BarChart3},{id:'emergency',label:'Gestión de Extintores',title:'Extintores',description:'Inventario y base anual',icon:FireExtinguisher},{id:'profile',label:'Mi perfil',title:'Mi perfil',description:'Tu información',icon:UserRound}] as const;
export function WorkspaceAdminNavigation({value,onChange,busy,dirty}:{value:string;onChange:(value:AdminSection)=>void;busy:boolean;dirty:boolean}){
 return <nav className="workspace-admin-navigation" aria-label="Cuenta y administración">{adminSections.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} aria-label={item.label} aria-current={value===item.id?'page':undefined} disabled={busy||item.id!=='profile'&&dirty} onClick={()=>onChange(item.id)}><span className="workspace-admin-icon" aria-hidden="true"><Icon size={20}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={16} aria-hidden="true"/></button>;})}</nav>;
}
