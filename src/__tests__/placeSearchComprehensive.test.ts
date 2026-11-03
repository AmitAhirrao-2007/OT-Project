import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchPlaces,
  discoverPlaces,
  normalizePlaceCategory,
  normalizeSearchResultItem
} from '../services/search/placesSearchService';

describe('Phase 6E: Comprehensive Place Search Suite', () => {
  describe('1. Place Category Normalization Across Diverse Place Types', () => {
    it('normalizes religious places and temples', () => {
      expect(normalizePlaceCategory('Golden Temple Amritsar')).toEqual({
        category: 'religious',
        isCharging: false
      });
      expect(normalizePlaceCategory('Gurdwara Bangla Sahib')).toEqual({
        category: 'religious',
        isCharging: false
      });
      expect(normalizePlaceCategory('Jama Masjid')).toEqual({
        category: 'religious',
        isCharging: false
      });
    });

    it('normalizes airports, railways, and bus stations', () => {
      expect(normalizePlaceCategory('Indira Gandhi International Airport')).toEqual({
        category: 'airport',
        isCharging: false
      });
      expect(normalizePlaceCategory('New Delhi Railway Station')).toEqual({
        category: 'railway_station',
        isCharging: false
      });
      expect(normalizePlaceCategory('ISBT Kashmere Gate Bus Terminal')).toEqual({
        category: 'bus_station',
        isCharging: false
      });
    });

    it('normalizes hospitals, universities, and schools', () => {
      expect(normalizePlaceCategory('AIIMS Hospital New Delhi')).toEqual({
        category: 'hospital',
        isCharging: false
      });
      expect(normalizePlaceCategory('IIT Delhi Campus')).toEqual({
        category: 'university',
        isCharging: false
      });
      expect(normalizePlaceCategory('Delhi Public School')).toEqual({
        category: 'school',
        isCharging: false
      });
    });

    it('normalizes highways and expressways', () => {
      expect(normalizePlaceCategory('Yamuna Expressway')).toEqual({
        category: 'highway',
        isCharging: false
      });
      expect(normalizePlaceCategory('NH-44 Bypass')).toEqual({
        category: 'highway',
        isCharging: false
      });
    });

    it('normalizes shopping centres and malls', () => {
      expect(normalizePlaceCategory('Select Citywalk Mall')).toEqual({
        category: 'shopping',
        isCharging: false
      });
      expect(normalizePlaceCategory('Supermarket Store')).toEqual({
        category: 'shopping',
        isCharging: false
      });
    });

    it('normalizes restaurants, cafes, and hotels', () => {
      expect(normalizePlaceCategory('Haldirams Restaurant')).toEqual({
        category: 'restaurant',
        isCharging: false
      });
      expect(normalizePlaceCategory('Blue Tokai Cafe')).toEqual({
        category: 'cafe',
        isCharging: false
      });
      expect(normalizePlaceCategory('Hotel Maurya Patna')).toEqual({
        category: 'hotel',
        isCharging: false
      });
    });

    it('normalizes cities, towns, villages, and localities', () => {
      expect(normalizePlaceCategory('Bhopal Municipality')).toEqual({
        category: 'city',
        isCharging: false
      });
      expect(normalizePlaceCategory('Hilsa Town')).toEqual({
        category: 'town',
        isCharging: false
      });
      expect(normalizePlaceCategory('Rampur Gram Village')).toEqual({
        category: 'village',
        isCharging: false
      });
      expect(normalizePlaceCategory('Karol Bagh Colony')).toEqual({
        category: 'locality',
        isCharging: false
      });
    });

    it('normalizes street addresses and residential buildings', () => {
      expect(normalizePlaceCategory('Kankarbagh Main Road')).toEqual({
        category: 'address',
        isCharging: false
      });
      expect(normalizePlaceCategory('Palm Residency Apartments')).toEqual({
        category: 'building',
        isCharging: false
      });
    });

    it('normalizes attractions and monuments', () => {
      expect(normalizePlaceCategory('India Gate Monument')).toEqual({
        category: 'attraction',
        isCharging: false
      });
      expect(normalizePlaceCategory('Eiffel Tower Historic')).toEqual({
        category: 'attraction',
        isCharging: false
      });
    });

    it('accurately identifies EV charging stations separately', () => {
      expect(normalizePlaceCategory('Tata Power EV Charging Station')).toEqual({
        category: 'charging_station',
        isCharging: true
      });
    });
  });

  describe('2. Search Result Item Structure & Field Preservation', () => {
    it('preserves id, name, address, coordinates, provider, and category on normalized results', () => {
      const rawTomTomItem = {
        id: 'poi-12345',
        title: 'Haldirams, Connaught Place, New Delhi',
        poi: {
          name: 'Haldirams',
          classifications: [{ code: 'RESTAURANT' }]
        },
        position: {
          lat: 28.6315,
          lon: 77.2167
        },
        address: {
          municipality: 'New Delhi',
          countrySubdivision: 'Delhi',
          country: 'India',
          countryCode: 'IN',
          freeformAddress: 'Connaught Place, New Delhi, Delhi 110001'
        }
      };

      const result = normalizeSearchResultItem(rawTomTomItem, 'Haldirams', 'tomtom_legacy');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('tomtom_legacy-poi-12345');
      expect(result!.name).toBe('Haldirams');
      expect(result!.coordinates).toEqual([28.6315, 77.2167]);
      expect(result!.category).toBe('restaurant');
      expect(result!.isChargingStation).toBe(false);
      expect(result!.source).toBe('tomtom_legacy');
      expect(result!.countryCode).toBe('IN');
      expect(result!.address).toContain('Connaught Place');
    });

    it('extracts name cleanly when poi.name is missing but title has comma-separated details', () => {
      const rawGeographyItem = {
        id: 'geo-9988',
        title: 'Darbhanga, Bihar',
        position: {
          lat: 26.1563,
          lon: 85.8943
        },
        address: {
          municipality: 'Darbhanga',
          countrySubdivision: 'Bihar',
          country: 'India',
          freeformAddress: 'Darbhanga, Bihar, India'
        }
      };

      const result = normalizeSearchResultItem(rawGeographyItem, 'Darbhanga', 'tomtom_legacy');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Darbhanga');
      expect(result!.coordinates).toEqual([26.1563, 85.8943]);
      expect(result!.category).toBe('city');
    });
  });

  describe('3. Autocomplete Suggest vs Full Search Behavior', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      process.env.PROXY_URL = 'http://127.0.0.1:3000';
    });

    afterEach(() => {
      delete process.env.PROXY_URL;
    });

    it('returns empty array when query is less than 2 characters without crashing', async () => {
      const res = await searchPlaces({ query: 'a' });
      expect(res).toEqual([]);
    });

    it('executes full discover search on Enter or search button click', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({
            status_code: 1000,
            provider: 'tomtom_v2',
            results: [
              {
                id: 'test-1',
                title: 'AIIMS New Delhi',
                position: { lat: 28.5681, lon: 77.2125 },
                poi: { classifications: [{ code: 'HOSPITAL' }] },
                address: { freeformAddress: 'Ansari Nagar, New Delhi' }
              }
            ]
          })
        } as any;
      });

      const places = await discoverPlaces({ query: 'AIIMS New Delhi', limit: 10 });
      expect(places.length).toBeGreaterThanOrEqual(1);
      const aiims = places.find((p) => p.name.includes('AIIMS'));
      expect(aiims).toBeDefined();
      expect(aiims?.category).toBe('hospital');
      expect(aiims?.coordinates).toEqual([28.5681, 77.2125]);
    });

    it('does not restrict global search to charging station hubs', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({
            status_code: 1000,
            provider: 'tomtom_v2',
            results: [
              {
                id: 'ig-1',
                title: 'India Gate, New Delhi',
                position: { lat: 28.6129, lon: 77.2295 },
                poi: { classifications: [{ code: 'MONUMENT' }] },
                address: { freeformAddress: 'Rajpath, India Gate, New Delhi' }
              }
            ]
          })
        } as any;
      });

      const places = await searchPlaces({ query: 'India Gate' });
      const ig = places.find((p) => p.name.includes('India Gate'));
      expect(ig).toBeDefined();
      expect(ig?.isChargingStation).toBe(false);
      expect(ig?.category).toBe('attraction');
    });
  });
});
