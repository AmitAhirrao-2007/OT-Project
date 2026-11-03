import {
  getStationStats,
  searchStations,
  getStationsInBbox,
  getStationsAlongCorridor,
  getStationById,
  loadPcsStations
} from '../server/stationDataService';

console.log('=== TASK 2 & 3: TESTING BACKEND STATION SERVICE ===');
const stations = loadPcsStations();
console.log(`Total stations loaded in memory: ${stations.length}`);

const stats = getStationStats();
console.log('Stats:', JSON.stringify(stats, null, 2));

console.log('\n--- Testing CPO / Network Searches ---');
for (const cpo of ['Tata Power', 'Ather', 'IOCL', 'HPCL', 'Adani']) {
  const res = searchStations('', { cpo, limit: 5 });
  console.log(`CPO '${cpo}': found ${res.length} sample results (first: ${res[0]?.name || 'none'})`);
}

console.log('\n--- Testing State Searches ---');
for (const state of ['Andhra Pradesh', 'Bihar', 'Maharashtra', 'Delhi']) {
  const res = searchStations('', { state, limit: 5 });
  console.log(`State '${state}': found ${res.length} sample results (first: ${res[0]?.name || 'none'})`);
}

console.log('\n--- Testing Bounding Box Query (Delhi NCR) ---');
const bboxResults = getStationsInBbox(28.4, 28.9, 77.0, 77.4, { limit: 10 });
console.log(`Delhi BBox returned ${bboxResults.length} stations. Sample: ${bboxResults[0]?.name}`);

console.log('\n--- Testing Route Corridor Query (Delhi to Agra) ---');
const delhiToAgra: [number, number][] = [
  [28.6139, 77.2090],
  [28.4089, 77.3178],
  [28.1487, 77.3320],
  [27.8974, 77.4912],
  [27.4924, 77.6737],
  [27.1767, 78.0081]
];
const corridorResults = getStationsAlongCorridor(delhiToAgra, 25, { excludeLev: true, minPowerKw: 25, limit: 10 });
console.log(`Corridor returned ${corridorResults.length} stations. Sample: ${corridorResults[0]?.name} (${corridorResults[0]?.ratedPowerKw} kW, detour: ${corridorResults[0]?.accessMetadata?.actualDetourMi} mi)`);

console.log('\n--- Testing Station Detail by ID ---');
if (stations.length > 0) {
  const sampleId = stations[0].id;
  const detail = getStationById(sampleId);
  console.log(`Station by ID '${sampleId}': ${detail ? 'SUCCESS (' + detail.name + ')' : 'FAILED'}`);
}

