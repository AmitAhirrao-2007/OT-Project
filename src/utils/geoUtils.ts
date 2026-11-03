// Geographic & station corridor utilities shared across routing and optimization services.

import { ChargingStation } from '../types/station';
import { VehicleProfile } from '../types/vehicle';
import { PlanOptions, ChargingSettings } from '../types/settings';
import { isNetworkMatch, isConnectorCompatible } from '../services/catalogueService';

/**
 * Calculates straight line distance between two coordinates in miles using the Haversine formula.
 */
export function haversineDistanceMi(coord1: [number, number], coord2: [number, number]): number {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 3958.8; // Radius of the Earth in miles
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

/**
 * Filter stations that match vehicle plug types, minimum stalls, and user exclusions.
 * Distinguishes zero available stalls (0) from unknown/untracked stalls (undefined).
 */
export function getEligibleStations(
  stations: ChargingStation[],
  vehicle: VehicleProfile,
  planOptions: PlanOptions,
  chargingSettings: ChargingSettings
): ChargingStation[] {
  const preferred = planOptions.preferredNetworks || chargingSettings.preferredNetworks || [];
  const avoided = chargingSettings.avoidedNetworks || [];
  const excluded = chargingSettings.excludedChargers || [];
  const minStalls = chargingSettings.minimumChargerStalls || 1;

  return stations
    .filter((station) => {
      // 1. Check excluded chargers
      if (excluded.includes(station.id)) return false;

      // 1b. Exclude stations with verified inaccessible road status
      if (station.accessMetadata?.roadAccessStatus === 'inaccessible') return false;

      // 2. Check avoided networks (supports exact and normalized alias matches)
      if (avoided.some((av) => isNetworkMatch(av, station.network))) return false;

      // 3. Check connector compatibility with selected vehicle plug types (supports canonical aliases like CCS/CCS2)
      const hasCompatiblePlug = station.connectors.some((c) =>
        isConnectorCompatible(c.type, vehicle.selectedPlugTypes)
      );
      if (!hasCompatiblePlug) return false;

      // 4. Check minimum total stalls
      if (station.totalStalls < minStalls) return false;

      // 5. If minimum stalls requirement > 1 and available stalls is known, enforce availability
      if (minStalls > 1 && station.availableStalls !== undefined && station.availableStalls < minStalls) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Prioritize preferred networks (supports exact and normalized alias matches)
      const aPref = preferred.some((p) => isNetworkMatch(p, a.network)) ? 1 : 0;
      const bPref = preferred.some((p) => isNetworkMatch(p, b.network)) ? 1 : 0;
      return bPref - aPref;
    });
}

/**
 * Projects a station onto a route polyline, returning its detour distance (perpendicular distance)
 * and progression distance from route origin in miles.
 */
export function projectStationOnPolyline(
  stationCoord: [number, number],
  polyline: [number, number][]
): { detourMi: number; distFromOriginMi: number } {
  if (polyline.length < 2) {
    return { detourMi: 9999, distFromOriginMi: 0 };
  }

  let minDetour = Infinity;
  let bestProgression = 0;
  let accumulatedDist = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    const segLen = haversineDistanceMi(p1, p2);

    // Flat earth approximation for segment projection factor t
    const midLatRad = ((p1[0] + p2[0]) / 2) * (Math.PI / 180);
    const cosLat = Math.cos(midLatRad);
    const dx = (p2[1] - p1[1]) * cosLat;
    const dy = p2[0] - p1[0];
    const segLenSq = dx * dx + dy * dy;

    let t = 0;
    if (segLenSq > 0) {
      const px = (stationCoord[1] - p1[1]) * cosLat;
      const py = stationCoord[0] - p1[0];
      t = Math.max(0, Math.min(1, (px * dx + py * dy) / segLenSq));
    }

    const projCoord: [number, number] = [
      p1[0] + t * (p2[0] - p1[0]),
      p1[1] + t * (p2[1] - p1[1])
    ];

    const dist = haversineDistanceMi(stationCoord, projCoord);
    if (dist < minDetour) {
      minDetour = dist;
      bestProgression = accumulatedDist + t * segLen;
    }

    accumulatedDist += segLen;
  }

  return {
    detourMi: Number(minDetour.toFixed(2)),
    distFromOriginMi: Number(bestProgression.toFixed(1))
  };
}

/**
 * Validates that an array of [lat, lon] coordinates represents valid, finite road geometry.
 */
export function validateRoadGeometry(coords: unknown): coords is [number, number][] {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  return coords.every(
    (pt) =>
      Array.isArray(pt) &&
      pt.length >= 2 &&
      typeof pt[0] === 'number' &&
      typeof pt[1] === 'number' &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]) &&
      pt[0] >= -90 &&
      pt[0] <= 90 &&
      pt[1] >= -180 &&
      pt[1] <= 180
  );
}

/**
 * Converts GeoJSON [longitude, latitude] coordinates into Leaflet [latitude, longitude] pairs.
 * Performs strict validation and bounds checking.
 */
export function geoJsonCoordinatesToLeafletLatLng(
  coords: [number, number][] | unknown
): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const result: [number, number][] = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      result.push([lat, lon]);
    }
  }
  return result;
}

/**
 * Converts Leaflet [latitude, longitude] coordinates into GeoJSON [longitude, latitude] pairs.
 */
export function leafletLatLngToGeoJsonCoordinates(
  coords: [number, number][] | unknown
): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const result: [number, number][] = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lon = Number(pt[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      result.push([lon, lat]);
    }
  }
  return result;
}

/**
 * Merges multiple sequential leg geometries into a single seamless continuous polyline,
 * avoiding point duplication at shared leg transitions.
 */
export function mergeRouteLegGeometries(
  legs: [number, number][][]
): [number, number][] {
  if (!Array.isArray(legs) || legs.length === 0) return [];
  const merged: [number, number][] = [];

  for (const leg of legs) {
    if (!Array.isArray(leg)) continue;
    for (let i = 0; i < leg.length; i++) {
      const pt = leg[i];
      if (merged.length > 0) {
        const last = merged[merged.length - 1];
        // Skip duplicate connecting point if within 5 meters (0.00005 deg)
        if (
          Math.abs(last[0] - pt[0]) < 0.00005 &&
          Math.abs(last[1] - pt[1]) < 0.00005
        ) {
          continue;
        }
      }
      merged.push(pt);
    }
  }

  return merged;
}


