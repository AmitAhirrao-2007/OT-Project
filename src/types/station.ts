export type StationAmenity =
  | 'restaurant'
  | 'coffee'
  | 'restroom'
  | 'shopping'
  | 'lodging'
  | 'wifi';

export type SupportedConnectorType =
  | 'CCS'
  | 'CCS2'
  | 'Level 2'
  | 'Type 2'
  | 'CHAdeMO'
  | 'NACS'
  | 'GB/T'
  | 'Bharat DC-001'
  | 'Bharat AC-001'
  | (string & {});

export interface ConnectorSpec {
  type: SupportedConnectorType;
  maxPowerKw: number;
  count: number;
  availableCount?: number;
  canonicalType?: string;
}

export type RoadAccessStatus = 'verified' | 'estimated' | 'uncertain' | 'inaccessible';

export type CarriagewayAccess =
  | 'both'
  | 'divided_unidirectional'
  | 'bidirectional_service_road'
  | 'restricted_premises'
  | 'unknown';

export type TravelDirection =
  | 'northbound'
  | 'southbound'
  | 'eastbound'
  | 'westbound'
  | 'both'
  | 'unknown';

export interface StationAccessMetadata {
  roadAccessStatus: RoadAccessStatus;
  carriagewayAccess: CarriagewayAccess;
  supportedDirections?: TravelDirection[];
  entranceCoordinates?: [number, number]; // [lat, lng] at highway off-ramp/entry point
  actualDetourMi?: number; // Measured or computed drivable road detour
  backupStationId?: string; // ID of fallback station if this station is unavailable
  accessRestrictions?: string[]; // e.g., ["Toll road access only", "Private premises access"]
  accessConfidence?: number; // 0.0 to 1.0 empirical verification confidence
  accessNotes?: string;
}

export type VerificationStatus =
  | 'verified'
  | 'source_reported'
  | 'user_reported'
  | 'estimated'
  | 'uncertain'
  | 'unknown'
  | 'stale'
  | 'conflicting';

export type VerificationMethod =
  | 'operator_app'
  | 'field_survey'
  | 'osm_overpass'
  | 'simulation'
  | 'user_report'
  | 'heuristic_estimation';

export interface FieldProvenance {
  status: VerificationStatus;
  verifiedAt?: string; // e.g., "2026-10-30" or ISO timestamp
  sourceUrl?: string;
  method?: VerificationMethod;
  confidence: number; // 0.0 to 1.0
  notes?: string;
}

export interface StationProvenance {
  identity?: FieldProvenance;
  coordinates?: FieldProvenance;
  network?: FieldProvenance;
  connectors?: FieldProvenance;
  power?: FieldProvenance;
  tariff?: FieldProvenance;
  amenities?: FieldProvenance;
  roadAccess?: FieldProvenance;
  operationalStatus?: FieldProvenance;
  dataNotes?: string;
}

export type TariffClassification =
  | 'source_confirmed'
  | 'user_reported'
  | 'estimated_default'
  | 'session_fee'
  | 'free'
  | 'unknown'
  | 'invalid';

export type StallAvailabilityStatus =
  | 'known_available'
  | 'known_full'
  | 'unknown'
  | 'stale';

export interface ChargingStation {
  id: string;
  name: string;
  network: string;
  canonicalNetwork?: string;
  address: string;
  coordinates: [number, number]; // [lat, lng]
  ratedPowerKw: number;
  totalStalls: number;
  availableStalls?: number;
  stallAvailabilityStatus?: StallAvailabilityStatus;
  connectors: ConnectorSpec[];
  amenities: StationAmenity[];
  pricePerKwh: string;
  tariffClassification?: TariffClassification;
  operationalStatus: 'operational' | 'limited' | 'unknown';
  statusTimestamp: string;
  openingHours: string;
  paymentMethods: string[];
  dataSource: 'Reference Simulation' | 'Open Charge Map' | 'Operator API';
  notes?: string;
  isExcluded?: boolean;
  isPreferred?: boolean;
  accessMetadata?: StationAccessMetadata;
  provenance?: StationProvenance;
}

