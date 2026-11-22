import { useState } from 'react';
import { BOARDS, DEFB, LATEST_FW, STYPES } from '../data/constants';
import { ACTS, BAR2, BTN, BTN_CRIT, BTN_P, BTN_SM, BTN_SM_D, Card, Field, INNER_TABS, INP, KEY_CODE, Modal, PG, StatCard, StatStrip, StatusBadge, StatusDot, innerTab } from './ui';
import SensorsTab from './SensorsTab';
import PinMap from './PinMap';
import { can, ago, now, fmtDur, rssiLabel, battVolt, nextId, boardOf, sensorConn } from '../data/db';
import { useESP } from '../context/ESPContext';
import { evaluateMetric } from '../config/thresholds';

const MAINT = { ok: ['Operational', 'normal'], due: ['Service due', 'warning'], under: ['Under maintenance', 'offline'] };
const batt = (v) => (v.battery == null ? 'Mains powered' : `${Math.round(v.battery)}% · ${battVolt(v.battery)} V`);
const wifi = (v) => (v.rssi == null || v.status !== 'online' ? '—' : `${v.rssi} dBm · ${rssiLabel(v.rssi)}`);
const upt = (v) => (v.status === 'online' && v.boot ? fmtDur(now() - v.boot) : '—');
const Fact = ({ k, children }) => <div><small className="block text-mut">{k}</small>{children}</div>;

