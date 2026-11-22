import { useState, useMemo } from 'react';
import { M, STYPES } from '../data/constants';
import { BTN, BTN_CRIT, BTN_P, BTN_SM, BTN_SM_D, BTN_SM_P, CARD, CARD_H2, Field, Modal, pill } from './ui';
import { can, metricsOf, freePins, sensorConn, calibState, ago, now, nextId } from '../data/db';
import { useESP } from '../context/ESPContext';

const CAL = { ok: ['Calibrated', 'normal'], due: ['Due', 'warning'], never: ['Not calibrated', 'offline'], failed: ['Failed', 'critical'] };
const CONN = { connected: 'normal', disconnected: 'critical', offline: 'offline' };

function SensorForm({ d, sensor, onSave, onClose }) {
  const [f, setF] = useState({ type: sensor?.type || 'moisture', dev: sensor?.dev || d.devices[0]?.id || '', pin: sensor ? String(sensor.pin) : '', area: sensor?.area || '' });
  const [err, setErr] = useState({});
  const pins = freePins(d, f.dev, f.type, sensor?.id);
  const pin = pins.includes(Number(f.pin)) ? f.pin : '';
  const areas = d.areas.filter((a) => a.dev === f.dev);
  const area = areas.some((a) => a.id === f.area) ? f.area : '';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const x = {};
    if (!f.dev) x.dev = 'Select an ESP32 device.';
    if (!pin) x.pin = pins.length ? 'Select a GPIO pin.' : `No free ${STYPES[f.type].pin} pins on this device.`;
    if (area && d.sensors.some((s) => s.id !== sensor?.id && s.area === area && s.type === f.type)) x.area = `This area already has a ${M[f.type].n.toLowerCase()} sensor.`;
    setErr(x);
    if (!Object.keys(x).length) onSave({ id: sensor?.id, type: f.type, dev: f.dev, pin: Number(pin), area: area || null });
  };
  return (
    <Modal title={sensor ? `Edit ${sensor.id}` : 'Register sensor'} onClose={onClose}
      foot={<><button className={BTN} onClick={onClose}>Cancel</button><button className={BTN_P} onClick={submit}>{sensor ? 'Save changes' : 'Register sensor'}</button></>}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Sensor type" cls="full"><select value={f.type} onChange={set('type')}>{Object.entries(STYPES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select></Field>
        <Field label="ESP32 device" err={err.dev}><select value={f.dev} onChange={set('dev')}>{d.devices.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</select></Field>
        <Field label={`GPIO pin (${STYPES[f.type].pin})`} err={err.pin}>
          <select value={pin} onChange={set('pin')}><option value="">Select pin</option>{pins.map((p) => <option key={p} value={p}>GPIO{p}</option>)}</select>
        </Field>
        <Field label="Monitoring area" err={err.area} cls="full">
          <select value={area} onChange={set('area')}><option value="">Not assigned</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <small className="text-mut font-normal">Only areas assigned to the selected ESP32 are listed.</small>
        </Field>
      </div>
    </Modal>
  );
}

