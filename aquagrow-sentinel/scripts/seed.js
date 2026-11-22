import admin from 'firebase-admin';
import crypto from 'node:crypto';
import { seed, migrate } from '../src/data/db.js';

const ORG_ID = 'aquagrow';

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'aquagrow-dd5b0' });

const auth = admin.auth();
const db = admin.firestore();

const timestampFields = (values) => ({
  ...values,
  orgId: ORG_ID,
  ownerId: values.ownerId || 'u1',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

async function ensureAuthUser(account) {
  try {
    await auth.getUser(account.uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid: account.uid,
      email: account.email,
      password: account.password,
      displayName: account.name,
      emailVerified: true,
    });
  }

  await auth.updateUser(account.uid, {
    email: account.email,
    displayName: account.name,
    disabled: false,
  });
}

async function writeCollection(name, items) {
  const batch = db.batch();
  for (const item of items || []) {
    batch.set(db.collection(name).doc(item.id), timestampFields(item), { merge: true });
  }
  if (items?.length) await batch.commit();
}

async function main() {
  const accounts = [
    { uid: 'u1', name: 'Maria Santos', email: 'owner@aquagrow.ph', password: 'Owner123', role: 'Owner', phone: '+63 917 000 0001', farms: [] },
    { uid: 'u2', name: 'Juan Dela Cruz', email: 'staff@aquagrow.ph', password: 'Staff123', role: 'Staff', phone: '+63 917 000 0002', farms: ['f1', 'f2'] },
    { uid: 'u4', name: 'Pedro Lim', email: 'staff2@aquagrow.ph', password: 'Staff123', role: 'Staff', phone: '+63 917 000 0004', farms: ['f2'] },
    { uid: 'u3', name: 'Ana Reyes', email: 'viewer@aquagrow.ph', password: 'Viewer123', role: 'Viewer', phone: '+63 917 000 0003', farms: ['f1'] },
  ];

  for (const account of accounts) await ensureAuthUser(account);

  const data = migrate(seed());

  await db.collection('organizations').doc(ORG_ID).set(timestampFields({
    org: data.settings.org,
    appVersion: '0.7.0',
    latestFirmware: '1.2.0',
    escMin: data.settings.escMin,
    confirmHw: data.settings.confirmHw,
  }));

  for (const account of accounts) {
    await db.collection('users').doc(account.uid).set(timestampFields({
      name: account.name,
      email: account.email,
      role: account.role,
      phone: account.phone,
      farms: account.farms,
      perms: {},
      active: true,
      photoURL: null,
      mustChange: false,
      lastLogin: null,
    }), { merge: true });
  }

  await writeCollection('farms', data.farms);
  await writeCollection('areas', data.areas);
  await writeCollection('devices', data.devices.map((device) => {
    const { key, ...safeDevice } = device;
    return {
      ...safeDevice,
      apiKeyHash: crypto.createHash('sha256').update(key).digest('hex'),
      keyStatus: 'active',
    };
  }));
  await writeCollection('sensors', data.sensors);
  await writeCollection('pumps', data.pumps);
  await writeCollection('alerts', data.alertRecs);
  await writeCollection('notifications', data.notifs);
  await writeCollection('activityLogs', data.logs);
  await writeCollection('maintenance', data.maintLog);

  console.log('AquaGrow seed completed for aquagrow-dd5b0');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
