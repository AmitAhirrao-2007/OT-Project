// Shared Station API Middleware
// Used by both server/ocpiProxyServer.ts and vite.config.ts (Vite dev server)
// Ensures /api/stations/* endpoints are ALWAYS active without relying on multiple terminal windows.

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import {
  searchStations,
  getStationsInBbox,
  getStationsAlongCorridor,
  getStationById,
  getStationStats,
  loadPcsStations
} from './stationDataService';

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

export async function handleStationApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const parsedUrl = parseUrl(req.url || '', true);
  const pathname = parsedUrl.pathname || '';

  if (!pathname.startsWith('/api/stations')) {
    return false;
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // 1. GET /api/stations/stats
  if (pathname === '/api/stations/stats' && req.method === 'GET') {
    const stats = getStationStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status_code: 1000, status: 'ready', stats }));
    return true;
  }

  // 2. GET /api/stations/search
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
    return true;
  }

  // 3. GET /api/stations/bbox
  if (pathname === '/api/stations/bbox' && req.method === 'GET') {
    const minLat = typeof parsedUrl.query.minLat === 'string' ? parseFloat(parsedUrl.query.minLat) : NaN;
    const maxLat = typeof parsedUrl.query.maxLat === 'string' ? parseFloat(parsedUrl.query.maxLat) : NaN;
    const minLon = typeof parsedUrl.query.minLon === 'string' ? parseFloat(parsedUrl.query.minLon) : NaN;
    const maxLon = typeof parsedUrl.query.maxLon === 'string' ? parseFloat(parsedUrl.query.maxLon) : NaN;

    if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'minLat, maxLat, minLon, and maxLon numeric query parameters are required' }));
      return true;
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
    return true;
  }

  // 4. POST /api/stations/corridor
  if (pathname === '/api/stations/corridor' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const polyline: [number, number][] = Array.isArray(body.polyline) ? body.polyline : [];
      const corridorRadiusMi = typeof body.corridorRadiusMi === 'number' ? body.corridorRadiusMi : 25;
      const excludeLev = body.excludeLev !== false;
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
    return true;
  }

  // 5. GET /api/stations/detail
  if (pathname === '/api/stations/detail' && req.method === 'GET') {
    const id = typeof parsedUrl.query.id === 'string' ? parsedUrl.query.id : '';
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required query parameter: id' }));
      return true;
    }
    const station = getStationById(id);
    if (!station) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Station ${id} not found` }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status_code: 1000, station }));
    return true;
  }

  return false;
}

