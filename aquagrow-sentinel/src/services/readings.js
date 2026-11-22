import { collection, doc, getDocs, setDoc, serverTimestamp, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ORG_ID } from './base';
export async function getAll(limitCount = 1000) { const s = await getDocs(query(collection(db, 'readings'), where('orgId', '==', ORG_ID), orderBy('timestamp', 'desc'), limit(limitCount))); return s.docs.map(d => ({ id: d.id, ...d.data() })); }
export function listen(callback, error, limitCount = 1000) { return onSnapshot(query(collection(db, 'readings'), where('orgId', '==', ORG_ID), orderBy('timestamp', 'desc'), limit(limitCount)), callback, error); }
export async function create(id, values) { await setDoc(doc(db, 'readings', id), { ...values, orgId: ORG_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
