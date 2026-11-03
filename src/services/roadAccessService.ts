// Road Access Service
// Validates physical road accessibility, carriageway directionality,
// entrance spur detours, and backup charger reachability.

import { ChargingStation, RoadAccessStatus, CarriagewayAccess, TravelDirection } from '../types/station';
import { VehicleProfile } from '../types/vehicle';
import { haversineDistanceMi } from '../utils/geoUtils';
import { calculateLegEnergy } from './energyModel';
import { StationReliabilitySummary } from '../types/communityReports';

export type BackupReachabilityClassification =
  | 'verified_reachable'
  | 'estimated_reachable'
  | 'backup_not_available'
  | 'no_feasible_backup';

export interface RoadAccessValidationResult {
  isAccessible: boolean;
  accessStatus: RoadAccessStatus;
  carriageway: CarriagewayAccess;
  actualDetourMi: number;
  entranceCoordinates?: [number, number];
  rejectionReason?: string;
  accessRestrictions?: string[];
  accessNotes?: string;
  accessConfidence: number; // 0.0 to 1.0
}

export interface BackupChargerEvaluation {
  backupStationId?: string;
  backupStationName?: string;
  backupReachable: boolean;
  reachabilityClassification?: BackupReachabilityClassification;
  distanceToBackupMi?: number;
  estimatedSocAtBackup?: number;
  communityReliabilityScore?: number | null;
  communityWarning?: string;
  reason?: string;
}

/**
 * Calculates the forward azimuth / bearing in degrees [0, 360) between two coordinates.
 */
export function calculateBearing(startCoord: [number, number], endCoord: [number, number]): number {
  const [lat1, lon1] = startCoord;
  const [lat2, lon2] = endCoord;

  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  const bearingDeg = ((θ * 180) / Math.PI + 360) % 360;

  return bearingDeg;
}

/**
 * Maps a compass bearing in degrees to a general cardinal travel direction.
 */
export function bearingToCardinalDirection(bearingDeg: number): TravelDirection {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  if (normalized >= 315 || normalized < 45) {
    return 'northbound';
  } else if (normalized >= 45 && normalized < 135) {
    return 'eastbound';
  } else if (normalized >= 135 && normalized < 225) {
    return 'southbound';
  } else {
    return 'westbound';
  }
}

/**
 * Determines route heading and travel direction at a given progression distance along a polyline.
 */
export function calculateRouteHeading(
  polyline: [number, number][],
  progressionDistMi: number
): { bearingDeg: number; travelDirection: TravelDirection } {
  if (polyline.length < 2) {
    return { bearingDeg: 0, travelDirection: 'both' };
  }

  let accumulatedDist = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    const segLen = haversineDistanceMi(p1, p2);

    if (accumulatedDist + segLen >= progressionDistMi || i === polyline.length - 2) {
      const bearing = calculateBearing(p1, p2);
      return {
        bearingDeg: Number(bearing.toFixed(1)),
        travelDirection: bearingToCardinalDirection(bearing)
      };
    }
    accumulatedDist += segLen;
  }

  // Fallback to overall polyline direction
  const overallBearing = calculateBearing(polyline[0], polyline[polyline.length - 1]);
  return {
    bearingDeg: Number(overallBearing.toFixed(1)),
    travelDirection: bearingToCardinalDirection(overallBearing)
  };
}

/**
 * Validates road accessibility for a charging station along a planned route.
 * Evaluates carriageway division, heading match, entrance off-ramps, and detour spurs.
 */