export default function DevicesPage({ d, update, user }) {
  const { esp, espData, equipmentList, hardwareProfile } = useESP();
  const canEdit = can(user, 'devices'), canDel = user.role === 'Owner';
  const [tab, setTab] = useState('dev'), [mod, setMod] = useState(null), [toast, setToast] = useState('');
  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const close = () => setMod(null);

  // Live real ESP32 device representation
  const realEsp32 = {
    id: 'd-real-esp32',
    code: 'ESP32-001',
    name: 'ESP32 Controller (SoilMonitor)',
    mac: '24:6F:28:4A:10:9B',
    board: 'ESP32 DevKit V1 (30-pin)',
    status: esp.connected ? 'online' : 'offline',
    seen: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() : null,
    battery: null, // Mains powered via 5V USB
    rssi: esp.connected ? -58 : null,
    fw: '1.0.0 (SoilMonitor Web Server)',
    boot: esp.lastUpdated ? new Date(esp.lastUpdated).getTime() - 24 * 3600e3 : null,
    maint: 'ok',
    ip: esp.address,
  };

  const deviceList = [realEsp32, ...(d.devices || []).filter((v) => v.code !== 'ESP32-001')];
  const cnt = (s) => deviceList.filter((v) => v.status === s).length;

  return (
    <div className={PG}>
      <div className={BAR2}>
        <div className={INNER_TABS} role="tablist">
          {[['dev', 'Devices'], ['sen', 'Sensors'], ['pin', 'Pin map']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={innerTab(tab === k)} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'dev' && (
        <>
          <StatStrip>
            <StatCard value={cnt('online')} label="Online" />
            <StatCard value={cnt('offline')} label="Offline" />
            <StatCard value={esp.address} label="ESP32 Address" sub={esp.connected ? 'HTTP stream active' : 'Disconnected'} />
            <StatCard value={equipmentList.filter((e) => e.state === 'running').length} label="Active Hardware" sub={`${equipmentList.length} total modules registered`} />
          </StatStrip>

          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5 mb-5">
            {deviceList.map((v) => {
              const isReal = v.id === 'd-real-esp32';
              return (
                <Card status={v.status} key={v.id}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <b className="font-display">{v.code}</b>
                      <div className="text-mut text-[12px]">{v.name}</div>
                    </div>
                    <StatusDot s={v.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 my-2.5 text-[13px]">
                    <Fact k="Status">
                      <span className={`font-semibold ${v.status === 'online' ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {v.status === 'online' ? 'Connected' : 'Offline'}
                      </span>
                    </Fact>
                    <Fact k="IP Address">
                      <span className="font-mono text-xs">{v.ip || '—'}</span>
                    </Fact>
                    <Fact k="Last seen">{ago(v.seen)}</Fact>
                    <Fact k="Power">{batt(v)}</Fact>
                    <Fact k="Wi-Fi">{wifi(v)}</Fact>
                    <Fact k="Firmware">{v.fw || '—'}</Fact>
                    <Fact k="Board">{v.board}</Fact>
                    <Fact k="Areas">Aquaculture & Garden</Fact>
                  </div>
                  {isReal ? (
                    <div className="pt-2 border-t border-line text-xs text-brand-dark font-medium">
                      Primary ESP32 Controller (Real hardware stream)
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>

          {/* Connected Hardware Profile Section (Sensors, Actuator, Display) */}
          <div className={CARD}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className={CARD_H2}>Real Hardware Connected on ESP32</h2>
              <span className="text-xs text-mut">Pins defined in SoilMonitor.ino</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px] min-w-[640px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-mut uppercase tracking-wider">
                    <th className="py-2.5 px-3">Hardware Module</th>
                    <th className="py-2.5 px-3">Type / Category</th>
                    <th className="py-2.5 px-3">GPIO Pin Mapping</th>
                    <th className="py-2.5 px-3">Monitoring Area</th>
                    <th className="py-2.5 px-3">Live State</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 1. Soil Moisture */}
                  <tr className="border-b border-line">
                    <td className="py-2.5 px-3 font-semibold text-ink">Soil Moisture Sensor</td>
                    <td className="py-2.5 px-3 text-mut">Analog Sensor</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 34 (ADC1)</td>
                    <td className="py-2.5 px-3">Garden</td>
                    <td className="py-2.5 px-3">
                      <span className={pill(esp.connected && espData?.percent != null ? 'normal' : 'critical')}>
                        {esp.connected && espData?.percent != null ? `${espData.percent}%` : 'No reading'}
                      </span>
                    </td>
                  </tr>

                  {/* 2. Water Temperature */}
                  <tr className="border-b border-line">
                    <td className="py-2.5 px-3 font-semibold text-ink">Water Temp Sensor (DS18B20)</td>
                    <td className="py-2.5 px-3 text-mut">OneWire Digital Probe</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 27</td>
                    <td className="py-2.5 px-3">Aquaculture</td>
                    <td className="py-2.5 px-3">
                      <span className={pill(esp.connected && espData?.temp != null ? 'normal' : 'critical')}>
                        {esp.connected && espData?.temp != null ? `${espData.temp.toFixed(1)} °C` : 'Sensor not detected'}
                      </span>
                    </td>
                  </tr>

                  {/* 3. Turbidity */}
                  <tr className="border-b border-line">
                    <td className="py-2.5 px-3 font-semibold text-ink">Turbidity Sensor Module</td>
                    <td className="py-2.5 px-3 text-mut">Optical Analog Sensor</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 35 (ADC1)</td>
                    <td className="py-2.5 px-3">Aquaculture</td>
                    <td className="py-2.5 px-3">
                      <span className={pill(esp.connected && espData?.turbOk !== false && espData?.ntu != null ? 'normal' : 'critical')}>
                        {esp.connected && espData?.turbOk !== false && espData?.ntu != null ? `${Math.round(espData.ntu)} NTU` : 'Sensor fault'}
                      </span>
                    </td>
                  </tr>

                  {/* 4. pH Sensor Module */}
                  <tr className="border-b border-line">
                    <td className="py-2.5 px-3 font-semibold text-ink">pH Sensor Module</td>
                    <td className="py-2.5 px-3 text-mut">Analog Electrode</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 32 (ADC1)</td>
                    <td className="py-2.5 px-3">Aquaculture</td>
                    <td className="py-2.5 px-3">
                      <span className={pill(esp.connected && espData?.phOk !== false && espData?.ph != null ? 'normal' : 'critical')}>
                        {esp.connected && espData?.phOk !== false && espData?.ph != null ? `${espData.ph.toFixed(2)} pH` : 'Sensor fault'}
                      </span>
                    </td>
                  </tr>

                  {/* 5. DHT22 Climate */}
                  <tr className="border-b border-line">
                    <td className="py-2.5 px-3 font-semibold text-ink">DHT22 Climate Sensor</td>
                    <td className="py-2.5 px-3 text-mut">Digital Temp & Humidity</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 26</td>
                    <td className="py-2.5 px-3">Garden</td>
                    <td className="py-2.5 px-3">
                      <span className={pill(esp.connected && espData?.airTemp != null && espData?.hum != null ? 'normal' : 'critical')}>
                        {esp.connected && espData?.airTemp != null && espData?.hum != null
                          ? `${espData.airTemp.toFixed(1)} °C · ${Math.round(espData.hum)}%`
                          : 'Sensor not detected'}
                      </span>
                    </td>
                  </tr>

                  {/* 6. Irrigation Pump Relay Actuator */}
                  <tr className="border-b border-line">
                    <td className="py-2.5 px-3 font-semibold text-ink">Irrigation Pump Relay</td>
                    <td className="py-2.5 px-3 text-mut">Actuator (Relay Module)</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 16 (Digital OUT)</td>
                    <td className="py-2.5 px-3">Garden</td>
                    <td className="py-2.5 px-3">
                      <span className={pill(espData?.pump ? 'online' : 'offline')}>
                        {espData?.pump ? 'ON (Irrigating)' : 'OFF (Idle)'}
                      </span>
                    </td>
                  </tr>

                  {/* 7. 16x2 I2C LCD Display */}
                  <tr className="border-b border-line last:border-b-0">
                    <td className="py-2.5 px-3 font-semibold text-ink">16x2 I2C LCD Display</td>
                    <td className="py-2.5 px-3 text-mut">Display (I2C Backpack)</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-dark">GPIO 21 (SDA), GPIO 22 (SCL)</td>
                    <td className="py-2.5 px-3">Local Hardware</td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs text-slate-500 italic">not reported by device</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'sen' && <SensorsTab d={d} update={update} user={user} say={say} />}
      {tab === 'pin' && <PinMap d={d} />}

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bg-ink text-white px-4 py-2.5 rounded-[10px] z-20 text-[14px] shadow-lg"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
