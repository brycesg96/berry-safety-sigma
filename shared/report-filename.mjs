/** A filesystem-safe name, derived identically by the browser and mail API. */
export function reportFilename(area, date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Fecha de inspección inválida.');
  const name = area.normalize('NFC').toLocaleUpperCase('es-PE')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/g, '') || 'ÁREA SIN NOMBRE';
  return `REG_INS_${name}_${match[3]}.${match[2]}.${match[1]}.xlsx`;
}
