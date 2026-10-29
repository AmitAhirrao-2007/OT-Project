import assert from 'node:assert';
import fs from 'node:fs';
import { demoTrip, demoRouteOptions } from './src/data/demoRoute.ts';
import { initialVehicleProfile, availableVehicles } from './src/data/demoVehicle.ts';
import { initialChargingSettings, initialRoutingSettings, initialPlanOptions } from './src/data/demoSettings.ts';
import { calculateChargingDuration, calculateLegEnergy, getEffectiveBatteryCapacity } from './src/services/energyModel.ts';
import { calculateTripRoutes, haversineDistanceMi, formatHoursMinutes, addMinutesToTimeString } from './src/services/routingService.ts';
import { formatDistance, formatSpeed, formatConsumption, formatTemperature } from './src/utils/units.ts';
import { chargingStations } from './src/data/stationCatalogue.ts';
import { POPULAR_LOCATIONS } from './src/data/knownLocations.ts';

console.log('--- EXECUTING EV ROUTE PLANNER COMPREHENSIVE TEST SUITE ---');

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

// 5. ENERGY MODEL AUDIT: Degradation, Speed & Piecewise Taper Curves
console.log('Test 5: Testing Energy Model and DC Fast Charging Calculations...');
const effectiveCap = getEffectiveBatteryCapacity(initialVehicleProfile);
assert(effectiveCap < initialVehicleProfile.usableBatteryKwh, 'Degradation must reduce usable capacity');
assert(Math.abs(effectiveCap - (38.0 * (1 - 0.051))) < 0.01, 'Degradation formula mismatch');

// Leg consumption
const leg = calculateLegEnergy({
  distanceMi: 100,
  vehicle: initialVehicleProfile,
  ambientTempF: 72,
  relativeSpeedPercent: 100
});
assert(leg.energyKwh > 20 && leg.energyKwh < 30, `Leg energy ${leg.energyKwh} out of reasonable range`);
assert(leg.socPercent > 50 && leg.socPercent < 80, `Leg SoC ${leg.socPercent}% out of reasonable range`);

// Charging duration with taper
const charge = calculateChargingDuration({
  batteryCapacityKwh: 40.5,
  usableCapacityKwh: 38.0,
  degradationPercent: 5.1,
  maxDcChargingKw: 50,
  stationPowerKw: 120,
  currentSocPercent: 10,
  targetSocPercent: 80
});
assert(charge.durationMinutes > 20 && charge.durationMinutes < 60, `Charge duration ${charge.durationMinutes} min out of expected range`);
assert(charge.energyAddedKwh > 20 && charge.energyAddedKwh < 30, `Energy added ${charge.energyAddedKwh} kWh unexpected`);
console.log('✓ Energy Model and DC Charging Taper calculations verified.');

// 6. DYNAMIC ROUTING SERVICE TEST
console.log('Test 6: Testing Dynamic Route Calculation & Time Math...');
assert.strictEqual(formatHoursMinutes(881), '14 h 41 min', 'Format hours/minutes mismatch');
assert.strictEqual(formatHoursMinutes(45), '45 min', 'Format minutes mismatch');
assert.strictEqual(addMinutesToTimeString('12:31 AM', 120), '2:31 AM', 'Add minutes mismatch');

const dist = haversineDistanceMi([25.5941, 85.1376], [28.6139, 77.2090]);
assert(dist > 500 && dist < 650, `Haversine distance ${dist} unexpected for Patna-Delhi`);

const dynamicResult = await calculateTripRoutes({
  origin: demoTrip.origin,
  destination: demoTrip.destination,
  waypoints: [],
  vehicle: initialVehicleProfile,
  planOptions: initialPlanOptions,
  chargingSettings: initialChargingSettings,
  routingSettings: initialRoutingSettings
});
assert(dynamicResult.routeOptions.length >= 3, 'Must return at least 3 route alternatives');
assert.strictEqual(dynamicResult.activeRouteId, 'route-optimal');
console.log('✓ Dynamic routing engine returned feasible calibrated corridor routes.');

// 7. UNIT CONVERSION TEST
console.log('Test 7: Verifying Metric vs Imperial Unit Conversions...');
assert.strictEqual(formatDistance(100, 'imperial'), '100 mi');
assert.strictEqual(formatDistance(100, 'metric'), '161 km');
assert.strictEqual(formatSpeed(60, 'imperial'), '60 mph');
assert.strictEqual(formatSpeed(60, 'metric'), '97 km/h');
assert.strictEqual(formatConsumption(245, 'imperial'), '245 Wh/mi');
assert.strictEqual(formatConsumption(245, 'metric'), '152 Wh/km');
assert.strictEqual(formatTemperature(72, 'F'), '72°F');
assert.strictEqual(formatTemperature(72, 'C'), '22°C');
console.log('✓ Unit conversions mathematically accurate across Imperial and Metric.');

// 8. DATA CATALOGUES & KNOWN LOCATIONS
console.log('Test 8: Verifying Station Catalogue and Known Location Hubs...');
assert(chargingStations.length >= 8, 'Station catalogue has too few stations');
assert(POPULAR_LOCATIONS.length >= 15, 'Known locations catalogue has too few hubs');
const ccsStations = chargingStations.filter((s) => s.connectors.some((c) => c.type === 'CCS'));
assert(ccsStations.length >= 5, 'Must have at least 5 CCS stations');
console.log('✓ Station catalogue and location points validated.');

// 9. COMPONENT EXISTENCE & INTEGRITY CHECK
console.log('Test 9: Verifying all modular components on disk...');
const requiredFiles = [
  'src/components/map/MapView.tsx',
  'src/components/route/RoutePanel.tsx',
  'src/components/route/RouteInputs.tsx',
  'src/components/route/ChargingStopCard.tsx',
  'src/components/charger/ChargerFinderModal.tsx',
  'src/components/dialogs/PlanOptionsModal.tsx',
  'src/components/dialogs/SavedPlansModal.tsx',
  'src/components/dialogs/SettingsModal.tsx',
  'src/components/dialogs/StationDetailsModal.tsx',
  'src/components/dialogs/LoginModal.tsx',
  'src/components/dialogs/LiveDataModal.tsx',
  'src/components/dialogs/PlugTypesModal.tsx',
  'src/components/dialogs/ReplaceVehicleModal.tsx',
  'src/components/dialogs/AddChargeCardModal.tsx',
  'src/components/topbar/TopNav.tsx',
  'src/context/PlannerContext.tsx',
  'src/services/energyModel.ts',
  'src/services/routingService.ts',
  'src/utils/units.ts',
  'src/data/stationCatalogue.ts',
  'src/data/knownLocations.ts'
];

for (const f of requiredFiles) {
  assert(fs.existsSync(f), `File ${f} is missing!`);
  const content = fs.readFileSync(f, 'utf8');
  assert(content.length > 200, `File ${f} is unexpectedly small`);
}
console.log(`✓ All ${requiredFiles.length} required modular files verified intact.`);

console.log('\n--- ALL 9 TEST SUITES PASSED FLAWLESSLY! ---');
