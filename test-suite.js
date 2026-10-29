import assert from 'node:assert';
import fs from 'node:fs';
import { demoTrip, demoRouteOptions } from './src/data/demoRoute.ts';
import { initialVehicleProfile, availableVehicles } from './src/data/demoVehicle.ts';
import { initialChargingSettings, initialRoutingSettings, initialPlanOptions } from './src/data/demoSettings.ts';

console.log('--- EXECUTING EV ROUTE PLANNER INTEGRITY & CONSISTENCY TEST SUITE ---');

// 1. DATA CONSISTENCY TEST: Check all 3 alternative routes
console.log('Test 1: Mathematical Duration & Metric Consistency across all routes...');
for (const route of demoRouteOptions) {
  console.log(`Checking route: ${route.id} (${route.label})`);
  
  // Total must strictly equal driving + charging + stop buffer
  const calculatedTotal = route.drivingDurationMinutes + route.chargingDurationMinutes + route.stopBufferMinutes;
  assert.strictEqual(
    route.totalDurationMinutes,
    calculatedTotal,
    `Duration inconsistency in ${route.id}: total (${route.totalDurationMinutes}) != drive (${route.drivingDurationMinutes}) + charge (${route.chargingDurationMinutes}) + buffer (${route.stopBufferMinutes})`
  );

  // Stop count must equal stops.length
  assert.strictEqual(
    route.stopCount,
    route.stops.length,
    `Stop count mismatch in ${route.id}: stopCount (${route.stopCount}) != stops.length (${route.stops.length})`
  );

  // Buffer must equal stops.length * 5 min
  assert.strictEqual(
    route.stopBufferMinutes,
    route.stops.length * 5,
    `Stop buffer in ${route.id} does not equal 5 min per stop`
  );

  // Polyline must have real coordinates
  assert(route.polylineCoordinates.length >= 10, `Polyline for ${route.id} has too few coordinates`);
  for (const [lat, lng] of route.polylineCoordinates) {
    assert(lat >= 25 && lat <= 29, `Latitude ${lat} out of range for corridor`);
    assert(lng >= 77 && lng <= 86, `Longitude ${lng} out of range for corridor`);
  }
}
console.log('✓ All 3 route alternatives are mathematically and geographically consistent.');

// 2. TILE PROVIDER AUDIT: Ensure NO unauthenticated CARTO watermark URL is used as default
console.log('Test 2: Verifying Map tile provider configuration...');
const mapViewContent = fs.readFileSync('src/components/map/MapView.tsx', 'utf8');
assert(!mapViewContent.includes('basemaps.cartocdn.com/dark_all'), 'CARTO watermark URL still present in MapView.tsx');
assert(mapViewContent.includes('tile.openstreetmap.org'), 'OpenStreetMap tile source missing');
assert(mapViewContent.includes('osm-dark-tiles'), 'Dark mode tile filter class missing');
assert(mapViewContent.includes('esri-dark'), 'Esri dark tile option missing');
console.log('✓ Map tile provider verified: CARTO watermark completely removed; OSM Dark + Esri configured.');

// 3. VEHICLE PROFILE AUDIT: Tata Nexon reference test values
console.log('Test 3: Checking vehicle profile values...');
assert.strictEqual(initialVehicleProfile.referenceConsumptionWhPerMi, 245, 'Ref consumption must be 245 Wh/mi');
assert.strictEqual(initialVehicleProfile.maximumSpeedMph, 83, 'Max speed must be 83 mph');
assert.strictEqual(initialVehicleProfile.relativeSpeedPercent, 101, 'Relative speed must be 101%');
assert.strictEqual(initialVehicleProfile.batteryDegradationPercent, 5.1, 'Degradation must be 5.1%');
assert(initialVehicleProfile.selectedPlugTypes.includes('CCS'), 'CCS must be selected');
assert(!initialVehicleProfile.selectedPlugTypes.includes('Level 2'), 'Level 2 must be unselected');
assert(availableVehicles.length >= 3, 'Multiple vehicle options must be available for replace dialog');
console.log('✓ Vehicle profile verified against reference specifications.');

// 4. CHARGING & ROUTING SETTINGS AUDIT
console.log('Test 4: Checking charging & routing settings defaults...');
assert.strictEqual(initialChargingSettings.minimumChargerStalls, 1, 'Minimum charger stalls must be 1');
assert.strictEqual(initialChargingSettings.maximumChargeLimit, 100, 'Maximum charge limit must be 100%');
assert.strictEqual(initialChargingSettings.preferredMinArrivalBatteryCharger, 10, 'Min charger arrival battery must be 10%');
assert.strictEqual(initialChargingSettings.preferredMinArrivalBatteryDestination, 10, 'Min destination arrival battery must be 10%');
assert.strictEqual(initialRoutingSettings.chargeStops, 'Optimal', 'Default charge stops strategy must be Optimal');
assert.strictEqual(initialRoutingSettings.weatherChoice, 'Seasonal', 'Default weather choice must be Seasonal');
assert(initialRoutingSettings.seasonalWeatherDescription.includes('Seasonal temperature'), 'Seasonal weather description missing');
console.log('✓ Charging & routing settings verified.');

// 5. COMPONENT EXISTENCE & HEALTH CHECK
console.log('Test 5: Verifying all required modular components on disk...');
const requiredFiles = [
  'src/components/map/MapView.tsx',
  'src/components/route/RoutePanel.tsx',
  'src/components/route/ChargingStopCard.tsx',
  'src/components/dialogs/PlanOptionsModal.tsx',
  'src/components/dialogs/SettingsModal.tsx',
  'src/components/dialogs/StationDetailsModal.tsx',
  'src/components/dialogs/LoginModal.tsx',
  'src/components/dialogs/LiveDataModal.tsx',
  'src/components/dialogs/PlugTypesModal.tsx',
  'src/components/dialogs/ReplaceVehicleModal.tsx',
  'src/components/dialogs/AddChargeCardModal.tsx',
  'src/components/topbar/TopNav.tsx',
  'src/context/PlannerContext.tsx'
];

for (const f of requiredFiles) {
  assert(fs.existsSync(f), `File ${f} is missing!`);
  const content = fs.readFileSync(f, 'utf8');
  assert(content.length > 250, `File ${f} is unexpectedly small`);
}
console.log(`✓ All ${requiredFiles.length} required modular files verified intact.`);

console.log('--- ALL ACCEPTANCE CRITERIA TESTS PASSED! ---');
