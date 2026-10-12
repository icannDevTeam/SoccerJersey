import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createJerseyStore } from '../jersey-store.js';

test('Firestore atomically reserves numbers, supports retries, and persists details', async () => {
  const app = initializeApp({ credential: applicationDefault() });
  const db = getFirestore(app);
  const name = `jerseyTest_${randomUUID()}`;
  const store = createJerseyStore(db, name);
  const body = {
    studentName: 'Integration Test', class: '4', jerseySize: 'M', pantsSize: 'L',
    nickname: 'TEST', jerseyNumber: 12, submissionId: randomUUID(),
  };
  try {
    assert.deepEqual(await store.takenNumbers(), []);
    const requests = Array.from({ length: 10 }, () => ({ ...body, submissionId: randomUUID() }));
    const results = await Promise.allSettled(requests.map(data => store.submit(data)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    for (const result of results.filter(result => result.status === 'rejected')) {
      assert.equal(result.reason.status, 409);
    }
    const winner = requests[results.findIndex(result => result.status === 'fulfilled')];
    await store.submit(winner);
    assert.deepEqual(await createJerseyStore(db, name).takenNumbers(), [12]);
    const saved = (await db.collection(name).doc('12').get()).data();
    assert.equal(saved.studentName, winner.studentName);
    assert.equal(saved.class, '');
    assert.ok(saved.createdAt);
    await store.submit({ ...body, jerseyNumber: 99, submissionId: randomUUID() });
    assert.deepEqual(await store.takenNumbers(), [12, 99]);

    const edit = { ...body, studentName: 'Corrected Name', jerseyNumber: 99 };
    await assert.rejects(store.update('12', edit, 'admin@test'), { status: 409 });
    await store.update('12', { ...edit, jerseyNumber: 50 }, 'admin@test');
    assert.deepEqual(await store.takenNumbers(), [50, 99]);
    const moved = (await store.list()).find(item => item.jerseyNumber === 50);
    assert.equal(moved.studentName, 'Corrected Name');
    assert.equal(moved.submissionId, winner.submissionId);
    assert.equal(moved.createdAt, saved.createdAt.toDate().toISOString());
    assert.equal(moved.updatedBy, 'admin@test');
    await store.remove('50');
    await assert.rejects(store.remove('50'), { status: 404 });
    assert.deepEqual(await store.takenNumbers(), [99]);
  } finally {
    await Promise.all(['12', '50', '99'].map(number => db.collection(name).doc(number).delete()));
    await deleteApp(app);
  }
});
