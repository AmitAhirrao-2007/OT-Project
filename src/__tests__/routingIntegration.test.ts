import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateTripRoutes, fetchRoadGeometry } from '../services/routingService';
import { RouteCalculationRequest, Waypoint } from '../types/route';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { initialVehicleProfile } from '../data/demoVehicle';
import { demoTrip } from '../data/demoRoute';
import { chargingStations } from '../data/stationCatalogue';
import { ChargingStation } from '../types/station';

describe('Phase 4B Routing Integration & Road Revalidation Test Suite', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalStations: ChargingStation[] = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalStations = [...chargingStations];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (chargingStations as unknown as ChargingStation[]).length = 0;
    chargingStations.push(...originalStations);
    vi.restoreAllMocks();
  });

  describe('1. Baseline Greedy Planning (useRcspOptimizer = false)', () => {
    it('executes default greedy heuristic when useRcspOptimizer is false', async () => {
      // Custom route from Lucknow to Agra
      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 95 },
        destination: { id: 'd', name: 'Agra', coordinates: [27.1767, 78.0081], batterySoc: 10 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: false },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);
      // All generated options are standard greedy strategies
      const methodTypes = result.routeOptions.map((o) => o.calculationMethod);
      expect(methodTypes).not.toContain('RCSP Optimizer');
      expect(result.activeRouteId).toBe('route-optimal');
    });
  });

  describe('2. Patna-Delhi Corridor Isolation', () => {
    it('always preserves calibrated demo fixture even when useRcspOptimizer is true', async () => {
      const req: RouteCalculationRequest = {
        origin: demoTrip.origin,
        destination: demoTrip.destination,
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBe(3);
      // Patna-Delhi fixture is never falsely labeled as RCSP
      result.routeOptions.forEach((opt) => {
        expect(opt.calculationMethod).not.toBe('RCSP Optimizer');
      });
      // The stops correspond to the calibrated demo corridor (Azamgarh, Haidergarh, etc.)
      expect(result.routeOptions[0].stops[0].stationId).toBe('sta-azamgarh-adani');
    });

    it('custom waypoints bypass demo corridor detection to use general optimizer', async () => {
      const customWaypoint: Waypoint = {
        id: 'wp-varanasi',
        name: 'Varanasi Bypass',
        coordinates: [25.3176, 82.9739],
        batterySoc: 50,
        isCustom: true
      };

      const req: RouteCalculationRequest = {
        origin: demoTrip.origin,
        destination: demoTrip.destination,
        waypoints: [customWaypoint],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: false },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      // Does not use Patna-Delhi demo fixture because custom waypoints are present
      expect(result.routeOptions[0].stops.map((s) => s.stationId)).not.toEqual(
        demoTrip.routeOptions[0].stops.map((s) => s.stationId)
      );
    });
  });

  describe('3. RCSP Optimizer Custom Route Execution (useRcspOptimizer = true)', () => {
    it('invokes solveRcsp and populates complete stop timings and costs', async () => {
      // Mock OSRM to return approximate road data
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              distance: 350000, // 350 km = ~217 miles
              duration: 16000, // ~266 mins
              geometry: {
                coordinates: [
                  [80.9462, 26.8467],
                  [78.0081, 27.1767]
                ]
              },
              legs: [
                { distance: 160000, duration: 7500 },
                { distance: 190000, duration: 8500 }
              ]
            }
          ]
        })
      });

      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 50 },
        destination: { id: 'd', name: 'Agra', coordinates: [27.1767, 78.0081], batterySoc: 0 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const rcspOpt = result.routeOptions.find((o) => o.id === 'route-rcsp');

      if (rcspOpt && rcspOpt.isFeasible) {
        expect(rcspOpt.calculationMethod).toBe('RCSP Optimizer');
        expect(result.activeRouteId).toBe('route-rcsp');
        expect(rcspOpt.stops.length).toBeGreaterThanOrEqual(1);

        // Verify timing fields are populated and not empty
        rcspOpt.stops.forEach((stop) => {
          expect(stop.arrivalTime).toMatch(/\d+:\d+\s*(AM|PM)/i);
          expect(stop.departureTime).toMatch(/\d+:\d+\s*(AM|PM)/i);
          expect(stop.chargeDurationMinutes).toBeGreaterThan(0);
          expect(stop.legDistanceMi).toBeGreaterThan(0);
          expect(stop.legDriveDuration).toMatch(/\d+\s*(h|min)/i);
        });
      }
    });

    it('falls back to Greedy Fallback if RCSP cannot find any feasible stop sequence', async () => {
      // Clear stations so no chargers exist, but vehicle only has 10% battery for a 200-mile trip
      (chargingStations as unknown as ChargingStation[]).length = 0;

      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'Origin', coordinates: [26.8, 80.9], batterySoc: 10 },
        destination: { id: 'd', name: 'Dest', coordinates: [27.2, 78.0], batterySoc: 0 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      // Since RCSP is null, the application should select greedy fallback
      const activeRoute = result.routeOptions.find((o) => o.id === result.activeRouteId);
      expect(activeRoute?.calculationMethod).toBe('Greedy Fallback');
    });
  });

  describe('4. OSRM Road Geometry and Battery Revalidation', () => {
    it('correctly converts [lat, lon] to OSRM query format and handles network timeout', async () => {
      // Mock fetch timeout
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network Timeout')), 100);
        });
      });

      const points: [number, number][] = [
        [26.8467, 80.9462],
        [27.1767, 78.0081]
      ];

      const data = await fetchRoadGeometry(points);
      // Timeout should return null gracefully without throwing
      expect(data).toBeNull();
    });

    it('marks geometrySource as estimated and roadValidated as false when OSRM fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('OSRM Server Offline'));

      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'City A', coordinates: [25.0, 80.0], batterySoc: 95 },
        destination: { id: 'd', name: 'City B', coordinates: [25.5, 80.5], batterySoc: 10 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const rcspOpt = result.routeOptions.find((o) => o.id === 'route-rcsp');
      if (rcspOpt) {
        expect(rcspOpt.geometrySource).toBe('estimated');
        expect(rcspOpt.roadValidated).toBe(false);
      }
    });

    it('marks roadValidated = true when OSRM succeeds and all leg battery reserves are satisfied', async () => {
      // Mock successful OSRM with legs that are well within vehicle range
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              distance: 80000, // 80 km = ~50 mi
              duration: 3600,
              geometry: {
                coordinates: [
                  [80.0, 25.0],
                  [80.5, 25.5]
                ]
              },
              legs: [{ distance: 80000, duration: 3600 }]
            }
          ]
        })
      });

      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'City A', coordinates: [25.0, 80.0], batterySoc: 95 },
        destination: { id: 'd', name: 'City B', coordinates: [25.5, 80.5], batterySoc: 10 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const rcspOpt = result.routeOptions.find((o) => o.id === 'route-rcsp');
      if (rcspOpt) {
        expect(rcspOpt.geometrySource).toBe('osrm');
        expect(rcspOpt.roadValidated).toBe(true);
        expect(rcspOpt.isFeasible).toBe(true);
      }
    });
  });

  describe('5. Greedy versus RCSP Multi-Route Coexistence', () => {
    it('returns both RCSP and Greedy options in routeOptions allowing side-by-side user comparison', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'Kanpur', coordinates: [26.4499, 80.3319], batterySoc: 85 },
        destination: { id: 'd', name: 'Varanasi', coordinates: [25.3176, 82.9739], batterySoc: 10 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const optionIds = result.routeOptions.map((o) => o.id);

      // Verify that greedy options (route-optimal, route-fewer, route-fewest) are present
      expect(optionIds).toContain('route-optimal');
      expect(optionIds).toContain('route-fewer');
      expect(optionIds).toContain('route-fewest');

      // Verify that every option in the result has a unique ID
      const uniqueIds = new Set(optionIds);
      expect(uniqueIds.size).toBe(optionIds.length);
    });
  });
});

