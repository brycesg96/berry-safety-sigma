import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, Check, Circle, Crop, LoaderCircle, Minus, MousePointer2, Pencil, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { Modal } from './components';
import type { Evidence } from './model';
import { arrowHead, fullPhotoEdit, rectFromPoints, renderEditedPhoto } from './photo-editing';
import type { PhotoCrop, PhotoEdit, PhotoShape, Point } from './photo-editing';

type Tool = 'select' | 'arrow' | 'circle' | 'crop';
type Gesture = { kind: 'draw' | 'move' | 'resize'; id: string; start: Point; original: PhotoShape; end?: 'start' | 'end' } | { kind: 'crop'; anchor: Point };
export function PhotoViewer({ photo, onClose, onSave }: { photo: Evidence; onClose: () => void; onSave?: (photo: Evidence) => Promise<void> }) {
  const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false);
  return <Modal title={editing ? 'Editar evidencia fotográfica' : 'Evidencia fotográfica'} wide onClose={() => { if (!saving) onClose(); }}>
    {editing && onSave ? <PhotoEditor photo={photo} saving={saving} onCancel={() => setEditing(false)} onSave={async updated => { setSaving(true); try { await onSave(updated); setEditing(false); } finally { setSaving(false); } }}/>
      : <><div className="photo-viewer-stage"><img className="photo-full" src={photo.data} alt={photo.name}/>{onSave && <button type="button" className="icon-button photo-viewer-edit" aria-label="Editar imagen" title="Editar imagen" onClick={() => setEditing(true)}><Pencil size={18}/></button>}</div><p className="photo-caption">{photo.name}</p></>}
  </Modal>;
}
function PhotoEditor({ photo, saving, onCancel, onSave }: { photo: Evidence; saving: boolean; onCancel: () => void; onSave: (photo: Evidence) => Promise<void> }) {
  const [edit, setEdit] = useState<PhotoEdit | null>(null), [history, setHistory] = useState<PhotoEdit[]>([]);
  const [tool, setTool] = useState<Tool>('select'), [selected, setSelected] = useState<string | null>(null);
  const [color, setColor] = useState('#ef4444'), [thickness, setThickness] = useState(4);
  const [crop, setCrop] = useState<PhotoCrop | null>(null), [error, setError] = useState('');
  const sourceRef = useRef<HTMLImageElement | null>(null), svgRef = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null);
  const [displayWidth, setDisplayWidth] = useState(600);
  useEffect(() => {
    let active = true; const source = new Image(); source.src = photo.originalData || photo.data;
    source.decode().then(() => { if (!active) return; sourceRef.current = source; const initial = photo.editState && photo.editState.width === source.naturalWidth && photo.editState.height === source.naturalHeight ? photo.editState : fullPhotoEdit(source.naturalWidth, source.naturalHeight); setEdit(initial); setCrop(initial.crop); }).catch(() => { if (active) setError('No se pudo abrir esta imagen para editarla.'); });
    return () => { active = false; };
  }, [photo.id]);
  useEffect(() => {
    if (!svgRef.current) return; const observer = new ResizeObserver(entries => setDisplayWidth(entries[0].contentRect.width || 600)); observer.observe(svgRef.current); return () => observer.disconnect();
  }, [edit !== null]);
  if (!edit) return <div className="photo-editor-loading">{error ? <p role="alert">{error}</p> : <><LoaderCircle className="spin" size={22}/><p>Preparando imagen…</p></>}<EditorButton className="button button-outline" onClick={onCancel}>Volver a la imagen</EditorButton></div>;
  const current = edit;
  const view = tool === 'crop' ? { x: 0, y: 0, width: current.width, height: current.height } : current.crop;
  const unit = Math.max(current.width, current.height) / 600, handleSize = view.width / displayWidth * 7;
  const shape = current.shapes.find(s => s.id === selected);
  function remember() { setHistory(items => [...items.slice(-29), current]); setError(''); }
  function changeShape(changes: Partial<PhotoShape>) { if (!selected) return; remember(); setEdit(d => d && ({ ...d, shapes: d.shapes.map(s => s.id === selected ? { ...s, ...changes } : s) })); }
  function point(e: ReactPointerEvent): Point {
    const bounds = svgRef.current!.getBoundingClientRect();
    return { x: Math.max(view.x, Math.min(view.x + view.width, view.x + (e.clientX - bounds.left) / bounds.width * view.width)), y: Math.max(view.y, Math.min(view.y + view.height, view.y + (e.clientY - bounds.top) / bounds.height * view.height)) };
  }
  function capture(e: ReactPointerEvent) { svgRef.current?.setPointerCapture(e.pointerId); }
  function begin(e: ReactPointerEvent<SVGSVGElement>) {
    if (saving || e.button !== 0) return;
    const start = point(e); capture(e);
    if (tool === 'crop') { gesture.current = { kind: 'crop', anchor: start }; setCrop(rectFromPoints(start, start)); return; }
    if (tool === 'select') { setSelected(null); return; }
    remember(); const added: PhotoShape = { id: crypto.randomUUID(), type: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y, color, stroke: thickness * unit };
    setEdit(d => d && ({ ...d, shapes: [...d.shapes, added] })); setSelected(added.id); gesture.current = { kind: 'draw', id: added.id, start, original: added };
  }
  function beginShape(e: ReactPointerEvent, target: PhotoShape, end?: 'start' | 'end') {
    if (tool !== 'select' || saving || e.button !== 0) return;
    e.stopPropagation(); remember(); setSelected(target.id); setColor(target.color); setThickness(Math.max(2, Math.min(16, target.stroke / unit))); capture(e);
    gesture.current = { kind: end ? 'resize' : 'move', id: target.id, start: point(e), original: target, end };
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current; if (!active || saving) return; const p = point(e);
    if (active.kind === 'crop') { setCrop(rectFromPoints(active.anchor, p)); return; }
    const original = active.original; let changes: Partial<PhotoShape>;
    if (active.kind === 'move') {
      const dx = Math.max(-Math.min(original.x1, original.x2), Math.min(current.width - Math.max(original.x1, original.x2), p.x - active.start.x));
      const dy = Math.max(-Math.min(original.y1, original.y2), Math.min(current.height - Math.max(original.y1, original.y2), p.y - active.start.y));
      changes = { x1: original.x1 + dx, x2: original.x2 + dx, y1: original.y1 + dy, y2: original.y2 + dy };
    } else changes = active.kind === 'resize' && active.end === 'start' ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y };
    setEdit(d => d && ({ ...d, shapes: d.shapes.map(s => s.id === active.id ? { ...s, ...changes } : s) }));
  }
  function end(e: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current; gesture.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (active && active.kind === 'draw') { setEdit(d => d && ({ ...d, shapes: d.shapes.filter(s => s.id !== active.id || Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= unit * 3) })); setTool('select'); }
  }
  function chooseTool(next: Tool) { setTool(next); setSelected(null); gesture.current = null; if (next === 'crop') setCrop(current.crop); }
  function scaleSelected(factor: number) {
    if (!shape) return; const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2;
    const halfX = Math.abs(shape.x2 - shape.x1) / 2, halfY = Math.abs(shape.y2 - shape.y1) / 2;
    const limited = Math.min(factor, halfX ? Math.min(cx, current.width - cx) / halfX : factor, halfY ? Math.min(cy, current.height - cy) / halfY : factor);
    changeShape({ x1: cx + (shape.x1 - cx) * limited, x2: cx + (shape.x2 - cx) * limited, y1: cy + (shape.y1 - cy) * limited, y2: cy + (shape.y2 - cy) * limited });
  }
  const cropCorners = crop ? [{ x: crop.x, y: crop.y, ax: crop.x + crop.width, ay: crop.y + crop.height }, { x: crop.x + crop.width, y: crop.y, ax: crop.x, ay: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height, ax: crop.x + crop.width, ay: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height, ax: crop.x, ay: crop.y }] : [];
  return <div className="photo-editor">
    <div className="photo-editor-toolbar" role="group" aria-label="Herramientas de imagen">
      {([{ id: 'select', label: 'Seleccionar', icon: <MousePointer2 size={17}/> }, { id: 'arrow', label: 'Flecha', icon: <ArrowUpRight size={17}/> }, { id: 'circle', label: 'Círculo', icon: <Circle size={17}/> }, { id: 'crop', label: 'Recortar', icon: <Crop size={17}/> }] as const).map(t => <EditorButton type="button" key={t.id} aria-pressed={tool === t.id} disabled={saving} onClick={() => chooseTool(t.id)}>{t.icon}{t.label}</EditorButton>)}
      <EditorButton type="button" aria-label="Deshacer" title="Deshacer" disabled={!history.length || saving} onClick={() => { const previous = history[history.length - 1]; setEdit(previous); setHistory(items => items.slice(0, -1)); setSelected(null); setTool('select'); }}><Undo2 size={17}/></EditorButton>
      <EditorButton type="button" aria-label="Restaurar original" title="Restaurar original" disabled={saving} onClick={() => { remember(); setEdit(fullPhotoEdit(current.width, current.height)); setSelected(null); setTool('select'); }}><RotateCcw size={17}/></EditorButton>
    </div>
    <div className="photo-editor-settings"><label>Color<input aria-label="Color de la marca" type="color" value={shape?.color || color} disabled={saving} onChange={e => { setColor(e.target.value); changeShape({ color: e.target.value }); }}/></label><label>Grosor<input aria-label="Grosor de la marca" type="range" min={2} max={16} step={1} value={shape ? Math.round(shape.stroke / unit) : thickness} disabled={saving} onChange={e => { setThickness(Number(e.target.value)); changeShape({ stroke: Number(e.target.value) * unit }); }}/><output>{shape ? Math.round(shape.stroke / unit) : thickness}</output></label><div className="photo-shape-actions"><EditorButton type="button" aria-label="Reducir figura" title="Reducir figura" disabled={!shape || saving} onClick={() => scaleSelected(.85)}><Minus size={17}/></EditorButton><EditorButton type="button" aria-label="Ampliar figura" title="Ampliar figura" disabled={!shape || saving} onClick={() => scaleSelected(1.15)}><Plus size={17}/></EditorButton><EditorButton type="button" aria-label="Eliminar figura" title="Eliminar figura" disabled={!shape || saving} onClick={() => { remember(); setEdit(d => d && ({ ...d, shapes: d.shapes.filter(s => s.id !== selected) })); setSelected(null); }}><Trash2 size={17}/></EditorButton></div></div>
    <p className="photo-editor-hint">{tool === 'crop' ? 'Arrastra sobre la imagen para elegir el recorte o ajusta sus esquinas.' : tool === 'select' ? 'Selecciona una marca para moverla. Arrastra sus puntos o usa + y − para cambiar el tamaño.' : `Arrastra sobre la imagen para dibujar ${tool === 'arrow' ? 'una flecha' : 'un círculo'}.`}</p>
    <div className="photo-editor-stage"><div style={{ width: `min(100%, ${50 * view.width / view.height}vh)` }}><svg ref={svgRef} aria-label="Lienzo de edición" role="img" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} style={{ aspectRatio: `${view.width} / ${view.height}` }} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <image href={photo.originalData || photo.data} x={0} y={0} width={current.width} height={current.height}/>
      {current.shapes.map(s => s.type === 'circle' ? <ellipse key={s.id} data-shape-type="circle" data-annotation-id={s.id} cx={(s.x1 + s.x2) / 2} cy={(s.y1 + s.y2) / 2} rx={Math.abs(s.x2 - s.x1) / 2} ry={Math.abs(s.y2 - s.y1) / 2} stroke={s.color} strokeWidth={s.stroke} fill="transparent" onPointerDown={e => beginShape(e, s)}/> : <g key={s.id} data-shape-type="arrow" data-annotation-id={s.id} onPointerDown={e => beginShape(e, s)}><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={Math.max(s.stroke, unit * 18)}/><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={s.stroke} strokeLinecap="round" pointerEvents="none"/><polygon points={arrowHead(s).map(p => `${p.x},${p.y}`).join(' ')} fill={s.color} pointerEvents="none"/></g>)}
      {tool === 'select' && shape && <g className="photo-selection"><rect x={Math.min(shape.x1, shape.x2) - handleSize} y={Math.min(shape.y1, shape.y2) - handleSize} width={Math.abs(shape.x2 - shape.x1) + handleSize * 2} height={Math.abs(shape.y2 - shape.y1) + handleSize * 2} fill="none" stroke="#ffffff" strokeDasharray={`${handleSize} ${handleSize}`} strokeWidth={handleSize / 4} pointerEvents="none"/>{(['start', 'end'] as const).map(side => <circle key={side} data-handle={side} aria-label={side === 'start' ? 'Redimensionar inicio de figura' : 'Redimensionar final de figura'} cx={side === 'start' ? shape.x1 : shape.x2} cy={side === 'start' ? shape.y1 : shape.y2} r={handleSize * 1.4} fill="#ffffff" stroke="#23664d" strokeWidth={handleSize / 3} onPointerDown={e => beginShape(e, shape, side)}/>)}</g>}
      {tool === 'crop' && crop && <g className="photo-crop"><path d={`M0 0H${current.width}V${current.height}H0Z M${crop.x} ${crop.y}V${crop.y + crop.height}H${crop.x + crop.width}V${crop.y}Z`} fill="#0009" fillRule="evenodd" pointerEvents="none"/><rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="none" stroke="#fff" strokeWidth={handleSize / 3} pointerEvents="none"/>{cropCorners.map((corner, i) => <circle key={i} cx={corner.x} cy={corner.y} r={handleSize * 1.4} fill="#fff" stroke="#23664d" strokeWidth={handleSize / 3} onPointerDown={e => { if (saving) return; e.stopPropagation(); capture(e); gesture.current = { kind: 'crop', anchor: { x: corner.ax, y: corner.ay } }; }}/>)}</g>}
    </svg></div></div>
    {tool === 'crop' && <div className="photo-crop-actions"><EditorButton type="button" className="button button-outline" disabled={saving} onClick={() => setTool('select')}>Cancelar recorte</EditorButton><EditorButton type="button" className="button button-primary" disabled={saving || !crop || crop.width < 8 || crop.height < 8} onClick={() => { if (!crop) return; remember(); setEdit({ ...current, crop }); setTool('select'); setSelected(null); }}><Crop size={16}/>Aplicar recorte</EditorButton></div>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="photo-editor-footer"><EditorButton type="button" className="button button-outline" disabled={saving} onClick={onCancel}>Cancelar edición</EditorButton><EditorButton type="button" className="button button-primary" disabled={saving || tool === 'crop'} onClick={async () => { try { setError(''); if (!sourceRef.current) throw new Error('Espera a que cargue la imagen.'); await onSave({ ...photo, originalData: photo.originalData || photo.data, data: renderEditedPhoto(sourceRef.current, current), editState: current }); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.'); } }}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}Guardar cambios</EditorButton></div>
  </div>;
}

// Touch browsers may suppress the click immediately after a drawing gesture.
// Activate on touch release and ignore the matching compatibility click.
function EditorButton({ onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const handledTouch = useRef(false);
  return <button {...props} onPointerDown={e => { if (e.pointerType !== 'touch') handledTouch.current = false; }} onPointerUp={e => {
    if (e.pointerType !== 'touch' || props.disabled) return;
    const b = e.currentTarget.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return;
    e.preventDefault(); handledTouch.current = true; e.currentTarget.focus(); onClick?.(e);
  }} onClick={e => {
    if (handledTouch.current && e.detail !== 0) { handledTouch.current = false; return; }
    handledTouch.current = false; onClick?.(e);
  }}/>;
}
