import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateSubmission, RequestError } from '../jersey-store.js';

const valid = {
  studentName: ' Test Student ', class: '4', jerseySize: 'M', pantsSize: 'L',
  nickname: ' sam ', jerseyNumber: 12, submissionId: randomUUID(),
};

test('normalizes names and requires a valid class', () => {
  const data = validateSubmission(valid);
  assert.equal(data.studentName, 'Test Student');
  assert.equal(data.nickname, 'SAM');
  assert.equal(data.class, '4');
  for (const classValue of ['3', '4', '5', '6']) {
    assert.equal(validateSubmission({ ...valid, class: classValue }).class, classValue);
  }
  for (const classValue of ['', undefined, null, 4]) {
    assert.throws(() => validateSubmission({ ...valid, class: classValue }), RequestError);
  }
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
