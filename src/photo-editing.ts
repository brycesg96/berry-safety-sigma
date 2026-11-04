export type Point = { x: number; y: number };
export type PhotoCrop = { x: number; y: number; width: number; height: number };
export type PhotoShape = { id: string; type: 'arrow' | 'circle'; x1: number; y1: number; x2: number; y2: number; color: string; stroke: number };
export type PhotoEdit = { width: number; height: number; crop: PhotoCrop; shapes: PhotoShape[] };
export const fullPhotoEdit = (width: number, height: number): PhotoEdit => ({ width, height, crop: { x: 0, y: 0, width, height }, shapes: [] });
export function rectFromPoints(a: Point, b: Point): PhotoCrop {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}
export function arrowHead(s: PhotoShape): Point[] {
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), length = Math.min(s.stroke * 4, Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * .45);
  return [{ x: s.x2, y: s.y2 }, { x: s.x2 - length * Math.cos(angle - Math.PI / 6), y: s.y2 - length * Math.sin(angle - Math.PI / 6) }, { x: s.x2 - length * Math.cos(angle + Math.PI / 6), y: s.y2 - length * Math.sin(angle + Math.PI / 6) }];
}
export function renderEditedPhoto(source: HTMLImageElement, edit: PhotoEdit): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(edit.crop.width)); canvas.height = Math.max(1, Math.round(edit.crop.height));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-edit.crop.x, -edit.crop.y); ctx.drawImage(source, 0, 0, edit.width, edit.height);
  for (const s of edit.shapes) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (s.type === 'circle') {
      ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.max(.1, Math.abs(s.x2 - s.x1) / 2), Math.max(.1, Math.abs(s.y2 - s.y1) / 2), 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      const head = arrowHead(s); ctx.beginPath(); ctx.moveTo(head[0].x, head[0].y); ctx.lineTo(head[1].x, head[1].y); ctx.lineTo(head[2].x, head[2].y); ctx.closePath(); ctx.fill();
    }
  }
  return canvas.toDataURL('image/jpeg', .9);
}
