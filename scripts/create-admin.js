// Usage: npm run create-admin -- <email> "<name>" "<position>"
// The password is read from ADMIN_PASSWORD or typed at a hidden prompt; it is never stored in plain text.
import { getDb } from '../firebase.js';
import { hashPassword } from '../admin-auth.js';

const [emailArg, name, position = ''] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
  console.error('Usage: npm run create-admin -- <email> "<name>" "<position>"');
  process.exit(1);
}

async function promptPassword() {
  if (!process.stdin.isTTY) throw new Error('Set ADMIN_PASSWORD or run in an interactive terminal.');
  process.stdout.write('Password: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let password = '';
  for await (const chunk of process.stdin) {
    for (const char of chunk.toString('utf8')) {
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        return password;
      }
      if (char === '\u0003') process.exit(130);
      password = char === '\u007f' ? password.slice(0, -1) : password + char;
    }
  }
  return password;
}

const password = process.env.ADMIN_PASSWORD ?? await promptPassword();
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

await getDb().collection('adminUsers').doc(email).set({
  email, name, position, role: 'admin', ...(await hashPassword(password)), updatedAt: new Date(),
});
console.log(`Admin account saved: ${email}`);
