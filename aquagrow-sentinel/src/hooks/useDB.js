import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { now, addLog } from '../data/db.js';
import { DEFTH } from '../data/constants.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const ORG_ID = 'aquagrow';

const metadata = (values) => ({
  ...clone(values),
  orgId: ORG_ID,
  ownerId: values.ownerId || null,
  createdAt: values.createdAt || serverTimestamp(),
  updatedAt: serverTimestamp(),
});

async function hashApiKey(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function seedFirestoreIfEmpty() {
  const existing = await getDocs(collection(db, 'farms'));
  if (!existing.empty) return;

  const s = migrate(seed());
  const writes = [];
  const safeDevices = await Promise.all(s.devices.map(async (device) => {
    const { key, ...safe } = device;
    return { ...safe, apiKeyHash: key ? await hashApiKey(key) : null, keyStatus: 'active' };
  }));
  const collections = {
    farms: s.farms,
    areas: s.areas,
    devices: safeDevices,
    sensors: s.sensors,
    users: s.users,
    pumps: s.pumps,
    alerts: s.alertRecs,
    notifications: s.notifs,
    activityLogs: s.logs,
    maintenance: s.maintLog,
  };

  Object.entries(collections).forEach(([name, items]) => {
    (items || []).forEach((item) => {
      writes.push(setDoc(doc(db, name, item.id), metadata(item)));
    });
  });

  writes.push(setDoc(doc(db, 'organizations', ORG_ID), metadata({
    org: s.settings.org,
    escMin: s.settings.escMin,
    confirmHw: s.settings.confirmHw,
    appVersion: '0.7.0',
    latestFirmware: '1.2.0',
  })));

  await Promise.all(writes);
}

async function syncCollection(name, nextItems, previousItems = []) {
  const nextById = new Map((nextItems || []).map((item) => [item.id, item]));
  const previousById = new Map((previousItems || []).map((item) => [item.id, item]));
  const writes = [];

  nextById.forEach((item, id) => {
    const before = previousById.get(id);
    if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
      writes.push(setDoc(doc(db, name, id), metadata(item), { merge: true }));
    }
  });

  previousById.forEach((_item, id) => {
    if (!nextById.has(id)) writes.push(deleteDoc(doc(db, name, id)));
  });

  await Promise.all(writes);
}

export default function useDB(signedIn = false, role = '', uid = '') {
  const [d, setD] = useState(() => ({
    farms: [], areas: [], devices: [], sensors: [], users: [], pumps: [],
    alertRecs: [], notifs: [], prefs: {}, snooze: {}, logs: [], maintLog: [],
    hist: {}, histSeeded: false, ingest: { stats: {}, seen: [], log: [], lastPkt: null },
    qflags: {}, thHist: [], th: DEFTH,
    settings: { org: 'Florelta Farm', escMin: 2, confirmHw: true },
    sync: { intervalMin: 5, last: null, lastTry: null, status: 'successful', pendingAt: null, error: null, lastBackup: null },
  }));
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState('');
  const previous = useRef(null);
  const collections = useRef({});

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      setError('');
      return;
    }

    let disposed = false;
    const unsubs = [];

    const ready = Promise.resolve();

    ready.then(() => {
        if (disposed) return;

        const names = ['farms', 'areas', 'devices', 'sensors', 'pumps', 'alerts', 'notifications', 'maintenance'];
        if (role === 'Owner') names.push('users', 'activityLogs');
        if (role === 'Staff') names.push('users');

        names.forEach((name) => {
          const source = name === 'notifications' && uid
            ? query(collection(db, 'notifications'), where('recipients', 'array-contains', uid))
            : collection(db, name);

          unsubs.push(onSnapshot(source, (snapshot) => {
            collections.current[name] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

            const c = collections.current;
            setD((current) => {
              const next = {
                ...current,
                farms: c.farms || current.farms,
                areas: c.areas || current.areas,
                devices: c.devices || current.devices,
                sensors: c.sensors || current.sensors,
                users: c.users || current.users,
                pumps: c.pumps || current.pumps,
                alertRecs: c.alerts || current.alertRecs,
                notifs: c.notifications || current.notifs,
                logs: c.activityLogs || current.logs,
                maintLog: c.maintenance || current.maintLog,
              };
              previous.current = clone(next);
              return migrate(clone(next));
            });
            setLoading(false);
          }, (listenerError) => {
            setError(`${name}: ${listenerError.message || 'Could not load Firebase data.'}`);
            setLoading(false);
          }));
        });

        return () => unsubs.forEach((unsubscribe) => unsubscribe());
      })
      .catch((seedError) => {
        setError(seedError.message || 'Could not initialize Firebase data.');
        setLoading(false);
      });

    return () => {
      disposed = true;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [signedIn, role, uid]);

  useEffect(() => {
    if (!signedIn || loading) return;
    // Live sensor values are written by the Cloud Function or simulator, not this browser timer.
    return;
  }, [loading, signedIn, role]);

  const update = useCallback((fn, msg, by) => {
    setD((current) => {
      const next = clone(current);
      fn(next);
      if (msg) next.logs = [{ id: 'l' + now(), t: now(), by: by || 'System', msg }, ...(next.logs || [])].slice(0, 500);

      syncCollection('farms', next.farms, current.farms);
      syncCollection('areas', next.areas, current.areas);
      syncCollection('devices', next.devices, current.devices);
      syncCollection('sensors', next.sensors, current.sensors);
      syncCollection('users', next.users, current.users);
      syncCollection('pumps', next.pumps, current.pumps);
      syncCollection('notifications', next.notifs, current.notifs);
      syncCollection('activityLogs', next.logs, current.logs);
      syncCollection('maintenance', next.maintLog, current.maintLog);

      if (next.settings) setDoc(doc(db, 'organizations', ORG_ID), metadata(next.settings), { merge: true });
      return next;
    });
  }, []);

  const replace = useCallback((data, msg, by) => {
    setD((current) => {
      const next = clone(data);
      if (msg) addLog(next, msg, by);

      syncCollection('farms', next.farms, current.farms);
      syncCollection('areas', next.areas, current.areas);
      syncCollection('devices', next.devices, current.devices);
      syncCollection('sensors', next.sensors, current.sensors);
      syncCollection('users', next.users, current.users);
      syncCollection('pumps', next.pumps, current.pumps);
      syncCollection('notifications', next.notifs, current.notifs);
      syncCollection('activityLogs', next.logs, current.logs);
      syncCollection('maintenance', next.maintLog, current.maintLog);
      return next;
    });
  }, []);

  return [d, update, replace, loading, error];
}

export const resetDB = async () => {
  const names = ['farms', 'areas', 'devices', 'sensors', 'users', 'pumps', 'alerts', 'notifications', 'activityLogs', 'maintenance'];
  await Promise.all(names.map(async (name) => {
    const snapshot = await getDocs(collection(db, name));
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  }));
  await seedFirestoreIfEmpty();
  location.reload();
};
