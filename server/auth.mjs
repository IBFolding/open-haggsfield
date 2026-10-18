import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const hash = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function passwordHash(value) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(value, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return salt + ':' + key.toString('hex');
}
export async function passwordMatches(value, stored) {
  const [salt, hex] = stored.split(':');
  const key = await scrypt(value, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
export async function limited(db, key, limit = 12, windowMs = 900000) {
  const now = Date.now();
  await db.prepare('DELETE FROM rate_limits WHERE until_at < ?').run(now);
  await db.prepare('INSERT INTO rate_limits(key,count,until_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1').run(hash(key), now + windowMs);
  return (await db.prepare('SELECT count FROM rate_limits WHERE key=?').get(hash(key))).count > limit;
}
export async function sessionUser(db, req) {
  const value = /(?:^|;\s*)oh_account=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  if (!value) return null;
  return (await db.prepare('SELECT users.* FROM sessions JOIN users ON sessions.user_id=users.id WHERE sessions.hash=? AND expires>?').get(hash(value), Date.now())) || null;
}
export async function issueSession(db, res, id, secure) {
  const value = token();
  await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  await db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(value), id, Date.now() + 7 * 86400000);
  res.cookie('oh_account', value, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/api',
    maxAge: 7 * 86400000
  });
}
export const vaultId = user => hash('account:' + user.id);
