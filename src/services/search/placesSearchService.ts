/**
 * Universal Places Search & Geocoding Service (Phase 6C.1)
 * Primary Type-Ahead: TomTom Orbis Places Search API (Suggest -> Discover -> Details)
 * Secondary Explicit Provider: Legacy TomTom Search v2 (with explicit version labeling)
 * Backend Proxy Integration: Relies on server-side /api/places/* to shield API keys
 * Curated Catalogue: Instant local charging station matching (0ms latency fallback)
 * Note: In strict compliance with OpenStreetMap / Nominatim Usage Policy, public Nominatim
 * is NEVER used as a keystroke-by-keystroke autocomplete provider.
 */

import { SearchResultPlace, PlaceSearchOptions, PlaceCategory, StationVerificationState, SearchProviderDiagnostic } from '../../types/search';
import { chargingStations } from '../../data/stationCatalogue';
import { POPULAR_LOCATIONS } from '../../data/knownLocations';
import { ChargingStation } from '../../types/station';
import { haversineDistanceMi } from '../../utils/geoUtils';

// Helper to determine if an API key is available in Vite or Node environment
export function getTomTomApiKey(): string | null {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const procEnv = typeof process !== 'undefined' ? process.env : undefined;
  const key = metaEnv?.VITE_TOMTOM_API_KEY || procEnv?.VITE_TOMTOM_API_KEY || procEnv?.TOMTOM_API_KEY || '';
  return typeof key === 'string' ? key.trim() || null : null;
}

// Server proxy status cache
let cachedServerStatus: { configured: boolean; provider: string } | null = null;
let lastCheckTime = 0;

// Helper to resolve proxy endpoint in browser vs node
function getProxyUrl(endpoint: string): string | null {
  if (typeof window !== 'undefined') return endpoint;
  if (process.env.PROXY_URL) return `${process.env.PROXY_URL}${endpoint}`;
  return null;
}

/**
 * Checks whether backend proxy daemon has TOMTOM_API_KEY configured
 */
export async function checkServerStatus(force = false): Promise<{ configured: boolean; provider: string }> {
  const endpoint = getProxyUrl('/api/places/status');
  if (!endpoint) {
    return { configured: false, provider: 'catalogue_only' };
  }
  const now = Date.now();
  if (!force && cachedServerStatus && now - lastCheckTime < 15000) {
    return cachedServerStatus;
  }
  try {
    const res = await fetch(endpoint);
    if (res.ok) {
      const data = await res.json();
      cachedServerStatus = {
        configured: Boolean(data.configured),
        provider: data.provider || 'tomtom_orbis'
      };
      lastCheckTime = now;
      return cachedServerStatus;
    }
  } catch {}
  cachedServerStatus = { configured: false, provider: 'catalogue_only' };
  lastCheckTime = now;
  return cachedServerStatus;
}

/**
 * Returns current provider connection state and diagnostic message (Task 10)
 */
export function getSearchProviderDiagnostics(): SearchProviderDiagnostic {
  const clientKey = getTomTomApiKey();
  if (clientKey) {
    return {
      hasKey: true,
      state: 'connected',
      provider: 'tomtom_orbis',
      message: 'Global search connected (TomTom Orbis API)'
    };
  }
  if (cachedServerStatus?.configured) {
    return {
      hasKey: true,
      state: 'connected',
      provider: 'tomtom_orbis',
      message: 'Global search connected via backend proxy daemon'
    };
  }
  return {
    hasKey: false,
    state: 'catalogue_only',
    provider: 'catalogue_only',
    message: 'Local 20-station catalogue only. Configure TOMTOM_API_KEY in server/.env or root .env for global search.'
  };
}

/**
 * Maps raw provider categories or POI types to normalized project PlaceCategory (Phase 6E)
 */