export function CalForm({ s, onSave, onClose }) {
  const [res, setRes] = useState('Pass'), [note, setNote] = useState('');
  return (
    <Modal title={`Record calibration · ${s.id}`} onClose={onClose}
      foot={<><button className={BTN} onClick={onClose}>Cancel</button><button className={BTN_P} onClick={() => onSave({ t: now(), result: res, note: note.trim() })}>Save record</button></>}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Result"><select value={res} onChange={(e) => setRes(e.target.value)}><option>Pass</option><option>Fail</option></select></Field>
        <Field label="Date"><input value={new Date().toLocaleDateString()} disabled /></Field>
        <Field label="Notes (optional)" cls="full"><textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function SensorsTab({ d, update, user, say }) {
  const { esp, espData } = useESP();
  const canEdit = can(user, 'devices'), canDel = user.role === 'Owner';
  const [mod, setMod] = useState(null);
  const close = () => setMod(null);

  // Real Hardware Sensors connected to ESP32
  const realSensors = useMemo(() => {
    return [
      {
        id: 'S-001',
        name: 'Soil Moisture Sensor',
        type: 'moisture',
        typeName: 'Soil Moisture',
        pin: 34,
        devCode: 'ESP32-001',
        areaName: 'Garden',
        conn: esp.connected ? 'connected' : 'offline',
        reading: espData?.percent != null ? `${espData.percent}%` : '—',
        calib: 'Calibrated',
        calibStatus: 'normal',
        last: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() : null,
      },
      {
        id: 'S-002',
        name: 'Water Temp Sensor (DS18B20)',
        type: 'temp',
        typeName: 'Water Temp',
        pin: 27,
        devCode: 'ESP32-001',
        areaName: 'Aquaculture',
        conn: esp.connected && espData?.temp != null ? 'connected' : esp.connected ? 'disconnected' : 'offline',
        reading: espData?.temp != null ? `${espData.temp.toFixed(1)} °C` : '—',
        calib: 'Calibrated',
        calibStatus: 'normal',
        last: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() : null,
      },
      {
        id: 'S-003',
        name: 'Turbidity Sensor Module',
        type: 'turb',
        typeName: 'Turbidity',
        pin: 35,
        devCode: 'ESP32-001',
        areaName: 'Aquaculture',
        conn: esp.connected && espData?.turbOk !== false && espData?.ntu != null ? 'connected' : esp.connected ? 'disconnected' : 'offline',
        reading: espData?.ntu != null ? `${Math.round(espData.ntu)} NTU` : '—',
        calib: 'Calibrated',
        calibStatus: 'normal',
        last: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() : null,
      },
      {
        id: 'S-004',
        name: 'pH Sensor Module',
        type: 'ph',
        typeName: 'pH Level',
        pin: 32,
        devCode: 'ESP32-001',
        areaName: 'Aquaculture',
        conn: esp.connected && espData?.phOk !== false && espData?.ph != null ? 'connected' : esp.connected ? 'disconnected' : 'offline',
        reading: espData?.ph != null ? `${espData.ph.toFixed(2)}` : '—',
        calib: 'Calibrated',
        calibStatus: 'normal',
        last: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() : null,
      },
      {
        id: 'S-005',
        name: 'DHT22 Climate Sensor',
        type: 'hum',
        typeName: 'Air Temp & Humidity',
        pin: 26,
        devCode: 'ESP32-001',
        areaName: 'Garden',
        conn: esp.connected && espData?.hum != null ? 'connected' : esp.connected ? 'disconnected' : 'offline',
        reading: espData?.airTemp != null && espData?.hum != null ? `${espData.airTemp.toFixed(1)} °C · ${Math.round(espData.hum)}%` : '—',
        calib: 'Calibrated',
        calibStatus: 'normal',
        last: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() : null,
      },
    ];
  }, [esp.connected, esp.lastUpdated, espData]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
        {Object.entries(STYPES).map(([k, t]) => (
          <div className={`${CARD} p-3.5`} key={k}>
            <b className="font-display">{t.name}</b>
            <div className="text-mut text-[13px]">{t.pin} input · 1 connected on ESP32</div>
          </div>
        ))}
      </div>
      <div className={CARD}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={CARD_H2}>Sensors Active on Hardware</h2>
          <span className="text-xs text-mut">5 live sensors connected to ESP32</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px] min-w-[760px]">
            <thead>
              <tr>
                {['Sensor', 'Type', 'ESP32 · Pin', 'Area', 'Connection', 'Live Reading', 'Calibration', 'Last Update'].map((h) => (
                  <th key={h} className="text-left text-mut font-semibold p-2 border-b-2 border-line whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {realSensors.map((s) => (
                <tr key={s.id}>
                  <td className="py-[9px] px-2 border-b border-line align-middle">
                    <b className="font-display">{s.id}</b>
                    <div className="text-xs text-mut">{s.name}</div>
                  </td>
                  <td className="py-[9px] px-2 border-b border-line align-middle">{s.typeName}</td>
                  <td className="py-[9px] px-2 border-b border-line align-middle font-mono text-xs">{s.devCode} · GPIO{s.pin}</td>
                  <td className="py-[9px] px-2 border-b border-line align-middle">{s.areaName}</td>
                  <td className="py-[9px] px-2 border-b border-line align-middle">
                    <span className={pill(CONN[s.conn] || 'offline')}>{s.conn}</span>
                  </td>
                  <td className="py-[9px] px-2 border-b border-line align-middle font-semibold text-ink">{s.reading}</td>
                  <td className="py-[9px] px-2 border-b border-line align-middle">
                    <span className={pill(s.calibStatus)}>{s.calib}</span>
                  </td>
                  <td className="py-[9px] px-2 border-b border-line align-middle text-mut text-xs">{ago(s.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
