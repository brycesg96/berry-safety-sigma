import './corporate-brand.css';

export function HortifrutLogo({ onDark = false }: { onDark?: boolean }) {
  return <span className={`hortifrut-logo${onDark ? ' hortifrut-logo-on-dark' : ''}`}><img src={`${import.meta.env.BASE_URL}brand/hortifrut.svg`} alt="Hortifrut" width="70" height="80"/></span>;
}