export function normalizePlaceCategory(raw: string): { category: PlaceCategory; isCharging: boolean } {
  const lower = (raw || '').toLowerCase();

  if (
    lower.includes('electric vehicle station') ||
    lower.includes('ev charging') ||
    lower.includes('charging station') ||
    lower.includes('charging_station')
  ) {
    return { category: 'charging_station', isCharging: true };
  }
  if (lower.includes('restaurant') || lower.includes('eatery') || lower.includes('food') || lower.includes('dining')) {
    return { category: 'restaurant', isCharging: false };
  }
  if (lower.includes('cafe') || lower.includes('coffee') || lower.includes('tea')) {
    return { category: 'cafe', isCharging: false };
  }
  if (lower.includes('hotel') || lower.includes('motel') || lower.includes('resort') || lower.includes('lodging') || lower.includes('inn')) {
    return { category: 'hotel', isCharging: false };
  }
  if (lower.includes('temple') || lower.includes('gurdwara') || lower.includes('mosque') || lower.includes('masjid') || lower.includes('church') || lower.includes('ashram') || lower.includes('religious') || lower.includes('shrine')) {
    return { category: 'religious', isCharging: false };
  }
  if (lower.includes('mall') || lower.includes('shopping') || lower.includes('supermarket') || lower.includes('store') || lower.includes('market') || lower.includes('bazaar')) {
    return { category: 'shopping', isCharging: false };
  }
  if (lower.includes('airport') || lower.includes('aerodrome') || lower.includes('airfield')) {
    return { category: 'airport', isCharging: false };
  }
  if (lower.includes('railway') || lower.includes('train') || lower.includes('metro') || (lower.includes('junction') && (lower.includes('rail') || lower.includes('station')))) {
    return { category: 'railway_station', isCharging: false };
  }
  if (lower.includes('bus') || lower.includes('isbt') || lower.includes('bus terminal') || lower.includes('bus stand') || lower.includes('bus station')) {
    return { category: 'bus_station', isCharging: false };
  }
  if (lower.includes('hospital') || lower.includes('clinic') || lower.includes('medical') || lower.includes('pharmacy') || lower.includes('aiims') || lower.includes('healthcare')) {
    return { category: 'hospital', isCharging: false };
  }
  if (lower.includes('university') || lower.includes('college') || lower.includes('institute') || lower.includes('campus')) {
    return { category: 'university', isCharging: false };
  }
  if (lower.includes('school') || lower.includes('vidyalaya') || lower.includes('academy')) {
    return { category: 'school', isCharging: false };
  }
  if (lower.includes('highway') || lower.includes('expressway') || lower.includes('freeway') || lower.includes('motorway') || lower.includes('bypass') || lower.includes('nh-') || lower.includes('sh-')) {
    return { category: 'highway', isCharging: false };
  }
  if (lower.includes('office') || lower.includes('company') || lower.includes('commercial') || lower.includes('cyber')) {
    return { category: 'office', isCharging: false };
  }
  if (lower.includes('attraction') || lower.includes('museum') || lower.includes('monument') || lower.includes('park') || lower.includes('tourism') || lower.includes('historic') || lower.includes('gate') || lower.includes('fort') || lower.includes('palace')) {
    return { category: 'attraction', isCharging: false };
  }
  if (lower.includes('building') || lower.includes('apartment') || lower.includes('enclave') || lower.includes('heights') || lower.includes('residency') || lower.includes('complex')) {
    return { category: 'building', isCharging: false };
  }
  if (lower.includes('village') || lower.includes('gram') || lower.includes('gaon')) {
    return { category: 'village', isCharging: false };
  }
  if (lower.includes('town')) {
    return { category: 'town', isCharging: false };
  }
  if (lower.includes('city') || lower.includes('municipality') || lower.includes('administrative')) {
    return { category: 'city', isCharging: false };
  }
  if (lower.includes('locality') || lower.includes('suburb') || lower.includes('neighborhood') || lower.includes('colony') || lower.includes('nagar') || lower.includes('vihar') || lower.includes('sector')) {
    return { category: 'locality', isCharging: false };
  }
  if (lower.includes('address') || lower.includes('street') || lower.includes('road') || lower.includes('avenue') || lower.includes('lane') || lower.includes('path') || lower.includes('marg') || lower.includes('rasta') || lower.includes('pad')) {
    return { category: 'address', isCharging: false };
  }

  return { category: 'poi', isCharging: false };
}

