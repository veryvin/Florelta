import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

const accounts = [
  { name: 'Maria Santos', email: 'owner@aquagrow.ph', password: 'Owner123', role: 'Owner', phone: '+63 917 000 0001', farms: [] },
  { name: 'Juan Dela Cruz', email: 'staff@aquagrow.ph', password: 'Staff123', role: 'Staff', phone: '+63 917 000 0002', farms: [] },
  { name: 'Pedro Lim', email: 'staff2@aquagrow.ph', password: 'Staff123', role: 'Staff', phone: '+63 917 000 0004', farms: [] },
  { name: 'Ana Reyes', email: 'viewer@aquagrow.ph', password: 'Viewer123', role: 'Viewer', phone: '+63 917 000 0003', farms: [] },
];

async function ensureAccount(account) {
  let user;
  let isNew = false;
  try {
    const result = await createUserWithEmailAndPassword(auth, account.email, account.password);
    user = result.user;
    isNew = true;
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error;
    const result = await signInWithEmailAndPassword(auth, account.email, account.password);
    user = result.user;
  }

  const profile = isNew ? {
    name: account.name,
    email: account.email,
    phone: account.phone,
    role: account.role,
    farms: account.farms,
    perms: {},
    active: true,
    photoURL: null,
    mustChange: false,
    lastLogin: null,
    orgId: 'aquagrow',
    ownerId: user.uid,
    createdAt: serverTimestamp(),
  } : {
    name: account.name,
    email: account.email,
    phone: account.phone,
  };

  await setDoc(doc(db, 'users', user.uid), {
    ...profile,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await signOut(auth);
  return user.uid;
}

let ownerUid;
for (const account of accounts) {
  const uid = await ensureAccount(account);
  if (account.role === 'Owner') ownerUid = uid;
  console.log(`Ready: ${account.email}`);
}

await signInWithEmailAndPassword(auth, 'owner@aquagrow.ph', 'Owner123');
await setDoc(doc(db, 'organizations', 'aquagrow'), {
  org: 'AquaGrow Sentinel Farm',
  appVersion: '0.7.0',
  latestFirmware: '1.2.0',
  escMin: 2,
  confirmHw: true,
  orgId: 'aquagrow',
  ownerId: ownerUid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

await signOut(auth);
console.log('AquaGrow accounts and organization ready. No operational sample data was added.');
