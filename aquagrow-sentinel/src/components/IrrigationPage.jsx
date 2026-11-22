import { useState } from 'react';
import { Link } from '../hooks/useRouter';
import { BAR2, CARD, CARD_H2, INNER_TABS, PG, StatCard, StatStrip, StatusDot, innerTab, pill } from './ui';
import { M } from '../data/constants';
import { ago } from '../data/db';
import { useESP } from '../context/ESPContext';
import { THRESHOLDS } from '../config/thresholds';

const fmtSec = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
const fmt = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function IrrigationPage({ d, user }) {
  const { esp, espData, alertEngine } = useESP();
  const [tab, setTab] = useState('ctl');

  const isConnected = esp.connected;
  const isPumpOn = Boolean(espData?.pump);
  const moisture = espData?.percent;
  const targetMoisture = THRESHOLDS.pump.targetMoisture; // 65%

  const sessions = alertEngine.pumpSessions || [];

  // Determine contextual pump explanation
  let pumpExplanation = 'Idle: soil moisture is adequate.';
  let pumpTone = 'bg-slate-50 border-line text-slate-700';

  if (!isConnected) {
    pumpExplanation = 'Device offline: unable to read current pump state.';
    pumpTone = 'bg-amber-50 border-amber-200 text-amber-800';
  } else if (isPumpOn) {
    pumpTone = 'bg-emerald-50 border-emerald-200 text-emerald-800';
    if (moisture != null && moisture < 30) {
      pumpExplanation = `Irrigating: soil is dry (${moisture}% < ${targetMoisture}% target).`;
    } else if (moisture != null && moisture >= targetMoisture) {
      pumpExplanation = `Irrigating: soil moisture reached ${moisture}%, nearing cutoff target (${targetMoisture}%).`;
    } else {
      pumpExplanation = `Irrigating: soil moisture (${moisture ?? '–'}%) is below ${targetMoisture}% target.`;
    }
  } else {
    // Pump is OFF
    if (moisture != null && moisture < 20) {
      pumpExplanation = 'Idle: pump in 20-second safety cooldown before next auto cycle.';
      pumpTone = 'bg-amber-50 border-amber-200 text-amber-800';
    } else if (moisture != null && moisture <= 70) {
      pumpExplanation = 'Idle: soil moisture is adequate (within safe 30–70% range).';
      pumpTone = 'bg-emerald-50 border-emerald-200 text-emerald-800';
    } else {
      pumpExplanation = 'Idle: soil moisture is high, irrigation paused.';
      pumpTone = 'bg-blue-50 border-blue-200 text-blue-800';
    }
  }

  // Check stalled condition: last 3 sessions all had <5% moisture rise
  const isStalled = sessions.length >= 3 && sessions.slice(0, 3).every((s) => s.rise < 5) && (moisture != null && moisture < 40);

  const totalIrrigationTimeToday = sessions.reduce((acc, s) => {
    const today = new Date().toDateString();
    if (new Date(s.start).toDateString() === today) {
      return acc + (s.sec || 0);
    }
    return acc;
  }, 0);

  return (
    <div className={PG}>
      <div className={BAR2}>
        <div className={INNER_TABS} role="tablist">
          {[['ctl', 'Pump Control & Status'], ['his', 'Irrigation History']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={innerTab(tab === k)} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      <StatStrip>
        <StatCard value={isPumpOn ? '1 Running' : '0 Idle'} label="Pump status" />
        <StatCard value={moisture != null ? `${moisture}%` : '—'} label="Current soil moisture" sub="Safe: 30–70%" />
        <StatCard value={`${targetMoisture}%`} label="Cutoff target" sub="Auto turns off at 65%" />
        <StatCard value={fmtSec(totalIrrigationTimeToday)} label="Irrigation today" sub={`${sessions.length} total logged sessions`} />
      </StatStrip>

      {/* Stalled Irrigation Alert Banner */}
      {isStalled && (
        <div className="border-l-4 border-l-warn bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-900 shadow-xs mb-4">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>⚠️</span>
            <span>Pump running but moisture not rising</span>
          </div>
          <p className="text-xs text-amber-800 mt-1 mb-0 leading-relaxed">
            The irrigation pump has run 3 consecutive cycles without soil moisture rising by at least 5%.
            Check the water reservoir supply, irrigation tubing/hose connection, and verify the soil moisture sensor probe is properly embedded.
          </p>
        </div>
      )}

      {tab === 'ctl' && (
        <div className="grid gap-4 max-w-2xl">
          <div className={CARD}>
            <div className="flex justify-between items-start gap-3 flex-wrap mb-3">
              <div>
                <h2 className="text-lg font-bold font-display text-ink m-0">Garden Irrigation Pump</h2>
                <div className="text-mut text-xs mt-0.5">
                  Connected to ESP32 Relay on GPIO 16 · Monitored by Soil Moisture Sensor on GPIO 34
                </div>
              </div>
              <StatusDot s={isPumpOn ? 'normal' : isConnected ? 'normal' : 'offline'} />
            </div>

            {/* Live Moisture Value Display */}
            <div className="my-3">
              <div className="font-display font-bold text-4xl text-ink leading-none">
                {moisture != null ? moisture : '—'}
                <small className="text-mut text-lg ml-0.5">{M.moisture.u}</small>
                <small className="text-mut text-xs font-sans font-normal ml-2">soil moisture</small>
              </div>

              {/* Moisture Progress Bar with Target Marker */}
              <div className="relative h-4 rounded-full bg-slate-100 overflow-hidden my-2.5">
                <i
                  className="block h-full bg-gradient-to-r from-accent to-brand transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, moisture ?? 0))}%` }}
                />
                {/* 65% Cutoff Target Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-brand-dark shadow-xs"
                  style={{ left: '65%' }}
                  title="Target cutoff: 65%"
                />
              </div>

              <div className="flex justify-between text-xs text-mut">
                <span>Critical: &lt;20%</span>
                <span>Safe Range: 30–70%</span>
                <span className="font-semibold text-brand-dark">Target Cutoff: 65%</span>
              </div>
            </div>

            {/* Current State Indicator & Explanation */}
            <div className="flex items-center gap-3 my-3">
              <span className={`${pill(isPumpOn ? 'online' : isConnected ? 'offline' : 'offline')} text-sm font-semibold px-3 py-1`}>
                {isPumpOn ? 'Pump ON' : 'Pump OFF'}
              </span>
              <span className="text-xs text-mut">
                {isPumpOn ? 'Relay contact closed (powering pump)' : 'Relay idle'}
              </span>
            </div>

            <div className={`p-3 rounded-xl border text-xs leading-relaxed ${pumpTone}`}>
              <div className="font-semibold mb-0.5">Current Pump Status:</div>
              {pumpExplanation}
            </div>

            {/* Operating Mode Explanation (No fake controls) */}
            <div className="bg-slate-50 border border-line rounded-xl p-3.5 mt-4 text-xs text-slate-700">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5 mb-1.5">
                <span>⚙️</span>
                <span>Auto mode (controlled by ESP32)</span>
              </div>
              <p className="m-0 leading-relaxed text-slate-600">
                The ESP32 autonomous control loop manages this pump. It turns ON automatically when soil moisture falls below <strong>65%</strong>.
                To prevent flooding and protect hardware, each watering cycle runs for a maximum of <strong>10 seconds</strong> followed by a <strong>20-second cooldown period</strong>.
              </p>
              <p className="mt-2 mb-0 text-[11px] text-slate-500">
                Manual HTTP toggle commands are not accepted by the firmware to ensure fail-safe autonomous regulation.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'his' && (
        <div className={CARD}>
          <div className="flex justify-between items-center mb-3">
            <h2 className={CARD_H2}>Pump Activity Log (Recorded in Browser)</h2>
            <span className="text-xs text-mut">{sessions.length} sessions logged</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-mut uppercase tracking-wider">
                  <th className="py-2.5 px-3">Session Start</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Moisture Before</th>
                  <th className="py-2.5 px-3">Moisture After</th>
                  <th className="py-2.5 px-3">Moisture Rise</th>
                  <th className="py-2.5 px-3">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-mut text-xs">
                      No pump cycles recorded yet. Cycles will be logged automatically as the ESP32 turns the pump on and off.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-b-0 text-xs">
                      <td className="py-2.5 px-3 font-medium text-ink">
                        {fmt(s.start)} <span className="text-mut font-normal">({ago(s.start)})</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {fmtSec(s.sec)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {s.moistureBefore != null ? `${s.moistureBefore}%` : '–'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-ink">
                        {s.moistureAfter != null ? `${s.moistureAfter}%` : '–'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={s.rise >= 5 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                          {s.rise >= 0 ? `+${s.rise}%` : `${s.rise}%`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {s.rise >= 5 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-200">
                            Effective (+{s.rise}%)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium border border-amber-200">
                            Low rise (&lt;5%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
