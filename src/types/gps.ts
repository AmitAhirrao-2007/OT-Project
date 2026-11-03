/**
 * Live GPS Location & Route Tracking Types
 * Phase 6F: Additive live geolocation and route progress abstractions
 */

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number; // Reported accuracy radius in meters
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null; // Direction of travel in degrees (0 - 360) or null
  speed?: number | null; // Speed in m/s or null
  timestamp: number;
}

export type GpsStatus =
  | 'idle'
  | 'locating'
  | 'tracking'
  | 'error'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface GpsRouteProgress {
  isMatching: boolean;
  isOffRoute: boolean;
  deviationDistanceMeters: number;
  distanceTravelledMi: number;
  remainingDistanceMi: number;
  totalDistanceMi: number;
  progressPercentage: number;
  matchedCoordinates: [number, number] | null;
  nearestSegmentIndex: number;
  statusText: string;
}

export interface GpsState {
  status: GpsStatus;
  currentPosition: GpsCoordinates | null;
  isTracking: boolean;
  isFollowMe: boolean;
  errorMessage: string | null;
  routeProgress: GpsRouteProgress | null;
}
