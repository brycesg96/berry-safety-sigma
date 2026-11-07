// Requested initial credential; no user's permanent password is stored here.
export const TEMPORARY_PASSWORD = '0123456789';
export function newPasswordError(password) {
  if (typeof password !== 'string' || [...password].length < 10) return 'La nueva contraseña debe tener al menos 10 caracteres.';
  if (password === TEMPORARY_PASSWORD) return 'Elige una contraseña distinta de la temporal.';
  if (new TextEncoder().encode(password).byteLength > 72) return 'La contraseña es demasiado larga.';
  return '';
}