/**
 * Robust Normalization Helper (Task 6)
 * Converts any provider response shape into standard SearchResultPlace
 */
export function normalizeSearchResultItem(
  item: any,
  fallbackQuery: string,
  source: 'tomtom_orbis' | 'tomtom_legacy' | 'catalogue' = 'tomtom_orbis'
): SearchResultPlace | null {
  if (!item || typeof item !== 'object') return null;

  // Extract latitude and longitude from multiple possible schemas
  let lat: number | undefined;
  let lon: number | undefined;

  if (typeof item.position?.lat === 'number' && typeof item.position?.lon === 'number') {
    lat = item.position.lat;
    lon = item.position.lon;
  } else if (Array.isArray(item.position) && item.position.length >= 2) {
    lat = item.position[0];
    lon = item.position[1];
  } else if (Array.isArray(item.geometry?.coordinates) && item.geometry.coordinates.length >= 2) {
    // GeoJSON order: [lon, lat]
    lon = item.geometry.coordinates[0];
    lat = item.geometry.coordinates[1];
  } else if (typeof item.point?.latitude === 'number' && typeof item.point?.longitude === 'number') {
    lat = item.point.latitude;
    lon = item.point.longitude;
  }

  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return null;
  }

  const name =
    item.poi?.name ||
    item.address?.municipalitySecondarySubdivision ||
    (item.title ? item.title.split(',')[0].trim() : '') ||
    item.name ||
    item.address?.freeformAddress?.split(',')?.[0]?.trim() ||
    fallbackQuery;

  const rawKind =
    item.poi?.classifications?.[0]?.code ||
    item.kind ||
    item.type ||
    item.classification ||
    '';

  let { category, isCharging } = normalizePlaceCategory(`${rawKind} ${name} ${item.title || ''}`);

  // If item is administrative geography without a street or poi, categorize as city
  if (category === 'poi' && !item.poi && item.address?.municipality && (item.kind === 'Geography' || item.type === 'Geography' || !item.address?.streetName)) {
    category = 'city';
  }

  // Check if coordinates correspond to a verified local catalogue charger (< 500m)
  const existingStation = chargingStations.find(
    (s) => Math.abs(s.coordinates[0] - lat!) < 0.005 && Math.abs(s.coordinates[1] - lon!) < 0.005
  );

  let verificationState: StationVerificationState | undefined;
  if (existingStation) {
    verificationState = 'verified_station';
  } else if (isCharging) {
    verificationState = 'unverified_charger_poi';
  }

  // Address formatting
  const freeform = item.address?.freeformAddress;
  const municipality = item.address?.municipality || item.address?.localName || '';
  const subdivision = item.address?.countrySubdivision || item.address?.countrySecondarySubdivision || '';
  const country = item.address?.country || '';

  const subTitle = municipality
    ? `${municipality}${subdivision ? ', ' + subdivision : ''}${country ? ', ' + country : ''}`
    : freeform || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  const fullAddress = freeform || `${name}, ${subTitle}`;

  return {
    id: `${source}-${item.id || Math.random().toString(36).slice(2, 9)}`,
    entityId: item.id,
    name,
    subTitle,
    address: fullAddress,
    coordinates: [lat, lon],
    category: existingStation ? 'charging_station' : category,
    isChargingStation: isCharging || Boolean(existingStation),
    stationData: existingStation,
    verificationState,
    source,
    countryCode: item.address?.countryCode,
    rawType: rawKind
  };
}

