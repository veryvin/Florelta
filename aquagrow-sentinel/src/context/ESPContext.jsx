import React, { createContext, useContext, useMemo } from 'react';
import { useESP32 } from '../services/esp32';
import { useAlertEngine } from '../services/alertEngine';
import { buildLiveEquipmentList, HARDWARE_PROFILE } from '../services/hardwareRegistry';

const ESPContext = createContext(null);

export function ESPProvider({ children }) {
  const esp = useESP32(2000);
  const espData = esp.data || esp.lastGoodData;

  const alertEngine = useAlertEngine(espData, esp.connected, esp.missedPolls || 0);

  const equipmentList = useMemo(() => {
    return buildLiveEquipmentList(espData, esp.connected);
  }, [espData, esp.connected]);

  const value = useMemo(() => ({
    esp,
    espData,
    alertEngine,
    equipmentList,
    hardwareProfile: HARDWARE_PROFILE,
  }), [esp, espData, alertEngine, equipmentList]);

  return (
    <ESPContext.Provider value={value}>
      {children}
    </ESPContext.Provider>
  );
}

export function useESP() {
  const context = useContext(ESPContext);
  if (!context) {
    throw new Error('useESP must be used within an ESPProvider');
  }
  return context;
}
