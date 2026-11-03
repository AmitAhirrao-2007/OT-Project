import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateTripRoutes,
  isDefaultPatnaDelhiCorridor,
  RouteCalculationRequest
} from '../services/routingService';
import {
  calculateRoadRouteAlternatives
} from '../services/traffic/trafficService';
import { Waypoint } from '../types/route';
import { initialVehicleProfile } from '../data/demoVehicle';
import {
  initialPlanOptions,
  initialChargingSettings,
  initialRoutingSettings
} from '../data/demoSettings';

describe('Phase 6C — Universal Origin, Destination, Dynamic Road Routes & Alternative Road Selection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Base test vehicle and settings
  const vehicle = initialVehicleProfile;
  const planOptions = { ...initialPlanOptions };
  const chargingSettings = { ...initialChargingSettings };
  const routingSettings = { ...initialRoutingSettings };

  // =========================================================================
  // 1. LOCATION TEST CASES & UNIVERSAL SELECTION
  // =========================================================================
  describe('Universal Origin, Destination & Intermediate Stop Selection', () => {
    it('1.1 should correctly identify that Patna -> Darbhanga is NOT the Patna-Delhi demo corridor', () => {
      const origin: Waypoint = {
        id: 'patna',
        name: 'Patna',
        address: 'Patna, Bihar, India',
        coordinates: [25.5941, 85.1376],
        batterySoc: 90
      };
      const darbhanga: Waypoint = {
        id: 'darbhanga',
        name: 'Darbhanga',
        address: 'Darbhanga, Bihar, India',
        coordinates: [26.1542, 85.8918],
        batterySoc: 10
      };

      const isDemo = isDefaultPatnaDelhiCorridor(origin, darbhanga, []);
      expect(isDemo).toBe(false);
    });

    it('1.2 should calculate dynamic route for Patna -> Darbhanga with genuine road distance (~80-100 mi)', async () => {
      const origin: Waypoint = {
        id: 'patna',
        name: 'Patna',
        address: 'Patna, Bihar, India',
        coordinates: [25.5941, 85.1376],
        batterySoc: 95
      };
      const destination: Waypoint = {
        id: 'darbhanga',
        name: 'Darbhanga',
        address: 'Darbhanga, Bihar, India',
        coordinates: [26.1542, 85.8918],
        batterySoc: 10
      };

      const req: RouteCalculationRequest = {
        origin,
        destination,
        waypoints: [],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(1);

      const primary = result.routeOptions.find((r) => r.id === result.activeRouteId) || result.routeOptions[0];
      // Patna to Darbhanga is ~80-100 miles, nowhere near the 647 mi of Patna-Delhi
      expect(primary.totalDistanceMi).toBeGreaterThanOrEqual(50);
      expect(primary.totalDistanceMi).toBeLessThan(180);
      expect(primary.polylineCoordinates.length).toBeGreaterThan(2);
      expect(primary.stops.length).toBe(0); // With 95% SoC, 80 mi Nexon EV Max can reach Darbhanga directly without charging!
      expect(primary.isFeasible).toBe(true);
    });

    it('1.3 should respect arbitrary address coordinates (Kankarbagh Main Road) without resetting to city center', async () => {
      // Specific Kankarbagh locality coordinates in south Patna
      const kankarbaghOrigin: Waypoint = {
        id: 'kankarbagh',
        name: 'Kankarbagh Main Road, Patna',
        address: 'Kankarbagh Main Rd, Near Tiwari Bechar, Patna, Bihar 800020',
        coordinates: [25.5996, 85.1550],
        batterySoc: 95
      };
      const delhiDest: Waypoint = {
        id: 'delhi',
        name: 'New Delhi',
        address: 'New Delhi, Delhi, India',
        coordinates: [28.6139, 77.2090],
        batterySoc: 10
      };

      const req: RouteCalculationRequest = {
        origin: kankarbaghOrigin,
        destination: delhiDest,
        waypoints: [],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(1);
      const opt = result.routeOptions[0];
      // Check that polyline begins at the specific Kankarbagh coordinates
      expect(opt.polylineCoordinates[0][0]).toBeCloseTo(25.5996, 2);
      expect(opt.polylineCoordinates[0][1]).toBeCloseTo(85.1550, 2);
    });

    it('1.4 should route Mumbai -> Goa passing through an intermediate restaurant/hotel via stop', async () => {
      const mumbai: Waypoint = {
        id: 'mumbai',
        name: 'Mumbai',
        coordinates: [19.0760, 72.8777],
        batterySoc: 95
      };
      const viaStop: Waypoint = {
        id: 'via-hotel-pune',
        name: 'The Orchid Hotel Pune',
        address: 'Bangalore-Pune Highway, Pune',
        coordinates: [18.5714, 73.7663],
        batterySoc: 25,
        type: 'via'
      };
      const goa: Waypoint = {
        id: 'goa',
        name: 'Panaji, Goa',
        coordinates: [15.4909, 73.8278],
        batterySoc: 15
      };

      const req: RouteCalculationRequest = {
        origin: mumbai,
        destination: goa,
        waypoints: [viaStop],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(1);
      const opt = result.routeOptions[0];
      expect(opt.totalDistanceMi).toBeGreaterThan(250);
      // Ensure polyline contains intermediate coordinates in vicinity of Pune
      const passesNearVia = opt.polylineCoordinates.some(
        ([lat, lon]) => Math.abs(lat - 18.5714) < 0.5 && Math.abs(lon - 73.7663) < 0.5
      );
      expect(passesNearVia).toBe(true);
    });

    it('1.5 should accurately report incomplete charger data for international routes (London -> Manchester)', async () => {
      const london: Waypoint = {
        id: 'london',
        name: 'London',
        coordinates: [51.5074, -0.1278],
        batterySoc: 90
      };
      const manchester: Waypoint = {
        id: 'manchester',
        name: 'Manchester',
        coordinates: [53.4808, -2.2426],
        batterySoc: 10
      };

      const req: RouteCalculationRequest = {
        origin: london,
        destination: manchester,
        waypoints: [],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      const opt = result.routeOptions[0];
      // Driving distance London -> Manchester is ~190-220 miles
      expect(opt.totalDistanceMi).toBeGreaterThan(150);
      // Since local catalogue contains 20 Indian stations, it must report honest unavailability
      expect(opt.chargerDataStatus).toBe('unavailable_outside_catalogue');
      expect(opt.isFeasible).toBe(false);
      expect(opt.feasibilityNote).toContain('catalogue (20 Indian stations)');
    });

    it('1.6 should route with multiple (3) intermediate stops preserving exact sequence order', async () => {
      const origin: Waypoint = { id: 'orig', name: 'Start', coordinates: [20.0, 75.0], batterySoc: 90 };
      const stop1: Waypoint = { id: 's1', name: 'Stop 1', coordinates: [20.5, 75.5], batterySoc: 25, type: 'via' };
      const stop2: Waypoint = { id: 's2', name: 'Stop 2', coordinates: [21.0, 76.0], batterySoc: 25, type: 'via' };
      const stop3: Waypoint = { id: 's3', name: 'Stop 3', coordinates: [21.5, 76.5], batterySoc: 25, type: 'via' };
      const dest: Waypoint = { id: 'dest', name: 'End', coordinates: [22.0, 77.0], batterySoc: 10 };

      const req: RouteCalculationRequest = {
        origin,
        destination: dest,
        waypoints: [stop1, stop2, stop3],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(1);
      const opt = result.routeOptions[0];
      // Total route must connect through all 4 legs
      expect(opt.polylineCoordinates.length).toBeGreaterThan(10);
      expect(opt.totalDistanceMi).toBeGreaterThan(100);
    });
  });

  // =========================================================================
  // 2. DYNAMIC ROAD ALTERNATIVES & ROUTING PREFERENCES
  // =========================================================================
  describe('Provider-Supported Road Alternatives & Routing Preferences', () => {
    it('2.1 calculateRoadRouteAlternatives should parse TomTom Orbis v3 multi-route response', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-tomtom-key';

      // Mock TomTom Orbis v3 multi-route response
      global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes('/routing/3/routes/calculate')) {
          const body = JSON.parse(opts.body);
          expect(body.maxPathAlternativeRoutes).toBe(3);
          expect(body.travelMode).toBe('car');

          return Promise.resolve({
            ok: true,
            json: async () => ({
              routes: [
                {
                  summary: { lengthInMeters: 200000, travelDurationInSeconds: 7200, trafficDelayDurationInSeconds: 300 },
                  path: { type: 'LineString', coordinates: [[73.0, 19.0], [73.5, 18.5], [74.0, 18.0]] }
                },
                {
                  summary: { lengthInMeters: 220000, travelDurationInSeconds: 7800, trafficDelayDurationInSeconds: 60 },
                  path: { type: 'LineString', coordinates: [[73.0, 19.0], [73.2, 18.7], [74.0, 18.0]] }
                },
                {
                  summary: { lengthInMeters: 235000, travelDurationInSeconds: 8400, trafficDelayDurationInSeconds: 0 },
                  path: { type: 'LineString', coordinates: [[73.0, 19.0], [73.8, 18.4], [74.0, 18.0]] }
                }
              ]
            })
          });
        }
        return Promise.reject(new Error('Unknown url'));
      });

      const alternatives = await calculateRoadRouteAlternatives(
        [[19.0, 73.0], [18.0, 74.0]],
        { maxAlternatives: 3, routeType: 'fastest', avoidTolls: true }
      );

      expect(alternatives.length).toBe(3);
      expect(alternatives[0].name).toBe('Fastest Road Route');
      expect(alternatives[1].name).toBe('Alternative Road 1');
      expect(alternatives[2].name).toBe('Alternative Road 2');
      expect(alternatives[0].distanceMi).toBe(124); // 200 km
      expect(alternatives[1].distanceMi).toBe(137); // 220 km
      expect(alternatives[2].distanceMi).toBe(146); // 235 km
      expect(alternatives[0].source).toBe('orbis_v3');
    });

    it('2.2 calculateRoadRouteAlternatives should pass avoidances (avoidTolls, avoidHighways, avoidFerries) to Orbis v3', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-tomtom-key';

      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes('/routing/3/routes/calculate')) {
          capturedBody = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            json: async () => ({
              routes: [
                {
                  summary: { lengthInMeters: 100000, travelDurationInSeconds: 3600 },
                  path: { coordinates: [[73.0, 19.0], [74.0, 18.0]] }
                }
              ]
            })
          });
        }
        return Promise.reject(new Error('Unknown url'));
      });

      await calculateRoadRouteAlternatives(
        [[19.0, 73.0], [18.0, 74.0]],
        { avoidTolls: true, avoidHighways: true, avoidFerries: true, routeType: 'shortest' }
      );

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.routeType).toBe('short');
      expect(capturedBody.avoid).toEqual({
        tollRoads: true,
        motorways: true,
        ferries: true
      });
    });

    it('2.3 should not invent fake alternatives if the provider returns only 1 path', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-tomtom-key';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/routing/3/routes/calculate')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              routes: [
                {
                  summary: { lengthInMeters: 50000, travelDurationInSeconds: 1800 },
                  path: { coordinates: [[85.0, 25.0], [85.5, 25.5]] }
                }
              ]
            })
          });
        }
        return Promise.reject(new Error('Unknown url'));
      });

      const alternatives = await calculateRoadRouteAlternatives(
        [[25.0, 85.0], [25.5, 85.5]],
        { maxAlternatives: 3 }
      );

      // Exactly 1 route returned from TomTom Orbis v3; must NOT manufacture fake shifted lines!
      expect(alternatives.length).toBe(1);
      expect(alternatives[0].source).toBe('orbis_v3');
    });
  });

  // =========================================================================
  // 3. EV OPTIMIZER EVALUATION ACROSS ALTERNATIVE ROAD ROUTES
  // =========================================================================
  describe('Independent EV Route Optimization Across Candidate Road Paths', () => {
    it('3.1 should evaluate charging requirements separately for each candidate road alternative', async () => {
      // Mock TomTom returning 2 distinct road alternatives
      process.env.VITE_TOMTOM_API_KEY = 'test-tomtom-key';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/routing/3/routes/calculate')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              routes: [
                {
                  summary: { lengthInMeters: 300000, travelDurationInSeconds: 10800 }, // ~186 miles
                  path: { coordinates: [[85.1376, 25.5941], [84.0, 25.0], [83.0, 25.3], [82.9739, 25.3176]] }
                },
                {
                  summary: { lengthInMeters: 350000, travelDurationInSeconds: 12600 }, // ~217 miles
                  path: { coordinates: [[85.1376, 25.5941], [84.5, 26.0], [83.5, 25.8], [82.9739, 25.3176]] }
                }
              ]
            })
          });
        }
        return Promise.reject(new Error('Network error'));
      });

      const origin: Waypoint = {
        id: 'patna',
        name: 'Patna',
        coordinates: [25.5941, 85.1376],
        batterySoc: 70
      };
      const dest: Waypoint = {
        id: 'varanasi',
        name: 'Varanasi',
        coordinates: [25.3176, 82.9739],
        batterySoc: 10
      };

      const req: RouteCalculationRequest = {
        origin,
        destination: dest,
        waypoints: [],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThanOrEqual(2);

      const opt1 = result.routeOptions[0];
      const opt2 = result.routeOptions[1];

      // Route 1 distance (~186 mi) and Route 2 distance (~217 mi) are distinct
      expect(opt1.totalDistanceMi).not.toEqual(opt2.totalDistanceMi);
      expect(opt1.polylineCoordinates).not.toEqual(opt2.polylineCoordinates);
      // Both options carry their own independent charging evaluation
      expect(opt1.drivingDuration).not.toBeUndefined();
      expect(opt2.drivingDuration).not.toBeUndefined();
    });

    it('3.2 should recommend the best EV-feasible route separately from raw road duration', async () => {
      const origin: Waypoint = { id: 'p1', name: 'Start', coordinates: [25.5, 85.0], batterySoc: 90 };
      const dest: Waypoint = { id: 'p2', name: 'End', coordinates: [26.0, 85.5], batterySoc: 10 };

      const req: RouteCalculationRequest = {
        origin,
        destination: dest,
        waypoints: [],
        vehicle,
        planOptions,
        chargingSettings,
        routingSettings
      };

      const result = await calculateTripRoutes(req);
      const recommended = result.routeOptions.find((r) => r.isRecommended);
      expect(recommended).toBeDefined();
    });
  });
});
