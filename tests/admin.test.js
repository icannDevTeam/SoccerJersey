import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../admin-auth.js';
import { parseJerseyNumber, validateDetails } from '../jersey-store.js';
import { createNotifier } from '../notifier.js';

test('passwords are stored as salted scrypt hashes', async () => {
  const first = await hashPassword('correct horse');
  const second = await hashPassword('correct horse');
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.ok(!JSON.stringify(first).includes('correct horse'));
  assert.equal(await verifyPassword('correct horse', first.passwordSalt, first.passwordHash), true);
  assert.equal(await verifyPassword('wrong', first.passwordSalt, first.passwordHash), false);
});

test('admin edits are validated like student submissions', () => {
  const details = validateDetails({
    studentName: '  Jane   Doe ', class: '4', jerseySize: 'M', pantsSize: 'L', nickname: ' jane ', jerseyNumber: 7,
  });
  assert.deepEqual(details, {
    studentName: 'Jane Doe', class: '4', jerseySize: 'M', pantsSize: 'L', nickname: 'JANE', jerseyNumber: 7,
  });
  assert.throws(() => validateDetails({ ...details, jerseyNumber: 100 }), { status: 400 });
  assert.throws(() => validateDetails({ ...details, nickname: 'A'.repeat(15) }), { status: 400 });
  assert.throws(() => validateDetails({ ...details, jerseyNumber: 0 }), { status: 400 });
  assert.equal(validateDetails({ ...details, jerseyNumber: 0 }, { allowTestNumber: true }).jerseyNumber, 0);
});

test('route jersey numbers must be 0-99 (0 is the admin test record)', () => {
  assert.equal(parseJerseyNumber('7'), 7);
  assert.equal(parseJerseyNumber('0'), 0);
  for (const value of ['100', '7.5', '-1', 'abc', '007']) {
    assert.throws(() => parseJerseyNumber(value), { status: 400 });
  }
});

test('email notifications stay disabled without SMTP settings', async () => {
  const notifier = createNotifier({ NOTIFY_EMAIL: 'iluito@binus.edu' });
  assert.equal(notifier.enabled, false);
  await notifier.submission({});
});
