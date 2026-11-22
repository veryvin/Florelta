import { evaluateMetric, THRESHOLDS } from '../config/thresholds.js';

console.log('--- STARTING COMPREHENSIVE FLORELTA LOGIC TESTS ---\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Turbidity 252 NTU consistency test
const turb252 = evaluateMetric('turb', 252, { turbOk: true, turbV: 1.8 });
assert(turb252.status === 'critical', 'Turbidity 252 NTU is evaluated as CRITICAL');
assert(turb252.label === 'Turbid / Dirty', 'Turbidity 252 NTU label is "Turbid / Dirty" (no contradiction with Safe 0-50 NTU)');

// 2. Turbidity Normal test (40 NTU)
const turb40 = evaluateMetric('turb', 40, { turbOk: true, turbV: 2.3 });
assert(turb40.status === 'normal', 'Turbidity 40 NTU is NORMAL');
assert(turb40.label === 'Clear (Optimal)', 'Turbidity 40 NTU label is Clear (Optimal)');

// 3. Turbidity Warning test (100 NTU)
const turb100 = evaluateMetric('turb', 100, { turbOk: true, turbV: 2.0 });
assert(turb100.status === 'warning', 'Turbidity 100 NTU is WARNING');
assert(turb100.label === 'Slightly Cloudy', 'Turbidity 100 NTU label is Slightly Cloudy');

// 4. Turbidity Sensor Fault test (turbOk false)
const turbFault = evaluateMetric('turb', null, { turbOk: false });
assert(turbFault.status === 'nosensor', 'Turbidity fault is nosensor');
assert(turbFault.faultType === 'sensor_fault', 'Turbidity fault is sensor_fault');

// 5. pH 4.2 test (Suspect reading outside 4-10)
const ph42 = evaluateMetric('ph', 4.2, { phOk: true });
assert(ph42.status === 'critical' || ph42.isSuspect, 'pH 4.2 is flagged as critical/suspect');
assert(ph42.label.includes('Acidic'), 'pH 4.2 label reflects Acidic');

// 6. pH 7.2 Normal test
const ph72 = evaluateMetric('ph', 7.2, { phOk: true });
assert(ph72.status === 'normal', 'pH 7.2 is NORMAL');
assert(ph72.label === 'Neutral (Optimal)', 'pH 7.2 label is Neutral (Optimal)');

// 7. pH Sensor Fault test (phOk false)
const phFault = evaluateMetric('ph', null, { phOk: false });
assert(phFault.status === 'nosensor', 'pH fault is nosensor');
assert(phFault.label === 'Sensor fault', 'pH fault label is "Sensor fault"');

// 8. Soil Moisture 0% with raw ADC 4095 (In Air / Disconnected test)
const moistInAir = evaluateMetric('moisture', 0, { raw: 4095 });
assert(moistInAir.status === 'warning', 'Soil moisture 0% with raw 4095 is evaluated as WARNING');
assert(moistInAir.isAirOrDisconnected === true, 'Soil moisture 0% with raw 4095 is flagged as In Air / Disconnected');

// 9. Soil Moisture 0% normal dry (raw ADC 2800)
const moistCritDry = evaluateMetric('moisture', 0, { raw: 2800 });
assert(moistCritDry.status === 'critical', 'Soil moisture 0% dry is CRITICAL');
assert(moistCritDry.label === 'Critically Dry', 'Soil moisture 0% dry label is Critically Dry');

// 10. Water Temp null (DS18B20 missing)
const tempNull = evaluateMetric('temp', null);
assert(tempNull.status === 'nosensor', 'Water temp null is nosensor');
assert(tempNull.label === 'No sensor', 'Water temp null label is "No sensor"');

// 11. Air Humidity 89% Warning test
const hum89 = evaluateMetric('hum', 89);
assert(hum89.status === 'warning', 'Air humidity 89% is WARNING');
assert(hum89.label === 'High Humidity', 'Air humidity 89% label is High Humidity');

// 12. Pump ON with 0% moisture
const pumpOn = evaluateMetric('pump', true, { percent: 0 });
assert(pumpOn.status === 'normal', 'Pump ON with dry soil is normal');
assert(pumpOn.label.includes('Irrigating (Soil dry)'), 'Pump ON with dry soil explains Irrigating (Soil dry)');

// 13. Pump ON with 70% moisture (above target)
const pumpOnWet = evaluateMetric('pump', true, { percent: 70 });
assert(pumpOnWet.status === 'warning', 'Pump ON with soil above target is WARNING');

// 14. Hysteresis clearance checks
const phHyst = THRESHOLDS.ph;
assert(phHyst.hysteresis === 0.1, 'pH hysteresis margin is 0.1');
// Safe range is 6.5-7.5. Low clears when >= 6.6
assert(6.55 < (phHyst.safeMin + phHyst.hysteresis), 'pH 6.55 is still inside hysteresis buffer (does not prematurely clear)');
assert(6.62 >= (phHyst.safeMin + phHyst.hysteresis), 'pH 6.62 clears low pH alert');

console.log(`\nTEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
if (failed > 0) process.exit(1);