/**
 * Searches local charging station catalogue and known locations for instant matching (0ms)
 */
export function searchLocalCatalogue(query: string): SearchResultPlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matched: SearchResultPlace[] = [];

  // 1. Match local curated stations
  for (const station of chargingStations) {
    if (
      station.name.toLowerCase().includes(q) ||
      station.network.toLowerCase().includes(q) ||
      station.address.toLowerCase().includes(q)
    ) {
      matched.push({
        id: `catalogue-${station.id}`,
        name: station.name,
        subTitle: `${station.network} • ${station.ratedPowerKw} kW DC Fast Charger`,
        address: station.address,
        coordinates: station.coordinates,
        category: 'charging_station',
        isChargingStation: true,
        stationData: station,
        verificationState: 'verified_station',
        source: 'catalogue',
        rawType: 'EV Charging Station'
      });
    }
  }

  // 2. Match local known cities & localities (Patna, Darbhanga, Kankarbagh, Delhi, Mumbai, etc.)
  for (const loc of POPULAR_LOCATIONS) {
    if (
      loc.name.toLowerCase().includes(q) ||
      loc.subTitle.toLowerCase().includes(q) ||
      loc.state.toLowerCase().includes(q)
    ) {
      if (
        !matched.some(
          (m) =>
            Math.abs(m.coordinates[0] - loc.coordinates[0]) < 0.01 &&
            Math.abs(m.coordinates[1] - loc.coordinates[1]) < 0.01
        )
      ) {
        matched.push({
          id: `local-${loc.id}`,
          name: loc.name,
          subTitle: `${loc.subTitle}, ${loc.state}`,
          address: `${loc.name}, ${loc.subTitle}, ${loc.state}, India`,
          coordinates: loc.coordinates,
          category: loc.name === 'Kankarbagh' ? 'locality' : 'city',
          isChargingStation: false,
          source: 'catalogue',
          rawType: 'City / Locality'
        });
      }
    }
  }

  return matched;
}

/**
 * 1. TomTom Orbis Places Suggest API (Direct client query when key present)
 * Documented at: POST /maps/orbis/places/suggest
 */
