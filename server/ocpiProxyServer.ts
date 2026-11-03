// Secure Server-Side OCPI Proxy Daemon
// Shields operator API tokens and upstream credentials from browser client code.
// Built with standard Node.js libraries (zero unnecessary dependencies).

import http from 'http';
import { parse } from 'url';
import fs from 'fs';
import path from 'path';
import { OcpiClient, redactSensitiveTokens } from '../src/services/providers/ocpi/ocpiClient';
import { OcpiLocationAdapter } from '../src/services/providers/ocpi/ocpiLocationAdapter';
import { MockOcpiProvider } from '../src/services/providers/mock/mockOcpiProvider';
import { LiveStationTelemetry, ProviderSyncDiagnostics } from '../src/services/providers/providerTypes';
import {
  submitCommunityReport,
  getReportsForStation,
  moderateReport,
  loadReportsFromDisk
} from './reportStorage';
import { computeStationReliability } from '../src/services/communityService';
import { ReportSubmissionRequest, ModerationRequest } from '../src/types/communityReports';
import {
  searchStations,
  getStationsInBbox,
  getStationsAlongCorridor,
  getStationById,
  getStationStats,
  loadPcsStations
} from './stationDataService';
import { handlePlacesAndTrafficApiRequest } from './placesAndTrafficMiddleware';
import { handleQueueApiRequest } from './queueApiMiddleware';
import { handleOperatorApiRequest } from './operatorApiMiddleware';

// Safely load environment variables from root .env or server/.env without extra dependencies
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'server', '.env'));

const PORT = parseInt(process.env.PORT || '3001', 10);
const OCPI_BASE_URL = process.env.OCPI_CPO_BASE_URL || '';
const OCPI_TOKEN = process.env.OCPI_SERVER_TOKEN || '';
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || process.env.VITE_TOMTOM_API_KEY || '';

// Parse request body helper with size limit
function parseRequestBody(req: http.IncomingMessage, maxBytes = 16384): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Internal state cache shielded on the server
let serverCache: LiveStationTelemetry[] = [];
let lastSyncTimestamp: string | null = null;
let providerMode: 'live' | 'mock' = OCPI_BASE_URL && OCPI_TOKEN ? 'live' : 'mock';

// Initialize mock provider as reliable sandbox
const mockProvider = new MockOcpiProvider();

// Initialize real client if credentials provided in server environment
const ocpiClient = OCPI_BASE_URL
  ? new OcpiClient({
      baseUrl: OCPI_BASE_URL,
      serverToken: OCPI_TOKEN,
      timeoutMs: parseInt(process.env.OCPI_REQUEST_TIMEOUT_MS || '6000', 10),
      maxRetries: parseInt(process.env.OCPI_MAX_RETRIES || '2', 10)
    })
  : null;

const locationAdapter = ocpiClient
  ? new OcpiLocationAdapter(ocpiClient, {
      providerId: 'cpo-upstream',
      providerName: 'Upstream OCPI CPO',
      sourceType: 'live_provider'
    })
  : null;

async function syncData(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (providerMode === 'live' && locationAdapter) {
      const res = await locationAdapter.fetchLocations();
      serverCache = res.telemetry;
      lastSyncTimestamp = new Date().toISOString();
      return { success: true, count: res.recordsAccepted };
    } else {
      // Fallback to simulated provider sandbox
      const res = await mockProvider.fetchLocations();
      serverCache = res;
      lastSyncTimestamp = new Date().toISOString();
      return { success: true, count: res.length };
    }
  } catch (err: unknown) {
    const errorMsg = redactSensitiveTokens(err instanceof Error ? err.message : String(err));
    return { success: false, count: serverCache.length, error: errorMsg };
  }
}

// Initial server sync
syncData().catch(() => {});

