import { FieldValue } from 'firebase-admin/firestore';

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sizes = new Set(['S', 'M', 'L', 'XL', '2XL', '3XL']);

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// #0 is reserved for admin test records; students can only choose 1–99.
export const TEST_NUMBER = 0;

export function validateDetails(body, { allowTestNumber = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'Invalid submission.');
  }
  const studentName = typeof body.studentName === 'string' ? body.studentName.trim().replace(/\s+/g, ' ') : '';
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().toUpperCase() : '';
  const classValue = body.class ?? '';
  if (!studentName || studentName.length > 120) {
    throw new RequestError(400, 'Enter a student name of up to 120 characters.');
  }
  if (!nickname || nickname.length > 14) {
    throw new RequestError(400, 'Enter a printed name of up to 14 characters.');
  }
  if (!['4', '5', '6'].includes(classValue)) {
    throw new RequestError(400, 'Select a class: 4, 5, or 6.');
  }
  if (!sizes.has(body.jerseySize) || !sizes.has(body.pantsSize)) {
    throw new RequestError(400, 'Select valid jersey and pants sizes.');
  }
  const isTest = allowTestNumber && body.jerseyNumber === TEST_NUMBER;
  if (!isTest && (!Number.isInteger(body.jerseyNumber) || body.jerseyNumber < 1 || body.jerseyNumber > 99)) {
    throw new RequestError(400, 'Select a jersey number from 1–99.');
  }
  return {
    studentName, class: classValue, jerseySize: body.jerseySize,
    pantsSize: body.pantsSize, nickname, jerseyNumber: body.jerseyNumber,
  };
}

export function validateSubmission(body) {
  const details = validateDetails(body);
  if (typeof body.submissionId !== 'string' || !uuidV4.test(body.submissionId)) {
    throw new RequestError(400, 'Invalid submission ID. Refresh the page and try again.');
  }
  return { ...details, submissionId: body.submissionId };
}

export function parseJerseyNumber(value) {
  const number = Number(value);
  if (!/^\d{1,2}$/.test(String(value)) || number < TEST_NUMBER || number > 99) {
    throw new RequestError(400, 'Invalid jersey number.');
  }
  return number;
}

function toIso(value) {
  return value?.toDate ? value.toDate().toISOString() : null;
}

export function createJerseyStore(db, collectionName = 'juniorSoccerJerseys') {
  const collection = db.collection(collectionName);
  return {
    async takenNumbers() {
      const snapshot = await collection.select('jerseyNumber').get();
      return snapshot.docs.map(doc => doc.get('jerseyNumber')).filter(n => n !== TEST_NUMBER).sort((a, b) => a - b);
    },
    async submit(body) {
      const data = validateSubmission(body);
      const ref = collection.doc(String(data.jerseyNumber));
      const created = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const existing = snapshot.data();
          // A retry after a lost response must not create a second reservation.
          if (Object.keys(data).every(key => existing[key] === data[key])) return false;
          throw new RequestError(409, 'That jersey number has just been taken. Please choose another number.');
        }
        transaction.create(ref, { ...data, createdAt: FieldValue.serverTimestamp() });
        return true;
      });
      return { submissionId: data.submissionId, jerseyNumber: data.jerseyNumber, created, details: data };
    },
    async list() {
      const snapshot = await collection.get();
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          submissionId: data.submissionId, studentName: data.studentName, class: data.class ?? '',
          jerseySize: data.jerseySize, pantsSize: data.pantsSize, nickname: data.nickname,
          jerseyNumber: data.jerseyNumber, createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt), updatedBy: data.updatedBy ?? null,
        };
      }).sort((a, b) => a.jerseyNumber - b.jerseyNumber);
    },
    async update(currentNumber, body, adminEmail) {
      const fromNumber = parseJerseyNumber(currentNumber);
      // A test record may stay on #0 but nobody can be moved onto it.
      const details = validateDetails(body, { allowTestNumber: fromNumber === TEST_NUMBER });
      const fromRef = collection.doc(String(fromNumber));
      const toRef = collection.doc(String(details.jerseyNumber));
      await db.runTransaction(async transaction => {
        const current = await transaction.get(fromRef);
        if (!current.exists) throw new RequestError(404, 'This submission no longer exists. Refresh the dashboard.');
        const audit = { updatedAt: FieldValue.serverTimestamp(), updatedBy: adminEmail };
        if (fromNumber === details.jerseyNumber) {
          transaction.update(fromRef, { ...details, ...audit });
          return;
        }
        const target = await transaction.get(toRef);
        if (target.exists) throw new RequestError(409, `Jersey number ${details.jerseyNumber} is already taken.`);
        transaction.create(toRef, { ...current.data(), ...details, ...audit });
        transaction.delete(fromRef);
      });
      return { jerseyNumber: details.jerseyNumber };
    },
    async remove(number) {
      const ref = collection.doc(String(parseJerseyNumber(number)));
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new RequestError(404, 'This submission no longer exists. Refresh the dashboard.');
        transaction.delete(ref);
      });
    },
  };
}
