import { collection, doc, onSnapshot, setDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

const ORG_ID = 'aquagrow';

export async function create(deviceId, values) {
  const ref = doc(collection(db, 'devices', deviceId, 'commands'));
  await setDoc(ref, {
    ...values,
    orgId: ORG_ID,
    ownerId: values.ownerId || null,
    status: 'pending',
    timestamp: serverTimestamp(),
    confirmedAt: null,
    note: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function listen(deviceId, callback, errorCallback) {
  return onSnapshot(query(collection(db, 'devices', deviceId, 'commands'), orderBy('timestamp', 'desc')), callback, errorCallback);
}