const server = http.createServer(async (req, res) => {
  const parsedUrl = parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '';

  // Standard CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const handledPlacesTraffic = await handlePlacesAndTrafficApiRequest(req, res);
  if (handledPlacesTraffic) return;

  const handledQueue = await handleQueueApiRequest(req, res);
  if (handledQueue) return;

  const handledOperator = await handleOperatorApiRequest(req, res);
  if (handledOperator) return;

  // Health and Provider Status Endpoint
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'ev-route-planner-ocpi-proxy',
        mode: providerMode,
        hasUpstreamCredentials: Boolean(OCPI_BASE_URL && OCPI_TOKEN),
        lastSync: lastSyncTimestamp,
        cachedRecords: serverCache.length
      })
    );
    return;
  }

  // Live Stations Telemetry Endpoint
  if (pathname === '/api/stations/live' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status_code: 1000,
        provider_mode: providerMode,
        timestamp: new Date().toISOString(),
        last_sync: lastSyncTimestamp,
        data: serverCache
      })
    );
    return;
  }

  // Trigger Manual Sync Endpoint
  if (pathname === '/api/stations/sync' && req.method === 'POST') {
    const result = await syncData();
    res.writeHead(result.success ? 200 : 502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // --- Indian EV PCS Station Catalogue Endpoints (Phase 6D) ---

  // Station Statistics & Summary Metrics
  if (pathname === '/api/stations/stats' && req.method === 'GET') {
    const stats = getStationStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status_code: 1000, stats }));
    return;
  }

  // Station Search & Filter
  if (pathname === '/api/stations/search' && req.method === 'GET') {
    const q = typeof parsedUrl.query.q === 'string' ? parsedUrl.query.q : '';
    const state = typeof parsedUrl.query.state === 'string' ? parsedUrl.query.state : undefined;
    const district = typeof parsedUrl.query.district === 'string' ? parsedUrl.query.district : undefined;
    const cpo = typeof parsedUrl.query.cpo === 'string' ? parsedUrl.query.cpo : undefined;
    const category = typeof parsedUrl.query.category === 'string' ? (parsedUrl.query.category as any) : undefined;
    const connector = typeof parsedUrl.query.connector === 'string' ? parsedUrl.query.connector : undefined;
    const minPowerKw = typeof parsedUrl.query.minPower === 'string' ? parseFloat(parsedUrl.query.minPower) : undefined;
    const maxPowerKw = typeof parsedUrl.query.maxPower === 'string' ? parseFloat(parsedUrl.query.maxPower) : undefined;
    const excludeLev = parsedUrl.query.excludeLev === 'true';
    const vehicleCompatible = parsedUrl.query.vehicleCompatible === 'true';
    const vehicleSelectedPlugs = typeof parsedUrl.query.vehiclePlugs === 'string'
      ? parsedUrl.query.vehiclePlugs.split(',').map((p) => p.trim())
      : undefined;
    const limit = typeof parsedUrl.query.limit === 'string' ? parseInt(parsedUrl.query.limit, 10) : 50;
    const offset = typeof parsedUrl.query.offset === 'string' ? parseInt(parsedUrl.query.offset, 10) : 0;

    const stations = searchStations(q, {
      state,
      district,
      cpo,
      category,
      connectorType: connector,
      minPowerKw,
      maxPowerKw,
      excludeLev,
      vehicleCompatible,
      vehicleSelectedPlugs,
      limit,
      offset
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status_code: 1000,
        total: (stations as any).totalCount ?? stations.length,
        returned: stations.length,
        offset,
        limit,
        stations
      })
    );
    return;
  }

  // Stations in Bounding Box (Viewport Clustering)
  if (pathname === '/api/stations/bbox' && req.method === 'GET') {
    const minLat = typeof parsedUrl.query.minLat === 'string' ? parseFloat(parsedUrl.query.minLat) : NaN;
    const maxLat = typeof parsedUrl.query.maxLat === 'string' ? parseFloat(parsedUrl.query.maxLat) : NaN;
    const minLon = typeof parsedUrl.query.minLon === 'string' ? parseFloat(parsedUrl.query.minLon) : NaN;
    const maxLon = typeof parsedUrl.query.maxLon === 'string' ? parseFloat(parsedUrl.query.maxLon) : NaN;

    if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'minLat, maxLat, minLon, and maxLon numeric query parameters are required' }));
      return;
    }

    const minPowerKw = typeof parsedUrl.query.minPower === 'string' ? parseFloat(parsedUrl.query.minPower) : undefined;
    const excludeLev = parsedUrl.query.excludeLev === 'true';
    const limit = typeof parsedUrl.query.limit === 'string' ? parseInt(parsedUrl.query.limit, 10) : 300;

    const stations = getStationsInBbox(minLat, maxLat, minLon, maxLon, {
      minPowerKw,
      excludeLev,
      limit
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status_code: 1000, count: stations.length, stations }));
    return;
  }

  // Stations along Route Corridor
  if (pathname === '/api/stations/corridor' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req, 1048576); // allow up to 1MB polyline payload
      const polyline: [number, number][] = Array.isArray(body.polyline) ? body.polyline : [];
      const corridorRadiusMi = typeof body.corridorRadiusMi === 'number' ? body.corridorRadiusMi : 25;
      const excludeLev = body.excludeLev !== false; // default true for highway road routes
      const minPowerKw = typeof body.minPowerKw === 'number' ? body.minPowerKw : 20;
      const limit = typeof body.limit === 'number' ? body.limit : 200;

      const stations = getStationsAlongCorridor(polyline, corridorRadiusMi, {
        excludeLev,
        minPowerKw,
        limit
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status_code: 1000, count: stations.length, stations }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Corridor station search failure';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // Station Detail by ID
  if (pathname === '/api/stations/detail' && req.method === 'GET') {
    const id = typeof parsedUrl.query.id === 'string' ? parsedUrl.query.id : '';
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required query parameter: id' }));
      return;
    }
    const station = getStationById(id);
    if (!station) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Station ${id} not found` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status_code: 1000, station }));
    return;
  }

  // --- Community Reliability Network Endpoints (Phase 5D) ---

  // Submit Driver Report
  if (pathname === '/api/reports' && req.method === 'POST') {
    try {
      const body: ReportSubmissionRequest = await parseRequestBody(req);
      const clientIp = req.socket.remoteAddress || '127.0.0.1';
      const result = submitCommunityReport(body, clientIp);
      res.writeHead(result.code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid request';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  // Get Reports for Station
  if (pathname === '/api/reports' && req.method === 'GET') {
    const stationId = typeof parsedUrl.query.stationId === 'string' ? parsedUrl.query.stationId : '';
    const connectorId = typeof parsedUrl.query.connectorId === 'string' ? parsedUrl.query.connectorId : undefined;
    if (!stationId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required query parameter: stationId' }));
      return;
    }
    const reports = getReportsForStation(stationId, { connectorId });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status_code: 1000,
        stationId,
        count: reports.length,
        reports
      })
    );
    return;
  }

  // Get Aggregate Reliability Summary
  if (pathname === '/api/reports/reliability' && req.method === 'GET') {
    const stationId = typeof parsedUrl.query.stationId === 'string' ? parsedUrl.query.stationId : '';
    const cpoStatus = typeof parsedUrl.query.cpoStatus === 'string' ? parsedUrl.query.cpoStatus : undefined;
    if (!stationId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required query parameter: stationId' }));
      return;
    }
    const allReports = loadReportsFromDisk();
    const summary = computeStationReliability(allReports, stationId, cpoStatus);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status_code: 1000,
        stationId,
        summary
      })
    );
    return;
  }

  // Administrative Moderation Endpoint
  if (pathname === '/api/reports/moderate' && req.method === 'POST') {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const body: ModerationRequest = await parseRequestBody(req);
      const result = moderateReport(body, token);
      res.writeHead(result.code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid request';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: msg }));
    }
    return;
  }

  // --- Traffic & Places Proxy Endpoints (Phase 6B.1) ---

  // Check Traffic Service Status
  if (pathname === '/api/traffic/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status_code: 1000,
        provider: 'tomtom_orbis',
        configured: Boolean(TOMTOM_API_KEY),
        status: TOMTOM_API_KEY ? 'ready' : 'missing_credentials',
        serverProxies: ['status', 'incidents', 'flow-tile', 'route', 'places-suggest']
      })
    );
    return;
  }

  // Proxy Traffic Flow Raster Tile
  if (pathname === '/api/traffic/flow-tile' && req.method === 'GET') {
    if (!TOMTOM_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'TOMTOM_API_KEY not configured on server' }));
      return;
    }
    const z = parsedUrl.query.z;
    const x = parsedUrl.query.x;
    const y = parsedUrl.query.y;
    const style = (parsedUrl.query.style as string) || 'dark';

    if (!z || !x || !y) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing z, x, or y tile coordinates' }));
      return;
    }

    try {
      const tileUrl = `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&key=${encodeURIComponent(TOMTOM_API_KEY)}&style=${encodeURIComponent(style)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const upstream = await fetch(tileUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!upstream.ok) {
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Upstream tile fetch failed: ${upstream.statusText}` }));
        return;
      }

      const buffer = await upstream.arrayBuffer();
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60',
        'Content-Length': buffer.byteLength.toString()
      });
      res.end(Buffer.from(buffer));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upstream tile error';
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // Proxy Traffic Incidents from TomTom Orbis / Legacy
  if (pathname === '/api/traffic/incidents' && req.method === 'GET') {
    if (!TOMTOM_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status_code: 2000,
          error: 'Traffic provider unconfigured: TOMTOM_API_KEY is missing on server'
        })
      );
      return;
    }

    const bbox = typeof parsedUrl.query.bbox === 'string' ? parsedUrl.query.bbox : '';
    if (!bbox) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required query parameter: bbox (minLon,minLat,maxLon,maxLat)' }));
      return;
    }

    try {
      // Primary: TomTom Orbis Incident Details
      const orbisUrl = `https://api.tomtom.com/maps/orbis/traffic/incidentDetails?apiVersion=1&key=${encodeURIComponent(TOMTOM_API_KEY)}&bbox=${encodeURIComponent(bbox)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const response = await fetch(orbisUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, provider: 'orbis', data }));
        return;
      }

      // Secondary fallback: Legacy v5
      const legacyUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(TOMTOM_API_KEY)}&bbox=${encodeURIComponent(bbox)}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length}}}`;
      const legRes = await fetch(legacyUrl, { headers: { Accept: 'application/json' } });
      if (!legRes.ok) {
        res.writeHead(legRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Upstream TomTom error: ${legRes.statusText}` }));
        return;
      }
      const data = await legRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status_code: 1000, provider: 'legacy_v5', data }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upstream network failure';
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // --- Dedicated Server-Side Road Routing Proxy (Phase 6C.2) ---
  // Serves POST /api/routing/calculate and POST /api/traffic/route
  if ((pathname === '/api/routing/calculate' || pathname === '/api/traffic/route') && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const rawPoints: [number, number][] = Array.isArray(body.locations)
        ? body.locations
        : Array.isArray(body.waypoints)
        ? body.waypoints
        : [];

      if (!rawPoints || rawPoints.length < 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload: locations array with >= 2 points [lat, lon] required' }));
        return;
      }

      const isShortest = body.routeType === 'shortest';
      const maxAlts = Math.min(4, Math.max(0, typeof body.maxAlternatives === 'number' ? body.maxAlternatives : 2));

      // 1. Primary: TomTom Orbis Routing v3 (if TOMTOM_API_KEY configured)
      if (TOMTOM_API_KEY) {
        try {
          const origin = rawPoints[0];
          const dest = rawPoints[rawPoints.length - 1];
          const intermediates = rawPoints.slice(1, -1);

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

          const avoidList: string[] = [];
          if (body.avoidTolls) avoidList.push('tollRoads');
          if (body.avoidHighways) avoidList.push('motorways');
          if (body.avoidFerries) avoidList.push('ferries');
          if (avoidList.length > 0) {
            orbisPayload.avoids = avoidList;
          }

          const orbisUrl = `https://api.tomtom.com/maps/orbis/routing/routes/calculate?apiVersion=3&key=${encodeURIComponent(TOMTOM_API_KEY)}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6500);

          const upstream = await fetch(orbisUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TomTom-Api-Version': '3',
              'TomTom-Api-Key': TOMTOM_API_KEY,
              Attributes: 'routes'
            },
            body: JSON.stringify(orbisPayload),
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (upstream.ok) {
            const data = await upstream.json();
            const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
            if (rawRoutes.length > 0) {
              const routes = rawRoutes.map((r: any, idx: number) => {
                const summary = r.summary || {};
                const distanceMi = Math.max(1, Math.round((summary.lengthInMeters || 0) * 0.000621371));
                const durationSeconds = summary.travelDurationInSeconds ?? summary.travelTimeInSeconds ?? 0;
                const delaySeconds = summary.trafficDelayDurationInSeconds ?? summary.trafficDelayInSeconds ?? 0;
                const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
                const trafficDelayMinutes = Math.max(0, Math.round(delaySeconds / 60));
                const freeFlowMinutes = Math.max(1, durationMinutes - trafficDelayMinutes);

                // Extract GeoJSON path coordinates [lon, lat] and convert to Leaflet [lat, lon]
                const leafletCoords: [number, number][] = [];
                if (r.path && Array.isArray(r.path.coordinates)) {
                  for (const [lon, lat] of r.path.coordinates) {
                    if (Number.isFinite(lat) && Number.isFinite(lon)) {
                      leafletCoords.push([lat, lon]);
                    }
                  }
                } else if (Array.isArray(r.legs)) {
                  for (const leg of r.legs) {
                    const legCoords = leg.path?.coordinates || [];
                    for (const [lon, lat] of legCoords) {
                      if (Number.isFinite(lat) && Number.isFinite(lon)) {
                        if (
                          leafletCoords.length === 0 ||
                          Math.abs(leafletCoords[leafletCoords.length - 1][0] - lat) > 0.00005 ||
                          Math.abs(leafletCoords[leafletCoords.length - 1][1] - lon) > 0.00005
                        ) {
                          leafletCoords.push([lat, lon]);
                        }
                      }
                    }
                  }
                }

                const legCount = Math.max(1, rawPoints.length - 1);
                const legs = Array.from({ length: legCount }, () => ({
                  distanceMi: Math.max(1, Math.round(distanceMi / legCount)),
                  durationMinutes: Math.max(1, Math.round(durationMinutes / legCount)),
                  trafficDelayMinutes: Math.round(trafficDelayMinutes / legCount)
                }));

                return {
                  id: `road-path-${idx}`,
                  name: idx === 0 ? (isShortest ? 'Shortest Road Route' : 'Fastest Road Route') : `Alternative Road ${idx}`,
                  distanceMi,
                  durationMinutes,
                  freeFlowDurationMinutes: freeFlowMinutes,
                  trafficDelayMinutes,
                  coordinates: leafletCoords.length >= 2 ? leafletCoords : rawPoints,
                  legs,
                  routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
                  source: 'orbis_v3',
                  hasTolls: !body.avoidTolls
                };
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status_code: 1000, provider: 'tomtom_orbis', routes }));
              return;
            }
          }
        } catch {}

        // Fallback: TomTom Routing v1
        try {
          const locStr = rawPoints.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(':');
          const avoidQuery = avoidList?.length ? `&avoid=${avoidList.join(',')}` : '';
          const legacyUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locStr}/json?key=${encodeURIComponent(TOMTOM_API_KEY)}&traffic=true&computeTravelTimeFor=all&travelMode=car&maxAlternatives=${maxAlts}&routeType=${isShortest ? 'shortest' : 'fastest'}${avoidQuery}`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5500);
          const legRes = await fetch(legacyUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (legRes.ok) {
            const data = await legRes.json();
            const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
            if (rawRoutes.length > 0) {
              const routes = rawRoutes.map((r: any, idx: number) => {
                const summary = r.summary || {};
                const distanceMi = Math.max(1, Math.round((summary.lengthInMeters || 0) * 0.000621371));
                const durationMinutes = Math.max(1, Math.round((summary.travelTimeInSeconds || 0) / 60));
                const trafficDelayMinutes = Math.max(0, Math.round((summary.trafficDelayInSeconds || 0) / 60));
                const freeFlowMinutes = Math.max(1, durationMinutes - trafficDelayMinutes);

                const leafletCoords: [number, number][] = [];
                if (Array.isArray(r.legs)) {
                  for (const leg of r.legs) {
                    if (Array.isArray(leg.points)) {
                      for (const pt of leg.points) {
                        if (Number.isFinite(pt.latitude) && Number.isFinite(pt.longitude)) {
                          leafletCoords.push([pt.latitude, pt.longitude]);
                        }
                      }
                    }
                  }
                }

                const legCount = Math.max(1, rawPoints.length - 1);
                const legs = Array.from({ length: legCount }, () => ({
                  distanceMi: Math.max(1, Math.round(distanceMi / legCount)),
                  durationMinutes: Math.max(1, Math.round(durationMinutes / legCount)),
                  trafficDelayMinutes: Math.round(trafficDelayMinutes / legCount)
                }));

                return {
                  id: `road-path-${idx}`,
                  name: idx === 0 ? (isShortest ? 'Shortest Road Route' : 'Fastest Road Route') : `Alternative Road ${idx}`,
                  distanceMi,
                  durationMinutes,
                  freeFlowDurationMinutes: freeFlowMinutes,
                  trafficDelayMinutes,
                  coordinates: leafletCoords.length >= 2 ? leafletCoords : rawPoints,
                  legs,
                  routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
                  source: 'legacy_v1',
                  hasTolls: !body.avoidTolls
                };
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status_code: 1000, provider: 'tomtom_v1', routes }));
              return;
            }
          }
        } catch {}
      }

      // 2. Fallback: High-Fidelity OSRM Driving Router (server-side, zero CORS)
      try {
        const coordsStr = rawPoints.map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(';');
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&alternatives=true`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const osrmRes = await fetch(osrmUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (osrmRes.ok) {
          const data = await osrmRes.json();
          const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
          if (data.code === 'Ok' && rawRoutes.length > 0) {
            const routes = rawRoutes.slice(0, maxAlts + 1).map((r: any, idx: number) => {
              const distanceMi = Math.max(1, Math.round((r.distance || 0) * 0.000621371));
              const durationMinutes = Math.max(1, Math.round((r.duration || 0) / 60));

              // Convert OSRM GeoJSON [lon, lat] to Leaflet [lat, lon]
              const leafletCoords: [number, number][] = Array.isArray(r.geometry?.coordinates)
                ? r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]])
                : rawPoints;

              const legs = Array.isArray(r.legs) && r.legs.length > 0
                ? r.legs.map((l: any) => ({
                    distanceMi: Math.max(1, Math.round((l.distance || 0) * 0.000621371)),
                    durationMinutes: Math.max(1, Math.round((l.duration || 0) / 60)),
                    trafficDelayMinutes: 0
                  }))
                : [{ distanceMi, durationMinutes, trafficDelayMinutes: 0 }];

              return {
                id: `road-path-${idx}`,
                name: idx === 0 ? 'Primary Road Route (OSRM)' : `Alternative Road ${idx} (OSRM)`,
                distanceMi,
                durationMinutes,
                freeFlowDurationMinutes: durationMinutes,
                trafficDelayMinutes: 0,
                coordinates: leafletCoords,
                legs,
                routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
                source: 'osrm',
                hasTolls: false
              };
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status_code: 1000, provider: 'osrm', routes }));
            return;
          }
        }
      } catch {}

      // If all upstream services fail, return a structured 502 with diagnostic
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'All upstream road routing providers failed to calculate route geometry' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Routing proxy server error';
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // Check Places Service Status (Phase 6C.1)
  if (pathname === '/api/places/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status_code: 1000,
        provider: 'tomtom_orbis',
        configured: Boolean(TOMTOM_API_KEY),
        status: TOMTOM_API_KEY ? 'ready' : 'missing_credentials',
        message: TOMTOM_API_KEY
          ? 'TomTom Orbis & Search v2 API proxy ready'
          : 'TOMTOM_API_KEY is not configured on the server. Falling back to local charging station catalogue.'
      })
    );
    return;
  }

  // Proxy Places Suggest (Orbis primary + Search v2 fallback)
  if (pathname === '/api/places/suggest' && req.method === 'POST') {
    if (!TOMTOM_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status_code: 2001,
          error: 'TOMTOM_API_KEY not configured on server',
          results: []
        })
      );
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const query = (body.query || '').trim();
      const limit = typeof body.limit === 'number' ? body.limit : 8;
      const center = body.center as [number, number] | undefined;

      if (!query) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, results: [] }));
        return;
      }

      // 1. Primary: TomTom Orbis Places Suggest
      const orbisPayload: Record<string, unknown> = {
        query,
        limit
      };
      if (center && Array.isArray(center) && center.length === 2) {
        orbisPayload.origin = {
          type: 'point',
          coordinates: [center[1], center[0]]
        };
      }

      const orbisUrl = `https://api.tomtom.com/maps/orbis/places/suggest?key=${encodeURIComponent(TOMTOM_API_KEY)}&apiVersion=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const upstream = await fetch(orbisUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'TomTom-Api-Version': '3',
          'TomTom-Api-Key': TOMTOM_API_KEY
        },
        body: JSON.stringify(orbisPayload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (upstream.ok) {
        const data = await upstream.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, provider: 'tomtom_orbis', results: data.results || [] }));
        return;
      }

      // 2. Secondary fallback: TomTom Search v2 (Legacy fuzzy search without radius restriction)
      let legacyUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${encodeURIComponent(TOMTOM_API_KEY)}&limit=${limit}&idxSet=POI,PAD,Str,Geo`;
      if (center && Array.isArray(center) && center.length === 2) {
        // Biasing without restriction (NO radius parameter!)
        legacyUrl += `&lat=${center[0]}&lon=${center[1]}`;
      }

      const legRes = await fetch(legacyUrl);
      if (legRes.ok) {
        const legData = await legRes.json();
        const results = (legData.results || []).map((item: any) => ({
          id: item.id || `leg-${Math.random().toString(36).slice(2, 8)}`,
          title: item.poi?.name || item.address?.freeformAddress || query,
          kind: item.poi?.classifications?.[0]?.code || item.type || 'poi',
          position: item.position,
          address: item.address,
          poi: item.poi
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, provider: 'tomtom_v2', results }));
        return;
      }

      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Upstream error: HTTP ${upstream.status}` }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upstream suggest proxy error';
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // Proxy Places Discover (Full comprehensive search on Enter/Search button)
  if (pathname === '/api/places/discover' && req.method === 'POST') {
    if (!TOMTOM_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status_code: 2001,
          error: 'TOMTOM_API_KEY not configured on server',
          results: []
        })
      );
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const query = (body.query || '').trim();
      const limit = typeof body.limit === 'number' ? body.limit : 15;
      const center = body.center as [number, number] | undefined;

      if (!query) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, results: [] }));
        return;
      }

      // Comprehensive multi-index search via Search v2 (unrestricted global query)
      let searchUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${encodeURIComponent(TOMTOM_API_KEY)}&limit=${limit}&idxSet=POI,PAD,Str,Geo,Addr`;
      if (center && Array.isArray(center) && center.length === 2) {
        searchUrl += `&lat=${center[0]}&lon=${center[1]}`;
      }

      const upstream = await fetch(searchUrl);
      if (upstream.ok) {
        const data = await upstream.json();
        const results = (data.results || []).map((item: any) => ({
          id: item.id || `leg-disc-${Math.random().toString(36).slice(2, 8)}`,
          title: item.poi?.name || item.address?.freeformAddress || query,
          kind: item.poi?.classifications?.[0]?.code || item.type || 'poi',
          position: item.position,
          address: item.address,
          poi: item.poi
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, provider: 'tomtom_discover', results }));
        return;
      }

      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Discover error: HTTP ${upstream.status}` }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upstream discover error';
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // Proxy Reverse Geocode (Coordinates to Address)
  if (pathname === '/api/places/reverseGeocode' && req.method === 'GET') {
    if (!TOMTOM_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'TOMTOM_API_KEY not configured on server' }));
      return;
    }

    const lat = parsedUrl.query.lat;
    const lon = parsedUrl.query.lon;
    if (!lat || !lon) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing lat or lon query parameter' }));
      return;
    }

    try {
      const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${encodeURIComponent(TOMTOM_API_KEY)}`;
      const upstream = await fetch(url);
      if (upstream.ok) {
        const data = await upstream.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status_code: 1000, data }));
        return;
      }
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Reverse geocode failed: ${upstream.statusText}` }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reverse geocode error';
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[OCPI Proxy Daemon] Listening on port ${PORT} (Mode: ${providerMode})`);
  });
}

export { server, syncData };

