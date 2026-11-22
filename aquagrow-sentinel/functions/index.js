import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const ORG_ID = 'aquagrow';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Device-Key');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return false; }
  return true;
}

export const ingestReading = onRequest({ cors: false, region: 'us-central1' }, async (req, res) => {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const packet = req.body || {};
    const key = req.header('X-Device-Key');
    const deviceId = packet.deviceId;
    const sensorId = packet.sensorId;
    const areaId = packet.areaId;

    if (!key || !deviceId || !sensorId || !areaId || !packet.metric || typeof packet.value !== 'number') {
      return res.status(400).json({ error: 'Missing required packet fields' });
    }

    const deviceSnap = await db.collection('devices').doc(deviceId).get();
    if (!deviceSnap.exists) return res.status(404).json({ error: 'Unknown device' });

    const device = deviceSnap.data();
    if (device.orgId !== ORG_ID) return res.status(403).json({ error: 'Wrong organization' });
    if (!device.apiKeyHash || hash(key) !== device.apiKeyHash) {
      return res.status(401).json({ error: 'Invalid device key' });
    }

    const packetId = packet.packetId || `${deviceId}:${sensorId}:${packet.timestamp || Date.now()}`;
    const existing = await db.collection('readings').where('packetId', '==', packetId).limit(1).get();
    if (!existing.empty) return res.status(409).json({ error: 'Duplicate packet' });

    const timestamp = packet.timestamp ? Timestamp.fromMillis(Number(packet.timestamp)) : Timestamp.now();
    const readingRef = db.collection('readings').doc();

    await db.runTransaction(async (transaction) => {
      transaction.set(readingRef, {
        areaId,
        sensorId,
        deviceId,
        metric: packet.metric,
        value: packet.value,
        timestamp,
        packetId,
        backfilled: packet.backfilled === true,
        status: 'accepted',
        orgId: ORG_ID,
        ownerId: 'u1',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(db.collection('areas').doc(areaId), {
        [`r.${packet.metric}`]: packet.value,
        rt: timestamp,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(db.collection('sensors').doc(sensorId), {
        last: timestamp,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(db.collection('devices').doc(deviceId), {
        status: 'online',
        seen: timestamp,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ ok: true, readingId: readingRef.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Reading could not be stored' });
  }
});

export const acknowledgeCommand = onRequest({ cors: false, region: 'us-central1' }, async (req, res) => {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { deviceId, commandId, status, note } = req.body || {};
    const key = req.header('X-Device-Key');
    if (!deviceId || !commandId || !key || !['acknowledged', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Missing acknowledgement fields' });
    }

    const deviceSnap = await db.collection('devices').doc(deviceId).get();
    if (!deviceSnap.exists) return res.status(404).json({ error: 'Unknown device' });
    const device = deviceSnap.data();
    if (!device.apiKeyHash || hash(key) !== device.apiKeyHash) return res.status(401).json({ error: 'Invalid device key' });

    await db.collection('devices').doc(deviceId).collection('commands').doc(commandId).set({
      status,
      confirmedAt: status === 'acknowledged' ? FieldValue.serverTimestamp() : null,
      note: note || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Command acknowledgement failed' });
  }
});
