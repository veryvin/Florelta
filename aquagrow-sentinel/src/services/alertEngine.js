/**
 * FLORELTA ALERT ENGINE & NOTIFICATION DISPATCHER
 *
 * Single source of truth for debounced alert generation, hysteresis clearance,
 * sensor fault detection, device offline handling, and Web Notifications.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { THRESHOLDS, evaluateMetric } from '../config/thresholds';

const STORAGE_KEY_ALERTS = 'florelta_active_alerts';
const STORAGE_KEY_RESOLVED = 'florelta_resolved_alerts';
const STORAGE_KEY_NOTIFS = 'florelta_notifications';
const STORAGE_KEY_PUMP_SESSIONS = 'florelta_pump_sessions';

const REQUIRED_STREAK = 3; // 3 consecutive readings (~6 seconds) required to trigger an alert

/**
 * Load items from localStorage safely.
 */
function loadStorage(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn(`Could not load ${key} from storage:`, err);
  }
  return fallback;
}

/**
 * Save items to localStorage safely.
 */
function saveStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`Could not save ${key} to storage:`, err);
  }
}

/**
 * Trigger browser Web Notification if permission has been granted.
 */
export function sendWebNotification(title, body) {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(`Florelta: ${title}`, {
          body,
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('Web notification dispatch failed:', e);
      }
    }
  }
}

/**
 * Main alert engine hook.
 * Accepts live espData, isConnected status, and missedPolls count.
 */
