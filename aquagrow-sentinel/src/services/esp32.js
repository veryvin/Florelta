import { useEffect, useRef, useState, useCallback } from 'react';

export const STORAGE_KEY_ESP32_URL = 'florelta_esp32_url';
export const DEFAULT_ESP32_URL = 'http://192.168.4.1';

/**
 * Retrieves the configured ESP32 address from browser storage.
 */
export function getStoredEsp32Url() {
  try {
    const val = localStorage.getItem(STORAGE_KEY_ESP32_URL);
    if (val && typeof val === 'string' && val.trim()) {
      return normalizeUrl(val.trim());
    }
  } catch (err) {
    console.warn('Could not read ESP32 URL from localStorage:', err);
  }
  return DEFAULT_ESP32_URL;
}

/**
 * Normalizes input address to include http:// protocol and remove trailing slash.
 */
export function normalizeUrl(url) {
  if (!url) return DEFAULT_ESP32_URL;
  let clean = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  return clean;
}

/**
 * Saves the ESP32 address to localStorage.
 */
export function setStoredEsp32Url(url) {
  const norm = normalizeUrl(url);
  try {
    localStorage.setItem(STORAGE_KEY_ESP32_URL, norm);
  } catch (err) {
    console.warn('Could not save ESP32 URL to localStorage:', err);
  }
  return norm;
}

/**
 * Soil moisture % classification:
 * red under 30 (Dry), green 30-70 (Moist), blue above 70 (Wet)
 */
export function getMoistureCategory(percent) {
  if (percent == null || Number.isNaN(percent)) {
    return { label: 'No data', barColor: 'bg-slate-300', textColor: 'text-slate-500' };
  }
  if (percent < 30) {
    return { label: 'Dry', barColor: 'bg-[#e04856]', textColor: 'text-[#e04856]' };
  }
  if (percent <= 70) {
    return { label: 'Moist', barColor: 'bg-[#2e854e]', textColor: 'text-[#2e854e]' };
  }
  return { label: 'Wet', barColor: 'bg-[#2563eb]', textColor: 'text-[#2563eb]' };
}

/**
 * Turbidity classification based on voltage:
 * >= 2.25 Clear, >= 1.75 Slightly cloudy, >= 1.25 Cloudy, otherwise Very dirty
 */
export function getTurbidityCategory(voltage) {
  if (voltage == null || Number.isNaN(voltage)) return 'Unknown';
  if (voltage >= 2.25) return 'Clear';
  if (voltage >= 1.75) return 'Slightly cloudy';
  if (voltage >= 1.25) return 'Cloudy';
  return 'Very dirty';
}

/**
 * pH classification:
 * below 6.5 Acidic, 6.5-7.5 Neutral, above 7.5 Alkaline
 */
export function getPhCategory(ph) {
  if (ph == null || Number.isNaN(ph)) return 'Unknown';
  if (ph < 6.5) return 'Acidic';
  if (ph <= 7.5) return 'Neutral';
  return 'Alkaline';
}

/**
 * React hook that polls <ESP32_ADDRESS>/data every 2 seconds.
 * Safely maintains last good data on network errors and provides connection status.
 */
export function useESP32(pollInterval = 2000) {
  const [address, setAddressState] = useState(getStoredEsp32Url);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState(null);
  const [lastGoodData, setLastGoodData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [missedPolls, setMissedPolls] = useState(0);

  const consecutiveFailures = useRef(0);
  const isMounted = useRef(true);
  const activeAbort = useRef(null);

  const updateAddress = useCallback((newUrl) => {
    const saved = setStoredEsp32Url(newUrl);
    setAddressState(saved);
  }, []);

  const fetchOnce = useCallback(async (targetUrl) => {
    const url = targetUrl || address;
    const endpoint = `${url}/data`;

    if (activeAbort.current) {
      activeAbort.current.abort();
    }
    const controller = new AbortController();
    activeAbort.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 2800);

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      if (!isMounted.current) return;

      consecutiveFailures.current = 0;
      setMissedPolls(0);
      setData(json);
      setLastGoodData(json);
      setConnected(true);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      clearTimeout(timeoutId);
      if (!isMounted.current) return;

      consecutiveFailures.current += 1;
      const count = consecutiveFailures.current;
      setMissedPolls(count);

      // Require 3 consecutive missed polls before marking device offline
      if (count >= 3) {
        setConnected(false);
      }
      setError(err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'ESP32 unreachable'));
    }
  }, [address]);

  useEffect(() => {
    isMounted.current = true;
    fetchOnce(address);

    const intervalId = setInterval(() => {
      fetchOnce(address);
    }, pollInterval);

    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
      if (activeAbort.current) activeAbort.current.abort();
    };
  }, [address, fetchOnce, pollInterval]);

  return {
    address,
    setAddress: updateAddress,
    connected,
    data,
    lastGoodData,
    lastUpdated,
    error,
    missedPolls,
    isOffline: !connected || missedPolls >= 3,
    refresh: () => fetchOnce(address),
  };
}
