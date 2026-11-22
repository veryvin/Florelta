import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export const ORG_ID = 'aquagrow';

export function addMetadata(values, extra = {}) {
  return {
    ...values,
    orgId: ORG_ID,
    ownerId: values.ownerId || extra.ownerId || null,
    createdAt: values.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function getAll(collectionName, constraints = []) {
  const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getById(collectionName, id) {
  const snapshot = await getDoc(doc(db, collectionName, id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function createDocument(collectionName, id, values) {
  const ref = id ? doc(db, collectionName, id) : doc(collection(db, collectionName));
  await setDoc(ref, addMetadata(values), { merge: false });
  return { id: ref.id, ...values };
}

export async function updateDocument(collectionName, id, values) {
  await updateDoc(doc(db, collectionName, id), { ...values, updatedAt: serverTimestamp() });
}

export async function removeDocument(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

export function listenCollection(collectionName, callback, errorCallback, constraints = []) {
  return onSnapshot(query(collection(db, collectionName), ...constraints), callback, errorCallback);
}

export { where, orderBy, limit };
