/**
 * Universal Place Search & Waypoint Types
 * Phase 6B: Search any place, address, POI, or charging station
 */

import { ChargingStation } from './station';

export type StationVerificationState =
  | 'verified_station'          // Fully audited, physical entrance, carriageway direction verified (e.g., our 20 Indian catalogue stations)
  | 'source_reported_station'   // Provider-reported with explicit power (kW) and connector types
  | 'estimated_station'         // Estimated from operator defaults
  | 'incomplete_charger_listing'// Missing critical fields (e.g., power or connector types)
  | 'unverified_charger_poi'    // Generic POI labeled as charging station, without verified specs
  | 'unavailable_charger_data'; // Corridor with zero known or reachable stations

export type PlaceCategory =
  | 'city'
  | 'town'
  | 'village'
  | 'locality'
  | 'street'
  | 'address'
  | 'building'
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'attraction'
  | 'religious'
  | 'shopping'
  | 'mall'
  | 'airport'
  | 'railway_station'
  | 'bus_station'
  | 'hospital'
  | 'university'
  | 'school'
  | 'highway'
  | 'office'
  | 'charging_station'
  | 'poi'
  | 'other';

export interface SearchResultPlace {
  id: string;
  name: string;
  subTitle?: string;
  address: string;
  coordinates: [number, number]; // [lat, lng]
  category: PlaceCategory;
  isChargingStation: boolean;
  stationData?: ChargingStation;
  verificationState?: StationVerificationState;
  distanceMiFromRoute?: number;
  source: 'tomtom_orbis' | 'tomtom_legacy' | 'catalogue' | 'manual' | 'nominatim' | 'gps';
  countryCode?: string;
  rawType?: string;
  entityId?: string; // Orbis entityId for Details API lookup
}

export interface PlaceSearchOptions {
  query: string;
  center?: [number, number]; // [lat, lng] proximity bias
  routeBoundingBox?: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
  limit?: number;
  countryCodes?: string[];
  signal?: AbortSignal;
  preferOrbis?: boolean;
  fullSearch?: boolean; // When true, triggers comprehensive Places Discover instead of brief suggest
}

export type SearchProviderState =
  | 'connected'
  | 'catalogue_only'
  | 'missing_key'
  | 'error'
  | 'searching';

export interface SearchProviderDiagnostic {
  state: SearchProviderState;
  provider: 'tomtom_orbis' | 'tomtom_legacy' | 'catalogue_only';
  hasKey: boolean;
  message: string;
}

