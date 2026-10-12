import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Vercel has no key file, so the service account is passed as an env var
// (raw JSON or base64). Locally GOOGLE_APPLICATION_CREDENTIALS points to the file.
function credential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return applicationDefault();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return cert(JSON.parse(json));
}

export function getDb() {
  if (!getApps().length) initializeApp({ credential: credential() });
  return getFirestore();
}
