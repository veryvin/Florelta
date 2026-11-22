import { collection, doc, getDocs, setDoc, serverTimestamp, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ORG_ID } from './base';
export async function getAll() { const s = await getDocs(collection(db, 'alerts')); return s.docs.map(d => ({ id: d.id, ...d.data() })); }
export function listen(callback, error) { return onSnapshot(collection(db, 'alerts'), callback, error); }
export async function create(id, values) { await setDoc(doc(db, 'alerts', id), { ...values, orgId: ORG_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
export async function update(id, values) { await setDoc(doc(db, 'alerts', id), { ...values, orgId: ORG_ID, updatedAt: serverTimestamp() }, { merge: true }); }
export async function deleteItem(id) { await deleteDoc(doc(db, 'alerts', id)); }
