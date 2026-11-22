/**
 * SINGLE SOURCE OF TRUTH FOR SYSTEM THRESHOLDS & EVALUATION
 * All sensor cards, badges, banners, charts, alert engine, and notifications read from this file.
 */

export const THRESHOLDS = {
  temp: {
    key: 'temp',
    name: 'Water temperature',
    unit: '°C',
    safeMin: 20,
    safeMax: 32,
    warnLow: 18,
    warnHigh: 34,
    critLow: 18,
    critHigh: 34,
    hysteresis: 0.3,
    caption: 'Safe 20–32 °C',
  },
  ph: {
    key: 'ph',
    name: 'pH Level',
    unit: '',
    safeMin: 6.5,
    safeMax: 7.5,
    warnLow: 6.0,
    warnHigh: 8.5,
    critLow: 6.0,
    critHigh: 8.5,
    hysteresis: 0.1,
    caption: 'Safe 6.5–7.5',
  },
  turb: {
    key: 'turb',
    name: 'Turbidity',
    unit: ' NTU',
    safeMin: 0,
    safeMax: 50,
    warnHigh: 150,
    critHigh: 150,
    hysteresis: 3,
    caption: 'Safe 0–50 NTU',
  },
  moisture: {
    key: 'moisture',
    name: 'Soil moisture',
    unit: '%',
    safeMin: 30,
    safeMax: 70,
    warnLow: 20,
    warnHigh: 85,
    critLow: 20,
    critHigh: 85,
    hysteresis: 1.0,
    targetPumpCutoff: 65,
    caption: 'Safe 30–70%',
  },
  airTemp: {
    key: 'airTemp',
    name: 'Air temperature',
    unit: '°C',
    safeMin: 18,
    safeMax: 34,
    warnLow: 15,
    warnHigh: 37,
    critLow: 15,
    critHigh: 37,
    hysteresis: 0.3,
    caption: 'Safe 18–34 °C',
  },
  hum: {
    key: 'hum',
    name: 'Air humidity',
    unit: '%',
    safeMin: 40,
    safeMax: 80,
    warnLow: 30,
    warnHigh: 90,
    critLow: 30,
    critHigh: 90,
    hysteresis: 1.0,
    caption: 'Safe 40–80%',
  },
  pump: {
    key: 'pump',
    name: 'Irrigation pump',
    unit: '',
    targetMoisture: 65,
    maxRunSec: 10,
    cooldownSec: 20,
    caption: 'Target cutoff: 65%',
  },
};

/**
 * Unified evaluation for any sensor reading.
 * Returns status ('normal' | 'warning' | 'critical' | 'nosensor') and matching descriptive label.
 * Status and label are derived together to ensure they NEVER contradict.
 */
