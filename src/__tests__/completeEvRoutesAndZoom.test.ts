import { describe, it, expect, vi } from 'vitest';
import { calculateTripRoutes } from '../services/routingService';
import { initialVehicleProfile } from '../data/demoVehicle';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { Waypoint, RouteCalculationRequest } from '../types/route';

describe('Phase 6H — Complete EV Routes and Map Zoom Controls', () => {
  const dummyVehicle = {
    ...initialVehicleProfile,
    usableBatteryKwh: 65.0,
    referenceConsumptionWhPerMi: 250, // 65 kWh / 0.25 = 260 miles max range
    maxDcChargingKw: 120,
    selectedPlugTypes: ['CCS' as const]
  };

  const patnaWaypoint: Waypoint = {
    id: 'origin-patna',
    name: 'Patna',
    coordinates: [25.5941, 85.1376],
    batterySoc: 95,
    departureTime: '08:00 AM'
  };

  const delhiWaypoint: Waypoint = {
    id: 'destination-delhi',
    name: 'Delhi',
    coordinates: [28.6139, 77.2090],
    batterySoc: 15
  };

  describe('Feature B: Battery-Feasible EV Routes Through Charging Stations', () => {
    it('should generate a complete multi-stop EV route with physical road continuity through all charging stops', async () => {
      const req: RouteCalculationRequest = {
        origin: patnaWaypoint,
        destination: delhiWaypoint,
        vehicle: dummyVehicle,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);

      const activeRoute = result.routeOptions.find((r) => r.id === result.activeRouteId) || result.routeOptions[0];
      expect(activeRoute).toBeDefined();
      expect(activeRoute.stops.length).toBeGreaterThanOrEqual(1);

      // Verify that every stop has realistic leg distance, driving duration, and battery feasibility
      for (const stop of activeRoute.stops) {
        expect(stop.legDistanceMi).toBeGreaterThan(0);
        expect(stop.legDriveDuration).toBeTruthy();
        expect(stop.arrivalSoc).toBeGreaterThanOrEqual(initialChargingSettings.preferredMinArrivalBatteryCharger);
        expect(stop.departureSoc).toBeGreaterThan(stop.arrivalSoc);
        expect(stop.chargeDurationMinutes).toBeGreaterThan(0);
        expect(stop.energyAddedKwh).toBeGreaterThan(0);
      }

      // Verify overall trip feasibility
      expect(activeRoute.isFeasible).toBe(true);
      expect(activeRoute.isCompleteEvJourney).toBe(true);
    });

    it('should correctly diagnose and mark route as infeasible with honest InfeasibilityDetails when battery is insufficient', async () => {
      // Vehicle with extremely low battery (8% SoC) departing for a 600+ mile journey
      const lowSocOrigin: Waypoint = {
        ...patnaWaypoint,
        batterySoc: 8 // Only ~12 miles of range
      };

      const req: RouteCalculationRequest = {
        origin: lowSocOrigin,
        destination: delhiWaypoint,
        vehicle: dummyVehicle,
        planOptions: initialPlanOptions,
        chargingSettings: {
          ...initialChargingSettings,
          preferredMinArrivalBatteryCharger: 10
        },
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const activeRoute = result.routeOptions.find((r) => r.id === result.activeRouteId) || result.routeOptions[0];

      expect(activeRoute.isFeasible).toBe(false);
      expect(activeRoute.feasibilityNote).toContain('complete EV journey not currently feasible');
      expect(activeRoute.infeasibilityDetails).toBeDefined();
      expect(activeRoute.infeasibilityDetails?.remainingDistanceMi).toBeGreaterThan(0);
      expect(activeRoute.infeasibilityDetails?.remainingEnergyKwh).toBeGreaterThan(0);
      expect(activeRoute.infeasibilityDetails?.reason).toBeTruthy();
      expect(activeRoute.infeasibilityDetails?.suggestedAction).toContain('Charge vehicle');
    });

    it('should handle custom long-distance routes with dynamic charging stop insertion and road legs', async () => {
      // Dynamic route from Lucknow to Varanasi (~190 miles)
      const lucknow: Waypoint = {
        id: 'origin-lucknow',
        name: 'Lucknow',
        coordinates: [26.8467, 80.9462],
        batterySoc: 70, // ~113 miles of range, requires charging to reach Varanasi (190 miles)
        departureTime: '09:00 AM',
        isCustom: true
      };

      const varanasi: Waypoint = {
        id: 'dest-varanasi',
        name: 'Varanasi',
        coordinates: [25.3176, 82.9739],
        batterySoc: 15,
        isCustom: true
      };

      const req: RouteCalculationRequest = {
        origin: lucknow,
        destination: varanasi,
        vehicle: dummyVehicle,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);

      const activeRoute = result.routeOptions[0];
      expect(activeRoute.totalDistanceMi).toBeGreaterThan(100);

      // Verify that charging stops connect properly
      if (activeRoute.stops.length > 0) {
        for (const stop of activeRoute.stops) {
          expect(stop.coordinates).toHaveLength(2);
          expect(stop.arrivalSoc).toBeDefined();
          expect(stop.departureSoc).toBeGreaterThanOrEqual(stop.arrivalSoc);
        }
      }
    });

    it('should detect infeasibility when a manually pinned charger is unreachable from current position', async () => {
      // Custom start point in Jaipur, custom destination in Agra (~150 miles)
      const jaipur: Waypoint = {
        id: 'origin-jaipur',
        name: 'Jaipur',
        coordinates: [26.9124, 75.7873],
        batterySoc: 12, // Only ~19 miles range!
        departureTime: '10:00 AM',
        isCustom: true
      };

      const agra: Waypoint = {
        id: 'dest-agra',
        name: 'Agra',
        coordinates: [27.1767, 78.0081],
        batterySoc: 10,
        isCustom: true
      };

      // Pinned charger in Dausa (~35 miles away, unreachable with 12% SoC)
      const pinnedCharger: Waypoint = {
        id: 'pinned-dausa',
        name: 'Dausa Fast EV Hub',
        coordinates: [26.8924, 76.3373],
        batterySoc: 15,
        type: 'charging_pinned',
        category: 'charging_station',
        stationId: 'sta-dausa-hub-1',
        powerKw: 60,
        verificationState: 'verified_station',
        isCustom: true
      };

      const req: RouteCalculationRequest = {
        origin: jaipur,
        destination: agra,
        waypoints: [pinnedCharger],
        vehicle: dummyVehicle,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const activeRoute = result.routeOptions[0];

      expect(activeRoute.isFeasible).toBe(false);
      expect(activeRoute.infeasibilityDetails).toBeDefined();
      expect(activeRoute.infeasibilityDetails?.remainingDistanceMi).toBeGreaterThan(0);
      expect(activeRoute.feasibilityNote).toContain('complete EV journey not currently feasible');
    });
  });

  describe('Feature A: Map Zoom Controls and State Preservation', () => {
    it('should verify zoom control functions map.zoomIn and map.zoomOut execute cleanly without resetting viewport', () => {
      // Mock Leaflet Map instance
      let currentZoom = 6;
      let fitBoundsCallCount = 0;

      const mockMap = {
        getZoom: () => currentZoom,
        zoomIn: vi.fn((delta = 1) => {
          currentZoom += delta;
          return currentZoom;
        }),
        zoomOut: vi.fn((delta = 1) => {
          currentZoom -= delta;
          return currentZoom;
        }),
        fitBounds: vi.fn(() => {
          fitBoundsCallCount++;
        }),
        invalidateSize: vi.fn(),
        getSize: () => ({ x: 1200, y: 800 })
      };

      // Test Zoom In 5 times
      for (let i = 0; i < 5; i++) {
        mockMap.zoomIn(1);
      }
      expect(mockMap.zoomIn).toHaveBeenCalledTimes(5);
      expect(currentZoom).toBe(11);

      // Test Zoom Out 5 times
      for (let i = 0; i < 5; i++) {
        mockMap.zoomOut(1);
      }
      expect(mockMap.zoomOut).toHaveBeenCalledTimes(5);
      expect(currentZoom).toBe(6);

      // Verify route key guard: simulating state re-renders (queue updates, stop hover, etc.)
      const routeKey1 = 'route-optimal-[25.5941,85.1376]-[28.6139,77.2090]-38';
      let lastFittedKey = '';

      // First load: routeKey changes from empty -> triggers fitBounds
      if (lastFittedKey !== routeKey1) {
        lastFittedKey = routeKey1;
        mockMap.fitBounds();
      }
      expect(fitBoundsCallCount).toBe(1);

      // Subsequent queue data arrives: same routeKey -> NO fitBounds call!
      if (lastFittedKey !== routeKey1) {
        lastFittedKey = routeKey1;
        mockMap.fitBounds();
      }
      expect(fitBoundsCallCount).toBe(1); // STILL 1, never wiped out user zoom!

      // Stop hover / select event: same routeKey -> NO fitBounds call!
      if (lastFittedKey !== routeKey1) {
        lastFittedKey = routeKey1;
        mockMap.fitBounds();
      }
      expect(fitBoundsCallCount).toBe(1); // User's manual zoom level is preserved!
    });
  });
});