export function useAlertEngine(espData, isConnected, missedPolls = 0) {
  const [activeAlerts, setActiveAlerts] = useState(() => loadStorage(STORAGE_KEY_ALERTS, []));
  const [resolvedAlerts, setResolvedAlerts] = useState(() => loadStorage(STORAGE_KEY_RESOLVED, []));
  const [notifications, setNotifications] = useState(() => loadStorage(STORAGE_KEY_NOTIFS, []));
  const [pumpSessions, setPumpSessions] = useState(() => loadStorage(STORAGE_KEY_PUMP_SESSIONS, []));

  // Debounce tracking counters: key -> number of consecutive abnormal polls
  const abnormalStreakRef = useRef({});
  // Candidate info for the current abnormal streak
  const candidateAlertRef = useRef({});

  // Pump state transition tracking
  const lastPumpStateRef = useRef(null);
  const pumpStartRef = useRef(null);

  // Sync to storage on state change
  useEffect(() => {
    saveStorage(STORAGE_KEY_ALERTS, activeAlerts);
  }, [activeAlerts]);

  useEffect(() => {
    saveStorage(STORAGE_KEY_RESOLVED, resolvedAlerts);
  }, [resolvedAlerts]);

  useEffect(() => {
    saveStorage(STORAGE_KEY_NOTIFS, notifications);
  }, [notifications]);

  useEffect(() => {
    saveStorage(STORAGE_KEY_PUMP_SESSIONS, pumpSessions);
  }, [pumpSessions]);

  // Push new notification
  const addNotification = useCallback((notif) => {
    setNotifications((prev) => {
      const next = [
        {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          t: Date.now(),
          read: false,
          ...notif,
        },
        ...prev,
      ].slice(0, 100);
      return next;
    });

    if (notif.sev === 'critical' || notif.sev === 'warning') {
      sendWebNotification(notif.title, notif.msg);
    }
  }, []);

  // Track pump cycles and monitor for stalled irrigation (3 cycles with <5% moisture rise)
  useEffect(() => {
    if (!espData || espData.pump == null) return;

    const currentPump = Boolean(espData.pump);
    const previousPump = lastPumpStateRef.current;

    // Pump turned ON
    if (currentPump && !previousPump) {
      pumpStartRef.current = {
        start: Date.now(),
        moistureBefore: espData.percent,
      };
    }

    // Pump turned OFF
    if (!currentPump && previousPump && pumpStartRef.current) {
      const start = pumpStartRef.current.start;
      const end = Date.now();
      const sec = Math.max(1, Math.round((end - start) / 1000));
      const moistureBefore = pumpStartRef.current.moistureBefore;
      const moistureAfter = espData.percent;
      const rise = (moistureAfter != null && moistureBefore != null) ? (moistureAfter - moistureBefore) : 0;

      const newSession = {
        id: `ps-${Date.now()}`,
        start,
        end,
        sec,
        moistureBefore,
        moistureAfter,
        rise,
      };

      setPumpSessions((prev) => [newSession, ...prev].slice(0, 50));
      pumpStartRef.current = null;
    }

    lastPumpStateRef.current = currentPump;
  }, [espData]);

  // Main evaluation loop executed on every update of espData or connection status
  useEffect(() => {
    const isOffline = !isConnected || missedPolls >= 3;
    const now = Date.now();
    const candidateMap = new Map();

    // 1. Evaluate Device Offline condition
    if (isOffline) {
      const key = 'device_offline';
      candidateMap.set(key, {
        key,
        sensor: 'ESP32 Controller',
        title: 'ESP32 Device Offline',
        sev: 'offline',
        value: 'Offline',
        range: 'ESP32 connected',
        rec: 'Check ESP32 power, Wi-Fi signal ("SoilMonitor" AP or local Wi-Fi), and IP address setting.',
        area: 'Controller',
        faultType: 'offline',
      });
    } else if (espData) {
      // 2. Evaluate Soil Moisture & Sensor Disconnection
      const moist = espData.percent;
      const raw = espData.raw;
      const moistEval = evaluateMetric('moisture', moist, { raw });
      if (moistEval.status !== 'normal') {
        const key = 'moisture';
        candidateMap.set(key, {
          key,
          sensor: 'Soil Moisture',
          title: moistEval.isAirOrDisconnected ? 'Soil Sensor in Air or Disconnected' : `Soil Moisture ${moistEval.label}`,
          sev: moistEval.status,
          value: moist != null ? `${moist}% (ADC ${raw ?? '–'})` : 'No reading',
          range: THRESHOLDS.moisture.caption,
          rec: moistEval.isAirOrDisconnected
            ? 'Inspect soil moisture sensor probe: ensure it is firmly in soil and wiring on GPIO 34 is intact.'
            : moist < 30
            ? 'Water the garden or verify irrigation pump is operating.'
            : 'Check soil drainage.',
          area: 'Garden',
          faultType: moistEval.faultType,
        });
      }

      // 3. Evaluate Water Temperature
      const temp = espData.temp;
      const tempEval = evaluateMetric('temp', temp);
      if (tempEval.status !== 'normal') {
        const key = 'temp';
        candidateMap.set(key, {
          key,
          sensor: 'Water Temperature',
          title: `Water Temperature ${tempEval.label}`,
          sev: tempEval.status,
          value: temp != null ? `${temp.toFixed(1)} °C` : 'No sensor',
          range: THRESHOLDS.temp.caption,
          rec: temp == null
            ? 'Check DS18B20 temperature probe wiring on GPIO 27 and 4.7kΩ pull-up resistor.'
            : temp < 20
            ? 'Check pond heater or cold water influx.'
            : 'Provide pond shading or aerate with cooler fresh water.',
          area: 'Aquaculture',
          faultType: tempEval.faultType,
        });
      }

      // 4. Evaluate pH Level
      const ph = espData.ph;
      const phOk = espData.phOk;
      const phEval = evaluateMetric('ph', ph, { phOk });
      if (phEval.status !== 'normal') {
        const key = 'ph';
        candidateMap.set(key, {
          key,
          sensor: 'pH Level',
          title: phEval.isSuspect ? 'Suspect pH Reading' : `pH Level ${phEval.label}`,
          sev: phEval.status,
          value: ph != null ? `${ph.toFixed(2)}` : 'Fault',
          range: THRESHOLDS.ph.caption,
          rec: phOk === false
            ? 'pH module fault: check sensor signal wiring on GPIO 32.'
            : phEval.isSuspect
            ? 'Check pH electrode glass bulb, rinse with distilled water, and calibrate probe.'
            : ph < 6.5
            ? 'Add agricultural lime or mild water buffer to raise pH to 6.5–7.5 safe range.'
            : 'Perform partial water change or add buffer to lower pH.',
          area: 'Aquaculture',
          faultType: phEval.faultType,
        });
      }

      // 5. Evaluate Turbidity
      const ntu = espData.ntu;
      const turbOk = espData.turbOk;
      const turbV = espData.turb;
      const turbEval = evaluateMetric('turb', ntu, { turbOk, turbV });
      if (turbEval.status !== 'normal') {
        const key = 'turb';
        candidateMap.set(key, {
          key,
          sensor: 'Turbidity',
          title: `Water Turbidity ${turbEval.label}`,
          sev: turbEval.status,
          value: ntu != null ? `${Math.round(ntu)} NTU (${turbV != null ? turbV.toFixed(2) + 'V' : ''})` : 'Fault',
          range: THRESHOLDS.turb.caption,
          rec: turbOk === false
            ? 'Turbidity sensor disconnected or faulty: check probe connection on GPIO 35.'
            : 'Check aquaculture mechanical filter, reduce fish feeding, and remove settled debris.',
          area: 'Aquaculture',
          faultType: turbEval.faultType,
        });
      }

      // 6. Evaluate Air Temperature
      const airTemp = espData.airTemp;
      const airTempEval = evaluateMetric('airTemp', airTemp);
      if (airTempEval.status !== 'normal') {
        const key = 'airTemp';
        candidateMap.set(key, {
          key,
          sensor: 'Air Temperature',
          title: `Air Temperature ${airTempEval.label}`,
          sev: airTempEval.status,
          value: airTemp != null ? `${airTemp.toFixed(1)} °C` : 'No sensor',
          range: THRESHOLDS.airTemp.caption,
          rec: airTemp == null
            ? 'DHT22 sensor not detected: check power and signal on GPIO 26.'
            : 'Inspect garden ventilation or shading.',
          area: 'Garden',
          faultType: airTempEval.faultType,
        });
      }

      // 7. Evaluate Air Humidity
      const hum = espData.hum;
      const humEval = evaluateMetric('hum', hum);
      if (humEval.status !== 'normal') {
        const key = 'hum';
        candidateMap.set(key, {
          key,
          sensor: 'Air Humidity',
          title: `Air Humidity ${humEval.label}`,
          sev: humEval.status,
          value: hum != null ? `${Math.round(hum)}%` : 'No sensor',
          range: THRESHOLDS.hum.caption,
          rec: hum == null
            ? 'DHT22 sensor not detected: check wiring on GPIO 26.'
            : hum < 40
            ? 'Low humidity: consider misting or shade cloth.'
            : 'High humidity: increase garden aeration to prevent fungal issues.',
          area: 'Garden',
          faultType: humEval.faultType,
        });
      }

      // 8. Stalled Irrigation Check
      // Check last 3 pump sessions; if each ran with <5% moisture rise, warn user
      if (pumpSessions.length >= 3) {
        const recent3 = pumpSessions.slice(0, 3);
        const allStalled = recent3.every((s) => s.rise < 5);
        if (allStalled && (espData.percent != null && espData.percent < 40)) {
          const key = 'pump_stall';
          candidateMap.set(key, {
            key,
            sensor: 'Irrigation System',
            title: 'Pump Running But Moisture Not Rising',
            sev: 'warning',
            value: `Last 3 cycles: <5% rise (current: ${espData.percent}%)`,
            range: 'Expected ≥5% rise after irrigation',
            rec: 'Pump has run 3 times without moisture rising by at least 5%. Check water supply, hose or sensor.',
            area: 'Garden',
            faultType: 'pump_stalled',
          });
        }
      }
    }

    // Apply Debouncing (3 consecutive polls) for Opening Alerts
    const currentStreaks = { ...abnormalStreakRef.current };
    const candidates = { ...candidateAlertRef.current };

    // Update streak counters
    candidateMap.forEach((info, key) => {
      currentStreaks[key] = (currentStreaks[key] || 0) + 1;
      candidates[key] = info;
    });

    // Reset streak counter for keys that returned to normal
    Object.keys(currentStreaks).forEach((key) => {
      if (!candidateMap.has(key)) {
        currentStreaks[key] = 0;
        delete candidates[key];
      }
    });

    abnormalStreakRef.current = currentStreaks;
    candidateAlertRef.current = candidates;

    // Check for alerts to open or update
    setActiveAlerts((prevAlerts) => {
      let nextAlerts = [...prevAlerts];
      let changed = false;

      // Check candidate conditions with streak >= REQUIRED_STREAK
      candidateMap.forEach((info, key) => {
        const streak = currentStreaks[key] || 0;
        if (streak >= REQUIRED_STREAK) {
          const existing = nextAlerts.find((a) => a.key === key && a.status !== 'resolved');
          if (!existing) {
            // Open NEW alert
            const newAlert = {
              id: `al-${key}-${now}`,
              key,
              sensor: info.sensor,
              title: info.title,
              sev: info.sev,
              value: info.value,
              value0: info.value,
              range: info.range,
              rec: info.rec,
              area: info.area,
              areaIds: [info.area === 'Garden' ? 'a1' : 'a3'],
              status: 'open',
              t: now,
              faultType: info.faultType,
              tl: [
                {
                  t: now,
                  by: 'System',
                  type: 'sys',
                  text: `Detected: ${info.value} (${info.title})`,
                },
              ],
            };
            nextAlerts.unshift(newAlert);
            changed = true;

            // Generate Notification
            addNotification({
              title: `${info.sensor}: ${info.title}`,
              msg: `${info.value} · Expected ${info.range}. ${info.rec}`,
              sev: info.sev,
              alertId: newAlert.id,
              areaIds: newAlert.areaIds,
            });
          } else {
            // Update live reading value in existing alert
            if (existing.value !== info.value || existing.sev !== info.sev) {
              existing.value = info.value;
              if (existing.sev !== info.sev) {
                existing.sev = info.sev;
                existing.tl.push({
                  t: now,
                  by: 'System',
                  type: 'sys',
                  text: `Severity changed to ${info.sev}`,
                });
              }
              changed = true;
            }
          }
        }
      });

      // Apply Hysteresis to resolve active alerts safely
      if (espData && !isOffline) {
        nextAlerts = nextAlerts.map((alert) => {
          if (alert.status === 'resolved') return alert;

          // Check if condition has returned safely within normal threshold + hysteresis
          let canClear = false;

          switch (alert.key) {
            case 'moisture': {
              const m = espData.percent;
              const raw = espData.raw;
              const th = THRESHOLDS.moisture;
              // Safe: 30-70. Margin 1.0. Clears when >= 31 and <= 69
              if (m != null && m >= (th.safeMin + th.hysteresis) && m <= (th.safeMax - th.hysteresis)) {
                if (!(raw != null && raw >= 4000 && m === 0)) {
                  canClear = true;
                }
              }
              break;
            }
            case 'temp': {
              const t = espData.temp;
              const th = THRESHOLDS.temp;
              // Safe: 20-32. Margin 0.3. Clears when >= 20.3 and <= 31.7
              if (t != null && t >= (th.safeMin + th.hysteresis) && t <= (th.safeMax - th.hysteresis)) {
                canClear = true;
              }
              break;
            }
            case 'ph': {
              const p = espData.ph;
              const ok = espData.phOk;
              const th = THRESHOLDS.ph;
              // Safe: 6.5-7.5. Margin 0.1. Clears when >= 6.6 and <= 7.4
              if (ok !== false && p != null && p >= (th.safeMin + th.hysteresis) && p <= (th.safeMax - th.hysteresis)) {
                canClear = true;
              }
              break;
            }
            case 'turb': {
              const n = espData.ntu;
              const ok = espData.turbOk;
              const th = THRESHOLDS.turb;
              // Safe: 0-50. Margin 3. Clears when <= 47 NTU
              if (ok !== false && n != null && n <= (th.safeMax - th.hysteresis)) {
                canClear = true;
              }
              break;
            }
            case 'airTemp': {
              const at = espData.airTemp;
              const th = THRESHOLDS.airTemp;
              if (at != null && at >= (th.safeMin + th.hysteresis) && at <= (th.safeMax - th.hysteresis)) {
                canClear = true;
              }
              break;
            }
            case 'hum': {
              const h = espData.hum;
              const th = THRESHOLDS.hum;
              if (h != null && h >= (th.safeMin + th.hysteresis) && h <= (th.safeMax - th.hysteresis)) {
                canClear = true;
              }
              break;
            }
            case 'device_offline': {
              if (isConnected && missedPolls === 0) {
                canClear = true;
              }
              break;
            }
            case 'pump_stall': {
              if (espData.percent != null && espData.percent >= 45) {
                canClear = true;
              }
              break;
            }
            default:
              break;
          }

          if (canClear) {
            changed = true;
            const resolvedAlert = {
              ...alert,
              status: 'resolved',
              resolvedAt: now,
              resolvedBy: 'System (Auto-recovery)',
              tl: [
                ...alert.tl,
                {
                  t: now,
                  by: 'System',
                  type: 'sys',
                  text: 'Reading returned safely within normal range. Resolved automatically.',
                },
              ],
            };

            // Notification for recovery
            addNotification({
              title: `${alert.sensor}: back to normal`,
              msg: `${alert.sensor} reading has safely returned to normal range (${alert.range}).`,
              sev: 'normal',
              alertId: alert.id,
              areaIds: alert.areaIds,
            });

            // Archive to resolved alerts
            setResolvedAlerts((r) => [resolvedAlert, ...r].slice(0, 50));
            return resolvedAlert;
          }

          return alert;
        });
      }

      return changed ? nextAlerts : prevAlerts;
    });
  }, [espData, isConnected, missedPolls, addNotification, pumpSessions]);

  // Alert Actions (Acknowledge and Resolve by user)
  const acknowledgeAlert = useCallback((alertId, userName = 'Operator') => {
    setActiveAlerts((prev) =>
      prev.map((a) => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'ack',
            ackAt: Date.now(),
            ackBy: userName,
            tl: [...a.tl, { t: Date.now(), by: userName, type: 'action', text: 'Acknowledged' }],
          };
        }
        return a;
      })
    );
  }, []);

  const resolveAlert = useCallback((alertId, userName = 'Operator', note = '') => {
    setActiveAlerts((prev) => {
      const target = prev.find((a) => a.id === alertId);
      if (!target) return prev;

      const resolved = {
        ...target,
        status: 'resolved',
        resolvedAt: Date.now(),
        resolvedBy: userName,
        tl: [
          ...target.tl,
          {
            t: Date.now(),
            by: userName,
            type: 'action',
            text: note.trim() ? `Resolved: ${note.trim()}` : 'Resolved manually',
          },
        ],
      };

      setResolvedAlerts((r) => [resolved, ...r].slice(0, 50));
      return prev.filter((a) => a.id !== alertId);
    });
  }, []);

  const reopenAlert = useCallback((alertId, userName = 'Operator') => {
    setActiveAlerts((prev) =>
      prev.map((a) => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'open',
            resolvedAt: null,
            resolvedBy: null,
            tl: [...a.tl, { t: Date.now(), by: userName, type: 'action', text: 'Reopened' }],
          };
        }
        return a;
      })
    );
  }, []);

  // Notifications Actions
  const markNotificationRead = useCallback((ids) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // Derived state for top status banner and sidebar badges
  const unresolvedAlerts = useMemo(
    () => activeAlerts.filter((a) => a.status !== 'resolved'),
    [activeAlerts]
  );

  const critAlerts = useMemo(
    () => unresolvedAlerts.filter((a) => a.sev === 'critical'),
    [unresolvedAlerts]
  );

  const warnAlerts = useMemo(
    () => unresolvedAlerts.filter((a) => a.sev === 'warning'),
    [unresolvedAlerts]
  );

  const offlineAlerts = useMemo(
    () => unresolvedAlerts.filter((a) => a.sev === 'offline'),
    [unresolvedAlerts]
  );

  const isOffline = !isConnected || missedPolls >= 3;

  // Worst status derivation: critical > warning > offline > normal
  const worstStatus = useMemo(() => {
    if (isOffline || offlineAlerts.length > 0) return 'offline';
    if (critAlerts.length > 0) return 'critical';
    if (warnAlerts.length > 0) return 'warning';
    return 'normal';
  }, [isOffline, offlineAlerts.length, critAlerts.length, warnAlerts.length]);

  // Dynamic banner payload matching the worst status
  const banner = useMemo(() => {
    if (isOffline || offlineAlerts.length > 0) {
      return {
        tone: 'bg-banner-off/92 border-banner-off-border text-banner-off-ink',
        lead: 'ESP32 Device is offline.',
        detail: 'Hardware communication lost after 3 missed polls. Displaying last recorded values.',
        icon: 'offline',
      };
    }
    if (critAlerts.length > 0) {
      const names = Array.from(new Set(critAlerts.map((a) => a.sensor))).join(', ');
      return {
        tone: 'bg-banner-crit/92 border-banner-crit-border text-banner-crit-ink',
        lead: `${critAlerts.length} critical ${critAlerts.length === 1 ? 'alert' : 'alerts'}: ${names}.`,
        detail: warnAlerts.length > 0
          ? `${warnAlerts.length} ${warnAlerts.length === 1 ? 'reading also needs' : 'readings also need'} attention.`
          : 'Immediate review recommended.',
        icon: 'critical',
      };
    }
    if (warnAlerts.length > 0) {
      const names = Array.from(new Set(warnAlerts.map((a) => a.sensor))).join(', ');
      return {
        tone: 'bg-banner-warn/92 border-banner-warn-border text-banner-warn-ink',
        lead: `${warnAlerts.length} ${warnAlerts.length === 1 ? 'reading needs' : 'readings need'} attention: ${names}.`,
        detail: 'Check warning sensors before they reach critical thresholds.',
        icon: 'warning',
      };
    }
    return {
      tone: 'bg-banner-ok/92 border-banner-ok-border text-banner-ok-ink',
      lead: 'All systems normal.',
      detail: 'Every reading is within its safe range.',
      icon: 'ok',
    };
  }, [isOffline, offlineAlerts.length, critAlerts, warnAlerts]);

  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return {
    activeAlerts: unresolvedAlerts,
    allAlerts: activeAlerts,
    resolvedAlerts,
    worstStatus,
    banner,
    openAlertsCount: unresolvedAlerts.length,
    acknowledgeAlert,
    resolveAlert,
    reopenAlert,
    notifications,
    unreadNotifsCount,
    markNotificationRead,
    markAllNotificationsRead,
    pumpSessions,
  };
}
