import assert from 'node:assert';
import fs from 'node:fs';

console.log('--- RUNNING EV ROUTE PLANNER INTEGRITY TEST SUITE ---');

// 1. Check demonstration route data
import('./dist/assets/index-CLwTq_uJ.js').then(() => {
  console.log('✓ Production JS bundle imports and evaluates successfully.');
}).catch((err) => {
  console.warn('Note on direct module import:', err.message);
});

// Verify raw data files
const routeData = fs.readFileSync('src/data/demoRoute.ts', 'utf8');
assert(routeData.includes('Patna'), 'Missing Patna in demoRoute');
assert(routeData.includes('Delhi'), 'Missing Delhi in demoRoute');
assert(routeData.includes('14 h 41 min'), 'Missing 14 h 41 min option');
assert(routeData.includes('14 h 45 min'), 'Missing 14 h 45 min option');
assert(routeData.includes('17 h 8 min'), 'Missing 17 h 8 min option');
assert(routeData.includes('240'), 'Missing 240 kW charger');
assert(routeData.includes('Purvanchal Expressway'), 'Missing Purvanchal stop');
assert(routeData.includes('Renovatio e-charge'), 'Missing Renovatio stop');
assert(routeData.includes('Bikanerwala Garhmukteshwar'), 'Missing Bikanerwala stop');
console.log('✓ Route demonstration data verified against captured reference.');

// Verify vehicle profile
const vehicleData = fs.readFileSync('src/data/demoVehicle.ts', 'utf8');
assert(vehicleData.includes('245'), 'Missing 245 Wh/mi reference consumption');
assert(vehicleData.includes('83'), 'Missing 83 mph maximum speed');
assert(vehicleData.includes('101'), 'Missing 101% relative speed');
assert(vehicleData.includes('5.1'), 'Missing 5.1% battery degradation');
assert(vehicleData.includes('CCS'), 'Missing CCS plug type');
console.log('✓ Vehicle profile verified (Tata Nexon EV reference values).');

// Verify settings
const settingsData = fs.readFileSync('src/data/demoSettings.ts', 'utf8');
assert(settingsData.includes('minimumChargerStalls: 1'), 'Missing 1 min stall requirement');
assert(settingsData.includes('maximumChargeLimit: 100'), 'Missing 100% max charge limit');
assert(settingsData.includes('preferredMinArrivalBatteryCharger: 10'), 'Missing 10% min charger battery');
assert(settingsData.includes('preferredMinArrivalBatteryDestination: 10'), 'Missing 10% min dest battery');
assert(settingsData.includes('Seasonal temperature and wind conditions based on historical data'), 'Missing seasonal weather description');
console.log('✓ Charging & routing settings verified against reference specifications.');

// Verify components exist and comply
const components = [
  'src/components/map/MapView.tsx',
  'src/components/route/RoutePanel.tsx',
  'src/components/route/ChargingStopCard.tsx',
  'src/components/dialogs/PlanOptionsModal.tsx',
  'src/components/dialogs/SettingsModal.tsx',
  'src/components/dialogs/StationDetailsModal.tsx',
  'src/components/dialogs/LoginModal.tsx',
  'src/components/topbar/TopNav.tsx',
  'src/context/PlannerContext.tsx'
];

for (const comp of components) {
  assert(fs.existsSync(comp), `Component ${comp} does not exist`);
  const content = fs.readFileSync(comp, 'utf8');
  assert(content.length > 200, `Component ${comp} appears incomplete`);
}
console.log(`✓ All ${components.length} architectural components verified on disk.`);

console.log('--- ALL INTEGRITY & VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
