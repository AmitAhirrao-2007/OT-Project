import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRouteTrafficSegments,
  calculateRoadRouteAlternatives
} from '../services/traffic/trafficService';
import { TrafficSegment } from '../types/traffic';

describe('Phase 6E: Live Road Traffic on Selected Route Suite', () => {
  const DELHI_BHOPAL_COORDS: [number, number][] = [
    [28.6139, 77.2090], // Delhi
    [27.1767, 78.0081], // Agra
    [26.2183, 78.1828], // Gwalior
    [23.2599, 77.4126]  // Bhopal
  ];

  const PATNA_DARBHANGA_COORDS: [number, number][] = [
    [25.5941, 85.1376], // Patna
    [25.6883, 85.2217], // Hajipur
    [25.9898, 85.6756], // Samastipur
    [26.1542, 85.8918]  // Darbhanga
  ];

  const MUMBAI_GOA_COORDS: [number, number][] = [
    [19.0760, 72.8777], // Mumbai
    [18.5204, 73.8567], // Pune
    [16.7050, 74.2433], // Kolhapur
    [15.2993, 74.1240]  // Goa
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PROXY_URL = 'http://127.0.0.1:3000';
  });

  afterEach(() => {
    delete process.env.PROXY_URL;
  });

  describe('1. Speed Ratio & Congestion Level Classification Rules', () => {
    it('classifies relative speed >= 0.90 as free_flow (green)', () => {
      const seg: Partial<TrafficSegment> = {
        currentSpeedMph: 55,
        freeFlowSpeedMph: 60,
        speedRatio: 0.92,
        congestionLevel: 'free_flow'
      };
      expect(seg.congestionLevel).toBe('free_flow');
      expect(seg.speedRatio).toBeGreaterThanOrEqual(0.9);
    });

    it('classifies 0.75 <= ratio < 0.90 as minor slowdown (lime/yellow)', () => {
      const seg: Partial<TrafficSegment> = {
        currentSpeedMph: 48,
        freeFlowSpeedMph: 60,
        speedRatio: 0.80,
        congestionLevel: 'minor'
      };
      expect(seg.congestionLevel).toBe('minor');
      expect(seg.speedRatio).toBeGreaterThanOrEqual(0.75);
      expect(seg.speedRatio).toBeLessThan(0.9);
    });

    it('classifies 0.50 <= ratio < 0.75 as moderate slowdown (amber/orange)', () => {
      const seg: Partial<TrafficSegment> = {
        currentSpeedMph: 36,
        freeFlowSpeedMph: 60,
        speedRatio: 0.60,
        congestionLevel: 'moderate'
      };
      expect(seg.congestionLevel).toBe('moderate');
      expect(seg.speedRatio).toBeGreaterThanOrEqual(0.5);
      expect(seg.speedRatio).toBeLessThan(0.75);
    });

    it('classifies ratio < 0.50 as heavy congestion (red)', () => {
      const seg: Partial<TrafficSegment> = {
        currentSpeedMph: 20,
        freeFlowSpeedMph: 60,
        speedRatio: 0.33,
        congestionLevel: 'heavy'
      };
      expect(seg.congestionLevel).toBe('heavy');
      expect(seg.speedRatio).toBeLessThan(0.5);
    });

    it('classifies road closure or 0 speed as blocked (dark crimson)', () => {
      const seg: Partial<TrafficSegment> = {
        currentSpeedMph: 0,
        freeFlowSpeedMph: 50,
        speedRatio: 0,
        roadClosed: true,
        congestionLevel: 'blocked'
      };
      expect(seg.congestionLevel).toBe('blocked');
      expect(seg.roadClosed).toBe(true);
    });

    it('classifies segments without coverage honestly as unknown (neutral slate)', () => {
      const seg: Partial<TrafficSegment> = {
        congestionLevel: 'unknown',
        provider: 'TomTom (No flow measurement at coordinate)'
      };
      expect(seg.congestionLevel).toBe('unknown');
    });
  });

  describe('2. Live Road Traffic Flow Along Key Corridors', () => {
    it('fetches multi-segment traffic along Delhi to Bhopal corridor', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          status_code: 1000,
          provider: 'TomTom Live Traffic',
          totalDistanceMi: 480.2,
          segmentsCount: 3,
          segments: [
            {
              id: 'seg-0',
              coordinates: [DELHI_BHOPAL_COORDS[0], DELHI_BHOPAL_COORDS[1]],
              congestionLevel: 'minor',
              currentSpeedMph: 45,
              freeFlowSpeedMph: 55,
              currentSpeedKph: 72,
              freeFlowSpeedKph: 89,
              speedRatio: 0.82,
              delaySeconds: 120,
              roadClosed: false,
              provider: 'TomTom Live Traffic Flow',
              lastUpdated: new Date().toISOString()
            },
            {
              id: 'seg-1',
              coordinates: [DELHI_BHOPAL_COORDS[1], DELHI_BHOPAL_COORDS[2]],
              congestionLevel: 'free_flow',
              currentSpeedMph: 60,
              freeFlowSpeedMph: 60,
              currentSpeedKph: 97,
              freeFlowSpeedKph: 97,
              speedRatio: 1.0,
              delaySeconds: 0,
              roadClosed: false,
              provider: 'TomTom Live Traffic Flow',
              lastUpdated: new Date().toISOString()
            },
            {
              id: 'seg-2',
              coordinates: [DELHI_BHOPAL_COORDS[2], DELHI_BHOPAL_COORDS[3]],
              congestionLevel: 'moderate',
              currentSpeedMph: 35,
              freeFlowSpeedMph: 55,
              currentSpeedKph: 56,
              freeFlowSpeedKph: 89,
              speedRatio: 0.64,
              delaySeconds: 300,
              roadClosed: false,
              provider: 'TomTom Live Traffic Flow',
              lastUpdated: new Date().toISOString()
            }
          ]
        })
      } as any));

      const result = await fetchRouteTrafficSegments(DELHI_BHOPAL_COORDS);
      expect(result.status).toBe('live');
      expect(result.segments.length).toBe(3);
      expect(result.segments[0].congestionLevel).toBe('minor');
      expect(result.segments[1].congestionLevel).toBe('free_flow');
      expect(result.segments[2].congestionLevel).toBe('moderate');
      expect(result.segments[0].currentSpeedMph).toBe(45);
      expect(result.segments[0].freeFlowSpeedMph).toBe(55);
    });

    it('fetches traffic segments for Patna to Darbhanga corridor', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          status_code: 1000,
          provider: 'TomTom Live Traffic',
          totalDistanceMi: 83.9,
          segmentsCount: 2,
          segments: [
            {
              id: 'seg-0',
              coordinates: [PATNA_DARBHANGA_COORDS[0], PATNA_DARBHANGA_COORDS[2]],
              congestionLevel: 'heavy',
              currentSpeedMph: 18,
              freeFlowSpeedMph: 45,
              currentSpeedKph: 29,
              freeFlowSpeedKph: 72,
              speedRatio: 0.40,
              delaySeconds: 540,
              roadClosed: false,
              provider: 'TomTom Live Traffic Flow',
              lastUpdated: new Date().toISOString()
            },
            {
              id: 'seg-1',
              coordinates: [PATNA_DARBHANGA_COORDS[2], PATNA_DARBHANGA_COORDS[3]],
              congestionLevel: 'free_flow',
              currentSpeedMph: 45,
              freeFlowSpeedMph: 45,
              currentSpeedKph: 72,
              freeFlowSpeedKph: 72,
              speedRatio: 1.0,
              delaySeconds: 0,
              roadClosed: false,
              provider: 'TomTom Live Traffic Flow',
              lastUpdated: new Date().toISOString()
            }
          ]
        })
      } as any));

      const result = await fetchRouteTrafficSegments(PATNA_DARBHANGA_COORDS);
      expect(result.status).toBe('live');
      expect(result.segments[0].congestionLevel).toBe('heavy');
      expect(result.segments[1].congestionLevel).toBe('free_flow');
    });

    it('identifies road closures along corridor such as Mumbai to Goa', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          status_code: 1000,
          provider: 'TomTom Live Traffic',
          totalDistanceMi: 368.9,
          segmentsCount: 2,
          segments: [
            {
              id: 'seg-0',
              coordinates: [MUMBAI_GOA_COORDS[0], MUMBAI_GOA_COORDS[1]],
              congestionLevel: 'free_flow',
              speedRatio: 0.95,
              roadClosed: false
            },
            {
              id: 'seg-1',
              coordinates: [MUMBAI_GOA_COORDS[1], MUMBAI_GOA_COORDS[2]],
              congestionLevel: 'blocked',
              speedRatio: 0,
              roadClosed: true,
              delaySeconds: 1800
            }
          ]
        })
      } as any));

      const result = await fetchRouteTrafficSegments(MUMBAI_GOA_COORDS);
      expect(result.segments[1].congestionLevel).toBe('blocked');
      expect(result.segments[1].roadClosed).toBe(true);
    });
  });

  describe('3. Alternative Road Routes & Traffic Isolation', () => {
    it('returns candidate road alternatives with independent polylines', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          status_code: 1000,
          provider: 'tomtom_orbis',
          routes: [
            {
              id: 'road-path-0',
              name: 'Fastest Road Route',
              distanceMi: 480,
              durationMinutes: 540,
              freeFlowDurationMinutes: 510,
              trafficDelayMinutes: 30,
              coordinates: DELHI_BHOPAL_COORDS,
              routeType: 'fastest',
              source: 'orbis_v3'
            },
            {
              id: 'road-path-1',
              name: 'Alternative Road 1',
              distanceMi: 495,
              durationMinutes: 565,
              freeFlowDurationMinutes: 550,
              trafficDelayMinutes: 15,
              coordinates: DELHI_BHOPAL_COORDS.map(([lat, lon]) => [lat + 0.1, lon + 0.1]),
              routeType: 'alternative',
              source: 'orbis_v3'
            }
          ]
        })
      } as any));

      const alts = await calculateRoadRouteAlternatives(DELHI_BHOPAL_COORDS);
      expect(alts.length).toBe(2);
      expect(alts[0].id).toBe('road-path-0');
      expect(alts[0].name).toBe('Fastest Road Route');
      expect(alts[1].id).toBe('road-path-1');
      expect(alts[1].name).toBe('Alternative Road 1');
      expect(alts[0].coordinates).not.toEqual(alts[1].coordinates);
    });

    it('returns empty segments gracefully when coordinates has fewer than 2 points', async () => {
      const res = await fetchRouteTrafficSegments([[28.6139, 77.2090]]);
      expect(res.status).toBe('unavailable');
      expect(res.segments).toEqual([]);
    });
  });
});
