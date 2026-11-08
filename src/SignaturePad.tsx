import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Check, Eraser, LoaderCircle, Undo2 } from 'lucide-react';
import { Modal } from './components';
import { prepareSignature } from './registration';
import type { Evidence } from './model';

type Point = { x: number; y: number };
const WIDTH = 900, HEIGHT = 360;
export function SignaturePad({ onConfirm, onClose }: { onConfirm: (signature: Evidence) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), strokes = useRef<Point[][]>([]), pointer = useRef<number | null>(null);
  const [hasInk, setHasInk] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const render = () => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.strokeStyle = '#173c33'; ctx.fillStyle = '#173c33'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of strokes.current) {
      if (!stroke.length) continue;
      ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y);
      if (stroke.length === 1) { ctx.arc(stroke[0].x, stroke[0].y, 2, 0, Math.PI * 2); ctx.fill(); }
      else { for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y); ctx.stroke(); }
    }
  };
  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(WIDTH, (event.clientX - bounds.left) / bounds.width * WIDTH)), y: Math.max(0, Math.min(HEIGHT, (event.clientY - bounds.top) / bounds.height * HEIGHT)) };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || pointer.current !== null || event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId;
    strokes.current.push([point(event)]); setHasInk(true); setError(''); render();
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId || busy) return;
    event.preventDefault(); strokes.current[strokes.current.length - 1].push(point(event)); render();
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const save = async () => {
    if (busy || !hasInk || !canvas.current) return;
    setBusy(true); setError('');
    try {
      const ctx = canvas.current.getContext('2d'); if (!ctx) throw new Error('No se pudo registrar la firma.');
      const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
      let left = WIDTH, top = HEIGHT, right = -1, bottom = -1;
      for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (pixels[(y * WIDTH + x) * 4 + 3]) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      if (right < left) throw new Error('Registra tu firma antes de guardarla.');
      const output = document.createElement('canvas'); output.width = right - left + 33; output.height = bottom - top + 33;
      const target = output.getContext('2d'); if (!target) throw new Error('No se pudo registrar la firma.');
      target.drawImage(canvas.current, left, top, right - left + 1, bottom - top + 1, 16, 16, right - left + 1, bottom - top + 1);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo guardar la firma.')), 'image/png'));
      onConfirm(await prepareSignature(new File([blob], 'Firma registrada.png', { type: 'image/png' })));
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo guardar la firma.'); }
    finally { setBusy(false); }
  };
  return <Modal title="Registrar firma" wide onClose={() => !busy && onClose()}>
    <p className="modal-description">Firma dentro del recuadro con el dedo, un lápiz táctil o el mouse.</p>
    <div className="signature-pad"><canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Área para registrar la firma" tabIndex={0} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { pointer.current = null; }}/></div>
    <div className="signature-pad-tools"><button type="button" className="button button-outline" disabled={!hasInk || busy} onClick={() => { strokes.current.pop(); pointer.current = null; setHasInk(strokes.current.length > 0); render(); }}><Undo2 size={16}/>Deshacer</button><button type="button" className="button button-outline" disabled={!hasInk || busy} onClick={() => { strokes.current = []; pointer.current = null; setHasInk(false); render(); }}><Eraser size={16}/>Limpiar</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="button button-primary" disabled={!hasInk || busy} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}Guardar firma</button></div>
  </Modal>;
}
