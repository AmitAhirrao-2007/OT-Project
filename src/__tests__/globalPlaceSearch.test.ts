import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeSearchResultItem,
  searchPlaces,
  discoverPlaces,
  getSearchProviderDiagnostics,
  checkServerStatus
} from '../services/search/placesSearchService';
import { calculateTripRoutes } from '../services/routingService';
import { RouteCalculationRequest } from '../types/route';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { initialVehicleProfile } from '../data/demoVehicle';
import { demoTrip } from '../data/demoRoute';

describe('Phase 6C.1: Global Place Search & Live Provider Integration Test Suite', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    delete process.env.VITE_TOMTOM_API_KEY;
    delete process.env.TOMTOM_API_KEY;
    delete process.env.PROXY_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.VITE_TOMTOM_API_KEY;
    delete process.env.TOMTOM_API_KEY;
    delete process.env.PROXY_URL;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Diagnostic States & Truthful Failure Messages (Task 10)
  // --------------------------------------------------------------------------
  describe('1. Diagnostic States & Truthful UI Messaging', () => {
    it('truthfully reports catalogue_only state when no API key or proxy is configured', () => {
      const diag = getSearchProviderDiagnostics();
      expect(diag.hasKey).toBe(false);
      expect(diag.state).toBe('catalogue_only');
      expect(diag.provider).toBe('catalogue_only');
      expect(diag.message).toContain('Local 20-station catalogue only');
    });

    it('reports connected state when VITE_TOMTOM_API_KEY is configured on client', () => {
      process.env.VITE_TOMTOM_API_KEY = 'real-tomtom-client-key';
      const diag = getSearchProviderDiagnostics();
      expect(diag.hasKey).toBe(true);
      expect(diag.state).toBe('connected');
      expect(diag.provider).toBe('tomtom_orbis');
      expect(diag.message).toContain('Global search connected');
    });

    it('reports connected state when backend proxy reports configured TOMTOM_API_KEY', async () => {
      process.env.PROXY_URL = 'http://127.0.0.1:3001';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status_code: 1000,
          configured: true,
          provider: 'tomtom_orbis'
        })
      } as Response);

      const status = await checkServerStatus(true);
      expect(status.configured).toBe(true);

      const diag = getSearchProviderDiagnostics();
      expect(diag.hasKey).toBe(true);
      expect(diag.state).toBe('connected');
      expect(diag.message).toContain('backend proxy');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Robust Normalization across Providers & Schemas (Task 6)
  // --------------------------------------------------------------------------
  describe('2. Robust Result Normalization', () => {
    it('normalizes Orbis position { lat, lon } schema with rich address', () => {
      const rawOrbis = {
        id: 'orb-1234',
        title: 'Kankarbagh Main Road',
        kind: 'road',
        position: { lat: 25.5996, lon: 85.1584 },
        address: {
          freeformAddress: 'Kankarbagh Main Rd, Patna, Bihar, 800020, India',
          municipality: 'Patna',
          countrySubdivision: 'Bihar',
          country: 'India',
          countryCode: 'IN'
        }
      };

      const norm = normalizeSearchResultItem(rawOrbis, 'Kankarbagh', 'tomtom_orbis');
      expect(norm).not.toBeNull();
      expect(norm?.name).toBe('Kankarbagh Main Road');
      expect(norm?.coordinates).toEqual([25.5996, 85.1584]);
      expect(norm?.category).toBe('address');
      expect(norm?.isChargingStation).toBe(false);
      expect(norm?.subTitle).toBe('Patna, Bihar, India');
      expect(norm?.countryCode).toBe('IN');
      expect(norm?.source).toBe('tomtom_orbis');
    });

    it('normalizes GeoJSON geometry.coordinates [lon, lat] schema', () => {
      const rawGeoJson = {
        id: 'geo-5678',
        name: 'Hotel Maurya',
        classification: 'hotel',
        geometry: {
          type: 'Point',
          coordinates: [85.1412, 25.6134] // [lon, lat]
        },
        address: {
          freeformAddress: 'South Gandhi Maidan, Patna, Bihar',
          municipality: 'Patna'
        }
      };

      const norm = normalizeSearchResultItem(rawGeoJson, 'Maurya', 'tomtom_legacy');
      expect(norm).not.toBeNull();
      expect(norm?.name).toBe('Hotel Maurya');
      expect(norm?.coordinates).toEqual([25.6134, 85.1412]); // [lat, lon]
      expect(norm?.category).toBe('hotel');
      expect(norm?.isChargingStation).toBe(false);
    });

    it('normalizes Search v2 POI schema with classifications', () => {
      const rawV2 = {
        id: 'poi-999',
        type: 'POI',
        poi: {
          name: 'Barista Coffee Cafe',
          classifications: [{ code: 'CAFE' }]
        },
        position: { lat: 25.6091, lon: 85.1442 },
        address: {
          freeformAddress: 'Frazer Road, Patna, Bihar'
        }
      };

      const norm = normalizeSearchResultItem(rawV2, 'Barista', 'tomtom_legacy');
      expect(norm).not.toBeNull();
      expect(norm?.name).toBe('Barista Coffee Cafe');
      expect(norm?.category).toBe('cafe');
      expect(norm?.coordinates).toEqual([25.6091, 85.1442]);
    });

    it('gracefully handles missing optional fields without discarding results', () => {
      const minimalItem = {
        id: 'min-1',
        title: 'Darbhanga Tower',
        position: { lat: 26.1542, lon: 85.8918 }
      };

      const norm = normalizeSearchResultItem(minimalItem, 'Darbhanga', 'tomtom_orbis');
      expect(norm).not.toBeNull();
      expect(norm?.name).toBe('Darbhanga Tower');
      expect(norm?.coordinates).toEqual([26.1542, 85.8918]);
      expect(norm?.category).toBe('poi');
      expect(norm?.address).toContain('26.1542');
    });

    it('rejects items with invalid or non-numeric coordinates', () => {
      const invalidItem = {
        id: 'bad-1',
        name: 'Ghost Place',
        position: { lat: null, lon: undefined }
      };

      const norm = normalizeSearchResultItem(invalidItem, 'Ghost', 'tomtom_orbis');
      expect(norm).toBeNull();
    });

    it('matches and marks verified charging stations from the curated catalogue', () => {
      // Station coordinates for Adani TotalEnergies Azamgarh: [26.0684, 83.1859]
      const chargerItem = {
        id: 'chg-azamgarh',
        title: 'Adani TotalEnergies - Purvanchal Expressway',
        kind: 'electric vehicle station',
        position: { lat: 26.0684, lon: 83.1859 },
        address: { freeformAddress: 'Purvanchal Expressway KM 102, Azamgarh sub-district' }
      };

      const norm = normalizeSearchResultItem(chargerItem, 'Adani', 'tomtom_orbis');
      expect(norm).not.toBeNull();
      expect(norm?.category).toBe('charging_station');
      expect(norm?.isChargingStation).toBe(true);
      expect(norm?.verificationState).toBe('verified_station');
      expect(norm?.stationData).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Removal of Unintended Search Restrictions (Task 4)
  // --------------------------------------------------------------------------
  describe('3. Unrestricted Global Search Querying', () => {
    it('does NOT append radius parameter to legacy search queries when center is provided', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-key';
      let capturedUrl = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [] })
        } as Response);
      });

      // User in Patna searching for London
      await discoverPlaces({
        query: 'London',
        center: [25.5941, 85.1376] // Patna center
      });

      expect(capturedUrl).toContain('search/2/search/London.json');
      expect(capturedUrl).toContain('lat=25.5941');
      expect(capturedUrl).toContain('lon=85.1376');
      // Crucial: Must NOT contain radius restriction which drops results beyond 100km
      expect(capturedUrl).not.toContain('radius=');
    });

    it('supports international locations and landmarks without geographic restrictions', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-key';

      const mockInternationalResults = {
        results: [
          {
            id: 'eiffel-1',
            poi: { name: 'Eiffel Tower', classifications: [{ code: 'TOURIST_ATTRACTION' }] },
            position: { lat: 48.8584, lon: 2.2945 },
            address: { freeformAddress: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris, France', countryCode: 'FR' }
          }
        ]
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockInternationalResults
      } as Response);

      const results = await discoverPlaces({ query: 'Eiffel Tower' });
      expect(results.length).toBeGreaterThan(0);
      const eiffel = results.find((r) => r.name === 'Eiffel Tower');
      expect(eiffel).toBeDefined();
      expect(eiffel?.coordinates).toEqual([48.8584, 2.2945]);
      expect(eiffel?.countryCode).toBe('FR');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Full Comprehensive Search via Discover (Task 5)
  // --------------------------------------------------------------------------
  describe('4. Full Search (Discover) Operation', () => {
    it('triggers discoverPlaces with higher limit and broader multi-index resolution', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-key';

      const mockDiscoverData = {
        results: [
          {
            id: 'disc-1',
            poi: { name: 'Hotel Maurya Patna' },
            position: { lat: 25.6134, lon: 85.1412 },
            address: { freeformAddress: 'South Gandhi Maidan, Patna' }
          },
          {
            id: 'disc-2',
            poi: { name: 'Maurya Lok Shopping Complex' },
            position: { lat: 25.6112, lon: 85.1388 },
            address: { freeformAddress: 'Dak Bungalow Road, Patna' }
          }
        ]
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDiscoverData
      } as Response);

      const found = await discoverPlaces({ query: 'Maurya', limit: 15 });
      expect(found.length).toBe(2);
      expect(found[0].name).toBe('Hotel Maurya Patna');
      expect(found[1].name).toBe('Maurya Lok Shopping Complex');
    });

    it('transparently delegates searchPlaces with fullSearch: true to discoverPlaces', async () => {
      process.env.VITE_TOMTOM_API_KEY = 'test-key';

      let calledUrl = '';
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        calledUrl = url;
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [] })
        } as Response);
      });

      await searchPlaces({ query: 'Taj Mahal', fullSearch: true, limit: 12 });
      expect(calledUrl).toContain('search/2/search/Taj%20Mahal.json');
      expect(calledUrl).toContain('limit=12');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Backend Proxy Support (Task 2)
  // --------------------------------------------------------------------------
  describe('5. Backend Proxy Communication', () => {
    it('routes requests to /api/places/suggest when PROXY_URL is configured', async () => {
      process.env.PROXY_URL = 'http://127.0.0.1:3001';

      let proxyRequested = false;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/places/suggest')) {
          proxyRequested = true;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status_code: 1000,
              provider: 'tomtom_orbis',
              results: [
                {
                  id: 'prox-1',
                  title: 'Darbhanga Junction',
                  position: { lat: 26.1528, lon: 85.8974 },
                  address: { freeformAddress: 'Darbhanga, Bihar' }
                }
              ]
            })
          } as Response);
        }
        return Promise.resolve({ ok: false } as Response);
      });

      const results = await searchPlaces({ query: 'Darbhanga' });
      expect(proxyRequested).toBe(true);
      const station = results.find((r) => r.name === 'Darbhanga Junction');
      expect(station).toBeDefined();
      expect(station?.coordinates).toEqual([26.1528, 85.8974]);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Integration with Routing Engine (Tasks 7 & 8)
  // --------------------------------------------------------------------------
  describe('6. Shared Search to Route Calculation Integration', () => {
    it('successfully recalculates dynamic EV route when destination is set to custom resolved place', async () => {
      const resolvedDarbhanga = {
        id: 'dest-darbhanga-1',
        name: 'Darbhanga',
        subTitle: 'Bihar, India',
        address: 'Darbhanga, Bihar, India',
        coordinates: [26.1542, 85.8918] as [number, number],
        batterySoc: 15,
        isCustom: true
      };

      const request: RouteCalculationRequest = {
        origin: demoTrip.origin, // Patna
        destination: resolvedDarbhanga, // User-selected Darbhanga
        waypoints: [],
        vehicle: initialVehicleProfile,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings,
        planOptions: initialPlanOptions
      };

      const result = await calculateTripRoutes(request);
      expect(result.routeOptions.length).toBeGreaterThan(0);
      const active = result.routeOptions[0];

      // Distance between Patna and Darbhanga is ~80-140 miles, NOT the 630-mile Delhi corridor
      expect(active.totalDistanceMi).toBeGreaterThan(50);
      expect(active.totalDistanceMi).toBeLessThan(200);
      expect(active.isFeasible).toBeDefined();
    });

    it('successfully includes user-added via stop and recalculates battery profile', async () => {
      const viaHotel = {
        id: 'via-hotel-1',
        name: 'Heritage Hotel Agra',
        coordinates: [27.1767, 78.0081] as [number, number],
        type: 'via' as const,
        batterySoc: 40,
        isCustom: true
      };

      const request: RouteCalculationRequest = {
        origin: demoTrip.origin,
        destination: demoTrip.destination,
        waypoints: [viaHotel],
        vehicle: initialVehicleProfile,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings,
        planOptions: initialPlanOptions
      };

      const result = await calculateTripRoutes(request);
      expect(result.routeOptions.length).toBeGreaterThan(0);
      const active = result.routeOptions[0];
      expect(active.totalDistanceMi).toBeGreaterThan(500);
    });
  });
});
