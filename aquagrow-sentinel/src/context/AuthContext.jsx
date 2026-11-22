import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
  updateEmail,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { USERS } from '../data/constants';

const ORG_ID = 'aquagrow';
const AuthContext = createContext(null);

export function authErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account is disabled. Ask an owner to enable it.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/email-already-in-use': 'An account already uses this email address.',
    'auth/weak-password': 'Use at least 8 characters with a letter and a number.',
    'auth/requires-recent-login': 'For security, sign in again before changing this password.',
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser);
      setProfile(null);

      if (unsubscribeProfile) unsubscribeProfile();

      if (!nextUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', nextUser.uid),
        async (snapshot) => {
          if (snapshot.exists()) {
            setProfile({ id: snapshot.id, ...snapshot.data() });
            setLoading(false);
          } else {
            console.warn(`AquaGrow: Creating missing user profile in Firestore for ${nextUser.uid} (${nextUser.email})...`);
            const known = USERS.find((u) => u.email?.toLowerCase() === nextUser.email?.toLowerCase());
            const newProfile = {
              name: nextUser.displayName || known?.name || nextUser.email?.split('@')[0] || 'User',
              email: nextUser.email,
              phone: known?.phone || '',
              role: known?.role || 'Staff',
              farms: known?.farms || [],
              perms: {},
              active: true,
              photoURL: nextUser.photoURL || null,
              mustChange: false,
              lastLogin: null,
              orgId: ORG_ID,
              ownerId: nextUser.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            try {
              await setDoc(doc(db, 'users', nextUser.uid), newProfile, { merge: true });
            } catch (err) {
              console.error('Failed to auto-create user profile in Firestore:', err);
              setProfile(null);
              setLoading(false);
            }
          }
        },
        (error) => {
          console.error('AquaGrow AuthContext profile snapshot error:', error);
          setProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    return result.user;
  };

  const logout = () => signOut(auth);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());

  const createUserProfile = async (uid, values) => {
    await setDoc(doc(db, 'users', uid), {
      name: values.name,
      email: values.email,
      phone: values.phone || '',
      role: values.role || 'Viewer',
      farms: values.farms || [],
      perms: values.perms || {},
      active: values.active !== false,
      photoURL: values.photoURL || null,
      mustChange: values.mustChange || false,
      lastLogin: null,
      orgId: ORG_ID,
      ownerId: values.ownerId || uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!auth.currentUser) throw new Error('You are not signed in.');
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
  };

  const updateUserProfile = async ({ name, email, phone }) => {
    if (!auth.currentUser) throw new Error('You are not signed in.');

    if (name) await updateProfile(auth.currentUser, { displayName: name });
    if (email && email !== auth.currentUser.email) await updateEmail(auth.currentUser, email.trim());

    await setDoc(doc(db, 'users', auth.currentUser.uid), {
      ...(name ? { name: name.trim() } : {}),
      ...(email ? { email: email.trim() } : {}),
      ...(phone !== undefined ? { phone: phone.trim() } : {}),
      orgId: ORG_ID,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const uploadProfilePicture = async (file) => {
    if (!auth.currentUser) throw new Error('You are not signed in.');
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG or PNG).');
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose an image under 2 MB.');

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const imageRef = ref(storage, `profilePictures/${auth.currentUser.uid}/profile.${extension}`);
    await uploadBytes(imageRef, file, { contentType: file.type });
    const photoURL = await getDownloadURL(imageRef);

    await setDoc(doc(db, 'users', auth.currentUser.uid), {
      photoURL,
      orgId: ORG_ID,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return photoURL;
  };

  const removeProfilePicture = async () => {
    if (!auth.currentUser) throw new Error('You are not signed in.');

    try {
      const folder = `profilePictures/${auth.currentUser.uid}`;
      await deleteObject(ref(storage, `${folder}/profile.jpg`));
    } catch (_error) {
      try { await deleteObject(ref(storage, `profilePictures/${auth.currentUser.uid}/profile.png`)); } catch (_pngError) {}
    }

    await setDoc(doc(db, 'users', auth.currentUser.uid), {
      photoURL: null,
      orgId: ORG_ID,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const value = useMemo(() => ({
    firebaseUser,
    profile,
    user: profile,
    loading,
    login,
    logout,
    resetPassword,
    createUserProfile,
    changePassword,
    updateUserProfile,
    uploadProfilePicture,
    removeProfilePicture,
  }), [firebaseUser, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
