/**
 * High-Precision Route Geometry Snapping & Progress Tracking Math
 * Phase 6F: Snaps user GPS coordinates to actual road polyline
 */

import { GpsCoordinates, GpsRouteProgress } from '../types/gps';

// Earth radius constant in meters
const EARTH_RADIUS_METERS = 6371008.8;

/**
 * Calculates great-circle distance between two [lat, lon] coordinates in meters
 */
export function haversineMeters(p1: [number, number], p2: [number, number]): number {
  const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
  const dLon = ((p2[1] - p1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1[0] * Math.PI) / 180) *
      Math.cos((p2[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates great-circle distance between two [lat, lon] coordinates in miles
 */
export function haversineMiles(p1: [number, number], p2: [number, number]): number {
  return haversineMeters(p1, p2) * 0.000621371;
}

/**
 * Projects a point P onto a line segment [A, B] in local tangent plane
 * Returns the closest point on the segment, distance in meters, and interpolation factor t (0 <= t <= 1)
 */
export function projectPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): {
  projectedPoint: [number, number];
  distanceMeters: number;
  t: number;
} {
  const [pLat, pLon] = p;
  const [aLat, aLon] = a;
  const [bLat, bLon] = b;

  // Convert to local Cartesian coordinates centered at A in meters
  const latFactor = 111132.95; // meters per degree latitude
  const lonFactor = 111412.84 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180)); // meters per degree longitude

  const bx = (bLon - aLon) * lonFactor;
  const by = (bLat - aLat) * latFactor;
  const px = (pLon - aLon) * lonFactor;
  const py = (pLat - aLat) * latFactor;

  const segLengthSq = bx * bx + by * by;

  if (segLengthSq < 0.1) {
    // Segment start and end are practically identical
    return {
      projectedPoint: a,
      distanceMeters: haversineMeters(p, a),
      t: 0
    };
  }

  // Scalar projection of P onto vector AB: t = (P . AB) / |AB|^2
  const dot = px * bx + py * by;
  const t = Math.max(0, Math.min(1, dot / segLengthSq));

  const projLon = aLon + (t * (bLon - aLon));
  const projLat = aLat + (t * (bLat - aLat));
  const projectedPoint: [number, number] = [projLat, projLon];

  const distanceMeters = haversineMeters(p, projectedPoint);

  return {
    projectedPoint,
    distanceMeters,
    t
  };
}

export interface MatchGpsOptions {
  offRouteThresholdMeters?: number; // Distance beyond which user is flagged as off-route (default: 120m)
  maxCorridorThresholdMeters?: number; // Distance beyond which route matching is discarded (default: 3000m)
  lastKnownSegmentIndex?: number; // Optional hint for segment search window
  gpsAccuracyMeters?: number; // Reported GPS accuracy radius
}

/**
 * Matches a user GPS position to the selected road route polyline
 * Accurately determines distance travelled, remaining distance, progress %, and deviation
 */
export function matchGpsToRoute(
  userPosition: [number, number] | GpsCoordinates,
  polyline: [number, number][],
  options: MatchGpsOptions = {}
): GpsRouteProgress {
  const isGpsObject = !Array.isArray(userPosition) && typeof userPosition === 'object' && userPosition !== null;
  const coords: [number, number] = isGpsObject
    ? [userPosition.latitude, userPosition.longitude]
    : userPosition;
  const inferredAccuracy = isGpsObject ? userPosition.accuracy : 15;

  const {
    offRouteThresholdMeters = 120,
    maxCorridorThresholdMeters = 3000,
    gpsAccuracyMeters = inferredAccuracy
  } = options;

  if (!polyline || polyline.length < 2) {
    return {
      isMatching: false,
      isOffRoute: false,
      deviationDistanceMeters: 0,
      distanceTravelledMi: 0,
      remainingDistanceMi: 0,
      totalDistanceMi: 0,
      progressPercentage: 0,
      matchedCoordinates: null,
      nearestSegmentIndex: -1,
      statusText: 'No active route polyline'
    };
  }

  // 1. Calculate cumulative distances along polyline in miles
  const segDistancesMi: number[] = [];
  let totalDistanceMi = 0;

  for (let i = 1; i < polyline.length; i++) {
    const d = haversineMiles(polyline[i - 1], polyline[i]);
    segDistancesMi.push(d);
    totalDistanceMi += d;
  }

  // 2. Find closest segment to user's GPS coordinates
  let minDeviationMeters = Infinity;
  let bestSegIndex = 0;
  let bestProjectedPoint: [number, number] = polyline[0];
  let bestT = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectPointOnSegment(coords, polyline[i], polyline[i + 1]);
    if (proj.distanceMeters < minDeviationMeters) {
      minDeviationMeters = proj.distanceMeters;
      bestSegIndex = i;
      bestProjectedPoint = proj.projectedPoint;
      bestT = proj.t;
    }
  }

  // Check if completely outside corridor (> maxCorridorThresholdMeters)
  if (minDeviationMeters > maxCorridorThresholdMeters) {
    return {
      isMatching: false,
      isOffRoute: true,
      deviationDistanceMeters: Math.round(minDeviationMeters),
      distanceTravelledMi: 0,
      remainingDistanceMi: Math.round(totalDistanceMi * 10) / 10,
      totalDistanceMi: Math.round(totalDistanceMi * 10) / 10,
      progressPercentage: 0,
      matchedCoordinates: null,
      nearestSegmentIndex: bestSegIndex,
      statusText: `Off corridor (${(minDeviationMeters * 0.000621371).toFixed(1)} mi away)`
    };
  }

  // 3. Compute distance travelled along the route up to projected point
  let travelledMi = 0;
  for (let i = 0; i < bestSegIndex; i++) {
    travelledMi += segDistancesMi[i];
  }
  if (bestSegIndex < segDistancesMi.length) {
    travelledMi += bestT * segDistancesMi[bestSegIndex];
  }

  // Account for GPS drift when near endpoints
  if (bestSegIndex === 0 && bestT === 0 && travelledMi < 0.05) {
    travelledMi = 0;
  }

  const remainingMi = Math.max(0, totalDistanceMi - travelledMi);
  const progressPercent = totalDistanceMi > 0
    ? Math.min(100, Math.max(0, Math.round((travelledMi / totalDistanceMi) * 100)))
    : 0;

  // Dynamic threshold: scale threshold if GPS accuracy is poor (e.g. 50m accuracy)
  const effectiveThreshold = Math.max(offRouteThresholdMeters, gpsAccuracyMeters * 1.5);
  const isOffRoute = minDeviationMeters > effectiveThreshold;

  let statusText = 'On Route';
  if (isOffRoute) {
    statusText = `Off Route (${Math.round(minDeviationMeters)}m deviation)`;
  } else if (progressPercent >= 99) {
    statusText = 'Arriving at Destination';
  } else {
    statusText = `On Route • ${progressPercent}% complete`;
  }

  return {
    isMatching: true,
    isOffRoute,
    deviationDistanceMeters: Math.round(minDeviationMeters),
    distanceTravelledMi: Math.round(travelledMi * 10) / 10,
    remainingDistanceMi: Math.round(remainingMi * 10) / 10,
    totalDistanceMi: Math.round(totalDistanceMi * 10) / 10,
    progressPercentage: progressPercent,
    matchedCoordinates: bestProjectedPoint,
    nearestSegmentIndex: bestSegIndex,
    statusText
  };
}
