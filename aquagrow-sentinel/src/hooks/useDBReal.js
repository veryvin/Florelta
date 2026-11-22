import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEFTH } from '../data/constants.js';

const ORG_ID = 'aquagrow';
const clone = (value) => JSON.parse(JSON.stringify(value));

const emptyDB = () => ({
  farms: [], areas: [], devices: [], sensors: [], users: [], pumps: [],
  alertRecs: [], notifs: [], prefs: {}, snooze: {}, logs: [], maintLog: [],
  hist: {}, histSeeded: false, ingest: {
    stats: { accepted: 0, invalid: 0, duplicate: 0, unauthorized: 0, suspect: 0, backfilled: 0 },
    seen: [], log: [], lastPkt: null,
  },
  qflags: {}, thHist: [], th: DEFTH,
  settings: { org: 'Florelta Farm', escMin: 2, confirmHw: true },
  sync: { intervalMin: 5, last: null, lastTry: null, status: 'successful', pendingAt: null, error: null, lastBackup: null },
});

async function syncCollection(name, nextItems, previousItems = []) {
  const nextById = new Map((nextItems || []).map((item) => [item.id, item]));
  const previousById = new Map((previousItems || []).map((item) => [item.id, item]));
  const writes = [];

  nextById.forEach((item, id) => {
    const before = previousById.get(id);
    if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
      let mapped = clone(item);
      if (name === 'areas') { mapped.farmId = item.farmId || item.farm; mapped.deviceId = item.deviceId || item.dev || null; delete mapped.farm; delete mapped.dev; }
      if (name === 'sensors') { mapped.deviceId = item.deviceId || item.dev; mapped.areaId = item.areaId || item.area || null; delete mapped.dev; delete mapped.area; }
      if (name === 'pumps') { mapped.areaId = item.areaId || item.area; delete mapped.area; }
      if (name === 'notifications') { mapped.recipients = item.recipients || item.to || []; delete mapped.to; }

      writes.push(setDoc(doc(db, name, id), {
        ...mapped, orgId: ORG_ID, ownerId: item.ownerId || null,
        updatedAt: serverTimestamp(),
        ...(before ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true }));
    }
  });

  previousById.forEach((_item, id) => {
    if (!nextById.has(id)) writes.push(deleteDoc(doc(db, name, id)));
  });

  if (writes.length) {
    await Promise.all(writes).catch((writeError) => {
      console.error(`AquaGrow Firestore write failed for ${name}:`, writeError);
      throw writeError;
    });
  }
}

export default function useDB(signedIn = false, role = '', uid = '') {
  const [d, setD] = useState(emptyDB);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!signedIn || !uid) {
      setD(emptyDB());
      setLoading(false);
      setError('');
      return;
    }

    let disposed = false;
    const unsubs = [];
    const names = ['farms', 'areas', 'devices', 'sensors', 'pumps', 'alerts', 'notifications', 'maintenance'];
    if (role === 'Owner') names.push('users', 'activityLogs');
    if (role === 'Staff') names.push('users');

    names.forEach((name) => {
      const source = name === 'notifications'
        ? query(collection(db, name), where('orgId', '==', ORG_ID), where('recipients', 'array-contains', uid))
        : query(collection(db, name), where('orgId', '==', ORG_ID));

      unsubs.push(onSnapshot(source, (snapshot) => {
        if (disposed) return;
        const items = snapshot.docs.map((item) => {
          const value = { id: item.id, ...item.data() };
          if (name === 'areas') return { ...value, farm: value.farm || value.farmId, dev: value.dev || value.deviceId, r: value.r || {}, h: value.h || {}, th: value.th || {} };
          if (name === 'sensors') return { ...value, dev: value.dev || value.deviceId, area: value.area || value.areaId };
          if (name === 'pumps') return { ...value, area: value.area || value.areaId, sessions: value.sessions || [], schedules: value.schedules || [], cmds: value.cmds || [] };
          if (name === 'notifications') return { ...value, to: value.to || value.recipients || [], readBy: value.readBy || [] };
          return value;
        });

        setD((current) => {
          const next = { ...current };
          if (name === 'farms') next.farms = items;
          if (name === 'areas') next.areas = items;
          if (name === 'devices') next.devices = items;
          if (name === 'sensors') next.sensors = items;
          if (name === 'pumps') next.pumps = items;
          if (name === 'alerts') next.alertRecs = items;
          if (name === 'notifications') next.notifs = items;
          if (name === 'users') next.users = items;
          if (name === 'activityLogs') next.logs = items;
          if (name === 'maintenance') next.maintLog = items;
          return next;
        });
        setLoading(false);
      }, (listenerError) => {
        setError(`${name}: ${listenerError.message || 'Could not load Firebase data.'}`);
        setLoading(false);
      }));
    });

    unsubs.push(onSnapshot(doc(db, 'ingestHealth', ORG_ID), (snapshot) => {
      if (disposed) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      setD((current) => ({
        ...current,
        ingest: {
          ...current.ingest,
          stats: { ...current.ingest.stats, ...(data.stats || data) },
          lastPkt: data.lastPacket || null,
        },
      }));
    }, (listenerError) => setError(`ingestHealth: ${listenerError.message}`)));

    unsubs.push(onSnapshot(collection(db, 'ingestHealth', ORG_ID, 'rejections'), (snapshot) => {
      if (disposed) return;
      const log = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setD((current) => ({ ...current, ingest: { ...current.ingest, log } }));
    }, (listenerError) => setError(`rejections: ${listenerError.message}`)));

    return () => {
      disposed = true;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [signedIn, role, uid]);

  const update = useCallback((fn, msg, by) => {
    setD((current) => {
      const next = clone(current);
      fn(next);

      syncCollection('farms', next.farms, current.farms);
      syncCollection('areas', next.areas, current.areas);
      syncCollection('devices', next.devices, current.devices);
      syncCollection('sensors', next.sensors, current.sensors);
      syncCollection('users', next.users, current.users);
      syncCollection('pumps', next.pumps, current.pumps);
      syncCollection('alerts', next.alertRecs, current.alertRecs);
      syncCollection('notifications', next.notifs, current.notifs);
      syncCollection('activityLogs', next.logs, current.logs);
      syncCollection('maintenance', next.maintLog, current.maintLog);

      if (next.settings) {
        setDoc(doc(db, 'organizations', ORG_ID), {
          org: next.settings.org,
          escMin: next.settings.escMin,
          confirmHw: next.settings.confirmHw,
          orgId: ORG_ID,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      return next;
    });
  }, []);

  const replace = useCallback((data, msg, by) => {
    setD((current) => {
      const next = clone(data);
      syncCollection('farms', next.farms, current.farms);
      syncCollection('areas', next.areas, current.areas);
      syncCollection('devices', next.devices, current.devices);
      syncCollection('sensors', next.sensors, current.sensors);
      syncCollection('users', next.users, current.users);
      syncCollection('pumps', next.pumps, current.pumps);
      syncCollection('alerts', next.alertRecs, current.alertRecs);
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
  location.reload();
};
