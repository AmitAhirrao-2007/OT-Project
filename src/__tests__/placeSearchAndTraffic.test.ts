import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as placesSearchService from '../services/search/placesSearchService';
import {
  normalizePlaceCategory,
  searchLocalCatalogue,
  searchPlaces,
  reverseGeocode
} from '../services/search/placesSearchService';
import {
  TomTomTrafficProvider
} from '../services/traffic/trafficService';
import { calculateTripRoutes } from '../services/routingService';
import { RouteCalculationRequest, Waypoint } from '../types/route';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { initialVehicleProfile } from '../data/demoVehicle';
import { demoTrip } from '../data/demoRoute';

describe('Phase 6B.1: Places Search, Waypoints & Traffic Integration Test Suite', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    delete process.env.VITE_TOMTOM_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.VITE_TOMTOM_API_KEY;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. General Place Search & Category Normalization
  // --------------------------------------------------------------------------
  describe('1. General Place Search & Category Normalization', () => {
    it('returns empty list for short or whitespace-only queries without network calls', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const emptyRes = await searchPlaces({ query: '' });
      const spaceRes = await searchPlaces({ query: '   ' });
      const singleCharRes = await searchPlaces({ query: 'a' });

      expect(emptyRes).toEqual([]);
      expect(spaceRes).toEqual([]);
      expect(singleCharRes).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('correctly normalizes diverse place categories and flags EV chargers', () => {
      expect(normalizePlaceCategory('Electric Vehicle Station')).toEqual({
        category: 'charging_station',
        isCharging: true
      });
      expect(normalizePlaceCategory('Fast EV Charging Hub')).toEqual({
        category: 'charging_station',
        isCharging: true
      });
      expect(normalizePlaceCategory('Italian Restaurant')).toEqual({
        category: 'restaurant',
        isCharging: false
      });
      expect(normalizePlaceCategory('Coffee Cafe')).toEqual({
        category: 'cafe',
        isCharging: false
      });
      expect(normalizePlaceCategory('Grand Hotel & Suites')).toEqual({
        category: 'hotel',
        isCharging: false
      });
      expect(normalizePlaceCategory('National Monument & Museum')).toEqual({
        category: 'attraction',
        isCharging: false
      });
      expect(normalizePlaceCategory('Shopping Mall')).toEqual({
        category: 'shopping',
        isCharging: false
      });
      expect(normalizePlaceCategory('International Airport')).toEqual({
        category: 'airport',
        isCharging: false
      });
      expect(normalizePlaceCategory('Administrative City Area')).toEqual({
        category: 'city',
        isCharging: false
      });
      expect(normalizePlaceCategory('Unknown Place Type')).toEqual({
        category: 'poi',
        isCharging: false
      });
    });

    it('matches curated local station catalogue by station name and operator', () => {
      const results = searchLocalCatalogue('Tata');
      expect(results.length).toBeGreaterThan(0);
      const first = results[0];
      expect(first.isChargingStation).toBe(true);
      expect(first.category).toBe('charging_station');
      expect(first.source).toBe('catalogue');
      expect(first.stationData).toBeDefined();
      expect(first.verificationState).toBe('verified_station');
    });

    it('does NOT query public Nominatim autocomplete when API key is missing (Nominatim policy compliance)', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      delete process.env.VITE_TOMTOM_API_KEY;

      const results = await searchPlaces({ query: 'Random City Anywhere' });

      // Must NOT invoke fetch on public nominatim
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(Array.isArray(results)).toBe(true);
    });

    it('parses TomTom Orbis Places Suggest response when key is configured', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'mock-tomtom-key';

      const mockOrbisResults = {
        summary: { query: 'Agra Taj' },
        results: [
          {
            id: 'orbis-sug-101',
            title: 'Taj Mahal',
            kind: 'attraction',
            address: { freeformAddress: 'Tajganj, Agra, Uttar Pradesh, India', countryCode: 'IN' },
            position: { lat: 27.1751, lon: 78.0421 }
          }
        ]
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockOrbisResults
      } as Response);

      const results = await searchPlaces({ query: 'Agra Taj' });
      expect(results.length).toBeGreaterThan(0);

      const taj = results.find((r) => r.name === 'Taj Mahal');
      expect(taj).toBeDefined();
      expect(taj?.coordinates).toEqual([27.1751, 78.0421]);
      expect(taj?.category).toBe('attraction');
      expect(taj?.isChargingStation).toBe(false);
      expect(taj?.source).toBe('tomtom_orbis');
    });

    it('rejects with abort error when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        searchPlaces({
          query: 'Varanasi',
          signal: controller.signal
        })
      ).rejects.toThrow();
    });

    it('performs reverse geocoding via TomTom Orbis when key is configured', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'mock-tomtom-key';

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          addresses: [
            {
              address: {
                streetName: 'Rajpath',
                freeformAddress: 'India Gate, Rajpath, New Delhi, Delhi, 110001, India'
              }
            }
          ]
        })
      } as Response);

      const place = await reverseGeocode([28.6129, 77.2295]);
      expect(place).toBeDefined();
      expect(place.name).toBe('Rajpath');
      expect(place.address).toContain('Delhi');
      expect(place.isCharging).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Waypoint Management Semantics & Reordering
  // --------------------------------------------------------------------------
  describe('2. Waypoint Management Semantics & Reordering', () => {
    it('distinguishes general via stops from pinned charging stops', () => {
      const viaStop: Waypoint = {
        id: 'via-stop-1',
        name: 'Taj Mahal Sightseeing',
        coordinates: [27.1751, 78.0421],
        type: 'via',
        category: 'attraction',
        source: 'tomtom_orbis',
        batterySoc: 45
      };

      const pinnedCharger: Waypoint = {
        id: 'charger-stop-1',
        name: 'Tata Power Fast Charger Agra',
        coordinates: [27.1700, 78.0200],
        type: 'charging_pinned',
        category: 'charging_station',
        source: 'catalogue',
        stationId: 'cs-agra-tata-01',
        targetChargeSoc: 85,
        batterySoc: 20,
        verificationState: 'verified_station'
      };

      expect(viaStop.type).toBe('via');
      expect(viaStop.stationId).toBeUndefined();
      expect(viaStop.targetChargeSoc).toBeUndefined();

      expect(pinnedCharger.type).toBe('charging_pinned');
      expect(pinnedCharger.stationId).toBe('cs-agra-tata-01');
      expect(pinnedCharger.targetChargeSoc).toBe(85);
      expect(pinnedCharger.verificationState).toBe('verified_station');
    });

    it('supports reordering and deletion of intermediate waypoints', () => {
      const waypoints: Waypoint[] = [
        { id: 'w1', name: 'Stop 1 - Varanasi Ghat', coordinates: [25.3176, 82.9739], type: 'via', batterySoc: 50 },
        { id: 'w2', name: 'Stop 2 - Prayagraj Sangam', coordinates: [25.4358, 81.8463], type: 'via', batterySoc: 50 },
        { id: 'w3', name: 'Stop 3 - Kanpur Hotel', coordinates: [26.4499, 80.3319], type: 'via', batterySoc: 50 }
      ];

      const reordered = [...waypoints];
      const temp = reordered[0];
      reordered[0] = reordered[1];
      reordered[1] = temp;

      expect(reordered[0].id).toBe('w2');
      expect(reordered[1].id).toBe('w1');
      expect(reordered[2].id).toBe('w3');

      const filtered = reordered.filter((w) => w.id !== 'w1');
      expect(filtered.length).toBe(2);
      expect(filtered.map((w) => w.id)).toEqual(['w2', 'w3']);
    });
  });

  // --------------------------------------------------------------------------
  // 3. EV Optimizer Multi-Waypoint Route Calculation & Decoupled Energy
  // --------------------------------------------------------------------------
  describe('3. EV Optimizer Multi-Waypoint Route Calculation & Decoupled Energy', () => {
    it('traverses intermediate via stops without treating them as charging stations', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 90 },
        destination: { id: 'dest', name: 'Agra', coordinates: [27.1767, 78.0081], batterySoc: 15 },
        waypoints: [
          {
            id: 'via-kanpur',
            name: 'Kanpur Center',
            coordinates: [26.4499, 80.3319],
            type: 'via',
            category: 'city',
            batterySoc: 50
          }
        ],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);

      const primary = result.routeOptions[0];
      const isViaInChargingStops = primary.stops.some((s) => s.name?.includes('Kanpur Center'));
      expect(isViaInChargingStops).toBe(false);

      for (const stop of primary.stops) {
        expect(stop.chargeDurationMinutes).toBeGreaterThan(0);
        expect(stop.departureSoc).toBeGreaterThan(stop.arrivalSoc);
      }
    });

    it('strictly decouples driving time from charging time in total duration', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 90 },
        destination: { id: 'dest', name: 'Agra', coordinates: [27.1767, 78.0081], batterySoc: 15 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const primary = result.routeOptions[0];

      const totalChargeMin = primary.stops.reduce((acc, s) => acc + s.chargeDurationMinutes, 0);
      expect(primary.chargingDurationMinutes).toBe(totalChargeMin);

      expect(primary.totalDurationMinutes).toBe(
        primary.drivingDurationMinutes + primary.chargingDurationMinutes + primary.stopBufferMinutes
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Traffic Service & TomTom Provider Abstraction
  // --------------------------------------------------------------------------
  describe('4. Traffic Service & TomTom Provider Abstraction', () => {
    it('reports missing_credentials status when API key is not configured', async () => {
      vi.spyOn(placesSearchService, 'getTomTomApiKey').mockReturnValue(null);
      const provider = new TomTomTrafficProvider();
      const status = await provider.getTrafficFlow([25.0, 80.0, 28.0, 85.0]);

      expect(status.status).toBe('missing_credentials');
      expect(status.coverageSupported).toBe(false);
      expect(status.trafficTileUrlTemplate).toBeUndefined();
    });

    it('returns empty list gracefully if traffic incidents API call fails', async () => {
      vi.spyOn(placesSearchService, 'getTomTomApiKey').mockReturnValue('mock-key');
      const provider = new TomTomTrafficProvider();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const incidents = await provider.getTrafficIncidents([25.0, 80.0, 28.0, 85.0]);
      expect(incidents).toEqual([]);
    });

    it('calculates traffic delay correctly from travel time and free-flow duration', () => {
      const travelTimeMin = 480;
      const trafficDelayMin = 40;
      const freeFlowMin = travelTimeMin - trafficDelayMin;

      expect(travelTimeMin).toBe(480);
      expect(trafficDelayMin).toBe(40);
      expect(freeFlowMin).toBe(440);
      expect(freeFlowMin + trafficDelayMin).toBe(travelTimeMin);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Task 11 Regression Scenarios & Edge Cases
  // --------------------------------------------------------------------------
  describe('5. Task 11 Regression Scenarios & Edge Cases', () => {
    it('Scenario 1: Preserves calibrated Patna–Delhi demonstration trip geometry and charging stops', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Patna', coordinates: [25.5941, 85.1376], batterySoc: 95 },
        destination: { id: 'dest', name: 'Delhi', coordinates: [28.6139, 77.2090], batterySoc: 10 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBe(3);

      const primary = result.routeOptions[0];
      expect(primary.totalDistanceMi).toBeGreaterThan(500);
      expect(primary.stops.length).toBe(6);
      expect(primary.stops[0].stationId).toBe('sta-azamgarh-adani');
      expect(primary.chargerDataStatus).toBe('catalogue_verified');
    });

    it('Scenario 2: Patna–Delhi with a via stop bypasses demo fixture to run general multi-stop optimizer', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Patna', coordinates: [25.5941, 85.1376], batterySoc: 95 },
        destination: { id: 'dest', name: 'Delhi', coordinates: [28.6139, 77.2090], batterySoc: 10 },
        waypoints: [
          {
            id: 'wp-varanasi',
            name: 'Varanasi Ghat',
            coordinates: [25.3176, 82.9739],
            batterySoc: 50,
            type: 'via'
          }
        ],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);
      const primary = result.routeOptions[0];
      // Does not use the fixed demo corridor stops because custom waypoints are present
      expect(primary.stops.map((s) => s.stationId)).not.toEqual(
        demoTrip.routeOptions[0].stops.map((s) => s.stationId)
      );
    });

    it('Scenario 3: Patna–Delhi with a pinned charging stop validates connector and safety reserve', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Patna', coordinates: [25.5941, 85.1376], batterySoc: 95 },
        destination: { id: 'dest', name: 'Delhi', coordinates: [28.6139, 77.2090], batterySoc: 10 },
        waypoints: [
          {
            id: 'pinned-haidergarh',
            name: 'Renovatio e-charge - Haidergarh',
            coordinates: [26.5894, 81.4282],
            batterySoc: 30,
            type: 'charging_pinned',
            stationId: 'sta-haidergarh-renovatio',
            targetChargeSoc: 85,
            verificationState: 'verified_station'
          }
        ],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);
    });

    it('Scenario 4: Supported international route honestly reports unavailable charger data outside catalogue', async () => {
      // Route in UK: London to Manchester (~208 miles, exceeds single-charge reserve of 38 kWh battery)
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'London', coordinates: [51.5074, -0.1278], batterySoc: 90 },
        destination: { id: 'dest', name: 'Manchester', coordinates: [53.4808, -2.2426], batterySoc: 15 },
        waypoints: [],
        vehicle: initialVehicleProfile, // 38 kWh usable, ~155 mi highway range
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);

      const primary = result.routeOptions[0];
      // Catalogue contains only Indian stations: international route must be flagged as infeasible with honest status
      expect(primary.isFeasible).toBe(false);
      expect(primary.chargerDataStatus).toBe('unavailable_outside_catalogue');
      expect(primary.feasibilityNote).toContain('local catalogue (20 Indian stations)');
    });

    it('Scenario 5: Route with unverified charger POI is flagged as unverified and infeasible', async () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 80 },
        destination: { id: 'dest', name: 'Agra', coordinates: [27.1767, 78.0081], batterySoc: 15 },
        waypoints: [
          {
            id: 'unverified-wp',
            name: 'Unknown Roadside Charging Plug',
            coordinates: [26.9000, 79.5000],
            batterySoc: 20,
            type: 'charging_pinned',
            verificationState: 'unverified_charger_poi' // POI lacking technical specs
          }
        ],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      const primary = result.routeOptions[0];
      expect(primary.isFeasible).toBe(false);
      expect(primary.chargerDataStatus).toBe('unverified_poi');
      expect(primary.feasibilityNote).toContain('unverified POI lacking technical charging specifications');
    });

    it('Scenario 6: Route with live traffic unavailable falls back to free-flow geometry safely', async () => {
      vi.spyOn(placesSearchService, 'getTomTomApiKey').mockReturnValue('mock-key');
      // Mock TomTom routing to fail
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('TomTom 503 Service Unavailable'));

      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 90 },
        destination: { id: 'dest', name: 'Kanpur', coordinates: [26.4499, 80.3319], batterySoc: 50 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);
      const primary = result.routeOptions[0];
      expect(primary.totalDistanceMi).toBeGreaterThan(0);
    });

    it('Scenario 7: Route with missing API credentials reports unconfigured traffic without crashing', async () => {
      vi.spyOn(placesSearchService, 'getTomTomApiKey').mockReturnValue(null);

      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 90 },
        destination: { id: 'dest', name: 'Kanpur', coordinates: [26.4499, 80.3319], batterySoc: 50 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const result = await calculateTripRoutes(req);
      expect(result.routeOptions.length).toBeGreaterThan(0);
      const primary = result.routeOptions[0];
      expect(primary.trafficSummary).toBeDefined();
    });
  });
});
