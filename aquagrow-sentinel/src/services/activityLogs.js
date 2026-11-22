import { collection, doc, getDocs, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ORG_ID } from './base';
export async function getAll() { const s = await getDocs(collection(db, 'activityLogs')); return s.docs.map(d => ({ id: d.id, ...d.data() })); }
export function listen(callback, error) { return onSnapshot(collection(db, 'activityLogs'), callback, error); }
export async function create(id, values) { await setDoc(doc(db, 'activityLogs', id), { ...values, orgId: ORG_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
