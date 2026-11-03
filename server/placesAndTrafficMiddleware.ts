// Unified Places Search & Route Traffic Middleware
// Powers /api/places/*, /api/traffic/*, and /api/routing/* across both Vite dev server and ocpiProxyServer.
// Uses server-side TOMTOM_API_KEY from .env (zero client token exposure).

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import fs from 'fs';
import path from 'path';

// Helper to safely load TOMTOM_API_KEY from .env
function getTomTomApiKey(): string {
  if (process.env.TOMTOM_API_KEY) return process.env.TOMTOM_API_KEY.trim();
  if (process.env.VITE_TOMTOM_API_KEY) return process.env.VITE_TOMTOM_API_KEY.trim();

  // Load from root .env
  try {
    const rootEnv = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(rootEnv)) {
      const content = fs.readFileSync(rootEnv, 'utf-8');
      const match = content.match(/TOMTOM_API_KEY=(.+)/);
      if (match && match[1]) {
        process.env.TOMTOM_API_KEY = match[1].trim();
        return process.env.TOMTOM_API_KEY;
      }
    }
  } catch {}

  return '';
}

function parseJsonBody(req: IncomingMessage, maxBytes = 1048576): Promise<any> {
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
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Haversine distance in miles between two coordinates
function haversineMi(c1: [number, number], c2: [number, number]): number {
  const dLat = ((c2[0] - c1[0]) * Math.PI) / 180;
  const dLon = ((c2[1] - c1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1[0] * Math.PI) / 180) *
      Math.cos((c2[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function handlePlacesAndTrafficApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const parsedUrl = parseUrl(req.url || '', true);
  const pathname = parsedUrl.pathname || '';
  const key = getTomTomApiKey();

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return true;
  }

  // ==========================================
  // PLACES SEARCH ENDPOINTS
  // ==========================================

  // GET /api/places/status
  if (pathname === '/api/places/status' && req.method === 'GET') {
    sendJson(res, 200, {
      status_code: 1000,
      configured: Boolean(key),
      provider: key ? 'tomtom' : 'catalogue_only',
      message: key
        ? 'Global Search connected via TomTom API'
        : 'TOMTOM_API_KEY is not configured on the server. Falling back to local charging station catalogue.'
    });
    return true;
  }

  // POST /api/places/suggest & POST /api/places/discover
  if ((pathname === '/api/places/suggest' || pathname === '/api/places/discover') && req.method === 'POST') {
    if (!key) {
      sendJson(res, 503, {
        status_code: 2001,
        error: 'TOMTOM_API_KEY not configured on server',
        results: []
      });
      return true;
    }

    try {
      const body = await parseJsonBody(req);
      const query = (body.query || '').trim();
      const isDiscover = pathname === '/api/places/discover';
      const defaultLimit = isDiscover ? 15 : 10;
      const limit = typeof body.limit === 'number' ? Math.min(30, Math.max(1, body.limit)) : defaultLimit;
      const center = body.center as [number, number] | undefined;

      if (!query) {
        sendJson(res, 200, { status_code: 1000, results: [] });
        return true;
      }

      // Query TomTom Fuzzy Search with POI, PAD (Point Address), Str (Street), Geo (Geography), Addr (Address)
      let searchUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&limit=${limit}&idxSet=POI,PAD,Str,Geo,Addr`;
      if (center && Array.isArray(center) && center.length === 2) {
        searchUrl += `&lat=${center[0]}&lon=${center[1]}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      const upstream = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (upstream.ok) {
        const data = await upstream.json();
        const results = (data.results || []).map((item: any) => ({
          id: item.id || `tt-${Math.random().toString(36).slice(2, 9)}`,
          title: item.poi?.name || item.address?.freeformAddress || query,
          kind: item.poi?.classifications?.[0]?.code || item.type || 'poi',
          position: item.position,
          address: item.address,
          poi: item.poi,
          score: item.score
        }));
        sendJson(res, 200, {
          status_code: 1000,
          provider: isDiscover ? 'tomtom_discover' : 'tomtom_search_v2',
          total: data.totalResults ?? results.length,
          results
        });
        return true;
      }

      sendJson(res, upstream.status, {
        status_code: 2000 + upstream.status,
        error: `Upstream error HTTP ${upstream.status}`,
        results: []
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upstream search error';
      sendJson(res, 502, { status_code: 2502, error: msg, results: [] });
      return true;
    }
  }

  // GET /api/places/reverseGeocode
  if (pathname === '/api/places/reverseGeocode' && req.method === 'GET') {
    const lat = parseFloat(parsedUrl.query.lat as string);
    const lon = parseFloat(parsedUrl.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      sendJson(res, 400, { error: 'lat and lon query params required' });
      return true;
    }

    if (!key) {
      sendJson(res, 200, {
        status_code: 1000,
        data: { addresses: [{ address: { freeformAddress: `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}` } }] }
      });
      return true;
    }

    try {
      const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat.toFixed(5)},${lon.toFixed(5)}.json?key=${encodeURIComponent(key)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const upstream = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (upstream.ok) {
        const data = await upstream.json();
        sendJson(res, 200, { status_code: 1000, data });
        return true;
      }
      sendJson(res, 200, { status_code: 1000, data: null });
      return true;
    } catch {
      sendJson(res, 200, { status_code: 1000, data: null });
      return true;
    }
  }

  // ==========================================
  // TRAFFIC ENDPOINTS
  // ==========================================

  // GET /api/traffic/status
  if (pathname === '/api/traffic/status' && req.method === 'GET') {
    sendJson(res, 200, {
      status_code: 1000,
      configured: Boolean(key),
      provider: key ? 'TomTom Orbis Live Traffic' : 'none',
      message: key
        ? 'Real-Time Traffic Flow & Incidents Connected'
        : 'TOMTOM_API_KEY is not configured. Traffic layer disabled.'
    });
    return true;
  }

  // GET /api/traffic/incidents
  if (pathname === '/api/traffic/incidents' && req.method === 'GET') {
    if (!key) {
      sendJson(res, 200, { status_code: 1000, incidents: [] });
      return true;
    }

    const bboxStr = parsedUrl.query.bbox as string;
    if (!bboxStr) {
      sendJson(res, 400, { error: 'bbox query param required: minLng,minLat,maxLng,maxLat' });
      return true;
    }

    try {
      const incUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}&bbox=${bboxStr}&fields={incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,delay,roadClosed}}}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const upstream = await fetch(incUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (upstream.ok) {
        const data = await upstream.json();
        sendJson(res, 200, { status_code: 1000, incidents: data.incidents || [] });
        return true;
      }
      sendJson(res, 200, { status_code: 1000, incidents: [] });
      return true;
    } catch {
      sendJson(res, 200, { status_code: 1000, incidents: [] });
      return true;
    }
  }

  // POST /api/traffic/route-segments
  // Computes actual live traffic condition along the selected road's polyline
  if (pathname === '/api/traffic/route-segments' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const coords: [number, number][] = Array.isArray(body.coordinates) ? body.coordinates : [];

      if (!coords || coords.length < 2) {
        sendJson(res, 400, { error: 'Valid coordinates array [lat, lon][] required' });
        return true;
      }

      if (!key) {
        // Return neutral segments without fabricated values
        const fallbackSegments = [
          {
            id: 'seg-fallback-0',
            coordinates: coords,
            congestionLevel: 'unknown',
            provider: 'Neutral (Missing API Key)',
            roadClosed: false,
            lastUpdated: new Date().toISOString()
          }
        ];
        sendJson(res, 200, {
          status_code: 1000,
          provider: 'Neutral (Missing API Key)',
          status: 'missing_credentials',
          segments: fallbackSegments
        });
        return true;
      }

      // 1. Calculate cumulative distance along polyline
      const totalPoints = coords.length;
      let totalDistanceMi = 0;
      const distances: number[] = [0];

      for (let i = 1; i < totalPoints; i++) {
        totalDistanceMi += haversineMi(coords[i - 1], coords[i]);
        distances.push(totalDistanceMi);
      }

      // 2. Partition route into 6 to 18 segments based on total distance
      const segmentCount = Math.min(18, Math.max(6, Math.round(totalDistanceMi / 35)));
      const segmentIntervalMi = totalDistanceMi / segmentCount;

      const partitions: { startIndex: number; endIndex: number; midPoint: [number, number]; coordinates: [number, number][] }[] = [];
      let currentSegStart = 0;

      for (let s = 1; s <= segmentCount; s++) {
        const targetDist = s * segmentIntervalMi;
        let segEnd = currentSegStart;

        while (segEnd < totalPoints - 1 && distances[segEnd] < targetDist) {
          segEnd++;
        }
        if (s === segmentCount) {
          segEnd = totalPoints - 1;
        }

        const segCoords = coords.slice(currentSegStart, segEnd + 1);
        if (segCoords.length >= 2) {
          const midIdx = Math.floor(segCoords.length / 2);
          partitions.push({
            startIndex: currentSegStart,
            endIndex: segEnd,
            midPoint: segCoords[midIdx],
            coordinates: segCoords
          });
        }
        currentSegStart = segEnd;
      }

      // 3. Concurrently sample real TomTom flow segment data for each partition midpoint
      const segmentPromises = partitions.map(async (part, idx) => {
        try {
          const flowUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${part.midPoint[0].toFixed(5)},${part.midPoint[1].toFixed(5)}&unit=mph&key=${encodeURIComponent(key)}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const flowRes = await fetch(flowUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (flowRes.ok) {
            const flowJson = await flowRes.json();
            const f = flowJson.flowSegmentData;
            if (f) {
              const currentSpeed = Number(f.currentSpeed) || 0;
              const freeFlowSpeed = Number(f.freeFlowSpeed) || 0;
              const isClosed = Boolean(f.roadClosure);
              const ratio = freeFlowSpeed > 0 ? currentSpeed / freeFlowSpeed : 1.0;

              // Categorize congestion level from actual speed ratio:
              // - roadClosed -> 'blocked'
              // - ratio < 0.50 -> 'heavy' (severe congestion)
              // - 0.50 <= ratio < 0.75 -> 'moderate' (heavy / noticeable slowdown)
              // - 0.75 <= ratio < 0.90 -> 'minor' (moderate traffic)
              // - ratio >= 0.90 -> 'free_flow' (flowing green)
              let congestionLevel: 'free_flow' | 'minor' | 'moderate' | 'heavy' | 'blocked' = 'free_flow';
              if (isClosed || (currentSpeed === 0 && freeFlowSpeed > 0)) {
                congestionLevel = 'blocked';
              } else if (ratio < 0.5) {
                congestionLevel = 'heavy';
              } else if (ratio < 0.75) {
                congestionLevel = 'moderate';
              } else if (ratio < 0.9) {
                congestionLevel = 'minor';
              } else {
                congestionLevel = 'free_flow';
              }

              const delaySec = Math.max(0, (f.currentTravelTime || 0) - (f.freeFlowTravelTime || 0));

              return {
                id: `traffic-seg-${idx}`,
                coordinates: part.coordinates,
                congestionLevel,
                currentSpeedMph: currentSpeed,
                freeFlowSpeedMph: freeFlowSpeed,
                currentSpeedKph: Math.round(currentSpeed * 1.60934),
                freeFlowSpeedKph: Math.round(freeFlowSpeed * 1.60934),
                speedRatio: Number(ratio.toFixed(2)),
                delaySeconds: delaySec,
                roadClosed: isClosed,
                provider: 'TomTom Live Traffic Flow',
                confidence: f.confidence,
                lastUpdated: new Date().toISOString()
              };
            }
          }
        } catch {}

        // Neutral section if specific point had no flow data
        return {
          id: `traffic-seg-${idx}`,
          coordinates: part.coordinates,
          congestionLevel: 'unknown' as const,
          provider: 'TomTom (No flow measurement at coordinate)',
          roadClosed: false,
          lastUpdated: new Date().toISOString()
        };
      });

      const matchedSegments = await Promise.all(segmentPromises);

      sendJson(res, 200, {
        status_code: 1000,
        provider: 'TomTom Live Traffic',
        totalDistanceMi: Number(totalDistanceMi.toFixed(1)),
        segmentsCount: matchedSegments.length,
        segments: matchedSegments
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to compute route traffic';
      sendJson(res, 500, { error: msg, segments: [] });
      return true;
    }
  }

  // ==========================================
  // ROAD ROUTING PROXY (Phase 6E)
  // Serves POST /api/routing/calculate and POST /api/traffic/route
  // ==========================================
  if ((pathname === '/api/routing/calculate' || pathname === '/api/traffic/route') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const rawPoints: [number, number][] = Array.isArray(body.locations)
        ? body.locations
        : Array.isArray(body.waypoints)
        ? body.waypoints
        : [];

      if (!rawPoints || rawPoints.length < 2) {
        sendJson(res, 400, { error: 'Invalid payload: locations array with >= 2 points [lat, lon] required' });
        return true;
      }

      const isShortest = body.routeType === 'shortest';
      const maxAlts = Math.min(4, Math.max(0, typeof body.maxAlternatives === 'number' ? body.maxAlternatives : 2));

      // 1. Primary: TomTom Orbis Routing v3 (if key configured)
      if (key) {
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

          const orbisUrl = `https://api.tomtom.com/maps/orbis/routing/routes/calculate?apiVersion=3&key=${encodeURIComponent(key)}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6500);

          const upstream = await fetch(orbisUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'TomTom-Api-Version': '3',
              'TomTom-Api-Key': key,
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

              sendJson(res, 200, { status_code: 1000, provider: 'tomtom_orbis', routes });
              return true;
            }
          }
        } catch {}

        // Fallback: TomTom Routing v1
        try {
          const locStr = rawPoints.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(':');
          const avoidList: string[] = [];
          if (body.avoidTolls) avoidList.push('tollRoads');
          if (body.avoidHighways) avoidList.push('motorways');
          if (body.avoidFerries) avoidList.push('ferries');
          const avoidQuery = avoidList.length ? `&avoid=${avoidList.join(',')}` : '';
          const legacyUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locStr}/json?key=${encodeURIComponent(key)}&traffic=true&computeTravelTimeFor=all&travelMode=car&maxAlternatives=${maxAlts}&routeType=${isShortest ? 'shortest' : 'fastest'}${avoidQuery}`;

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

              sendJson(res, 200, { status_code: 1000, provider: 'tomtom_v1', routes });
              return true;
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
                name: idx === 0 ? (isShortest ? 'Shortest Road Route (OSRM)' : 'Primary Road Route (OSRM)') : `Alternative Road ${idx} (OSRM)`,
                distanceMi,
                durationMinutes,
                freeFlowDurationMinutes: durationMinutes,
                trafficDelayMinutes: 0,
                coordinates: leafletCoords.length >= 2 ? leafletCoords : rawPoints,
                legs,
                routeType: idx === 0 ? (isShortest ? 'shortest' : 'fastest') : 'alternative',
                source: 'osrm',
                hasTolls: !body.avoidTolls
              };
            });

            sendJson(res, 200, { status_code: 1000, provider: 'osrm', routes });
            return true;
          }
        }
      } catch {}

      sendJson(res, 500, { error: 'Failed to calculate road routes from any provider', routes: [] });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Routing proxy calculation failed';
      sendJson(res, 500, { error: msg, routes: [] });
      return true;
    }
  }

  return false;
}
