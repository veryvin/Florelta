/**
 * HARDWARE REGISTRY FOR FLORELTA
 * Defines the real hardware profile connected to the ESP32:
 * Controller, 5 Sensors, 1 Actuator, and 1 Display with GPIO pin mappings.
 */

export const HARDWARE_PROFILE = {
  controller: {
    id: 'ctrl-esp32',
    name: 'ESP32 NodeMCU DevKit',
    board: 'ESP32 (30-pin)',
    ipDefault: '192.168.4.1',
    firmware: '1.0.0 (SoilMonitor)',
  },
  sensors: [
    {
      id: 'sen-moisture',
      key: 'moisture',
      name: 'Soil Moisture Sensor',
      type: 'Soil Moisture (Capacitive / Resistive)',
      pin: 34,
      pinType: 'Analog ADC1 (GPIO34)',
      area: 'Garden',
      unit: '%',
    },
    {
      id: 'sen-temp',
      key: 'temp',
      name: 'Water Temperature Sensor',
      type: 'DS18B20 Waterproof Probe',
      pin: 27,
      pinType: 'OneWire Digital (GPIO27)',
      area: 'Aquaculture',
      unit: '°C',
    },
    {
      id: 'sen-turb',
      key: 'turb',
      name: 'Turbidity Sensor Module',
      type: 'Optical Turbidity Sensor',
      pin: 35,
      pinType: 'Analog ADC1 (GPIO35)',
      area: 'Aquaculture',
      unit: ' NTU',
    },
    {
      id: 'sen-ph',
      key: 'ph',
      name: 'pH Sensor Module',
      type: 'Analog pH Electrode & Signal Board',
      pin: 32,
      pinType: 'Analog ADC1 (GPIO32)',
      area: 'Aquaculture',
      unit: '',
    },
    {
      id: 'sen-dht22',
      key: 'dht22',
      name: 'DHT22 Climate Sensor',
      type: 'DHT22 Digital Temperature & Humidity',
      pin: 26,
      pinType: 'Digital (GPIO26)',
      area: 'Garden',
      unit: '°C / %',
    },
  ],
  actuators: [
    {
      id: 'act-pump',
      key: 'pump',
      name: 'Irrigation Pump Relay',
      type: '5V Single-Channel Relay Module',
      pin: 16,
      pinType: 'Digital Output (GPIO16)',
      area: 'Garden',
    },
  ],
  displays: [
    {
      id: 'disp-lcd',
      key: 'lcd',
      name: '16x2 I2C LCD Display',
      type: 'HD44780 with PCF8574 I2C Backpack',
      pin: '21 (SDA), 22 (SCL)',
      pinType: 'I2C Bus (GPIO21 / GPIO22)',
      area: 'Local Controller',
      statusNote: 'not reported by device',
    },
  ],
};

/**
 * Builds equipment items list for Dashboard's EquipmentPanel.
 * Derives live status directly from the ESP32 data stream.
 */
export function buildLiveEquipmentList(espData, isConnected) {
  if (!isConnected) {
    return [
      { id: 'esp32', name: 'ESP32 Controller', state: 'offline', mode: null },
      { id: 'pump', name: 'Irrigation Pump Relay (GPIO 16)', state: 'offline', mode: null },
      { id: 'temp', name: 'Water Temp Sensor (DS18B20)', state: 'offline', mode: null },
      { id: 'ph', name: 'pH Sensor Module (GPIO 32)', state: 'offline', mode: null },
      { id: 'turb', name: 'Turbidity Sensor (GPIO 35)', state: 'offline', mode: null },
      { id: 'moisture', name: 'Soil Moisture Sensor (GPIO 34)', state: 'offline', mode: null },
      { id: 'dht22', name: 'DHT22 Climate Sensor (GPIO 26)', state: 'offline', mode: null },
      { id: 'lcd', name: '16x2 I2C LCD (GPIO 21/22)', state: 'off', mode: null },
    ];
  }

  const d = espData || {};

  // Pump state
  let pumpState = 'off';
  if (d.pump) pumpState = 'running';

  // Sensor states
  const tempState = d.temp == null ? 'fault' : 'running';
  const phState = d.phOk === false || d.ph == null ? 'fault' : 'running';
  const turbState = d.turbOk === false || d.turb == null ? 'fault' : 'running';
  const moistState = d.percent == null ? 'fault' : 'running';
  const dhtState = (d.airTemp == null || d.hum == null) ? 'fault' : 'running';

  return [
    { id: 'esp32', name: 'ESP32 Controller', state: 'running', mode: null },
    { id: 'pump', name: 'Irrigation Pump Relay (GPIO 16)', state: pumpState, mode: 'auto' },
    { id: 'temp', name: 'Water Temp Sensor (DS18B20)', state: tempState, mode: null },
    { id: 'ph', name: 'pH Sensor Module (GPIO 32)', state: phState, mode: null },
    { id: 'turb', name: 'Turbidity Sensor (GPIO 35)', state: turbState, mode: null },
    { id: 'moisture', name: 'Soil Moisture Sensor (GPIO 34)', state: moistState, mode: null },
    { id: 'dht22', name: 'DHT22 Climate Sensor (GPIO 26)', state: dhtState, mode: null },
    { id: 'lcd', name: '16x2 I2C LCD (GPIO 21/22)', state: 'off', mode: null },
  ];
}