export function evaluateMetric(key, value, extra = {}) {
  // Disconnected device check
  if (extra.offline) {
    return {
      status: 'offline',
      label: 'Offline',
      detail: 'Device offline',
      severity: 'offline',
    };
  }

  switch (key) {
    case 'moisture': {
      if (value == null || Number.isNaN(value)) {
        return {
          status: 'nosensor',
          label: 'No sensor',
          detail: 'Soil moisture sensor not detected',
          faultType: 'missing',
        };
      }
      // Check for raw ADC at or near 4095 (sensor in air or disconnected)
      if (extra.raw != null && extra.raw >= 4000 && value === 0) {
        return {
          status: 'warning',
          label: 'In Air / Disconnected',
          detail: `Raw reading ${extra.raw} (0%): Sensor may be in air or disconnected (or extremely dry soil)`,
          isAirOrDisconnected: true,
          faultType: 'air_or_disconnected',
        };
      }
      if (value < 20) {
        return {
          status: 'critical',
          label: 'Critically Dry',
          detail: `Soil moisture critically low (${value}% < 20%)`,
        };
      }
      if (value < 30) {
        return {
          status: 'warning',
          label: 'Dry',
          detail: `Soil moisture low (${value}% in warning range 20–30%)`,
        };
      }
      if (value <= 70) {
        return {
          status: 'normal',
          label: 'Moist (Optimal)',
          detail: `Soil moisture within safe range (${value}%)`,
        };
      }
      if (value <= 85) {
        return {
          status: 'warning',
          label: 'Very Moist',
          detail: `Soil moisture elevated (${value}% in warning range 70–85%)`,
        };
      }
      return {
        status: 'critical',
        label: 'Saturated',
        detail: `Soil oversaturated (${value}% > 85%)`,
      };
    }

    case 'temp': {
      if (value == null || Number.isNaN(value)) {
        return {
          status: 'nosensor',
          label: 'No sensor',
          detail: 'Water temperature sensor not detected',
          faultType: 'missing',
        };
      }
      if (value < 18) {
        return {
          status: 'critical',
          label: 'Critically Cold',
          detail: `Water temperature critically cold (${value.toFixed(1)} °C < 18 °C)`,
        };
      }
      if (value < 20) {
        return {
          status: 'warning',
          label: 'Cool',
          detail: `Water temperature cool (${value.toFixed(1)} °C in warning range 18–20 °C)`,
        };
      }
      if (value <= 32) {
        return {
          status: 'normal',
          label: 'Optimal',
          detail: `Water temperature within safe range (${value.toFixed(1)} °C)`,
        };
      }
      if (value <= 34) {
        return {
          status: 'warning',
          label: 'Warm',
          detail: `Water temperature elevated (${value.toFixed(1)} °C in warning range 32–34 °C)`,
        };
      }
      return {
        status: 'critical',
        label: 'Critically Hot',
        detail: `Water temperature critically hot (${value.toFixed(1)} °C > 34 °C)`,
      };
    }

    case 'ph': {
      if (extra.phOk === false || value == null || Number.isNaN(value)) {
        return {
          status: 'nosensor',
          label: 'Sensor fault',
          detail: 'pH sensor reported fault or probe communication failed',
          faultType: 'sensor_fault',
        };
      }
      // Extreme values suspect probe calibration
      if (value < 4.0 || value > 10.0) {
        return {
          status: 'warning',
          label: 'Suspect reading',
          detail: `Extreme pH reading (${value.toFixed(1)}): check probe and calibration`,
          isSuspect: true,
          faultType: 'suspect_reading',
        };
      }
      if (value < 6.0) {
        return {
          status: 'critical',
          label: 'Acidic (Critical)',
          detail: `pH critically acidic (${value.toFixed(1)} < 6.0)`,
        };
      }
      if (value < 6.5) {
        return {
          status: 'warning',
          label: 'Slightly Acidic',
          detail: `pH slightly acidic (${value.toFixed(1)} in warning range 6.0–6.5)`,
        };
      }
      if (value <= 7.5) {
        return {
          status: 'normal',
          label: 'Neutral (Optimal)',
          detail: `pH neutral and optimal (${value.toFixed(1)})`,
        };
      }
      if (value <= 8.5) {
        return {
          status: 'warning',
          label: 'Slightly Alkaline',
          detail: `pH slightly alkaline (${value.toFixed(1)} in warning range 7.5–8.5)`,
        };
      }
      return {
        status: 'critical',
        label: 'Alkaline (Critical)',
        detail: `pH critically alkaline (${value.toFixed(1)} > 8.5)`,
      };
    }

    case 'turb': {
      if (extra.turbOk === false || value == null || Number.isNaN(value)) {
        return {
          status: 'nosensor',
          label: 'Sensor fault',
          detail: 'Turbidity sensor reported fault or offline',
          faultType: 'sensor_fault',
        };
      }
      // Evaluate based on NTU
      if (value <= 50) {
        return {
          status: 'normal',
          label: 'Clear (Optimal)',
          detail: `Water is clear (${Math.round(value)} NTU ≤ 50 NTU)`,
        };
      }
      if (value <= 150) {
        return {
          status: 'warning',
          label: 'Slightly Cloudy',
          detail: `Water is slightly cloudy (${Math.round(value)} NTU in warning range 50–150 NTU)`,
        };
      }
      return {
        status: 'critical',
        label: 'Turbid / Dirty',
        detail: `Water is highly turbid (${Math.round(value)} NTU > 150 NTU)`,
      };
    }

    case 'airTemp': {
      if (value == null || Number.isNaN(value)) {
        return {
          status: 'nosensor',
          label: 'No sensor',
          detail: 'Air temperature sensor not detected',
          faultType: 'missing',
        };
      }
      if (value < 15) {
        return {
          status: 'critical',
          label: 'Critically Cold',
          detail: `Air temperature critically cold (${value.toFixed(1)} °C < 15 °C)`,
        };
      }
      if (value < 18) {
        return {
          status: 'warning',
          label: 'Cool',
          detail: `Air temperature cool (${value.toFixed(1)} °C in warning range 15–18 °C)`,
        };
      }
      if (value <= 34) {
        return {
          status: 'normal',
          label: 'Optimal',
          detail: `Air temperature optimal (${value.toFixed(1)} °C)`,
        };
      }
      if (value <= 37) {
        return {
          status: 'warning',
          label: 'Warm',
          detail: `Air temperature elevated (${value.toFixed(1)} °C in warning range 34–37 °C)`,
        };
      }
      return {
        status: 'critical',
        label: 'Critically Hot',
        detail: `Air temperature critically hot (${value.toFixed(1)} °C > 37 °C)`,
      };
    }

    case 'hum': {
      if (value == null || Number.isNaN(value)) {
        return {
          status: 'nosensor',
          label: 'No sensor',
          detail: 'Air humidity sensor not detected',
          faultType: 'missing',
        };
      }
      if (value < 30) {
        return {
          status: 'critical',
          label: 'Critically Dry Air',
          detail: `Air humidity critically low (${Math.round(value)}% < 30%)`,
        };
      }
      if (value < 40) {
        return {
          status: 'warning',
          label: 'Dry Air',
          detail: `Air humidity low (${Math.round(value)}% in warning range 30–40%)`,
        };
      }
      if (value <= 80) {
        return {
          status: 'normal',
          label: 'Optimal',
          detail: `Air humidity optimal (${Math.round(value)}%)`,
        };
      }
      if (value <= 90) {
        return {
          status: 'warning',
          label: 'High Humidity',
          detail: `Air humidity elevated (${Math.round(value)}% in warning range 80–90%)`,
        };
      }
      return {
        status: 'critical',
        label: 'Saturated Air',
        detail: `Air humidity near saturation (${Math.round(value)}% > 90%)`,
      };
    }

    case 'pump': {
      const isPumpOn = Boolean(value);
      const moisture = extra.percent;
      if (isPumpOn) {
        if (moisture != null && moisture < 30) {
          return {
            status: 'normal',
            label: 'Irrigating (Soil dry)',
            detail: `Pump ON: currently irrigating dry soil (${moisture}% < 65% target)`,
          };
        }
        if (moisture != null && moisture >= 65) {
          return {
            status: 'warning',
            label: 'Pump running above target',
            detail: `Pump ON but soil moisture is already at or above target (${moisture}% ≥ 65%)`,
          };
        }
        return {
          status: 'normal',
          label: 'Irrigating',
          detail: 'Pump ON (automatic watering in progress)',
        };
      }
      // Pump is OFF
      if (moisture != null && moisture < 20) {
        return {
          status: 'warning',
          label: 'Idle (Low moisture)',
          detail: 'Pump OFF while soil moisture is low (cycle cooldown or waiting for next auto cycle)',
        };
      }
      return {
        status: 'normal',
        label: 'Idle',
        detail: 'Pump OFF (soil moisture adequate)',
      };
    }

    default:
      return {
        status: 'normal',
        label: 'Normal',
        detail: 'Reading recorded',
      };
  }
}
