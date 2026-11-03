import { calculateTripRoutes } from '../src/services/routingService';
import { initialVehicleProfile } from '../src/data/demoVehicle';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../src/data/demoSettings';

async function run() {
  // Route with potentially few or no catalogue stations: Jaipur to Jodhpur
  const origin = {
    id: 'origin-jaipur',
    name: 'Jaipur, Rajasthan',
    coordinates: [26.9124, 75.7873] as [number, number],
    batterySoc: 95,
    isCustom: true
  };

  const destination = {
    id: 'destination-jodhpur',
    name: 'Jodhpur, Rajasthan',
    coordinates: [26.2389, 73.0243] as [number, number],
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

  console.log('Jaipur -> Jodhpur activeRouteId:', res.activeRouteId);
  console.log('Options count:', res.routeOptions.length);
  for (const opt of res.routeOptions) {
    console.log('Option:', opt.id, opt.routeName, 'Dist:', opt.totalDistanceMi, 'Duration:', opt.totalDuration, 'Feasible:', opt.isFeasible, 'Stops:', opt.stops.length, 'Polyline:', opt.polylineCoordinates?.length);
  }
}

run().catch(console.error);

