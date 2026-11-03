/**
 * Smart Charging Queue & Waiting-Time Prediction Service
 * Phase 6G: Multi-provider queue integration, arrival-time waiting prediction, and voluntary reporting.
 */

import {
  StationQueueData,
  ConnectorQueueStatus,
  CommunityQueueReport,
  QueueReportSubmission,
  QueueArrivalPrediction,
  QueueConfidence,
  QueueDataSource
} from '../../types/queue';
import { ChargingStation, SupportedConnectorType } from '../../types/station';
import { VehicleProfile } from '../../types/vehicle';
import { calculateChargingDuration } from '../energyModel';
import { normalizeConnectorType, areConnectorsCompatible } from '../../utils/connectorUtils';
import { simulatedQueueService } from './simulatedQueueService';

/**
 * Formats a timestamp into Indian Standard Time (Asia/Kolkata) "hh:mm A" string
 */
export function formatIstTime(timestampMs: number | Date): string {
  const date = typeof timestampMs === 'number' ? new Date(timestampMs) : timestampMs;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Helper to compute distance in meters between two lat/lng pairs
 */
export function computeDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
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
 * Evaluates queue information confidence based on source and age
 */
export function evaluateQueueConfidence(
  source: QueueDataSource,
  timestampMs: number,
  currentTimeMs: number = Date.now()
): QueueConfidence {
  if (source === 'unavailable') return 'unknown';

  const ageMinutes = Math.max(0, (currentTimeMs - timestampMs) / (60 * 1000));

  if (source === 'operator_managed_queue' || source === 'operator_live') {
    if (ageMinutes <= 30) return 'high';
    if (ageMinutes <= 90) return 'medium';
    if (ageMinutes <= 180) return 'low';
    return 'unknown';
  }

  if (source === 'operator_aggregate_report' || source === 'verified_availability') {
    if (ageMinutes <= 30) return 'high';
    if (ageMinutes <= 60) return 'medium';
    if (ageMinutes <= 120) return 'low';
    return 'unknown';
  }

  if (source === 'community_report') {
    if (ageMinutes <= 25) return 'medium';
    if (ageMinutes <= 75) return 'low';
    return 'unknown';
  }

  if (source === 'historical_estimate') {
    return 'low';
  }

  if (source === 'simulated_queue') {
    return 'low';
  }

  return 'unknown';
}

export interface PredictQueueParams {
  station: ChargingStation;
  connectorType: SupportedConnectorType | string;
  currentQueueStatus: ConnectorQueueStatus | null;
  arrivalTimestampMs: number;
  currentTimestampMs?: number;
  vehicle: VehicleProfile;
  arrivalSocPercent: number;
  targetSocPercent: number;
}

/**
 * Predicts queue waiting time and plug-in time at the driver's expected arrival time
 * Models dynamic charger turnover between now and arrival rather than blindly echoing current status.
 */
export function predictQueueAtArrival(params: PredictQueueParams): QueueArrivalPrediction {
  const {
    station,
    connectorType,
    currentQueueStatus,
    arrivalTimestampMs,
    currentTimestampMs = Date.now(),
    vehicle,
    arrivalSocPercent,
    targetSocPercent
  } = params;

  const expectedArrivalTime = formatIstTime(arrivalTimestampMs);

  // Calculate charging duration for this vehicle at this station
  const stationPower = station.ratedPowerKw || 60;
  const chargingEst = calculateChargingDuration({
    usableCapacityKwh: vehicle.usableBatteryKwh,
    degradationPercent: vehicle.batteryDegradationPercent,
    maxDcChargingKw: vehicle.maxDcChargingKw,
    stationPowerKw: stationPower,
    currentSocPercent: Math.max(5, arrivalSocPercent),
    targetSocPercent: Math.max(arrivalSocPercent + 10, targetSocPercent || 80)
  });
  const estChargeMinutes = Math.max(10, Math.round(chargingEst.durationMinutes));

  // Case 1: No live queue or community data available
  if (!currentQueueStatus || currentQueueStatus.dataSource === 'unavailable') {
    return {
      stationId: station.id,
      connectorType,
      expectedArrivalTime,
      arrivalTimestampMs,
      estimatedWaitAtArrivalMinutes: null,
      estimatedWaitRange: undefined,
      estimatedPlugInTime: null,
      estimatedChargeDurationMinutes: estChargeMinutes,
      estimatedDepartureTime: null,
      projectedStallsAvailable: 0,
      projectedVehiclesWaiting: 0,
      confidence: 'unknown',
      dataSource: 'unavailable',
      predictionRationale: 'Queue information unavailable for this station.'
    };
  }

  // Case 2: Queue data exists -> Compute arrival-time projection
  const deltaMinutes = Math.max(0, (arrivalTimestampMs - currentTimestampMs) / (60 * 1000));
  const totalStalls = Math.max(1, currentQueueStatus.totalPoints);
  const occupiedStalls = Math.min(totalStalls, Math.max(0, currentQueueStatus.occupiedPoints));
  const currentWaitingVehicles = Math.max(0, currentQueueStatus.vehiclesWaiting);

  // Calibrate turnover session duration based on station rated power and AC vs DC connector type
  let avgSessionMinutes = 35;
  const isAc =
    typeof connectorType === 'string' &&
    (connectorType.toLowerCase().includes('type 2') ||
      connectorType.toLowerCase().includes('ac') ||
      stationPower <= 22);

  if (isAc) {
    avgSessionMinutes = 120; // AC destination charging (slow turnaround)
  } else if (stationPower >= 150) {
    avgSessionMinutes = 20; // High power DC fast chargers
  } else if (stationPower >= 100) {
    avgSessionMinutes = 28; // Standard 100-140 kW DC fast chargers
  } else if (stationPower >= 50) {
    avgSessionMinutes = 40; // 50-60 kW highway chargers
  } else {
    avgSessionMinutes = 55; // Slower DC / 25-30 kW
  }

  // Stalls projected to finish charging and open up between now and arrival
  // Turnover rate = (totalStalls / avgSessionMinutes) stalls per minute
  const projectedClearedSlots = deltaMinutes > 0
    ? Math.floor((deltaMinutes * totalStalls) / avgSessionMinutes)
    : 0;

  // Net vehicles waiting ahead of this driver upon arrival
  // Anyone currently charging or in line minus those who leave before we arrive
  const netVehiclesAhead = Math.max(
    0,
    currentWaitingVehicles + occupiedStalls - projectedClearedSlots - totalStalls + 1
  );

  let waitMinutesAtArrival = 0;
  if (netVehiclesAhead > 0) {
    // If operator authoritative wait time is available and arrival is immediate (within 5 mins), respect it
    if (
      deltaMinutes <= 5 &&
      currentQueueStatus.estimatedWaitMinutes !== null &&
      currentQueueStatus.estimatedWaitMinutes !== undefined &&
      (currentQueueStatus.dataSource === 'operator_managed_queue' ||
        currentQueueStatus.dataSource === 'operator_aggregate_report')
    ) {
      waitMinutesAtArrival = currentQueueStatus.estimatedWaitMinutes;
    } else {
      // Wait until the netVehiclesAhead-th slot becomes available
      waitMinutesAtArrival = Math.round((netVehiclesAhead * avgSessionMinutes) / totalStalls);
    }
  } else if (occupiedStalls === totalStalls && deltaMinutes < 10) {
    // If all stalls are currently full and we arrive in < 10 min, expect brief turnaround wait
    waitMinutesAtArrival = Math.round(avgSessionMinutes / (totalStalls * 2));
  }

  // Calculate estimated plug-in and departure times
  const plugInTimestampMs = arrivalTimestampMs + waitMinutesAtArrival * 60 * 1000;
  const departureTimestampMs = plugInTimestampMs + estChargeMinutes * 60 * 1000;

  const estimatedPlugInTime = formatIstTime(plugInTimestampMs);
  const estimatedDepartureTime = formatIstTime(departureTimestampMs);

  // Confidence & range estimation
  const confidence = evaluateQueueConfidence(
    currentQueueStatus.dataSource,
    currentQueueStatus.updatedAt,
    currentTimestampMs
  );

  const lowerBound = Math.max(0, Math.round(waitMinutesAtArrival * 0.75));
  const upperBound = Math.max(lowerBound + 5, Math.round(waitMinutesAtArrival * 1.25 + 5));
  const waitRange: [number, number] = waitMinutesAtArrival > 0
    ? [lowerBound, upperBound]
    : [0, 5];

  // Human-readable prediction explanation
  let rationale = '';
  if (currentQueueStatus.dataSource === 'simulated_queue') {
    rationale = waitMinutesAtArrival === 0
      ? 'Estimated immediate plug-in based on EVSure simulated queue (Illustrative only).'
      : `Estimated ${waitMinutesAtArrival} min wait (~${netVehiclesAhead} vehicle(s) ahead) based on EVSure simulated queue (Illustrative only, not live).`;
  } else if (waitMinutesAtArrival === 0) {
    rationale = deltaMinutes > 15
      ? `Estimated immediate plug-in at arrival; ${projectedClearedSlots} sessions projected to clear during your ${Math.round(deltaMinutes)} min drive.`
      : `Immediate charger availability reported at ${currentQueueStatus.connectorType} stalls.`;
  } else {
    rationale = `Estimated ${waitMinutesAtArrival} min wait (~${netVehiclesAhead} vehicle(s) ahead) based on ${currentQueueStatus.dataSource.replace('_', ' ')}.`;
  }

  return {
    stationId: station.id,
    connectorType,
    expectedArrivalTime,
    arrivalTimestampMs,
    estimatedWaitAtArrivalMinutes: waitMinutesAtArrival,
    estimatedWaitRange: waitRange,
    estimatedPlugInTime,
    estimatedChargeDurationMinutes: estChargeMinutes,
    estimatedDepartureTime,
    projectedStallsAvailable: Math.max(0, totalStalls - (occupiedStalls - projectedClearedSlots)),
    projectedVehiclesWaiting: netVehiclesAhead,
    confidence,
    dataSource: currentQueueStatus.dataSource,
    predictionRationale: rationale
  };
}

export interface MarkerQueueBadgeInfo {
  label: string;
  badgeText: string;
  badgeClass: string;
  waitingCount: number | null;
  hasData: boolean;
  isStale: boolean;
  connectorType: string;
  availablePoints?: number;
  totalPoints?: number;
  dataSource: QueueDataSource;
  updatedAt?: number;
  isSimulated?: boolean;
}

/**
 * Computes the exact visual queue badge to display on Leaflet map markers
 * Strictly connector-specific according to the driver's vehicle profile.
 */
export function getMarkerQueueBadge(
  queueData: StationQueueData | null | undefined,
  vehicle?: VehicleProfile
): MarkerQueueBadgeInfo {
  const selectedPlugs = vehicle?.selectedPlugTypes || ['CCS'];

  // Default fallback for unmonitored / missing queue data (Clean solid style)
  const unavailableResult: MarkerQueueBadgeInfo = {
    label: 'Queue unknown',
    badgeText: 'Queue unknown',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-600 shadow-sm',
    waitingCount: null,
    hasData: false,
    isStale: false,
    connectorType: 'CCS2',
    dataSource: 'unavailable'
  };

  if (!queueData || !queueData.connectorQueues || queueData.primaryDataSource === 'unavailable') {
    return unavailableResult;
  }

  // Find connector queue matching vehicle's selected plug types
  let matchedConnType = 'CCS2';
  let matchedQueue: ConnectorQueueStatus | null = null;

  for (const plug of selectedPlugs) {
    for (const [cKey, cQueue] of Object.entries(queueData.connectorQueues)) {
      if (areConnectorsCompatible(plug, cKey)) {
        matchedConnType = normalizeConnectorType(cKey);
        matchedQueue = cQueue;
        break;
      }
    }
    if (matchedQueue) break;
  }

  // If no connector queue matches vehicle, check if any connector queue has reports
  if (!matchedQueue) {
    for (const [cKey, cQueue] of Object.entries(queueData.connectorQueues)) {
      if (cQueue.dataSource !== 'unavailable') {
        matchedConnType = normalizeConnectorType(cKey);
        matchedQueue = cQueue;
        break;
      }
    }
    if (!matchedQueue) {
      const firstKey = Object.keys(queueData.connectorQueues)[0];
      if (firstKey) {
        matchedConnType = normalizeConnectorType(firstKey);
        matchedQueue = queueData.connectorQueues[firstKey];
      }
    }
  }

  if (!matchedQueue || matchedQueue.dataSource === 'unavailable') {
    return {
      ...unavailableResult,
      connectorType: matchedConnType
    };
  }

  const isSimulated = matchedQueue.dataSource === 'simulated_queue' || queueData.primaryDataSource === 'simulated_queue';
  const isStale = !isSimulated && (queueData.isStale || Date.now() - matchedQueue.updatedAt > 45 * 60 * 1000);
  const count = matchedQueue.vehiclesWaiting;
  const isPeopleWaiting = Boolean(matchedQueue.peopleWaiting && matchedQueue.peopleWaiting > 0 && count === 0);

  let badgeText = '';
  let label = '';
  let badgeClass = '';

  if (isSimulated) {
    // Feature 1: Prominent SIMULATED indicator on all badges, solid purple styling
    badgeText = `${count} waiting · SIMULATED`;
    label = `Estimated queue: ${count} vehicle${count === 1 ? '' : 's'}`;
    badgeClass = 'bg-violet-700 text-white font-bold border-violet-400 shadow-sm';
  } else if (isPeopleWaiting) {
    const pCount = matchedQueue.peopleWaiting!;
    badgeText = `${pCount} people waiting`;
    label = `${pCount} people waiting`;
    badgeClass = isStale
      ? 'bg-amber-700 text-white border-amber-500'
      : 'bg-amber-500 text-slate-950 font-black border-amber-300 shadow-sm';
  } else if (count === 0) {
    badgeText = '0 waiting';
    label = '0 vehicles reported waiting';
    badgeClass = isStale
      ? 'bg-emerald-800 text-emerald-100 border-emerald-600'
      : 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-sm';
  } else if (count >= 4) {
    badgeText = `${count} waiting`;
    label = `${count} vehicles waiting`;
    badgeClass = isStale
      ? 'bg-rose-800 text-rose-100 border-rose-600'
      : 'bg-rose-600 text-white font-black border-rose-400 shadow-sm';
  } else {
    // 1 to 3 waiting
    badgeText = `${count} waiting`;
    label = `${count} vehicle${count === 1 ? '' : 's'} waiting`;
    badgeClass = isStale
      ? 'bg-amber-700 text-amber-100 border-amber-500'
      : 'bg-amber-500 text-slate-950 font-black border-amber-300 shadow-sm';
  }

  if (isStale) {
    badgeText += ' (stale)';
  }

  return {
    label,
    badgeText,
    badgeClass,
    waitingCount: isPeopleWaiting ? matchedQueue.peopleWaiting! : count,
    hasData: true,
    isStale,
    connectorType: matchedConnType,
    availablePoints: matchedQueue.availablePoints,
    totalPoints: matchedQueue.totalPoints,
    dataSource: matchedQueue.dataSource,
    updatedAt: matchedQueue.updatedAt,
    isSimulated
  };
}

/**
 * Client service API to interact with backend queue proxy endpoints
 */
export const chargingQueueService = {
  /**
   * Fetches latest queue data and connector breakdown for a station
   */
  async getStationQueueData(stationId: string): Promise<StationQueueData | null> {
    try {
      const res = await fetch(`/api/queue/station/${encodeURIComponent(stationId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.primaryDataSource !== 'unavailable') {
          return data;
        }
      }
    } catch {
      // Fall through to simulated fallback
    }

    if (simulatedQueueService.isSimulationEnabled()) {
      return simulatedQueueService.getOrGenerateSimulatedQueue(stationId);
    }
    return null;
  },

  /**
   * Batch fetches queue data for multiple station IDs to minimize network roundtrips
   * Strict Precedence: Operator > Community > Simulated fallback > Unavailable
   */
  async getBatchStationQueueData(ids: string[]): Promise<Record<string, StationQueueData>> {
    if (!ids || ids.length === 0) return {};
    const result: Record<string, StationQueueData> = {};

    try {
      const res = await fetch(`/api/queue/stations?ids=${encodeURIComponent(ids.join(','))}`);
      if (res.ok) {
        const data = await res.json();
        const serverQueues = data.queues || {};
        for (const [id, q] of Object.entries(serverQueues as Record<string, StationQueueData>)) {
          if (q && q.primaryDataSource !== 'unavailable') {
            result[id] = q;
          }
        }
      }
    } catch {
      // Continue to simulated queue fallback
    }

    // Apply simulated queue fallback for unmonitored stations along the route
    if (simulatedQueueService.isSimulationEnabled()) {
      for (const id of ids) {
        if (!result[id]) {
          const sim = simulatedQueueService.getOrGenerateSimulatedQueue(id);
          if (sim) {
            result[id] = sim;
          }
        }
      }
    }

    return result;
  },

  /**
   * Submits a voluntary community queue report
   */
  async submitReport(submission: QueueReportSubmission): Promise<{ success: boolean; message: string; report?: CommunityQueueReport }> {
    try {
      const res = await fetch('/api/queue/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      });
      const data = await res.json();
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Network failure submitting report'
      };
    }
  }
};

export const getBatchStationQueueData = (ids: string[]) => chargingQueueService.getBatchStationQueueData(ids);
