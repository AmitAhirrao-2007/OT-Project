import { calculateTripRoutes } from '../src/services/routingService.ts';
import { initialVehicleProfile } from '../src/data/demoVehicle.ts';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../src/data/demoSettings.ts';

async function test() {
  const res = await calculateTripRoutes({
    origin: { id: 'delhi', name: 'New Delhi', coordinates: [28.6139, 77.2090], batterySoc: 95 },
    destination: { id: 'kisan', name: 'Tata Power EZ Charge - Kisan Path Bypass', coordinates: [26.8467, 80.9462], batterySoc: 10 },
    waypoints: [],
    vehicle: initialVehicleProfile,
    planOptions: initialPlanOptions,
    chargingSettings: initialChargingSettings,
    routingSettings: initialRoutingSettings
  });

  const opt = res.routeOptions[0];
  console.log('Route Options count:', res.routeOptions.length);
  console.log('Active Route ID:', res.activeRouteId);
  console.log('Opt 0 ID:', opt.id);
  console.log('Opt 0 Name:', opt.routeName || opt.description);
  console.log('Opt 0 Distance:', opt.totalDistanceMi);
  console.log('Opt 0 Duration:', opt.drivingDuration);
  console.log('Opt 0 Stops count:', opt.stops.length);
  console.log('Opt 0 Polyline count:', opt.polylineCoordinates?.length);
  console.log('Opt 0 Polyline sample:', JSON.stringify(opt.polylineCoordinates?.slice(0, 5)));
  console.log('Opt 0 Stops coords:', opt.stops.map(s => ({ name: s.name, coords: s.coordinates, arrSoc: s.arrivalSoc })));
}
test().catch(console.error);