export function validateStationRoadAccess(
  station: ChargingStation,
  polyline: [number, number][],
  progressionDistMi: number,
  perpendicularDetourMi: number
): RoadAccessValidationResult {
  const meta = station.accessMetadata;

  // 1. Backward compatibility: If no accessMetadata is specified, treat as estimated
  if (!meta) {
    const estimatedSpur = Number((Math.max(0.1, perpendicularDetourMi) * 2.0).toFixed(2));
    return {
      isAccessible: true,
      accessStatus: 'estimated',
      carriageway: 'unknown',
      actualDetourMi: estimatedSpur,
      accessConfidence: 0.5,
      accessNotes: 'Estimated highway spur detour (metadata not catalogued)'
    };
  }

  // 2. Reject explicitly inaccessible stations
  if (meta.roadAccessStatus === 'inaccessible') {
    return {
      isAccessible: false,
      accessStatus: 'inaccessible',
      carriageway: meta.carriagewayAccess,
      actualDetourMi: 999,
      rejectionReason: 'Station is physically or operationally inaccessible from the road network',
      accessRestrictions: meta.accessRestrictions,
      accessNotes: meta.accessNotes,
      accessConfidence: meta.accessConfidence ?? 1.0
    };
  }

  // 3. Directional carriageway check
  const routeHeading = calculateRouteHeading(polyline, progressionDistMi);

  if (meta.carriagewayAccess === 'divided_unidirectional') {
    const supported = meta.supportedDirections || [];
    const isSupported =
      supported.includes('both') ||
      supported.includes(routeHeading.travelDirection);

    if (!isSupported) {
      return {
        isAccessible: false,
        accessStatus: meta.roadAccessStatus,
        carriageway: meta.carriagewayAccess,
        actualDetourMi: 999,
        rejectionReason: `Opposite carriageway with median barrier: route travels ${routeHeading.travelDirection}, station serves ${supported.join(', ')}`,
        accessRestrictions: meta.accessRestrictions,
        accessNotes: meta.accessNotes,
        accessConfidence: meta.accessConfidence ?? 0.85
      };
    }
  }

  // 4. Calculate actual drivable detour distance
  let actualDetour = meta.actualDetourMi;
  if (actualDetour === undefined) {
    if (meta.entranceCoordinates) {
      // Detour via entrance ramp + spur to station
      const spurToEntrance = perpendicularDetourMi;
      const entranceToCharger = haversineDistanceMi(meta.entranceCoordinates, station.coordinates);
      actualDetour = Number(((spurToEntrance + entranceToCharger) * 2.0).toFixed(2));
    } else {
      // Fallback: 2x perpendicular distance (round-trip off-highway)
      actualDetour = Number((Math.max(0.1, perpendicularDetourMi) * 2.0).toFixed(2));
    }
  }

  return {
    isAccessible: true,
    accessStatus: meta.roadAccessStatus,
    carriageway: meta.carriagewayAccess,
    actualDetourMi: actualDetour,
    entranceCoordinates: meta.entranceCoordinates,
    accessRestrictions: meta.accessRestrictions,
    accessNotes: meta.accessNotes,
    accessConfidence: meta.accessConfidence ?? 0.8
  };
}

/**
 * Evaluates reachability of configured backup charger or finds the best feasible alternative.
 * Enforces battery reserve (>= 3%), connector compatibility, road accessibility, and community reliability.
 */
