const emulatorUrl = 'http://127.0.0.1:5001/aquagrow-dd5b0/us-central1/ingestReading';
const url = process.env.AQUAGROW_INGEST_URL || emulatorUrl;

const readings = [
  { deviceId: 'd1', sensorId: 'S-001', areaId: 'a1', metric: 'moisture', value: 58, key: 'a91f03c2d7be4410' },
  { deviceId: 'd2', sensorId: 'S-003', areaId: 'a3', metric: 'temp', value: 28.4, key: '5be2907a11c8d3f6' },
  { deviceId: 'd2', sensorId: 'S-004', areaId: 'a3', metric: 'ph', value: 7.2, key: '5be2907a11c8d3f6' },
  { deviceId: 'd2', sensorId: 'S-005', areaId: 'a3', metric: 'turb', value: 118, key: '5be2907a11c8d3f6' },
];

for (const reading of readings) {
  const { key, ...packet } = reading;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Key': key },
    body: JSON.stringify({
      ...packet,
      packetId: `${packet.deviceId}:${packet.sensorId}:${Date.now()}`,
      timestamp: Date.now(),
    }),
  });

  const body = await response.json().catch(() => ({}));
  console.log(`${packet.deviceId}/${packet.metric}: ${response.status}`, body);
}
