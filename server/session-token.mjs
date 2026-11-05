import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
export const SESSION_MS = 8 * 60 * 60 * 1000;
const equal = (a,b) => timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const signature = (payload,key) => createHmac('sha256',key).update(`berry-mail-session-v1:${payload}`).digest('base64url');
export function issueMailSession(key,origin,now=Date.now()) {
  const expiresAt=now+SESSION_MS;
  const payload=Buffer.from(JSON.stringify({version:1,origin,issuedAt:now,expiresAt,nonce:randomUUID()})).toString('base64url');
  return {token:`berry.${payload}.${signature(payload,key)}`,expiresAt};
}
export function authorizedMail(authorization,key,origin,now=Date.now()) {
  if(typeof authorization!=='string' || !authorization.startsWith('Bearer ') || key.length<32)return false;
  const token=authorization.slice(7);
  // Keep compatibility with the previous deployed client while it is upgraded.
  if(equal(token,key))return true;
  if(token.length>2048)return false;
  const parts=token.split('.');
  if(parts.length!==3 || parts[0]!=='berry' || !equal(parts[2],signature(parts[1],key)))return false;
  try {
    const value=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return value.version===1 && typeof value.origin==='string' && value.origin===origin && Number.isSafeInteger(value.issuedAt) && Number.isSafeInteger(value.expiresAt) && value.expiresAt-value.issuedAt===SESSION_MS && value.issuedAt<=now && value.expiresAt>now && typeof value.nonce==='string';
  }catch{return false;}
}
