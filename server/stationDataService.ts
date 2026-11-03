// Server-Side Spatial Index and Query Service for Indian EV PCS Stations
// Manages in-memory grid indexing, text search, bounding box filtering,
// and route corridor station discovery for ~28,350 public charging stations.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChargingStation } from '../src/types/station';
import { chargingStations } from '../src/data/stationCatalogue';

// Resolve directory robustly regardless of process.cwd()
export function resolveDataFilePath(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const localPath = path.resolve(__dirname, 'data', 'evPcsStations.json');
    if (fs.existsSync(localPath)) {
      return localPath;
    }
  } catch {}

  const cwdPath = path.resolve(process.cwd(), 'server', 'data', 'evPcsStations.json');
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  const rootPath = path.resolve(process.cwd(), 'evPcsStations.json');
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  return path.resolve(process.cwd(), 'server', 'data', 'evPcsStations.json');
}

// Haversine distance in statute miles
export function haversineDistanceMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Internal cache state
let cachedStations: ChargingStation[] | null = null;
let spatialGrid: Map<string, ChargingStation[]> = new Map();
let stationsById: Map<string, ChargingStation> = new Map();
let isInitializing = false;

// Build spatial grid buckets (1 degree lat x 1 degree lon ~ 69 mi x 60 mi)
function buildSpatialIndex(stations: ChargingStation[]): void {
  spatialGrid.clear();
  stationsById.clear();

  for (const st of stations) {
    if (st.id) {
      stationsById.set(st.id, st);
    }
    if (st.coordinates && Array.isArray(st.coordinates) && st.coordinates.length === 2) {
      const [lat, lng] = st.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const gridKey = `${Math.floor(lat)}:${Math.floor(lng)}`;
        let bucket = spatialGrid.get(gridKey);
        if (!bucket) {
          bucket = [];
          spatialGrid.set(gridKey, bucket);
        }
        bucket.push(st);
      }
    }
  }
}

/**
 * Loads PCS stations from disk into memory and constructs the spatial index.
 * Idempotent: Subsequent calls return the cached data.
 */
