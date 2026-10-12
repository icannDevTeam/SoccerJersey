import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDb } from './firebase.js';
import { createJerseyStore, RequestError } from './jersey-store.js';
import { createAdminAuth, SESSION_HOURS } from './admin-auth.js';
import { createNotifier } from './notifier.js';
import { buildExcelReport } from './excel-report.js';

const db = getDb();
const onVercel = Boolean(process.env.VERCEL);
const store = createJerseyStore(db);
const auth = createAdminAuth(db);
const notifier = createNotifier();
const secureCookies = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' || onVercel;
const SESSION_COOKIE = 'jersey_admin';

const staticFiles = new Map([
  ['/', ['jersey-form.html', 'text/html; charset=utf-8']],
  ['/jersey-form.html', ['jersey-form.html', 'text/html; charset=utf-8']],
  ['/admin', ['admin.html', 'text/html; charset=utf-8']],
  ['/images/logo.jpe', ['images/logo.jpe', 'image/jpeg']],
  ['/images/size_chart.png', ['images/size_chart.png', 'image/png']],
]);

const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function json(response, status, data, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...baseHeaders,
    ...headers,
  });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new RequestError(415, 'Send the request as JSON.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) throw new RequestError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'Invalid JSON request.');
  }
}

function readCookie(request, name) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
}

function checkOrigin(request) {
  const origin = request.headers.origin;
  try {
    if (origin && new URL(origin).host === request.headers.host) return;
  } catch {}
  throw new RequestError(403, 'Request blocked. Please reload the dashboard.');
}

function clientIp(request) {
  // Vercel's edge sets x-forwarded-for itself, so it is only trusted there.
  if (onVercel) {
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

async function handleAdmin(request, response, path) {
  const method = request.method;
  if (method !== 'GET') checkOrigin(request);

  if (path === '/api/admin/login' && method === 'POST') {
    const { token, admin } = await auth.login(await readBody(request), clientIp(request));
    return json(response, 200, { admin }, { 'Set-Cookie': sessionCookie(token, SESSION_HOURS * 3600) });
  }

  const token = readCookie(request, SESSION_COOKIE);
  if (path === '/api/admin/logout' && method === 'POST') {
    await auth.logout(token);
    return json(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  const admin = await auth.session(token);
  if (!admin) return json(response, 401, { error: 'Please sign in.' }, token ? { 'Set-Cookie': sessionCookie('', 0) } : {});

  if (path === '/api/admin/me' && method === 'GET') {
    return json(response, 200, { admin, emailNotifications: notifier.enabled });
  }
  if (path === '/api/admin/submissions' && method === 'GET') {
    return json(response, 200, { submissions: await store.list() });
  }
  if (path === '/api/admin/report.xlsx' && method === 'GET') {
    const buffer = await buildExcelReport(await store.list(), admin);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="junior-soccer-jersey-report-${day}.xlsx"`,
      'Cache-Control': 'no-store',
      ...baseHeaders,
    });
    return response.end(Buffer.from(buffer));
  }
  const match = path.match(/^\/api\/admin\/submissions\/([^/]+)$/);
  if (match && method === 'PATCH') {
    return json(response, 200, await store.update(match[1], await readBody(request), admin.email));
  }
  if (match && method === 'DELETE') {
    await store.remove(match[1]);
    return json(response, 200, { ok: true });
  }
  return json(response, 404, { error: 'Not found.' });
}

export async function handler(request, response) {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/api/admin/')) return await handleAdmin(request, response, path);
    if (path === '/api/numbers' && request.method === 'GET') {
      return json(response, 200, { takenNumbers: await store.takenNumbers() });
    }
    if (path === '/api/submissions' && request.method === 'POST') {
      const result = await store.submit(await readBody(request));
      if (result.created) {
        const sending = notifier.submission(result.details).catch(error => console.error('Email notification failed:', error.code ?? error.name));
        // Serverless functions freeze after responding, so wait for the email there.
        if (onVercel) await sending;
      }
      return json(response, 201, { submissionId: result.submissionId, jerseyNumber: result.jerseyNumber });
    }
    const file = staticFiles.get(path);
    if (file && ['GET', 'HEAD'].includes(request.method)) {
      const contents = await readFile(fileURLToPath(new URL(file[0], import.meta.url)));
      response.writeHead(200, {
        'Content-Type': file[1],
        'Cache-Control': path === '/admin' ? 'no-store' : 'no-cache',
        ...baseHeaders,
      });
      return response.end(request.method === 'HEAD' ? undefined : contents);
    }
    return json(response, 404, { error: 'Not found.' });
  } catch (error) {
    if (error instanceof RequestError) return json(response, error.status, { error: error.message });
    console.error('Jersey request failed:', error.code ?? error.name);
    return json(response, 503, { error: 'Unable to reach the submission service. Please try again.' });
  }
}

export default handler;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8001);
  createServer(handler).listen(port, '0.0.0.0', () => {
    console.log(`Jersey form: http://localhost:${port}`);
    console.log(`Admin dashboard: http://localhost:${port}/admin`);
    console.log(`Email notifications: ${notifier.enabled ? 'enabled' : 'disabled (SMTP not configured)'}`);
  });
}
