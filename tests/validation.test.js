import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateSubmission, RequestError } from '../jersey-store.js';

const valid = {
  studentName: ' Test Student ', class: '', jerseySize: 'M', pantsSize: 'L',
  nickname: ' sam ', jerseyNumber: 12, submissionId: randomUUID(),
};

test('normalizes names and permits optional class', () => {
  const data = validateSubmission(valid);
  assert.equal(data.studentName, 'Test Student');
  assert.equal(data.nickname, 'SAM');
  assert.equal(data.class, '');
  assert.equal(validateSubmission({ ...valid, class: '4' }).class, '4');
  assert.equal(validateSubmission({ ...valid, class: undefined }).class, '');
});

test('rejects invalid fields and number boundaries', () => {
  for (const change of [
    { studentName: '' }, { studentName: 'a'.repeat(121) }, { class: '7' },
    { nickname: 'a'.repeat(15) }, { nickname: ' ' }, { jerseySize: 'invalid' },
    { pantsSize: '' }, { jerseyNumber: 0 }, { jerseyNumber: 100 },
    { jerseyNumber: 1.5 }, { jerseyNumber: '12' }, { submissionId: '' },
  ]) assert.throws(() => validateSubmission({ ...valid, ...change }), RequestError);
  for (const body of [null, [], 'text']) assert.throws(() => validateSubmission(body), RequestError);
  for (const jerseyNumber of [1, 99]) assert.equal(validateSubmission({ ...valid, jerseyNumber }).jerseyNumber, jerseyNumber);
});
