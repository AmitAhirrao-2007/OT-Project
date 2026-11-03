import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isGeolocationSupported,
  extractGpsCoordinates,
  mapGeolocationError,
  getCurrentGpsPosition,
  startGpsWatch,
  stopGpsWatch
} from '../services/gps/geolocationService';
import {
  haversineMeters,
  haversineMiles,
  projectPointOnSegment,
  matchGpsToRoute
} from '../utils/routeProgressUtils';
import { GpsCoordinates } from '../types/gps';

describe('Phase 6F: Live GPS Location and Route Tracking Suite', () => {
  // Test route geometry: Delhi -> Agra -> Gwalior -> Bhopal
  const DELHI_BHOPAL_POLYLINE: [number, number][] = [
    [28.6139, 77.2090], // Delhi (0 mi)
    [27.1767, 78.0081], // Agra (~115 mi)
    [26.2183, 78.1828], // Gwalior (~185 mi)
    [23.2599, 77.4126]  // Bhopal (~484 mi)
  ];

  let originalGeolocation: Geolocation | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalGeolocation = globalThis.navigator?.geolocation;
  });

  afterEach(() => {
    if (globalThis.navigator && originalGeolocation !== undefined) {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: originalGeolocation,
        configurable: true,
        writable: true
      });
    }
  });

  describe('1. Geolocation Browser Capability & Support Checks', () => {
    it('returns true when navigator.geolocation is available', () => {
      const mockGeo = {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn(),
        clearWatch: vi.fn()
      };
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: mockGeo,
        configurable: true,
        writable: true
      });

      expect(isGeolocationSupported()).toBe(true);
    });

    it('returns false when navigator.geolocation is undefined', () => {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: undefined,
        configurable: true,
        writable: true
      });

      expect(isGeolocationSupported()).toBe(false);
    });
  });

  describe('2. Coordinate Extraction & Error Mapping', () => {
    it('extracts complete GpsCoordinates including heading, speed, and accuracy', () => {
      const mockPosition = {
        coords: {
          latitude: 28.6139,
          longitude: 77.2090,
          accuracy: 15.5,
          altitude: 216,
          altitudeAccuracy: 5,
          heading: 182.4,
          speed: 18.2 // ~40 mph
        },
        timestamp: 1714500000000
      } as unknown as GeolocationPosition;

      const extracted = extractGpsCoordinates(mockPosition);
      expect(extracted.latitude).toBe(28.6139);
      expect(extracted.longitude).toBe(77.2090);
      expect(extracted.accuracy).toBe(15.5);
      expect(extracted.altitude).toBe(216);
      expect(extracted.heading).toBe(182.4);
      expect(extracted.speed).toBe(18.2);
      expect(extracted.timestamp).toBe(1714500000000);
    });

    it('handles null values for optional coordinates gracefully', () => {
      const mockPosition = {
        coords: {
          latitude: 25.5941,
          longitude: 85.1376,
          accuracy: 45,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: 1714500001000
      } as unknown as GeolocationPosition;

      const extracted = extractGpsCoordinates(mockPosition);
      expect(extracted.latitude).toBe(25.5941);
      expect(extracted.longitude).toBe(85.1376);
      expect(extracted.altitude).toBeNull();
      expect(extracted.heading).toBeNull();
      expect(extracted.speed).toBeNull();
    });

    it('maps PERMISSION_DENIED (code 1) to user-friendly permission advice', () => {
      const error = {
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError;

      const mapped = mapGeolocationError(error);
      expect(mapped.status).toBe('permission_denied');
      expect(mapped.code).toBe(1);
      expect(mapped.message.toLowerCase()).toContain('denied');
      expect(mapped.message).toContain('browser');
    });

    it('maps POSITION_UNAVAILABLE (code 2) to GPS acquisition failure advice', () => {
      const error = {
        code: 2,
        message: 'Network location provider at full capacity',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError;

      const mapped = mapGeolocationError(error);
      expect(mapped.status).toBe('unavailable');
      expect(mapped.code).toBe(2);
      expect(mapped.message.toLowerCase()).toContain('unavailable');
    });

    it('maps TIMEOUT (code 3) to clear timeout message', () => {
      const error = {
        code: 3,
        message: 'Timeout expired',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError;

      const mapped = mapGeolocationError(error);
      expect(mapped.status).toBe('timeout');
      expect(mapped.code).toBe(3);
      expect(mapped.message.toLowerCase()).toContain('timed out');
    });
  });

  describe('3. Geolocation Service Execution (One-Time and Continuous Watch)', () => {
    it('getCurrentGpsPosition resolves with valid coordinates on success', async () => {
      const mockPosition = {
        coords: {
          latitude: 28.5355,
          longitude: 77.3910,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      } as unknown as GeolocationPosition;

      const getCurrentPositionMock = vi.fn().mockImplementation((success) => {
        success(mockPosition);
      });

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionMock,
          watchPosition: vi.fn(),
          clearWatch: vi.fn()
        },
        configurable: true,
        writable: true
      });

      const pos = await getCurrentGpsPosition();
      expect(pos.latitude).toBe(28.5355);
      expect(pos.longitude).toBe(77.3910);
      expect(getCurrentPositionMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000
        })
      );
    });

    it('getCurrentGpsPosition rejects with mapped error on permission denial', async () => {
      const mockError = {
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError;

      const getCurrentPositionMock = vi.fn().mockImplementation((_, error) => {
        error(mockError);
      });

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: {
          getCurrentPosition: getCurrentPositionMock,
          watchPosition: vi.fn(),
          clearWatch: vi.fn()
        },
        configurable: true,
        writable: true
      });

      await expect(getCurrentGpsPosition()).rejects.toMatchObject({
        status: 'permission_denied'
      });
    });

    it('startGpsWatch registers watchPosition and stopGpsWatch calls clearWatch', () => {
      const watchPositionMock = vi.fn().mockReturnValue(42);
      const clearWatchMock = vi.fn();

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: {
          getCurrentPosition: vi.fn(),
          watchPosition: watchPositionMock,
          clearWatch: clearWatchMock
        },
        configurable: true,
        writable: true
      });

      const onUpdate = vi.fn();
      const onError = vi.fn();

      const watchId = startGpsWatch(onUpdate, onError);
      expect(watchId).toBe(42);
      expect(watchPositionMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: true,
          maximumAge: 5000
        })
      );

      // Trigger update callback
      const mockPosition = {
        coords: {
          latitude: 27.1767,
          longitude: 78.0081,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: 175,
          speed: 25
        },
        timestamp: Date.now()
      } as unknown as GeolocationPosition;

      const successCb = watchPositionMock.mock.calls[0][0];
      successCb(mockPosition);
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        latitude: 27.1767,
        longitude: 78.0081
      }));

      // Stop watch
      stopGpsWatch(watchId);
      expect(clearWatchMock).toHaveBeenCalledWith(42);
    });
  });

  describe('4. Great-Circle Distance and Segment Projection Math', () => {
    it('computes accurate haversine distance between Delhi and Agra', () => {
      const delhi: [number, number] = [28.6139, 77.2090];
      const agra: [number, number] = [27.1767, 78.0081];

      const meters = haversineMeters(delhi, agra);
      const miles = haversineMiles(delhi, agra);

      // Known road/aerial distance Delhi-Agra is ~175-185 km (~108-115 mi)
      expect(meters).toBeGreaterThan(170000);
      expect(meters).toBeLessThan(190000);
      expect(miles).toBeGreaterThan(105);
      expect(miles).toBeLessThan(120);
    });

    it('returns zero distance for identical coordinates', () => {
      const p: [number, number] = [28.6139, 77.2090];
      expect(haversineMeters(p, p)).toBe(0);
      expect(haversineMiles(p, p)).toBe(0);
    });

    it('projects point perpendicularly onto an east-west line segment', () => {
      const a: [number, number] = [28.0, 77.0];
      const b: [number, number] = [28.0, 78.0];
      // Point slightly north of segment midpoint
      const p: [number, number] = [28.001, 77.5];

      const proj = projectPointOnSegment(p, a, b);
      expect(proj.t).toBeCloseTo(0.5, 2);
      expect(proj.projectedPoint[0]).toBeCloseTo(28.0, 4);
      expect(proj.projectedPoint[1]).toBeCloseTo(77.5, 3);
      // 0.001 deg latitude is approx 111 meters
      expect(proj.distanceMeters).toBeGreaterThan(100);
      expect(proj.distanceMeters).toBeLessThan(120);
    });

    it('clamps projection to segment endpoints when point lies beyond boundaries', () => {
      const a: [number, number] = [28.0, 77.0];
      const b: [number, number] = [28.0, 78.0];

      // Point before start
      const before: [number, number] = [28.0, 76.5];
      const projBefore = projectPointOnSegment(before, a, b);
      expect(projBefore.t).toBe(0);
      expect(projBefore.projectedPoint[0]).toBe(28.0);
      expect(projBefore.projectedPoint[1]).toBe(77.0);

      // Point past end
      const past: [number, number] = [28.0, 78.5];
      const projPast = projectPointOnSegment(past, a, b);
      expect(projPast.t).toBe(1);
      expect(projPast.projectedPoint[0]).toBe(28.0);
      expect(projPast.projectedPoint[1]).toBe(78.0);
    });
  });

  describe('5. High-Precision Route Snapping & Progress Tracking (matchGpsToRoute)', () => {
    it('accurately identifies point directly on route as On Route with proportional progress', () => {
      // User is at Agra on the Delhi->Bhopal route
      const gpsAtAgra: GpsCoordinates = {
        latitude: 27.1767,
        longitude: 78.0081,
        accuracy: 12,
        altitude: null,
        heading: 170,
        speed: 28,
        timestamp: Date.now()
      };

      const progress = matchGpsToRoute(gpsAtAgra, DELHI_BHOPAL_POLYLINE);
      expect(progress).not.toBeNull();
      if (!progress) return;

      expect(progress.isMatching).toBe(true);
      expect(progress.isOffRoute).toBe(false);
      expect(progress.deviationDistanceMeters).toBeLessThan(5); // Exact coordinate
      expect(progress.distanceTravelledMi).toBeGreaterThan(100);
      expect(progress.remainingDistanceMi).toBeGreaterThan(250);
      expect(progress.progressPercentage).toBeGreaterThan(20);
      expect(progress.progressPercentage).toBeLessThan(40);
      expect(progress.statusText).toContain('On Route');
    });

    it('tolerates small realistic GPS drift within dynamic threshold without false off-route alerts', () => {
      // User is slightly offset near Agra with 25m reported GPS accuracy
      const driftedGps: GpsCoordinates = {
        latitude: 27.1767 + 0.0003,
        longitude: 78.0081,
        accuracy: 25,
        altitude: null,
        heading: null,
        speed: 15,
        timestamp: Date.now()
      };

      const progress = matchGpsToRoute(driftedGps, DELHI_BHOPAL_POLYLINE);
      expect(progress).not.toBeNull();
      if (!progress) return;

      expect(progress.isMatching).toBe(true);
      // Dynamic threshold: max(50m, 25 * 1.5) = 50m. Deviation is ~15m < 50m, so should remain on-route
      expect(progress.isOffRoute).toBe(false);
      expect(progress.deviationDistanceMeters).toBeGreaterThan(5);
      expect(progress.deviationDistanceMeters).toBeLessThan(45);
    });

    it('flags true off-route deviation when user leaves road by 200+ meters', () => {
      // User has turned off the highway eastwards (~400m off road)
      const offRouteGps: GpsCoordinates = {
        latitude: 27.1767,
        longitude: 78.0081 + 0.004,
        accuracy: 10,
        altitude: null,
        heading: null,
        speed: 10,
        timestamp: Date.now()
      };

      const progress = matchGpsToRoute(offRouteGps, DELHI_BHOPAL_POLYLINE);
      expect(progress).not.toBeNull();
      if (!progress) return;

      expect(progress.isMatching).toBe(true);
      expect(progress.isOffRoute).toBe(true);
      expect(progress.deviationDistanceMeters).toBeGreaterThan(200);
      expect(progress.statusText).toContain('Off Route');
    });

    it('returns isMatching: false when user GPS is outside corridor (> 3000m)', () => {
      // User is in Mumbai [19.0760, 72.8777] while trip is Delhi -> Bhopal
      const mumbaiGps: GpsCoordinates = {
        latitude: 19.0760,
        longitude: 72.8777,
        accuracy: 15,
        altitude: null,
        heading: null,
        speed: 0,
        timestamp: Date.now()
      };

      const progress = matchGpsToRoute(mumbaiGps, DELHI_BHOPAL_POLYLINE);
      expect(progress).not.toBeNull();
      if (!progress) return;

      expect(progress.isMatching).toBe(false);
      expect(progress.isOffRoute).toBe(true);
      expect(progress.statusText.toLowerCase()).toContain('off corridor');
    });

    it('handles empty or single-point polylines safely without crashing', () => {
      const gps: GpsCoordinates = {
        latitude: 28.6139,
        longitude: 77.2090,
        accuracy: 10,
        altitude: null,
        heading: null,
        speed: null,
        timestamp: Date.now()
      };

      const emptyRes = matchGpsToRoute(gps, []);
      expect(emptyRes.isMatching).toBe(false);
      expect(emptyRes.statusText).toBe('No active route polyline');

      const singleRes = matchGpsToRoute(gps, [[28.6139, 77.2090]]);
      expect(singleRes.isMatching).toBe(false);
      expect(singleRes.statusText).toBe('No active route polyline');
    });
  });

  describe('6. Non-Destructive Invariants & Privacy Adherence', () => {
    it('preserves existing route polyline without mutating coordinate arrays', () => {
      const polylineCopy = DELHI_BHOPAL_POLYLINE.map(coord => [...coord] as [number, number]);
      const gps: GpsCoordinates = {
        latitude: 27.1767,
        longitude: 78.0081,
        accuracy: 10,
        altitude: null,
        heading: null,
        speed: null,
        timestamp: Date.now()
      };

      matchGpsToRoute(gps, DELHI_BHOPAL_POLYLINE);
      expect(DELHI_BHOPAL_POLYLINE).toEqual(polylineCopy);
    });

    it('does not make external network requests for GPS tracking operations', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const gps: GpsCoordinates = {
        latitude: 27.1767,
        longitude: 78.0081,
        accuracy: 10,
        altitude: null,
        heading: null,
        speed: null,
        timestamp: Date.now()
      };

      matchGpsToRoute(gps, DELHI_BHOPAL_POLYLINE);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
