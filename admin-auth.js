import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { RequestError } from './jersey-store.js';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return { passwordSalt: salt.toString('base64'), passwordHash: hash.toString('base64') };
}

export async function verifyPassword(password, passwordSalt, passwordHash) {
  const expected = Buffer.from(passwordHash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(passwordSalt, 'base64'), expected.length, SCRYPT_OPTIONS);
  return timingSafeEqual(actual, expected);
}

const tokenHash = token => createHash('sha256').update(token).digest('hex');
const dummy = await hashPassword(randomBytes(16).toString('hex'));

export function createAdminAuth(db) {
  const users = db.collection('adminUsers');
  const sessions = db.collection('adminSessions');
  const failures = new Map();

  function checkThrottle(key) {
    const entry = failures.get(key);
    if (entry && entry.lockedUntil > Date.now()) {
      throw new RequestError(429, 'Too many failed sign-in attempts. Please wait 15 minutes and try again.');
    }
  }

  function recordFailure(key) {
    const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) {
      entry.count = 0;
      entry.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
    }
    failures.set(key, entry);
    if (failures.size > 5000) {
      for (const [item, value] of failures) if (value.lockedUntil < Date.now()) failures.delete(item);
    }
  }

  return {
    async login(body, ip) {
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!email || !password || email.length > 200 || password.length > 200) {
        throw new RequestError(400, 'Enter your email and password.');
      }
      const key = `${ip}|${email}`;
      checkThrottle(key);
      const snapshot = await users.doc(email).get();
      const user = snapshot.exists ? snapshot.data() : null;
      // Always run scrypt so response time does not reveal whether an account exists.
      const valid = await verifyPassword(password, user?.passwordSalt ?? dummy.passwordSalt, user?.passwordHash ?? dummy.passwordHash);
      if (!user || !valid) {
        recordFailure(key);
        throw new RequestError(401, 'Incorrect email or password.');
      }
      failures.delete(key);
      const token = randomBytes(32).toString('base64url');
      await sessions.doc(tokenHash(token)).set({
        email, expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000), createdAt: new Date(),
      });
      return { token, admin: { email, name: user.name, position: user.position } };
    },

    async session(token) {
      if (!token || token.length > 100) return null;
      const ref = sessions.doc(tokenHash(token));
      const snapshot = await ref.get();
      if (!snapshot.exists) return null;
      const { email, expiresAt } = snapshot.data();
      if (expiresAt.toDate() <= new Date()) {
        await ref.delete().catch(() => {});
        return null;
      }
      const user = await users.doc(email).get();
      if (!user.exists) return null;
      return { email, name: user.get('name'), position: user.get('position') };
    },

    async logout(token) {
      if (token && token.length <= 100) await sessions.doc(tokenHash(token)).delete();
    },
  };
}
