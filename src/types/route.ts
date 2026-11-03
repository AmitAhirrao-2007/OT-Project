import {
  StationAmenity,
  RoadAccessStatus,
  CarriagewayAccess,
  TariffClassification,
  StallAvailabilityStatus
} from './station';
import { ConfidenceTier, StationReliabilitySummary } from './communityReports';
import { BackupReachabilityClassification } from '../services/roadAccessService';
import { VehicleProfile } from './vehicle';
import { PlanOptions, ChargingSettings, RoutingSettings } from './settings';
import { TrafficRouteSummary } from './traffic';

export type Amenity = StationAmenity;
export type WaypointType = 'origin' | 'destination' | 'via' | 'charging_pinned';

export interface ChargingStop {
  id: string;
  stationId: string;
  name: string;
  network: string;
  address: string;
  coordinates: [number, number]; // [lat, lng]
  powerKw: number;
  stallsTotal: number;
  stallsAvailable?: number;
  arrivalTime: string;
  departureTime: string;
  arrivalSoc: number; // percentage
  departureSoc: number; // percentage
  chargeDurationMinutes: number;
  energyAddedKwh: number;
  legDriveDuration: string; // e.g., "3 h 38 min"
  legDistanceMi: number; // e.g., 170
  amenities: Amenity[];
  priceEstimate?: string;
  notes?: string;
  isExcluded?: boolean;
  isPreferred?: boolean;
  isPinned?: boolean;
  isFeasible: boolean;
  // Road accessibility and carriageway metadata
  roadAccessStatus?: RoadAccessStatus;
  carriagewayAccess?: CarriagewayAccess;
  entranceCoordinates?: [number, number];
  actualDetourMi?: number;
  backupStationId?: string;
  backupStationName?: string;
  backupReachable?: boolean;
  accessRestrictions?: string[];
  accessNotes?: string;
  // Data quality and provenance metadata
  canonicalNetwork?: string;
  tariffClassification?: TariffClassification;
  stallAvailabilityStatus?: StallAvailabilityStatus;
  provenanceConfidence?: number;
  // Community reliability metadata (Phase 5D)
  reachabilityClassification?: BackupReachabilityClassification;
  communityReliabilityScore?: number | null;
  communityConfidenceTier?: ConfidenceTier;
  communityWarning?: string;
  communityQueueMinutes?: number;
  cpoConflict?: {
    hasConflict: boolean;
    cpoStatus: string;
    communityWarning: string;
  };
}

export type RouteGeometryStatus =
  | 'PROVIDER_ROAD_GEOMETRY'
  | 'OSRM_ROAD_GEOMETRY'
  | 'APPROXIMATE_GEOMETRY'
  | 'GEOMETRY_UNAVAILABLE'
  | 'ROUTE_INFEASIBLE';

export interface InfeasibilityDetails {
  lastReachableStation?: {
    id?: string;
    name: string;
    coordinates?: [number, number];
    arrivalSoc?: number;
  };
  remainingDistanceMi: number;
  remainingEnergyKwh: number;
  requiredSocPercent: number;
  reason: string;
  suggestedAction?: string;
}

export interface RouteOption {
  id: string;
  label: string; // e.g. "14 h 41 min"
  badge?: string; // e.g. "Faster" or "+2 h 27 min"
  description?: string;
  totalDuration: string;
  totalDurationMinutes: number;
  drivingDuration: string;
  drivingDurationMinutes: number;
  chargingDuration: string;
  chargingDurationMinutes: number;
  stopBufferDuration: string;
  stopBufferMinutes: number;
  totalDistanceMi: number;
  stopCount: number;
  totalEnergyKwh: number;
  estimatedExpenseInr: number;
  tollNote?: string;
  stops: ChargingStop[];
  polylineCoordinates: [number, number][];
  isFeasible: boolean;
  chargerDataStatus?: 'catalogue_verified' | 'unavailable_outside_catalogue' | 'incomplete_data' | 'unverified_poi';
  feasibilityNote?: string;
  calculationMethod:
    | 'Energy-Constrained Path Simulation'
    | 'OSRM Road Router + Calibrated Model'
    | 'TomTom Orbis Road Router'
    | 'RCSP Optimizer'
    | 'Greedy Fallback';
  geometrySource?: 'osrm' | 'tomtom' | 'estimated' | 'unavailable';
  geometryStatus?: RouteGeometryStatus;
  roadValidated?: boolean;
  trafficSummary?: TrafficRouteSummary;
  alternativeIndex?: number;
  routeName?: string;
  hasTolls?: boolean;
  majorRoads?: string[];
  isRecommended?: boolean;
  infeasibilityDetails?: InfeasibilityDetails;
  isCompleteEvJourney?: boolean;
}

export interface Waypoint {
  id: string;
  name: string;
  subTitle?: string;
  address?: string;
  coordinates: [number, number];
  batterySoc: number;
  departureTime?: string;
  arrivalTime?: string;
  isCustom?: boolean;
  type?: WaypointType;
  category?: string;
  source?: 'manual' | 'tomtom' | 'tomtom_orbis' | 'tomtom_legacy' | 'nominatim' | 'catalogue' | 'map_click' | 'gps';
  stationId?: string;
  powerKw?: number;
  targetChargeSoc?: number;
  verificationState?: 'verified_station' | 'source_reported_station' | 'estimated_station' | 'incomplete_charger_listing' | 'unverified_charger_poi' | 'unavailable_charger_data';
  isFeasibleStop?: boolean;
  infeasibilityReason?: string;
}

export interface RouteCalculationRequest {
  origin: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  vehicle: VehicleProfile;
  planOptions: PlanOptions;
  chargingSettings: ChargingSettings;
  routingSettings: RoutingSettings;
  communitySummaries?: Map<string, StationReliabilitySummary>;
  queueWaitMinutesMap?: Map<string, number>;
  enableTraffic?: boolean;
}

export interface DemonstrationTrip {
  origin: Waypoint;
  destination: Waypoint;
  waypoints: Waypoint[];
  routeOptions: RouteOption[];
  activeRouteId: string;
}