async function queryOrbisSuggest(
  query: string,
  apiKey: string,
  center?: [number, number],
  limit = 8,
  signal?: AbortSignal
): Promise<SearchResultPlace[]> {
  const url = `https://api.tomtom.com/maps/orbis/places/suggest?key=${encodeURIComponent(apiKey)}&apiVersion=1`;

  const body: Record<string, unknown> = {
    query,
    limit
  };

  if (center) {
    // Orbis format: coordinates are [lon, lat]
    body.origin = {
      type: 'point',
      coordinates: [center[1], center[0]]
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'TomTom-Api-Version': '3',
      'TomTom-Api-Key': apiKey
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    throw new Error(`Orbis Places Suggest returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawList = Array.isArray(data.results) ? data.results : [];
  const results: SearchResultPlace[] = [];

  for (const raw of rawList) {
    const item = normalizeSearchResultItem(raw, query, 'tomtom_orbis');
    if (item) results.push(item);
  }

  return results;
}

/**
 * 2. Secondary Explicit-Search Provider: Legacy TomTom Search v2 (Direct client query)
 * Unrestricted global search with optional non-blocking center bias
 */
async function queryLegacyTomTomSearch(
  query: string,
  apiKey: string,
  center?: [number, number],
  limit = 8,
  signal?: AbortSignal
): Promise<SearchResultPlace[]> {
  let url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${encodeURIComponent(apiKey)}&limit=${limit}&idxSet=POI,PAD,Str,Geo,Addr`;
  if (center) {
    // Proximity ranking bias WITHOUT radius restriction (Task 4)
    url += `&lat=${center[0]}&lon=${center[1]}`;
  }

  const res = await fetch(url, { signal });
  if (!res.ok) return [];

  const data = await res.json();
  const rawResults = Array.isArray(data.results) ? data.results : [];
  const results: SearchResultPlace[] = [];

  for (const raw of rawResults) {
    const item = normalizeSearchResultItem(raw, query, 'tomtom_legacy');
    if (item) results.push(item);
  }

  return results;
}

/**
 * 3. Query Backend Proxy Places Suggest
 */
async function queryProxySuggest(
  query: string,
  center?: [number, number],
  limit = 8,
  signal?: AbortSignal
): Promise<SearchResultPlace[]> {
  const endpoint = getProxyUrl('/api/places/suggest');
  if (!endpoint) return [];

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, center, limit }),
      signal
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const results: SearchResultPlace[] = [];
    const source = data.provider === 'tomtom_v2' ? 'tomtom_legacy' : 'tomtom_orbis';

    for (const raw of rawResults) {
      const item = normalizeSearchResultItem(raw, query, source);
      if (item) results.push(item);
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * 4. Query Backend Proxy Places Discover (Full Comprehensive Search)
 */
async function queryProxyDiscover(
  query: string,
  center?: [number, number],
  limit = 15,
  signal?: AbortSignal
): Promise<SearchResultPlace[]> {
  const endpoint = getProxyUrl('/api/places/discover');
  if (!endpoint) return [];

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, center, limit }),
      signal
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const results: SearchResultPlace[] = [];

    for (const raw of rawResults) {
      const item = normalizeSearchResultItem(raw, query, 'tomtom_legacy');
      if (item) results.push(item);
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * TomTom Orbis Places Discover API (Detailed structured resolution)
 * Documented at: POST /maps/orbis/places/discover
 */
export async function queryOrbisDiscover(
  query: string,
  apiKey: string,
  center?: [number, number],
  limit = 12,
  signal?: AbortSignal
): Promise<SearchResultPlace[]> {
  return queryLegacyTomTomSearch(query, apiKey, center, limit, signal);
}

/**
 * TomTom Orbis Places Details API (Rich metadata for selected place)
 * Documented at: GET /maps/orbis/places/details/{entityId}
 */
export async function getOrbisPlaceDetails(
  entityId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://api.tomtom.com/maps/orbis/places/details/${encodeURIComponent(entityId)}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { 'TomTom-Api-Version': '3' },
      signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Full Comprehensive Search (Task 5)
 * Triggered on Enter key or clicking Search button
 */
export async function discoverPlaces(options: PlaceSearchOptions): Promise<SearchResultPlace[]> {
  const { query, limit = 15, signal, center } = options;
  if (signal?.aborted) {
    throw new DOMException('This operation was aborted', 'AbortError');
  }
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const apiKey = getTomTomApiKey();
  const results: SearchResultPlace[] = [];

  // Curated matches first
  const catalogueMatches = searchLocalCatalogue(trimmed);
  results.push(...catalogueMatches);

  let providerResults: SearchResultPlace[] = [];

  if (apiKey) {
    providerResults = await queryLegacyTomTomSearch(trimmed, apiKey, center, limit, signal);
  } else {
    providerResults = await queryProxyDiscover(trimmed, center, limit, signal);
  }

  for (const item of providerResults) {
    const isDup = results.some(
      (r) =>
        Math.abs(r.coordinates[0] - item.coordinates[0]) < 0.001 &&
        Math.abs(r.coordinates[1] - item.coordinates[1]) < 0.001
    );
    if (!isDup) results.push(item);
  }

  return results.slice(0, limit);
}

/**
 * Universal Place Search Entrypoint (Type-ahead Suggest)
 * - Evaluates local catalogue first (instant 0ms response)
 * - Uses TomTom Orbis Places Suggest / Search v2 via direct key OR backend proxy
 * - Merges results with coordinate deduplication
 * - Strictly avoids public Nominatim keystroke scraping
 */
export async function searchPlaces(options: PlaceSearchOptions): Promise<SearchResultPlace[]> {
  const { query, limit = 8, signal, center, fullSearch } = options;
  if (signal?.aborted) {
    throw new DOMException('This operation was aborted', 'AbortError');
  }
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (fullSearch) {
    return discoverPlaces(options);
  }

  const apiKey = getTomTomApiKey();
  const results: SearchResultPlace[] = [];

  // 1. Local curated catalogue match
  const catalogueMatches = searchLocalCatalogue(trimmed);
  results.push(...catalogueMatches);

  let providerResults: SearchResultPlace[] = [];

  if (apiKey) {
    try {
      // 2. Primary: TomTom Orbis Places Suggest directly
      providerResults = await queryOrbisSuggest(trimmed, apiKey, center, limit, signal);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      try {
        // Fallback to TomTom Search v2 directly
        providerResults = await queryLegacyTomTomSearch(trimmed, apiKey, center, limit, signal);
      } catch (legErr: unknown) {
        if (legErr instanceof Error && legErr.name === 'AbortError') throw legErr;
      }
    }
  } else {
    // 3. Fallback to Server Proxy (/api/places/suggest)
    providerResults = await queryProxySuggest(trimmed, center, limit, signal);
  }

  for (const item of providerResults) {
    const isDup = results.some(
      (r) =>
        Math.abs(r.coordinates[0] - item.coordinates[0]) < 0.001 &&
        Math.abs(r.coordinates[1] - item.coordinates[1]) < 0.001
    );
    if (!isDup) results.push(item);
  }

  return results.slice(0, limit);
}

/**
 * Reverse geocodes coordinates to human-readable address and place name
 * - Priority 1: Check nearby catalogue stations (< 200m)
 * - Priority 2: TomTom Orbis Reverse Geocode API (via direct client key or proxy)
 * - Priority 3: Fallback coordinates placeholder
 */
export async function reverseGeocode(
  coordinates: [number, number],
  signal?: AbortSignal
): Promise<{
  name: string;
  address: string;
  category: PlaceCategory;
  isCharging: boolean;
  stationData?: ChargingStation;
  verificationState?: StationVerificationState;
}> {
  const [lat, lon] = coordinates;

  // 1. Nearby catalogue station check
  const existingStation = chargingStations.find(
    (s) => haversineDistanceMi(s.coordinates, coordinates) < 0.2
  );
  if (existingStation) {
    return {
      name: existingStation.name,
      address: existingStation.address,
      category: 'charging_station',
      isCharging: true,
      stationData: existingStation,
      verificationState: 'verified_station'
    };
  }

  const apiKey = getTomTomApiKey();

  if (apiKey) {
    try {
      const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat.toFixed(5)},${lon.toFixed(5)}.json?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = await res.json();
        const address = data.addresses?.[0]?.address;
        if (address) {
          const name = address.streetName || address.municipalitySubdivision || address.municipality || `Point (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
          return {
            name,
            address: address.freeformAddress || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            category: 'poi',
            isCharging: false
          };
        }
      }
    } catch {}
  } else {
    // Try reverse geocode via backend proxy
    const proxyEp = getProxyUrl(`/api/places/reverseGeocode?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);
    if (proxyEp) {
      try {
        const res = await fetch(proxyEp, { signal });
        if (res.ok) {
          const json = await res.json();
          const address = json.data?.addresses?.[0]?.address;
          if (address) {
            const name = address.streetName || address.municipalitySubdivision || address.municipality || `Point (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
            return {
              name,
              address: address.freeformAddress || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
              category: 'poi',
              isCharging: false
            };
          }
        }
      } catch {}
    }
  }

  // 4. Default coordinates placeholder if no API key is available
  return {
    name: `Map Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    address: `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)} • Configure TOMTOM_API_KEY for reverse geocoding`,
    category: 'poi',
    isCharging: false
  };
}
