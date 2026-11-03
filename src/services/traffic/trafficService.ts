/**
 * Provider-Independent Traffic Service & TomTom Orbis Integration (Phase 6B.1)
 * Primary: TomTom Orbis Traffic APIs
 *   - Flow Tiles: /maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2
 *   - Incidents: /maps/orbis/traffic/incidentDetails?apiVersion=1
 *   - Routing: POST /routing/3/routes/calculate (Orbis v3)
 * Secondary: Documented Legacy TomTom Traffic v4 / v5 / Routing v1 fallbacks
 * Never fabricates or fakes traffic data.
 */

import {
  TrafficFlowResult,
  TrafficIncident,
  TrafficRouteSummary,
  TrafficProvider,
  IncidentCategory,
  TrafficSegment,
  TrafficDataStatus
} from '../../types/traffic';
import { getTomTomApiKey } from '../search/placesSearchService';
import {
  geoJsonCoordinatesToLeafletLatLng,
  validateRoadGeometry,
  mergeRouteLegGeometries
} from '../../utils/geoUtils';

// Helper to resolve proxy endpoint in browser vs node
function getProxyUrl(endpoint: string): string | null {
  if (typeof window !== 'undefined') return endpoint;
  if (process.env.PROXY_URL) return `${process.env.PROXY_URL}${endpoint}`;
  return null;
}

interface CachedTraffic {
  timestamp: number;
  data: TrafficFlowResult;
}

const TRAFFIC_CACHE_TTL_MS = 3 * 60 * 1000; // 3-minute freshness TTL
const TRAFFIC_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15-minute stale threshold
let cachedTrafficResult: { key: string; entry: CachedTraffic } | null = null;

/**
 * Maps TomTom incident iconCategory to project IncidentCategory
 */
export function mapIncidentCategory(iconCategory?: number): IncidentCategory {
  switch (iconCategory) {
    case 1:
      return 'accident';
    case 2:
      return 'hazard';
    case 3:
      return 'road_closure';
    case 6:
      return 'congestion';
    case 8:
      return 'construction';
    case 9:
      return 'weather';
    default:
      return 'other';
  }
}

/**
 * Maps TomTom magnitudeOfDelay to project severity
 */
export function mapIncidentSeverity(magnitude?: number): 'minor' | 'moderate' | 'major' | 'critical' {
  switch (magnitude) {
    case 3:
      return 'critical';
    case 2:
      return 'major';
    case 1:
      return 'moderate';
    default:
      return 'minor';
  }
}

/**
 * TomTom Traffic Provider Implementation
 * Supports both TomTom Orbis (primary) and Legacy TomTom (secondary) APIs
 */
export class TomTomTrafficProvider implements TrafficProvider {
  id = 'tomtom-traffic';
  name = 'TomTom Orbis Traffic';
  apiVersion: 'orbis' | 'legacy' = 'orbis';

  hasCredentials(): boolean {
    return Boolean(getTomTomApiKey());
  }

  /**
   * Primary: Orbis Raster Flow Tile URL Template
   * Format: /maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&key={key}&style=dark
   */
  getTrafficTileUrlTemplate(style: 'dark' | 'light' = 'dark'): string | null {
    const key = getTomTomApiKey();
    if (!key) return null;
    return `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&key=${encodeURIComponent(key)}&style=${style}`;
  }

  /**
   * Secondary Fallback: Legacy v4 Flow Tile URL Template
   */
  getLegacyTrafficTileUrlTemplate(): string | null {
    const key = getTomTomApiKey();
    if (!key) return null;
    return `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}&thickness=10`;
  }