export function evaluateBackupCharger(
  primaryStation: ChargingStation,
  allStations: ChargingStation[],
  vehicle: VehicleProfile,
  arrivalSocAtPrimary: number = 10,
  communitySummaries?: Map<string, StationReliabilitySummary>,
  minConfiguredReserve: number = 10
): BackupChargerEvaluation {
  const backupId = primaryStation.accessMetadata?.backupStationId;
  let targetBackup: ChargingStation | undefined;

  if (backupId) {
    targetBackup = allStations.find((s) => s.id === backupId);
    if (!targetBackup) {
      return {
        backupStationId: backupId,
        backupReachable: false,
        reachabilityClassification: 'backup_not_available',
        reason: `Configured backup station (${backupId}) not found in catalogue`
      };
    }
  } else {
    // Dynamic search for feasible backup charger within battery reach
    const vehiclePlugs = vehicle.supportedPlugTypes || ['CCS', 'Type 2'];
    const candidates = allStations.filter((s) => {
      if (s.id === primaryStation.id) return false;
      if (s.accessMetadata?.roadAccessStatus === 'inaccessible') return false;
      // Connector compatibility
      if (s.connectors && s.connectors.length > 0) {
        const hasCompatible = s.connectors.some((c) =>
          vehiclePlugs.some((p) => c.type.toUpperCase().includes(p.toUpperCase()))
        );
        if (!hasCompatible) return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      return {
        backupReachable: false,
        reachabilityClassification: 'backup_not_available',
        reason: 'No backup station configured'
      };
    }

    // Rank candidates by reachable distance and community reliability
    candidates.sort((a, b) => {
      const distA = haversineDistanceMi(primaryStation.coordinates, a.coordinates);
      const distB = haversineDistanceMi(primaryStation.coordinates, b.coordinates);
      const scoreA = communitySummaries?.get(a.id)?.overallScore ?? 50;
      const scoreB = communitySummaries?.get(b.id)?.overallScore ?? 50;
      return distA - distB - (scoreA - scoreB) * 0.1;
    });

    targetBackup = candidates[0];
  }

  // Distance from primary station to backup station
  const distMi = haversineDistanceMi(primaryStation.coordinates, targetBackup.coordinates);
  const legEnergy = calculateLegEnergy({ distanceMi: distMi, vehicle });
  const estimatedSocAtBackup = Number((arrivalSocAtPrimary - legEnergy.socPercent).toFixed(1));

  // 1. Connector compatibility check
  const vehiclePlugs = vehicle.supportedPlugTypes || ['CCS', 'Type 2'];
  const hasCompatibleConnector = !targetBackup.connectors || targetBackup.connectors.length === 0 || targetBackup.connectors.some((c) =>
    vehiclePlugs.some((p) => c.type.toUpperCase().includes(p.toUpperCase()))
  );
  if (!hasCompatibleConnector) {
    return {
      backupStationId: targetBackup.id,
      backupStationName: targetBackup.name,
      distanceToBackupMi: Number(distMi.toFixed(1)),
      estimatedSocAtBackup,
      backupReachable: false,
      reachabilityClassification: 'no_feasible_backup',
      reason: `Backup station has no compatible connector for vehicle (requires ${vehiclePlugs.join(', ')})`
    };
  }

  // 2. Road accessibility check
  if (targetBackup.accessMetadata?.roadAccessStatus === 'inaccessible') {
    return {
      backupStationId: targetBackup.id,
      backupStationName: targetBackup.name,
      distanceToBackupMi: Number(distMi.toFixed(1)),
      estimatedSocAtBackup,
      backupReachable: false,
      reachabilityClassification: 'no_feasible_backup',
      reason: 'Backup station is physically or operationally inaccessible from the road network'
    };
  }

  // 3. Battery reachability check: The vehicle must have at least 3% emergency battery remaining
  const isReachable = estimatedSocAtBackup >= 3.0;
  if (!isReachable) {
    return {
      backupStationId: targetBackup.id,
      backupStationName: targetBackup.name,
      distanceToBackupMi: Number(distMi.toFixed(1)),
      estimatedSocAtBackup,
      backupReachable: false,
      reachabilityClassification: 'no_feasible_backup',
      reason: `Insufficient battery: arrival SoC at primary (${arrivalSocAtPrimary}%) leaves only ${estimatedSocAtBackup}% at backup (minimum safe buffer is 3%)`
    };
  }

  // Community summary info
  const communitySummary = communitySummaries?.get(targetBackup.id);
  const communityWarning = communitySummary?.activeWarnings && communitySummary.activeWarnings.length > 0
    ? communitySummary.activeWarnings[0]
    : undefined;

  const classification: BackupReachabilityClassification =
    targetBackup.accessMetadata?.roadAccessStatus === 'verified'
      ? 'verified_reachable'
      : 'estimated_reachable';

  return {
    backupStationId: targetBackup.id,
    backupStationName: targetBackup.name,
    distanceToBackupMi: Number(distMi.toFixed(1)),
    estimatedSocAtBackup,
    backupReachable: true,
    reachabilityClassification: classification,
    communityReliabilityScore: communitySummary?.overallScore ?? null,
    communityWarning,
    reason: estimatedSocAtBackup < minConfiguredReserve
      ? `Arrival at backup (${estimatedSocAtBackup}%) satisfies emergency reserve (>=3%) but is below preferred ${minConfiguredReserve}% buffer`
      : undefined
  };
}

