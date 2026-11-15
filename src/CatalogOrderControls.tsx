import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp } from 'lucide-react';
import type { CatalogMove } from './catalog-order';

export function CatalogOrderControls({ label, index, count, disabled, onMove }: { label: string; index: number; count: number; disabled: boolean; onMove: (move: CatalogMove) => void }) {
  return <div className="catalog-order-controls" role="group" aria-label={`Orden de ${label}`}>
    {([{ move: 'first', text: 'Mover al principio', icon: ChevronsUp }, { move: 'up', text: 'Subir', icon: ArrowUp }, { move: 'down', text: 'Bajar', icon: ArrowDown }, { move: 'last', text: 'Mover al final', icon: ChevronsDown }] as const).map(({ move, text, icon: Icon }) => <button key={move} type="button" className="icon-button" title={text} aria-label={`${text}: ${label}`} disabled={disabled || (move === 'first' || move === 'up' ? index === 0 : index === count - 1)} onClick={() => onMove(move)}><Icon size={16}/></button>)}
  </div>;
}