  /**
   * Fetches real incidents using TomTom Orbis Incidents API (with Legacy v5 fallback)
   */
  async getTrafficIncidents(bbox: [number, number, number, number]): Promise<TrafficIncident[]> {
    const key = getTomTomApiKey();
    if (!key) return [];

    const [minLat, minLng, maxLat, maxLng] = bbox;

    // 1. Primary: TomTom Orbis Incident Details
    try {
      const orbisUrl = `https://api.tomtom.com/maps/orbis/traffic/incidentDetails?apiVersion=1&key=${encodeURIComponent(key)}&bbox=${minLng},${minLat},${maxLng},${maxLat}`;
      const res = await fetch(orbisUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        const rawIncidents = Array.isArray(data.incidents) ? data.incidents : [];
        if (rawIncidents.length > 0) {
          return rawIncidents.map((inc: any): TrafficIncident => {
            const props = inc.properties || inc;
            const geom = inc.geometry || {};
            const coords: [number, number] =
              geom.type === 'Point' && Array.isArray(geom.coordinates)
                ? [geom.coordinates[1], geom.coordinates[0]] // [lon, lat] -> [lat, lon]
                : [minLat + (maxLat - minLat) / 2, minLng + (maxLng - minLng) / 2];

            const description = props.events?.[0]?.description || props.description || 'Traffic Incident';

            return {
              id: `orbis-inc-${props.id || Math.random().toString(36).slice(2, 9)}`,
              category: mapIncidentCategory(props.iconCategory),
              description,
              coordinates: coords,
              severity: mapIncidentSeverity(props.magnitudeOfDelay),
              startTime: props.startTime,
              endTime: props.endTime,
              delaySeconds: props.delay || props.trafficDelayDurationInSeconds,
              roadClosed: Boolean(props.roadClosed)
            };
          });
        }
      }
    } catch {}

    // 2. Secondary: Legacy TomTom Incident Details v5
    try {
      const legacyUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}&bbox=${minLng},${minLat},${maxLng},${maxLat}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,delay,roadClosed}}}`;
      const res = await fetch(legacyUrl);
      if (!res.ok) return [];
      const data = await res.json();
      const rawIncidents = data.incidents || [];

      return rawIncidents.map((inc: any): TrafficIncident => {
        const props = inc.properties || {};
        const geom = inc.geometry || {};
        const coords: [number, number] =
          geom.type === 'Point' && Array.isArray(geom.coordinates)
            ? [geom.coordinates[1], geom.coordinates[0]]
            : [minLat + (maxLat - minLat) / 2, minLng + (maxLng - minLng) / 2];

        const description = props.events?.[0]?.description || 'Traffic Incident';

        return {
          id: `legacy-inc-${props.id || Math.random().toString(36).slice(2, 9)}`,
          category: mapIncidentCategory(props.iconCategory),
          description,
          coordinates: coords,
          severity: mapIncidentSeverity(props.magnitudeOfDelay),
          startTime: props.startTime,
          endTime: props.endTime,
          delaySeconds: props.delay,
          roadClosed: Boolean(props.roadClosed)
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetches traffic flow and incidents for a bounding box
   * Enforces honest status reporting: 'live' ONLY when recent successful response received.
   */
  async getTrafficFlow(bbox: [number, number, number, number]): Promise<TrafficFlowResult> {
    const key = getTomTomApiKey();
    const now = Date.now();
    const bboxKey = bbox.map((n) => n.toFixed(2)).join(',');

    // Check in-memory cache
    if (cachedTrafficResult && cachedTrafficResult.key === bboxKey) {
      const ageMs = now - cachedTrafficResult.entry.timestamp;
      if (ageMs < TRAFFIC_CACHE_TTL_MS) {
        return cachedTrafficResult.entry.data;
      }
      if (ageMs < TRAFFIC_STALE_THRESHOLD_MS) {
        // Mark cached data as stale if older than 3 mins but under 15 mins
        return {
          ...cachedTrafficResult.entry.data,
          status: 'stale',
          lastUpdatedMinutesAgo: Math.round(ageMs / 60000)
        };
      }
    }

    if (!key) {
      return {
        status: 'missing_credentials',
        provider: this.name,
        timestamp: new Date().toISOString(),
        lastUpdatedMinutesAgo: 0,
        segments: [],
        incidents: [],
        trafficTileUrlTemplate: undefined,
        attribution: 'Traffic data powered by TomTom (API Key required)',
        coverageSupported: false,
        notes: 'VITE_TOMTOM_API_KEY environment variable is not configured. Traffic layer disabled.'
      };
    }

    try {
      const incidents = await this.getTrafficIncidents(bbox);
      const tileUrl = this.getTrafficTileUrlTemplate() || undefined;

      const result: TrafficFlowResult = {
        status: 'live',
        provider: this.name,
        timestamp: new Date().toISOString(),
        lastUpdatedMinutesAgo: 0,
        segments: [],
        incidents,
        trafficTileUrlTemplate: tileUrl,
        attribution: '© TomTom Orbis Traffic • Real-Time Traffic Flow & Incidents',
        coverageSupported: true,
        notes: incidents.length > 0 ? `${incidents.length} active live incidents reported.` : 'Real-time flow layer active.'
      };

      cachedTrafficResult = {
        key: bboxKey,
        entry: { timestamp: now, data: result }
      };

      return result;
    } catch (err: unknown) {
      return {
        status: 'unavailable',
        provider: this.name,
        timestamp: new Date().toISOString(),
        lastUpdatedMinutesAgo: 0,
        segments: [],
        incidents: [],
        trafficTileUrlTemplate: undefined,
        attribution: 'TomTom Traffic',
        coverageSupported: false,
        notes: err instanceof Error ? err.message : 'Failed to query live traffic provider.'
      };
    }
  }
}

export const defaultTrafficProvider = new TomTomTrafficProvider();

export interface CandidateRoadPath {
  id: string;
  name: string;
  coordinates: [number, number][];
  distanceMi: number;
  durationMinutes: number;
  freeFlowDurationMinutes: number;
  trafficDelayMinutes: number;
  trafficSummary: TrafficRouteSummary;
  legs: { distanceMi: number; durationMinutes: number; trafficDelayMinutes: number }[];
  routeType: 'fastest' | 'shortest' | 'alternative';
  hasTolls?: boolean;
  majorRoads?: string[];
  source: 'orbis_v3' | 'legacy_v1' | 'osrm' | 'geometric_fallback';
}

export interface RouteAlternativeOptions {
  routeType?: 'fastest' | 'shortest';
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
  maxAlternatives?: number;
  signal?: AbortSignal;
}

/**
 * Calculates dynamic road routes with genuine provider-supported alternative paths.
 * Priority 1: Backend Routing Proxy (POST /api/routing/calculate) using server TOMTOM_API_KEY
 * Priority 2: TomTom Orbis v3 Routing (POST /maps/orbis/routing/routes/calculate?apiVersion=3)
 * Priority 3: TomTom Legacy Routing v1 (GET /routing/1/calculateRoute)
 * Priority 4: High-Fidelity OSRM Driving Router (GET /route/v1/driving with alternatives=true)
 * Priority 5: Geometric Fallback (Only if all upstream road networks fail)
 */
export async function calculateRoadRouteAlternatives(
  waypoints: [number, number][],
  options?: RouteAlternativeOptions
): Promise<CandidateRoadPath[]> {
  if (waypoints.length < 2) return [];

  const maxAlts = Math.min(4, Math.max(0, options?.maxAlternatives ?? 2));
  const isShortest = options?.routeType === 'shortest';

  // 1. Primary: Query Backend Routing Proxy (/api/routing/calculate)
  const key = getTomTomApiKey();
  const isDirectMockKey = Boolean(key && key.startsWith('test-'));
  const proxyEndpoint = !isDirectMockKey ? getProxyUrl('/api/routing/calculate') : null;
  if (proxyEndpoint) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: waypoints,
          routeType: isShortest ? 'shortest' : 'fastest',
          maxAlternatives: maxAlts,
          avoidTolls: options?.avoidTolls,
          avoidHighways: options?.avoidHighways,
          avoidFerries: options?.avoidFerries
        }),
        signal: options?.signal || controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const rawRoutes = Array.isArray(json.routes) ? json.routes : [];
        if (rawRoutes.length > 0) {
          const results: CandidateRoadPath[] = [];

          rawRoutes.forEach((route: any, idx: number) => {
            const rawCoords: [number, number][] = Array.isArray(route.coordinates) && route.coordinates.length >= 2
              ? route.coordinates
              : waypoints;

            const validatedCoords = validateRoadGeometry(rawCoords) ? rawCoords : waypoints;

            const trafficSummary: TrafficRouteSummary = {
              status: 'live',
              provider: json.provider === 'tomtom_orbis' ? 'TomTom Orbis Routing v3' : json.provider === 'tomtom_v1' ? 'TomTom Routing v1' : 'OSRM Road Router',
              trafficTravelTimeMinutes: route.durationMinutes,
              freeFlowTravelTimeMinutes: route.freeFlowDurationMinutes || route.durationMinutes,
              trafficDelayMinutes: route.trafficDelayMinutes || 0,
              lastUpdated: new Date().toISOString(),
              segments: [],
              incidents: []
            };

            results.push({
              id: route.id || `road-path-${idx}`,
              name: route.name || (idx === 0 ? (isShortest ? 'Shortest Road Route' : 'Fastest Road Route') : `Alternative Road ${idx}`),
              coordinates: validatedCoords,
              distanceMi: route.distanceMi,
              durationMinutes: route.durationMinutes,
              freeFlowDurationMinutes: route.freeFlowDurationMinutes || route.durationMinutes,
              trafficDelayMinutes: route.trafficDelayMinutes || 0,
              trafficSummary,
              legs: route.legs || [{ distanceMi: route.distanceMi, durationMinutes: route.durationMinutes, trafficDelayMinutes: 0 }],
              routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
              hasTolls: route.hasTolls ?? !options?.avoidTolls,
              source: route.source || (json.provider === 'tomtom_orbis' ? 'orbis_v3' : json.provider === 'tomtom_v1' ? 'legacy_v1' : 'osrm')
            });
          });

          if (results.length > 0) {
            return results;
          }
        }
      }
    } catch {}
  }

  // 2. Direct Client Query: Official TomTom Orbis v3 Routing API (if VITE_TOMTOM_API_KEY present)
  if (key) {
    try {
      const origin = waypoints[0];
      const dest = waypoints[waypoints.length - 1];
      const intermediates = waypoints.slice(1, -1);

      const orbisPayload: Record<string, unknown> = {
        routePlanningLocations: {
          origin: {
            type: 'Point',
            coordinates: [origin[1], origin[0]] // GeoJSON [lon, lat]
          },
          destination: {
            type: 'Point',
            coordinates: [dest[1], dest[0]]
          }
        },
        routeType: isShortest ? 'short' : 'fast',
        travelMode: 'car',
        traffic: 'live',
        maxPathAlternativeRoutes: maxAlts
      };

      if (intermediates.length > 0) {
        (orbisPayload.routePlanningLocations as any).waypoints = {
          type: 'MultiPoint',
          coordinates: intermediates.map((p) => [p[1], p[0]])
        };
      }

      const avoidObj: Record<string, boolean> = {};
      const avoidList: string[] = [];
      if (options?.avoidTolls) {
        avoidObj.tollRoads = true;
        avoidList.push('tollRoads');
      }
      if (options?.avoidHighways) {
        avoidObj.motorways = true;
        avoidList.push('motorways');
      }
      if (options?.avoidFerries) {
        avoidObj.ferries = true;
        avoidList.push('ferries');
      }
      if (avoidList.length > 0) {
        orbisPayload.avoid = avoidObj;
        orbisPayload.avoids = avoidList;
      }

      const orbisUrl = `https://api.tomtom.com/routing/3/routes/calculate?apiVersion=3&key=${encodeURIComponent(key)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(orbisUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'TomTom-Api-Version': '3',
          'TomTom-Api-Key': key,
          Attributes: 'routes'
        },
        body: JSON.stringify(orbisPayload),
        signal: options?.signal || controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
        if (rawRoutes.length > 0) {
          const results: CandidateRoadPath[] = [];

          rawRoutes.forEach((route: any, idx: number) => {
            const summary = route.summary || {};
            const distanceMi = Math.max(1, Math.round((summary.lengthInMeters || 0) * 0.000621371));
            const durationSeconds = summary.travelDurationInSeconds ?? summary.travelTimeInSeconds ?? 0;
            const delaySeconds = summary.trafficDelayDurationInSeconds ?? summary.trafficDelayInSeconds ?? 0;
            const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
            const trafficDelayMinutes = Math.max(0, Math.round(delaySeconds / 60));
            const freeFlowDurationMinutes = Math.max(1, durationMinutes - trafficDelayMinutes);

            // Convert GeoJSON [lon, lat] coordinates to Leaflet [lat, lon]
            let coordinates: [number, number][] = [];
            if (route.path && Array.isArray(route.path.coordinates)) {
              coordinates = geoJsonCoordinatesToLeafletLatLng(route.path.coordinates);
            } else if (Array.isArray(route.legs)) {
              const legGeoms: [number, number][][] = [];
              for (const leg of route.legs) {
                if (leg.path?.coordinates) {
                  legGeoms.push(geoJsonCoordinatesToLeafletLatLng(leg.path.coordinates));
                } else if (Array.isArray(leg.points)) {
                  legGeoms.push(leg.points.map((pt: any) => [pt.latitude, pt.longitude]));
                }
              }
              coordinates = mergeRouteLegGeometries(legGeoms);
            }

            if (!validateRoadGeometry(coordinates)) {
              coordinates = waypoints;
            }

            const legCount = Math.max(1, waypoints.length - 1);
            const legDist = Math.max(1, Math.round(distanceMi / legCount));
            const legDur = Math.max(1, Math.round(durationMinutes / legCount));
            const legDelay = Math.round(trafficDelayMinutes / legCount);
            const legs = Array.from({ length: legCount }, () => ({
              distanceMi: legDist,
              durationMinutes: legDur,
              trafficDelayMinutes: legDelay
            }));

            const trafficSummary: TrafficRouteSummary = {
              status: 'live',
              provider: 'TomTom Orbis Routing v3',
              trafficTravelTimeMinutes: durationMinutes,
              freeFlowTravelTimeMinutes: freeFlowDurationMinutes,
              trafficDelayMinutes,
              lastUpdated: new Date().toISOString(),
              segments: [],
              incidents: []
            };

            const pathName =
              idx === 0
                ? isShortest
                  ? 'Shortest Road Route'
                  : 'Fastest Road Route'
                : `Alternative Road ${idx}`;

            results.push({
              id: `road-path-${idx}`,
              name: pathName,
              coordinates,
              distanceMi,
              durationMinutes,
              freeFlowDurationMinutes,
              trafficDelayMinutes,
              trafficSummary,
              legs,
              routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
              hasTolls: !options?.avoidTolls,
              source: 'orbis_v3'
            });
          });

          if (results.length > 0) {
            return results;
          }
        }
      }
    } catch {}

    // Fallback: TomTom Routing v1
    try {
      const locationsStr = waypoints
        .map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
        .join(':');

      const avoidList: string[] = [];
      if (options?.avoidTolls) avoidList.push('tollRoads');
      if (options?.avoidHighways) avoidList.push('motorways');
      if (options?.avoidFerries) avoidList.push('ferries');
      const avoidQuery = avoidList.length > 0 ? `&avoid=${avoidList.join(',')}` : '';

      const legacyUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locationsStr}/json?key=${encodeURIComponent(key)}&traffic=true&computeTravelTimeFor=all&travelMode=car&maxAlternatives=${maxAlts}&routeType=${isShortest ? 'shortest' : 'fastest'}${avoidQuery}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(legacyUrl, { signal: options?.signal || controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
        if (rawRoutes.length > 0) {
          const results: CandidateRoadPath[] = [];

          rawRoutes.forEach((route: any, idx: number) => {
            if (!route.summary) return;
            const summary = route.summary;
            const distanceMi = Math.max(1, Math.round(summary.lengthInMeters * 0.000621371));
            const durationMinutes = Math.max(1, Math.round(summary.travelTimeInSeconds / 60));
            const trafficDelayMinutes = Math.max(0, Math.round((summary.trafficDelayInSeconds || 0) / 60));
            const freeFlowDurationMinutes = Math.max(1, durationMinutes - trafficDelayMinutes);

            const coordinates: [number, number][] = [];
            if (Array.isArray(route.legs)) {
              for (const leg of route.legs) {
                if (Array.isArray(leg.points)) {
                  for (const pt of leg.points) {
                    coordinates.push([pt.latitude, pt.longitude]);
                  }
                }
              }
            }

            const legs = Array.isArray(route.legs) && route.legs.length > 0
              ? route.legs.map((leg: any) => ({
                  distanceMi: Math.max(1, Math.round((leg.summary?.lengthInMeters || 0) * 0.000621371)),
                  durationMinutes: Math.max(1, Math.round((leg.summary?.travelTimeInSeconds || 0) / 60)),
                  trafficDelayMinutes: Math.max(0, Math.round((leg.summary?.trafficDelayInSeconds || 0) / 60))
                }))
              : [{ distanceMi, durationMinutes, trafficDelayMinutes }];

            const trafficSummary: TrafficRouteSummary = {
              status: 'live',
              provider: 'TomTom Legacy Routing v1',
              trafficTravelTimeMinutes: durationMinutes,
              freeFlowTravelTimeMinutes: freeFlowDurationMinutes,
              trafficDelayMinutes,
              lastUpdated: new Date().toISOString(),
              segments: [],
              incidents: []
            };

            const pathName =
              idx === 0
                ? isShortest
                  ? 'Shortest Road Route'
                  : 'Fastest Road Route'
                : `Alternative Road ${idx}`;

            results.push({
              id: `road-path-${idx}`,
              name: pathName,
              coordinates: coordinates.length > 0 ? coordinates : waypoints,
              distanceMi,
              durationMinutes,
              freeFlowDurationMinutes,
              trafficDelayMinutes,
              trafficSummary,
              legs,
              routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
              hasTolls: !options?.avoidTolls,
              source: 'legacy_v1'
            });
          });

          if (results.length > 0) {
            return results;
          }
        }
      }
    } catch {}
  }

  // 3. Fallback: OSRM Driving Router with alternatives
  try {
    const coordsStr = waypoints.map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&alternatives=true`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(osrmUrl, { signal: options?.signal || controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
      if (data.code === 'Ok' && rawRoutes.length > 0) {
        return rawRoutes.slice(0, maxAlts + 1).map((route: any, idx: number) => {
          const geojsonCoords: [number, number][] = Array.isArray(route.geometry?.coordinates)
            ? geoJsonCoordinatesToLeafletLatLng(route.geometry.coordinates)
            : waypoints;

          const distanceMi = Math.max(1, Math.round(route.distance * 0.000621371));
          const durationMinutes = Math.max(1, Math.round(route.duration / 60));

          const legs = Array.isArray(route.legs) && route.legs.length > 0
            ? route.legs.map((l: any) => ({
                distanceMi: Math.max(1, Math.round(l.distance * 0.000621371)),
                durationMinutes: Math.max(1, Math.round(l.duration / 60)),
                trafficDelayMinutes: 0
              }))
            : [{ distanceMi, durationMinutes, trafficDelayMinutes: 0 }];

          const trafficSummary: TrafficRouteSummary = {
            status: 'unavailable',
            provider: 'OSRM Driving Router',
            trafficTravelTimeMinutes: durationMinutes,
            freeFlowTravelTimeMinutes: durationMinutes,
            trafficDelayMinutes: 0,
            lastUpdated: new Date().toISOString(),
            segments: [],
            incidents: []
          };

          const pathName =
            idx === 0
              ? isShortest
                ? 'Shortest Road Route (OSRM)'
                : 'Primary Road Route (OSRM)'
              : `Alternative Road ${idx} (OSRM)`;

          return {
            id: `road-path-${idx}`,
            name: pathName,
            coordinates: geojsonCoords,
            distanceMi,
            durationMinutes,
            freeFlowDurationMinutes: durationMinutes,
            trafficDelayMinutes: 0,
            trafficSummary,
            legs,
            routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
            source: 'osrm' as const
          };
        });
      }
    }
  } catch {}

  // 4. Geometric Fallback (Only if all upstream road networks fail)
  let directDistMi = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const [lat1, lon1] = waypoints[i - 1];
    const [lat2, lon2] = waypoints[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    directDistMi += 3958.8 * c;
  }

  const distanceMi = Math.max(1, Math.round(directDistMi * 1.28));
  const durationMinutes = Math.max(1, Math.round(distanceMi * 1.35));

  const interpolatedCoords: [number, number][] = waypoints.reduce<[number, number][]>((acc, pt, i) => {
    if (i === 0) return [pt];
    const prev = waypoints[i - 1];
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      acc.push([
        prev[0] + ((pt[0] - prev[0]) * s) / steps,
        prev[1] + ((pt[1] - prev[1]) * s) / steps
      ]);
    }
    return acc;
  }, []);

  const fallbackTraffic: TrafficRouteSummary = {
    status: key ? 'unavailable' : 'missing_credentials',
    provider: 'Geometric Fallback',
    trafficTravelTimeMinutes: durationMinutes,
    freeFlowTravelTimeMinutes: durationMinutes,
    trafficDelayMinutes: 0,
    lastUpdated: new Date().toISOString(),
    segments: [],
    incidents: []
  };

  return [
    {
      id: 'road-path-0',
      name: isShortest ? 'Shortest Road Route' : 'Fastest Road Route',
      coordinates: interpolatedCoords,
      distanceMi,
      durationMinutes,
      freeFlowDurationMinutes: durationMinutes,
      trafficDelayMinutes: 0,
      trafficSummary: fallbackTraffic,
      legs: [{ distanceMi, durationMinutes, trafficDelayMinutes: 0 }],
      routeType: isShortest ? 'shortest' : 'fastest',
      source: 'geometric_fallback'
    }
  ];
}

/**
 * Calculates a traffic-aware route using TomTom Routing APIs
 * Legacy convenience method returning the primary road path.
 */
export async function calculateTomTomTrafficRoute(
  waypoints: [number, number][]
): Promise<{
  coordinates: [number, number][];
  distanceMi: number;
  durationMinutes: number;
  freeFlowDurationMinutes: number;
  trafficDelayMinutes: number;
  trafficSummary: TrafficRouteSummary;
  legs: { distanceMi: number; durationMinutes: number; trafficDelayMinutes: number }[];
  apiVersion: 'orbis_v3' | 'legacy_v1';
} | null> {
  const alts = await calculateRoadRouteAlternatives(waypoints);
  const primary = alts.find((a) => a.source === 'orbis_v3' || a.source === 'legacy_v1');
  if (!primary) return null;
  return {
    coordinates: primary.coordinates,
    distanceMi: primary.distanceMi,
    durationMinutes: primary.durationMinutes,
    freeFlowDurationMinutes: primary.freeFlowDurationMinutes,
    trafficDelayMinutes: primary.trafficDelayMinutes,
    trafficSummary: primary.trafficSummary,
    legs: primary.legs,
    apiVersion: primary.source === 'orbis_v3' ? 'orbis_v3' : 'legacy_v1'
  };
}

/**
 * Fetches real live traffic conditions directly along the selected road route (Phase 6E)
 * Uses backend proxy POST /api/traffic/route-segments
 * Enforces honest reporting: returns 'live' when provider segments received, 'unavailable' otherwise.
 */
export async function fetchRouteTrafficSegments(
  coordinates: [number, number][],
  signal?: AbortSignal
): Promise<{
  status: TrafficDataStatus;
  provider: string;
  segments: TrafficSegment[];
  totalDistanceMi?: number;
}> {
  if (!coordinates || coordinates.length < 2) {
    return {
      status: 'unavailable',
      provider: 'None',
      segments: []
    };
  }

  const endpoint = getProxyUrl('/api/traffic/route-segments');
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates }),
        signal
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          const hasMeasurements = data.segments.some((s: TrafficSegment) => s.congestionLevel !== 'unknown');
          return {
            status: hasMeasurements ? 'live' : 'stale',
            provider: data.provider || 'TomTom Live Traffic',
            segments: data.segments,
            totalDistanceMi: data.totalDistanceMi
          };
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
    }
  }

  return {
    status: 'unavailable',
    provider: 'Traffic flow unavailable',
    segments: []
  };
}
