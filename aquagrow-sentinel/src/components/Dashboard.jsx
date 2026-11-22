import { useCallback, useMemo, useState } from 'react';
import AreaSection from './AreaSection';
import ReadingCard from './ReadingCard';
import Chart from './Chart';
import EquipmentPanel from './EquipmentPanel';
import OpenAlertsPanel from './OpenAlertsPanel';
import { CARD_H2, Card, PG, STATUS_BG, StatCard, StatStrip, StatusBadge } from './ui';
import { M } from '../data/constants';
import { areaStatus, ago, can, metricsOf, now, thOf } from '../data/db';
import { useAreaMetrics } from '../lib/readingStatus';
import logo from '../assets/logo.png';
import { DEFAULT_ESP32_URL } from '../services/esp32';
import { useESP } from '../context/ESPContext';
import { THRESHOLDS, evaluateMetric } from '../config/thresholds';

const fmtTime = (t) =>
  t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';

function StatusBanner({ banner }) {
  if (!banner) return null;

  let icon = (
    <svg className="w-5 h-5 flex-none text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5.2" />
    </svg>
  );

  if (banner.icon === 'critical') {
    icon = (
      <svg className="w-5 h-5 flex-none text-crit" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <line x1="12" y1="8" x2="12" y2="12.5" />
        <circle cx="12" cy="16" r="0.6" fill="currentColor" />
      </svg>
    );
  } else if (banner.icon === 'warning') {
    icon = (
      <svg className="w-5 h-5 flex-none text-warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  } else if (banner.icon === 'offline') {
    icon = (
      <svg className="w-5 h-5 flex-none text-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    );
  }

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] shadow-[0_2px_10px_rgba(18,48,42,0.05)] backdrop-blur-sm ${banner.tone}`}
    >
      <span aria-hidden="true">{icon}</span>
      <p className="m-0 leading-snug">
        <strong className="font-semibold">{banner.lead}</strong>{' '}
        <span className="opacity-90">{banner.detail}</span>
      </p>
    </div>
  );
}

export default function Dashboard({ d, update, user, onOpenDrawer }) {
  // Shared ESP32 Hardware Integration & Alert Engine
  const { esp, espData, alertEngine, equipmentList } = useESP();
  const [showConfig, setShowConfig] = useState(false);
  const [addressInput, setAddressInput] = useState(esp.address);
  const [selectedChartKey, setSelectedChartKey] = useState('moisture');

  const ponds = d.areas.filter((a) => a.kind === 'pond');
  const gardens = d.areas.filter((a) => a.kind === 'garden');
  const healthy = Math.round((d.areas.filter((a) => areaStatus(d, a) === 'normal').length / (d.areas.length || 1)) * 100);

  const canActOnAlerts = can(user, 'alerts');

  // Live ESP32 Aquaculture Metrics evaluated strictly via unified thresholds
  const aquacultureMetrics = useMemo(() => {
    if (espData) {
      const tempEval = evaluateMetric('temp', espData.temp, { offline: !esp.connected });
      const phEval = evaluateMetric('ph', espData.ph, { phOk: espData.phOk, offline: !esp.connected });
      const turbEval = evaluateMetric('turb', espData.ntu, { turbOk: espData.turbOk, turbV: espData.turb, offline: !esp.connected });

      return [
        {
          key: 'temp',
          label: 'Water Temperature',
          unit: '°C',
          value: espData.temp,
          isNoSensor: espData.temp == null,
          decimals: 1,
          status: tempEval.status,
          extraLabel: tempEval.label,
          safeMin: THRESHOLDS.temp.safeMin,
          safeMax: THRESHOLDS.temp.safeMax,
          history: espData.tempHistory || [],
        },
        {
          key: 'ph',
          label: 'pH Level',
          unit: '',
          value: espData.phOk !== false && espData.ph != null ? espData.ph : null,
          isNoSensor: espData.phOk === false || espData.ph == null,
          decimals: 2,
          status: phEval.status,
          extraLabel: phEval.label,
          safeMin: THRESHOLDS.ph.safeMin,
          safeMax: THRESHOLDS.ph.safeMax,
          history: espData.phHistory || [],
        },
        {
          key: 'turb',
          label: 'Turbidity',
          unit: ' NTU',
          value: espData.turbOk !== false && espData.ntu != null ? espData.ntu : null,
          voltage: espData.turb,
          isNoSensor: espData.turbOk === false || espData.ntu == null,
          decimals: 0,
          status: turbEval.status,
          extraLabel: turbEval.label,
          safeMin: THRESHOLDS.turb.safeMin,
          safeMax: THRESHOLDS.turb.safeMax,
          history: espData.turbHistory || [],
        },
      ];
    }
    return [
      { key: 'temp', label: 'Water Temperature', unit: '°C', value: null, isNoSensor: false, status: 'offline', history: [] },
      { key: 'ph', label: 'pH Level', unit: '', value: null, isNoSensor: false, status: 'offline', history: [] },
      { key: 'turb', label: 'Turbidity', unit: ' NTU', value: null, isNoSensor: false, status: 'offline', history: [] },
    ];
  }, [espData, esp.connected]);

  // Live ESP32 Garden & Climate Metrics evaluated strictly via unified thresholds
  const gardenMetrics = useMemo(() => {
    if (espData) {
      const moistEval = evaluateMetric('moisture', espData.percent, { raw: espData.raw, offline: !esp.connected });
      const pumpEval = evaluateMetric('pump', espData.pump, { percent: espData.percent, offline: !esp.connected });
      const airTempEval = evaluateMetric('airTemp', espData.airTemp, { offline: !esp.connected });
      const humEval = evaluateMetric('hum', espData.hum, { offline: !esp.connected });

      return [
        {
          key: 'moisture',
          label: 'Soil Moisture',
          unit: '%',
          value: espData.percent != null ? espData.percent : null,
          isNoSensor: espData.percent == null,
          decimals: 0,
          status: moistEval.status,
          extraLabel: moistEval.label,
          safeMin: THRESHOLDS.moisture.safeMin,
          safeMax: THRESHOLDS.moisture.safeMax,
          history: espData.history || [],
        },
        {
          key: 'pump',
          label: 'Irrigation Pump',
          unit: '',
          value: espData.pump != null ? (espData.pump ? 'ON' : 'OFF') : '–',
          extraLabel: pumpEval.label,
          isNoSensor: false,
          status: pumpEval.status,
          history: [],
        },
        {
          key: 'airTemp',
          label: 'Air Temperature',
          unit: '°C',
          value: espData.airTemp != null ? espData.airTemp : null,
          isNoSensor: espData.airTemp == null,
          decimals: 1,
          status: airTempEval.status,
          extraLabel: airTempEval.label,
          safeMin: THRESHOLDS.airTemp.safeMin,
          safeMax: THRESHOLDS.airTemp.safeMax,
          history: [],
        },
        {
          key: 'hum',
          label: 'Air Humidity',
          unit: '%',
          value: espData.hum != null ? espData.hum : null,
          isNoSensor: espData.hum == null,
          decimals: 0,
          status: humEval.status,
          extraLabel: humEval.label,
          safeMin: THRESHOLDS.hum.safeMin,
          safeMax: THRESHOLDS.hum.safeMax,
          history: espData.humHistory || [],
        },
      ];
    }
    return [
      { key: 'moisture', label: 'Soil Moisture', unit: '%', value: null, isNoSensor: false, status: 'offline', history: [] },
      { key: 'pump', label: 'Irrigation Pump', unit: '', value: 'OFF', isNoSensor: false, status: 'offline', history: [] },
      { key: 'airTemp', label: 'Air Temperature', unit: '°C', value: null, isNoSensor: false, status: 'offline', history: [] },
      { key: 'hum', label: 'Air Humidity', unit: '%', value: null, isNoSensor: false, status: 'offline', history: [] },
    ];
  }, [espData, esp.connected]);

  const CHART_OPTIONS = [
    { key: 'moisture', label: 'Soil Moisture (%)', unit: '%', minVal: 0, maxVal: 100 },
    { key: 'temp', label: 'Water Temperature (°C)', unit: '°C', minVal: null, maxVal: null },
    { key: 'turb', label: 'Turbidity (NTU)', unit: ' NTU', minVal: 0, maxVal: 1000 },
    { key: 'ph', label: 'pH Level', unit: '', minVal: 0, maxVal: 14 },
    { key: 'hum', label: 'Air Humidity (%)', unit: '%', minVal: 0, maxVal: 100 },
  ];

  const currentChartOpt = CHART_OPTIONS.find((o) => o.key === selectedChartKey) || CHART_OPTIONS[0];

  const chartPoints = useMemo(() => {
    if (!espData) return [];
    switch (selectedChartKey) {
      case 'moisture':
        return espData.history || [];
      case 'temp':
        return espData.tempHistory || [];
      case 'turb':
        return espData.turbHistory || [];
      case 'ph':
        return espData.phHistory || [];
      case 'hum':
        return espData.humHistory || [];
      default:
        return espData.history || [];
    }
  }, [espData, selectedChartKey]);

  return (
    <div className={`${PG} pt-5 lg:pt-7 pb-8`}>
      {/* Brand header + live ESP32 connectivity indicator + Address Settings */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="Open navigation menu"
              className="border border-line bg-white/85 backdrop-blur-sm rounded-[10px] w-10 h-10 grid place-items-center text-[18px] text-ink shadow-sm hover:bg-brand-soft flex-none transition-colors"
            >
              ☰
            </button>
          )}
          <div className="flex items-center gap-3">
            <img src={logo} alt="Florelta" className="w-10 h-10 sm:w-11 sm:h-11 flex-none object-contain" />
            <div>
              <h1 className="font-display font-bold text-[24px] sm:text-[28px] leading-tight tracking-[-0.02em] text-ink m-0">
                Florelta
              </h1>
              <p className="text-[13px] sm:text-[14px] text-mut mt-0.5 mb-0">
                Real-time status of your pond and garden.
              </p>
            </div>
          </div>
        </div>

        {/* Connection Status & ESP32 Settings */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div
            role="status"
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border shadow-sm text-[12.5px] font-medium backdrop-blur-md transition-colors ${
              esp.connected
                ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800'
                : 'bg-amber-50/90 border-amber-200 text-amber-800 animate-pulse'
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full flex-none ${
                esp.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>
              {esp.connected ? (
                <>
                  <strong className="font-semibold">Connected</strong>
                  <span className="opacity-80">
                    {' '}· updated {esp.lastUpdated ? fmtTime(esp.lastUpdated) : 'just now'}
                  </span>
                </>
              ) : (
                <strong className="font-semibold">Connection lost, retrying…</strong>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setAddressInput(esp.address);
              setShowConfig(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/85 hover:bg-white border border-line text-[12.5px] font-medium text-ink shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Configure ESP32 device address"
          >
            <span aria-hidden="true">⚙️</span>
            <span>ESP32 Address</span>
          </button>
        </div>
      </header>

      {/* ESP32 Address Configuration Modal */}
      {showConfig && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="esp32-settings-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-line p-6 relative">
            <h3 id="esp32-settings-title" className="text-lg font-bold font-display text-ink m-0">
              ESP32 Device Address
            </h3>
            <p className="text-mut text-xs mt-1 mb-4 leading-relaxed">
              Set the IP address of your ESP32 web server. Changes are saved in your browser and take effect immediately.
            </p>

            <label htmlFor="esp32-url-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Device URL / IP Address
            </label>
            <input
              id="esp32-url-input"
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="http://192.168.4.1"
              className="w-full px-3 py-2 rounded-xl border border-line bg-slate-50/50 text-ink text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            />

            <div className="bg-slate-50 rounded-xl p-3 mt-3 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-700">Quick Reference:</div>
              <div>• <strong>SoilMonitor Wi-Fi (AP mode):</strong> <code className="bg-white px-1 py-0.5 rounded border border-slate-200">http://192.168.4.1</code></div>
              <div>• <strong>Shared Wi-Fi / Hotspot (STA mode):</strong> Use the IP printed in Serial Monitor (e.g. <code className="bg-white px-1 py-0.5 rounded border border-slate-200">http://192.168.1.xxx</code>)</div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-5">
              <button
                type="button"
                onClick={() => setAddressInput(DEFAULT_ESP32_URL)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
              >
                Reset to default
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    esp.setAddress(addressInput);
                    setShowConfig(false);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-semibold transition-colors"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic status banner driven strictly by single source of truth alerts */}
      <StatusBanner banner={alertEngine.banner} />

      {/* Live reading cards: Aquaculture and Garden sections connected to ESP32 */}
      <div className="grid gap-5">
        {/* Aquaculture Section */}
        <section aria-label="Aquaculture (Water Monitoring)">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-ink m-0 flex items-baseline gap-1.5 flex-wrap">
              <span>Aquaculture</span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-slate-500 font-normal">Water Quality Monitoring</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 gap-3">
            {aquacultureMetrics.map((metric) => (
              <ReadingCard key={metric.key} metric={metric} />
            ))}
          </div>
        </section>

        {/* Garden & Climate Section */}
        <section aria-label="Garden & Climate Monitoring">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-ink m-0 flex items-baseline gap-1.5 flex-wrap">
              <span>Garden & Climate</span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-slate-500 font-normal">Soil & Environment Monitoring</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {gardenMetrics.map((metric) => (
              <ReadingCard key={metric.key} metric={metric} />
            ))}
          </div>
        </section>
      </div>

      {/* Bottom primary panels: Open alerts (13fr) + Equipment (7fr) */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]">
        <OpenAlertsPanel
          alerts={alertEngine.activeAlerts}
          areas={d.areas}
          canAct={canActOnAlerts}
          allReadingsSafe={alertEngine.worstStatus === 'normal'}
          onAcknowledge={(r) => alertEngine.acknowledgeAlert(r.id, user.name)}
          onResolve={(r) => alertEngine.resolveAlert(r.id, user.name)}
        />
        <EquipmentPanel items={equipmentList} />
      </div>

      {/* Summary strip */}
      <StatStrip className="rounded-2xl border-slate-200 shadow-sm">
        <StatCard value={d.farms.length} label="Farms" sub={`${gardens.length} gardens · ${ponds.length} ponds`} />
        <StatCard value={d.areas.length} label="Monitoring areas" sub={`${gardens.length} gardens · ${ponds.length} ponds`} />
        <StatCard value={esp.connected ? '1' : '0'} label="ESP32 Status" sub={esp.connected ? 'Hardware connected' : 'Connecting…'} />
        <StatCard
          value={alertEngine.openAlertsCount}
          label="Active alerts"
          sub={`${alertEngine.activeAlerts.filter((x) => x.sev === 'critical').length} crit · ${alertEngine.activeAlerts.filter((x) => x.sev === 'warning').length} warn`}
        />
        <StatCard
          value={alertEngine.worstStatus === 'normal' ? '100%' : alertEngine.worstStatus === 'warning' ? '75%' : '40%'}
          label="System health"
          sub={`Updated ${esp.lastUpdated ? fmtTime(esp.lastUpdated) : 'pending'}`}
        />
      </StatStrip>

      {/* Sensor trend chart with ESP32 60-reading history */}
      <Card className="rounded-2xl border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-lg font-semibold text-ink m-0">
            Sensor History Trends (Last 60 Readings)
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="sensor-chart-select" className="sr-only">Select Sensor Trend</label>
            <select
              id="sensor-chart-select"
              className="border border-line rounded-lg px-2.5 py-1.5 bg-white text-sm font-medium text-ink shadow-xs focus:outline-none focus:ring-2 focus:ring-brand"
              aria-label="Sensor to graph"
              value={selectedChartKey}
              onChange={(e) => setSelectedChartKey(e.target.value)}
            >
              {CHART_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Chart
          pts={chartPoints}
          u={currentChartOpt.unit}
          minVal={currentChartOpt.minVal}
          maxVal={currentChartOpt.maxVal}
        />
      </Card>

      {/* Farm health overview & recent notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm p-5">
          <h2 className={CARD_H2}>Farm health overview</h2>
          {d.farms.map((f) => {
            const ar = d.areas.filter((a) => a.farm === f.id);
            const ok = ar.filter((a) => areaStatus(d, a) === 'normal').length;
            const pc = ar.length ? (ok / ar.length) * 100 : 0;
            return (
              <div className="mb-3.5 last:mb-0" key={f.id}>
                <div className="flex justify-between text-[14px]">
                  <b className="font-display">{f.name}</b>
                  <span className="text-mut">{ok}/{ar.length} areas healthy</span>
                </div>
                <div className="h-2 rounded-full bg-[#e9efec] overflow-hidden my-1.5">
                  <i
                    className={`block h-full ${pc > 66 ? 'bg-ok' : pc > 33 ? 'bg-warn' : 'bg-crit'}`}
                    style={{ width: `${pc}%` }}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {ar.map((a) => (
                    <StatusBadge key={a.id} status={areaStatus(d, a)}>{a.name}</StatusBadge>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm p-5">
          <h2 className={CARD_H2}>Recent notifications</h2>
          <div className="grid gap-1.5">
            {d.notifs.filter((n) => n.to?.includes(user.id)).slice(0, 6).map((n) => (
              <div className="flex gap-2.5 py-2 border-b border-line last:border-b-0 text-[14px]" key={n.id}>
                <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-none ${STATUS_BG[n.sev] || 'bg-off'}`} />
                <div>
                  <b>{n.title}</b>
                  <div className="text-mut text-[13px]">{n.msg}</div>
                  <div className="text-mut text-[12px]">{ago(n.t)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
