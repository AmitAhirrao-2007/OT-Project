import { calculateTripRoutes } from '../src/services/routingService';
import { initialVehicleProfile } from '../src/data/demoVehicle';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../src/data/demoSettings';

async function run() {
  const origin = {
    id: 'origin-custom',
    name: 'New Delhi, Delhi',
    subTitle: 'New Delhi, Delhi, India',
    address: 'New Delhi, Delhi, India',
    coordinates: [28.6139, 77.2090] as [number, number],
    batterySoc: 95,
    departureTime: '12:31 AM',
    isCustom: true
  };

  const destination = {
    id: 'destination-custom',
    name: 'Tata Power EZ Charge - Kisan Path Bypass',
    subTitle: 'Tata Power EZ Charge • 150 kW DC Fast Charger',
    address: 'Kisan Path Outer Ring Road, Lucknow',
    coordinates: [26.8467, 80.9462] as [number, number],
    batterySoc: 10,
    isCustom: true
  };

  const res = await calculateTripRoutes({
    origin,
    destination,
    waypoints: [],
    vehicle: initialVehicleProfile,
    planOptions: initialPlanOptions,
    chargingSettings: initialChargingSettings,
    routingSettings: initialRoutingSettings
  });

  console.log('Active route ID:', res.activeRouteId);
  console.log('Options count:', res.routeOptions.length);
  for (const opt of res.routeOptions) {
    console.log('--- Option:', opt.id, opt.routeName, '---');
    console.log('Duration:', opt.totalDuration, 'Dist:', opt.totalDistanceMi, 'Feasible:', opt.isFeasible);
    console.log('Stops count:', opt.stops.length);
    console.log('Polyline length:', opt.polylineCoordinates?.length);
    if (opt.polylineCoordinates?.length > 0) {
      console.log('Polyline start:', opt.polylineCoordinates[0], 'end:', opt.polylineCoordinates[opt.polylineCoordinates.length - 1]);
      const hasNaN = opt.polylineCoordinates.some(c => isNaN(c[0]) || isNaN(c[1]));
      console.log('Polyline has NaN:', hasNaN);
    }
    opt.stops.forEach((s, idx) => {
      console.log('Stop ' + (idx + 1) + ':', s.name, 'coords:', s.coordinates, 'arrivalSoc:', s.arrivalSoc, 'feasible:', s.isFeasible);
    });
  }
}

run().catch(console.error);
