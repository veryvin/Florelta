import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, getFirestore, query, where } from 'firebase/firestore';

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
const credential = await signInWithEmailAndPassword(auth, 'owner@aquagrow.ph', 'Owner123');
const uid = credential.user.uid;

const collections = ['farms', 'areas', 'devices', 'sensors', 'pumps', 'alerts', 'notifications', 'activityLogs', 'maintenance', 'thresholdChanges', 'readings', 'readingHourly', 'readingDaily'];

for (const name of collections) {
  const source = name === 'notifications'
    ? query(collection(db, name), where('orgId', '==', 'aquagrow'), where('recipients', 'array-contains', uid))
    : query(collection(db, name), where('orgId', '==', 'aquagrow'));

  const snapshot = await getDocs(source);
  await Promise.all(snapshot.docs.map((item) => deleteDoc(doc(db, name, item.id))));
  console.log(`Cleared ${name}: ${snapshot.size}`);
}

await signOut(auth);
console.log('All operational dummy data cleared.');