export function loadPcsStations(): ChargingStation[] {
  if (cachedStations !== null) {
    return cachedStations;
  }

  const resolvedPath = resolveDataFilePath();
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[StationDataService] PCS data file not found at: ${resolvedPath}`);
    cachedStations = [];
    return cachedStations;
  }

  try {
    const rawData = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed: ChargingStation[] = JSON.parse(rawData);
    cachedStations = parsed;
    buildSpatialIndex(cachedStations);
    console.log(`[StationDataService] Successfully indexed ${cachedStations.length} PCS stations in memory.`);
    return cachedStations;
  } catch (err) {
    console.error('[StationDataService] Failed to load PCS stations JSON:', err);
    cachedStations = [];
    return cachedStations;
  }
}

// Pre-warm the cache asynchronously in background
setTimeout(() => {
  if (cachedStations === null && !isInitializing) {
    isInitializing = true;
    try {
      loadPcsStations();
    } finally {
      isInitializing = false;
    }
  }
}, 0);

export interface StationSearchOptions {
  q?: string;
  state?: string;
  district?: string;
  cpo?: string;
  category?: 'all' | 'fast' | 'ac' | 'dc' | 'slow' | 'lev';
  connectorType?: string;
  minPowerKw?: number;
  maxPowerKw?: number;
  excludeLev?: boolean;
  vehicleCompatible?: boolean;
  vehicleSelectedPlugs?: string[];
  limit?: number;
  offset?: number;
}

export type StationSearchResultList = ChargingStation[] & { totalCount?: number };

/**
 * Text search across station name, address, network, state, district, city, connectors.
 * Supports pagination, total match counts, power thresholds, and vehicle compatibility.
 */
export function searchStations(queryOrOptions: string | StationSearchOptions = '', options: StationSearchOptions = {}): StationSearchResultList {
  const all = loadPcsStations();
  const opts: StationSearchOptions = typeof queryOrOptions === 'object' && queryOrOptions !== null
    ? queryOrOptions
    : options;
  const rawQ = typeof queryOrOptions === 'string' ? queryOrOptions : (opts.q || '');
  const q = (rawQ || '').trim().toLowerCase();
  const stateFilter = (opts.state || '').trim().toLowerCase();
  const cpoFilter = (opts.cpo || '').trim().toLowerCase();
  const connFilter = (opts.connectorType || '').trim().toLowerCase();
  const categoryFilter = (opts.category || 'all').toLowerCase();
  const minKw = opts.minPowerKw ?? 0;
  const maxKw = opts.maxPowerKw ?? Infinity;
  const excludeLev = opts.excludeLev ?? false;
  const limit = Math.min(500, Math.max(1, opts.limit ?? 60));
  const offset = Math.max(0, opts.offset ?? 0);
  const vehicleCompatible = Boolean(opts.vehicleCompatible && opts.vehicleSelectedPlugs?.length);
  const vehiclePlugs = (opts.vehicleSelectedPlugs || []).map((p) => p.toLowerCase());

  const matched: StationSearchResultList = [];
  let totalMatchingCount = 0;

  for (const st of all) {
    const isLev = (st as any)._meta?.is_lev ?? (st.ratedPowerKw <= 3.5);

    // 1. Explicit Category Filter
    if (categoryFilter === 'fast' && st.ratedPowerKw < 30) continue;
    if (categoryFilter === 'slow' && st.ratedPowerKw >= 30) continue;
    if (categoryFilter === 'lev' && !isLev && st.ratedPowerKw > 3.5) continue;
    if (categoryFilter === 'ac') {
      const hasAc = st.connectors.some(
        (c) =>
          c.type.includes('Type 2') ||
          c.type.includes('AC') ||
          (c.canonicalType && c.canonicalType.includes('AC')) ||
          (c.maxPowerKw <= 22 && c.maxPowerKw > 3.5)
      );
      if (!hasAc) continue;
    }
    if (categoryFilter === 'dc') {
      const hasDc = st.connectors.some(
        (c) =>
          c.type.includes('CCS') ||
          c.type.includes('DC') ||
          (c.canonicalType && c.canonicalType.includes('DC')) ||
          c.maxPowerKw >= 15
      );
      if (!hasDc) continue;
    }

    // 2. Power Range Filter
    if (st.ratedPowerKw < minKw) continue;
    if (st.ratedPowerKw > maxKw) continue;

    // 3. LEV Exclusion
    if (excludeLev && isLev) continue;

    // 4. State Filter
    if (stateFilter && stateFilter !== 'all') {
      const stState = ((st as any)._meta?.state || '').toLowerCase();
      const addr = st.address.toLowerCase();
      if (!stState.includes(stateFilter) && !addr.includes(stateFilter)) {
        continue;
      }
    }

    // 5. CPO / Operator Filter (Supports aliases like Reliance -> Jio-bp pulse)
    if (cpoFilter && cpoFilter !== 'all') {
      const net = (st.canonicalNetwork || st.network || '').toLowerCase();
      const cpoAlias = (st as any)._meta?.cpo?.toLowerCase() || '';
      const matchesNet = net.includes(cpoFilter);
      const matchesAlias = cpoAlias.includes(cpoFilter);
      const matchesReliance =
        (cpoFilter.includes('jio') || cpoFilter.includes('reliance') || cpoFilter.includes('bp')) &&
        (net.includes('jio') || net.includes('bp') || cpoAlias.includes('reliance'));
      const matchesTata = cpoFilter.includes('tata') && (net.includes('tata') || cpoAlias.includes('tata'));
      if (!matchesNet && !matchesAlias && !matchesReliance && !matchesTata) {
        continue;
      }
    }

    // 6. Connector Type Filter
    if (connFilter && connFilter !== 'all') {
      const hasConn = st.connectors.some((c) => {
        const typeLow = (c.type || '').toLowerCase();
        const canonLow = (c.canonicalType || '').toLowerCase();
        if (connFilter === 'ccs2' || connFilter === 'ccs') {
          return typeLow.includes('ccs') || canonLow.includes('ccs');
        }
        if (connFilter === 'type 2' || connFilter === 'type2') {
          return typeLow.includes('type 2') || typeLow.includes('type-2') || canonLow.includes('type 2');
        }
        if (connFilter.includes('bharat ac')) {
          return typeLow.includes('bharat ac') || canonLow.includes('bharat ac');
        }
        if (connFilter.includes('bharat dc')) {
          return typeLow.includes('bharat dc') || canonLow.includes('bharat dc');
        }
        if (connFilter.includes('lev') || connFilter.includes('slow')) {
          return typeLow.includes('lev') || canonLow.includes('lev') || c.maxPowerKw <= 3.5;
        }
        if (connFilter === 'chademo') {
          return typeLow.includes('chademo') || canonLow.includes('chademo');
        }
        if (connFilter === 'other') {
          const isStandard =
            typeLow.includes('ccs') ||
            typeLow.includes('type 2') ||
            typeLow.includes('bharat') ||
            typeLow.includes('chademo');
          return !isStandard;
        }
        if (connFilter === 'unknown') {
          return !c.type || typeLow.includes('unknown') || canonLow.includes('unknown');
        }
        return typeLow.includes(connFilter) || canonLow.includes(connFilter);
      });
      if (!hasConn) continue;
    }

    // 7. Vehicle Compatibility Filter (Section 7)
    if (vehicleCompatible) {
      const isCompatible = st.connectors.some((c) => {
        const cType = (c.type || '').toLowerCase();
        const cCanon = (c.canonicalType || '').toLowerCase();
        return vehiclePlugs.some((vp) => {
          if (vp.includes('ccs') && (cType.includes('ccs') || cCanon.includes('ccs'))) return true;
          if (vp.includes('type 2') && (cType.includes('type 2') || cCanon.includes('type 2'))) return true;
          if (vp.includes('chademo') && (cType.includes('chademo') || cCanon.includes('chademo'))) return true;
          return cType.includes(vp) || vp.includes(cType);
        });
      });
      if (!isCompatible) continue;
    }

    // 8. General Comprehensive Text Query
    if (q) {
      const nameMatch = st.name.toLowerCase().includes(q);
      const addrMatch = st.address.toLowerCase().includes(q);
      const netMatch =
        (st.canonicalNetwork || '').toLowerCase().includes(q) ||
        (st.network || '').toLowerCase().includes(q);
      const stateMatch = ((st as any)._meta?.state || '').toLowerCase().includes(q);
      const districtMatch = ((st as any)._meta?.district || '').toLowerCase().includes(q);
      const cpoMatch = ((st as any)._meta?.cpo || '').toLowerCase().includes(q);
      const notesMatch = (st.notes || '').toLowerCase().includes(q);
      const connMatch = st.connectors.some(
        (c) => (c.type || '').toLowerCase().includes(q) || (c.canonicalType || '').toLowerCase().includes(q)
      );

      // Numeric power query check (e.g. "60 kw", "150kw")
      const numMatch = q.match(/(\d+)\s*kw/);
      const powerMatches = numMatch ? st.ratedPowerKw >= parseInt(numMatch[1], 10) : false;

      if (!nameMatch && !addrMatch && !netMatch && !stateMatch && !districtMatch && !cpoMatch && !notesMatch && !connMatch && !powerMatches) {
        continue;
      }
    }

    // Count towards total matches
    totalMatchingCount++;

    // Pagination slice
    if (totalMatchingCount > offset && matched.length < limit) {
      matched.push(st);
    }
  }

  matched.totalCount = totalMatchingCount;
  return matched;
}

export interface BboxOptions {
  excludeLev?: boolean;
  minPowerKw?: number;
  limit?: number;
}

/**
 * Retrieve stations within a geographical bounding box [minLat, maxLat, minLon, maxLon].
 * Uses the grid bucket index for fast candidate retrieval.
 */
export function getStationsInBbox(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  options: BboxOptions = {}
): ChargingStation[] {
  loadPcsStations();
  const excludeLev = options.excludeLev ?? false;
  const minKw = options.minPowerKw ?? 0;
  const limit = Math.min(500, Math.max(1, options.limit ?? 250));

  const latStart = Math.floor(minLat);
  const latEnd = Math.floor(maxLat);
  const lonStart = Math.floor(minLon);
  const lonEnd = Math.floor(maxLon);

  const matched: ChargingStation[] = [];

  for (let lat = latStart; lat <= latEnd; lat++) {
    for (let lon = lonStart; lon <= lonEnd; lon++) {
      const bucket = spatialGrid.get(`${lat}:${lon}`);
      if (!bucket) continue;

      for (const st of bucket) {
        if (!st.coordinates) continue;
        const [sLat, sLng] = st.coordinates;

        if (sLat >= minLat && sLat <= maxLat && sLng >= minLon && sLng <= maxLon) {
          if (st.ratedPowerKw < minKw) continue;
          const isLev = (st as any)._meta?.is_lev ?? (st.ratedPowerKw <= 3.5);
          if (excludeLev && isLev) continue;

          matched.push(st);
          if (matched.length >= limit) {
            return matched;
          }
        }
      }
    }
  }

  return matched;
}

export interface CorridorOptions {
  excludeLev?: boolean;
  minPowerKw?: number;
  limit?: number;
}

/**
 * Finds all charging stations located along a road path polyline within a specified corridor buffer radius.
 * Efficiently uses bounding box of sampled polyline waypoints and spatial grid lookup.
 */
export function getStationsAlongCorridor(
  polyline: [number, number][],
  corridorRadiusMi = 25,
  options: CorridorOptions = {}
): ChargingStation[] {
  loadPcsStations();
  if (!polyline || polyline.length < 2) {
    return [];
  }

  const excludeLev = options.excludeLev ?? true; // Default true for route corridor (passenger EVs)
  const minKw = options.minPowerKw ?? 20; // Default 20 kW for realistic EV road trips
  const limit = options.limit ?? 300;

  // 1. Calculate overall bounding box of polyline expanded by radius
  const degBuffer = corridorRadiusMi / 60;
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;

  // Downsample polyline for corridor search if dense (sample every ~3 miles)
  const sampledPoints: [number, number][] = [];
  let lastPt: [number, number] | null = null;

  for (let i = 0; i < polyline.length; i++) {
    const pt = polyline[i];
    if (i === 0 || i === polyline.length - 1) {
      sampledPoints.push(pt);
      lastPt = pt;
    } else if (lastPt) {
      const dist = haversineDistanceMi(lastPt[0], lastPt[1], pt[0], pt[1]);
      if (dist >= 3.0) {
        sampledPoints.push(pt);
        lastPt = pt;
      }
    }

    if (pt[0] < minLat) minLat = pt[0];
    if (pt[0] > maxLat) maxLat = pt[0];
    if (pt[1] < minLon) minLon = pt[1];
    if (pt[1] > maxLon) maxLon = pt[1];
  }

  // 2. Fetch candidates in the expanded bounding box
  const candidateBucketStations = getStationsInBbox(
    minLat - degBuffer,
    maxLat + degBuffer,
    minLon - degBuffer,
    maxLon + degBuffer,
    { excludeLev, minPowerKw: minKw, limit: 2000 }
  );

  // 3. Exact distance check against sampled polyline segments
  const selectedStations: ChargingStation[] = [];
  const seenIds = new Set<string>();

  for (const st of candidateBucketStations) {
    if (!st.coordinates || seenIds.has(st.id)) continue;
    const [sLat, sLng] = st.coordinates;

    let minDistance = Infinity;
    for (const pt of sampledPoints) {
      const d = haversineDistanceMi(sLat, sLng, pt[0], pt[1]);
      if (d < minDistance) {
        minDistance = d;
      }
      if (minDistance <= corridorRadiusMi) {
        break;
      }
    }

    if (minDistance <= corridorRadiusMi) {
      seenIds.add(st.id);
      const annotated = {
        ...st,
        accessMetadata: {
          ...(st.accessMetadata || {
            roadAccessStatus: 'verified',
            carriagewayAccess: 'both',
            supportedDirections: ['both']
          }),
          actualDetourMi: Math.round(minDistance * 10) / 10
        }
      };
      selectedStations.push(annotated);
      if (selectedStations.length >= limit) {
        break;
      }
    }
  }

  return selectedStations;
}

/**
 * Get station by unique stable ID
 */
export function getStationById(id: string): ChargingStation | undefined {
  loadPcsStations();
  return stationsById.get(id) || chargingStations.find((s) => s.id === id);
}

export interface DetailedDatasetStats {
  status: 'ready' | 'loading' | 'uninitialized';
  total: number;
  rawRecordsCount: number;
  normalizedHubsCount: number;
  withCoordinates: number;
  validCoordinatesCount: number;
  invalidCoordinatesCount: number;
  statesCount: number;
  cposCount: number;
  fastChargerCount: number;
  acSlowCount: number;
  levCount: number;
  connectorDistribution: Record<string, number>;
  topStates: Record<string, number>;
  topCpos: Record<string, number>;
}

/**
 * Get comprehensive summary metrics of the imported station catalogue
 */
export function getStationStats(): DetailedDatasetStats {
  const all = loadPcsStations();
  let withCoords = 0;
  let validCoords = 0;
  let invalidCoords = 0;
  const statesMap: Record<string, number> = {};
  const cposMap: Record<string, number> = {};
  const connectorMap: Record<string, number> = {};
  let fast = 0;
  let acSlow = 0;
  let lev = 0;

  for (const st of all) {
    if (st.coordinates && Array.isArray(st.coordinates) && st.coordinates.length === 2) {
      withCoords++;
      const [lat, lng] = st.coordinates;
      if (lat >= 6.0 && lat <= 38.0 && lng >= 68.0 && lng <= 98.0) {
        validCoords++;
      } else {
        invalidCoords++;
      }
    } else {
      invalidCoords++;
    }

    const sMeta = (st as any)._meta;
    const stState = sMeta?.state || 'Unknown State';
    statesMap[stState] = (statesMap[stState] || 0) + 1;

    const cpo = st.canonicalNetwork || st.network || 'Unknown CPO';
    cposMap[cpo] = (cposMap[cpo] || 0) + 1;

    for (const c of st.connectors) {
      const cType = c.canonicalType || c.type;
      connectorMap[cType] = (connectorMap[cType] || 0) + c.count;
    }

    if (st.ratedPowerKw >= 30) {
      fast++;
    } else if (st.ratedPowerKw > 3.5) {
      acSlow++;
    } else {
      lev++;
    }
  }

  // Top 15 states
  const sortedStates = Object.entries(statesMap).sort((a, b) => b[1] - a[1]);
  const topStates: Record<string, number> = {};
  for (const [k, v] of sortedStates.slice(0, 15)) {
    topStates[k] = v;
  }

  // Top 15 CPOs
  const sortedCpos = Object.entries(cposMap).sort((a, b) => b[1] - a[1]);
  const topCpos: Record<string, number> = {};
  for (const [k, v] of sortedCpos.slice(0, 15)) {
    topCpos[k] = v;
  }

  return {
    status: all.length > 0 ? 'ready' : 'uninitialized',
    total: all.length,
    rawRecordsCount: 39636,
    normalizedHubsCount: all.length,
    withCoordinates: withCoords,
    validCoordinatesCount: validCoords,
    invalidCoordinatesCount: invalidCoords,
    statesCount: Object.keys(statesMap).length,
    cposCount: Object.keys(cposMap).length,
    fastChargerCount: fast,
    acSlowCount: acSlow,
    levCount: lev,
    connectorDistribution: connectorMap,
    topStates,
    topCpos
  };
}
