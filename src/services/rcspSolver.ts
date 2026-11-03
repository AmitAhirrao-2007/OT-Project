// RCSP Solver for EV Route Planner
// Implements a label‑setting algorithm for the Resource‑Constrained Shortest Path problem.
// The implementation is deliberately lightweight: it uses the existing energyModel for
// energy consumption and charging duration, and it approximates road distances with
// haversine distances (straight‑line) because the application does not have OSRM data
// for arbitrary station‑to‑station legs. This limitation is documented in the
// accompanying report.

import { RouteCalculationRequest, RouteOption, ChargingStop } from "../types/route";
import { ChargingStation } from "../types/station";
import { chargingStations } from "../data/stationCatalogue";
import { getEligibleStations, projectStationOnPolyline, haversineDistanceMi } from "../utils/geoUtils";
import { formatHoursMinutes, addMinutesToTimeString, parseDurationStringToMinutes } from "../utils/timeUtils";
import {
  calculateLegEnergy,
  calculateChargingDuration,
} from "./energyModel";
import {
  validateStationRoadAccess,
  evaluateBackupCharger,
  RoadAccessValidationResult
} from "./roadAccessService";
import {
  classifyTariff,
  classifyStallAvailability,
  normalizeNetworkName
} from "./catalogueService";
import { globalLiveDataService } from "./providers/liveDataService";

// ---------------------------------------------------------------------------
// Types used internally by the solver
// ---------------------------------------------------------------------------
interface RcspNode {
  id: string; // "origin", station.id, "dest"
  type: "origin" | "station" | "dest";
  coordinates: [number, number]; // [lat, lng]
  // For stations only
  station?: ChargingStation;
  // Distance from origin along the route (miles). For origin = 0, destination = totalRoadDist.
  distFromOriginMi: number;
  detourMi?: number;
  accessValidation?: RoadAccessValidationResult;
}

interface RcspLabel {
  nodeId: string;
  soc: number; // percentage remaining after arriving at this node (before possible charging)
  time: number; // accumulated minutes (driving + charging + stop buffers)
  cost: number; // accumulated INR cost
  // Sequence of stops taken so far (excluding current node if it is a station that will be charged later)
  stops: ChargingStop[];
}

// ---------------------------------------------------------------------------
// Solver implementation
// ---------------------------------------------------------------------------
export function solveRcsp(req: RouteCalculationRequest): RouteOption | null {
  const { origin, destination, waypoints = [], vehicle, planOptions, chargingSettings, communitySummaries } = req;

  // -----------------------------------------------------------------------
  // 1. Build candidate nodes (origin, eligible stations, destination)
  // -----------------------------------------------------------------------
  const initialSoc = origin.batterySoc !== undefined ? origin.batterySoc : 95;
  const minChargerReserve = chargingSettings.preferredMinArrivalBatteryCharger ?? 10;
  const minDestReserve =
    planOptions.destinationArrivalSoc ??
    chargingSettings.preferredMinArrivalBatteryDestination ??
    10;
  const maxChargeLimit = Math.min(100, chargingSettings.maximumChargeLimit ?? 100);

  // Use the same eligibility logic as the greedy algorithm, reconciled with live telemetry.
  const stationsToUse = globalLiveDataService.getReconciledStations(chargingStations);
  const eligibleStations = getEligibleStations(stationsToUse, vehicle, planOptions, chargingSettings);

  // Determine the baseline corridor polyline and distance
  const polyline: [number, number][] = [
    origin.coordinates,
    ...waypoints.map((w) => w.coordinates),
    destination.coordinates
  ];

  let baselineDistanceMi = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    baselineDistanceMi += haversineDistanceMi(polyline[i], polyline[i + 1]);
  }
  baselineDistanceMi = Math.max(1, Math.round(baselineDistanceMi));

  // Origin node
  const nodes: RcspNode[] = [
    { id: "origin", type: "origin", coordinates: origin.coordinates, distFromOriginMi: 0 },
  ];

  // Project stations onto the polyline.
  for (const st of eligibleStations) {
    const proj = projectStationOnPolyline(st.coordinates, polyline);
    // Only consider stations that are reasonably close to the line (same cutoff as greedy)
    if (proj.detourMi <= 25 && proj.distFromOriginMi > 5 && proj.distFromOriginMi < baselineDistanceMi - 5) {
      // Validate road accessibility and carriageway compatibility
      const access = validateStationRoadAccess(st, polyline, proj.distFromOriginMi, proj.detourMi);
      if (access.isAccessible) {
        nodes.push({
          id: `station-${st.id}`,
          type: "station",
          coordinates: st.coordinates,
          station: st,
          distFromOriginMi: proj.distFromOriginMi,
          detourMi: access.actualDetourMi,
          accessValidation: access,
        });
      }
    }
  }

  // Destination node
  nodes.push({ id: "dest", type: "dest", coordinates: destination.coordinates, distFromOriginMi: baselineDistanceMi });

  // Sort nodes by progression along the route.
  nodes.sort((a, b) => a.distFromOriginMi - b.distFromOriginMi);

  // -----------------------------------------------------------------------
  // 2. Label‑setting algorithm (front‑to‑back propagation)
  // -----------------------------------------------------------------------
  // Map from node id to array of nondominated labels.
  const labelMap = new Map<string, RcspLabel[]>();

  // Insert initial label at origin.
  const originLabel: RcspLabel = {
    nodeId: "origin",
    soc: initialSoc,
    time: 0,
    cost: 0,
    stops: [],
  };
  labelMap.set("origin", [originLabel]);

  // Process nodes in order of distFromOrigin (ensures forward progression, no cycles).
  for (let i = 0; i < nodes.length; i++) {
    const curNode = nodes[i];
    const curLabels = labelMap.get(curNode.id) ?? [];
    if (curLabels.length === 0) continue; // nothing to expand from this node

    // Expand each label to every later node.
    for (let j = i + 1; j < nodes.length; j++) {
      const nextNode = nodes[j];
      const legDist = nextNode.distFromOriginMi - curNode.distFromOriginMi;
      if (legDist <= 0) continue;

      // Approximate driving time: 1.33 minutes per mile (same factor used elsewhere).
      const legDriveMinutes = Math.round(legDist * 1.33);

      // Compute energy needed for this leg.
      const legEnergy = calculateLegEnergy({ distanceMi: legDist, vehicle });

      for (const label of curLabels) {
        // Check if we have enough SOC to reach next node.
        const arrivalSocRaw = label.soc - legEnergy.socPercent;
        const arrivalSoc = Number(arrivalSocRaw.toFixed(1));
        const reserve = nextNode.type === "station" ? minChargerReserve : minDestReserve;
        if (arrivalSoc < reserve) continue; // infeasible transition

        // -------------------------------------------------------------------
        // a) If next node is destination – finish the path.
        // -------------------------------------------------------------------
        if (nextNode.type === "dest") {
          const finalTime = label.time + legDriveMinutes;
          const finalLabel: RcspLabel = {
            nodeId: "dest",
            soc: arrivalSoc,
            time: finalTime,
            cost: label.cost,
            stops: label.stops,
          };
          // Store at destination (will be evaluated after the loop).
          const existing = labelMap.get("dest") ?? [];
          if (isLabelDominated(finalLabel, existing)) continue;
          const kept = pruneDominated(finalLabel, existing);
          labelMap.set("dest", kept);
          continue;
        }

        // -------------------------------------------------------------------
        // b) If next node is a charging station – we may choose a target SOC after charging.
        // -------------------------------------------------------------------
        const station = nextNode.station!;
        // Determine allowed charging power (vehicle vs station).
        const actualPowerKw = Math.min(vehicle.maxDcChargingKw, station.ratedPowerKw);
        // Enumerate possible target SOC values. To keep runtime reasonable we step
        // by 5% increments by default (or user/test specified discretization resolution, e.g. 1%, 2%, 5%).
        const step = Math.max(1, Math.min(20, planOptions.socDiscretizationStepPercent || 5));
        for (let targetSoc = Math.max(arrivalSoc + step, arrivalSoc); targetSoc <= maxChargeLimit; targetSoc += step) {
          const chargeEstimate = calculateChargingDuration({
            usableCapacityKwh: vehicle.usableBatteryKwh,
            degradationPercent: vehicle.batteryDegradationPercent,
            maxDcChargingKw: actualPowerKw,
            stationPowerKw: station.ratedPowerKw,
            currentSocPercent: Math.max(0, arrivalSoc),
            targetSocPercent: targetSoc,
          });
          const chargeMinutes = Math.max(5, chargeEstimate.durationMinutes);
          const stopBuffer = 5; // per stop overhead as in greedy implementation
          const detourDriveMinutes = Math.round((nextNode.detourMi || 0) * 1.33);
          const queueWait = req.queueWaitMinutesMap?.get(station.id) ?? 0;

          const newTime = label.time + legDriveMinutes + chargeMinutes + stopBuffer + detourDriveMinutes + queueWait;
          const newCost = label.cost + Math.round(chargeEstimate.energyAddedKwh * (station.pricePerKwh ? parseFloat(station.pricePerKwh.replace(/[^0-9.]/g, "")) : 21));

          const backupEval = evaluateBackupCharger(
            station,
            chargingStations,
            vehicle,
            arrivalSoc,
            communitySummaries,
            minChargerReserve
          );

          const commSummary = communitySummaries?.get(station.id);

          const stop: ChargingStop = {
            id: `rcsp-stop-${station.id}-${label.stops.length + 1}`,
            stationId: station.id,
            name: station.name,
            network: station.network,
            address: station.address,
            coordinates: station.coordinates,
            powerKw: station.ratedPowerKw,
            stallsTotal: station.totalStalls,
            stallsAvailable: station.availableStalls,
            arrivalTime: "", // will be filled later in reconstruction
            departureTime: "",
            arrivalSoc,
            departureSoc: targetSoc,
            chargeDurationMinutes: chargeMinutes,
            energyAddedKwh: chargeEstimate.energyAddedKwh,
            legDriveDuration: formatHoursMinutes(legDriveMinutes),
            legDistanceMi: legDist,
            amenities: station.amenities,
            priceEstimate: station.pricePerKwh,
            isFeasible: true,
            isPreferred: (planOptions.preferredNetworks || chargingSettings.preferredNetworks || []).includes(station.network),
            isExcluded: false,
            roadAccessStatus: nextNode.accessValidation?.accessStatus || station.accessMetadata?.roadAccessStatus || 'estimated',
            carriagewayAccess: nextNode.accessValidation?.carriageway || station.accessMetadata?.carriagewayAccess,
            entranceCoordinates: nextNode.accessValidation?.entranceCoordinates || station.accessMetadata?.entranceCoordinates,
            actualDetourMi: nextNode.detourMi ?? nextNode.accessValidation?.actualDetourMi,
            backupStationId: backupEval.backupStationId,
            backupStationName: backupEval.backupStationName,
            backupReachable: backupEval.backupReachable,
            reachabilityClassification: backupEval.reachabilityClassification,
            communityReliabilityScore: commSummary?.overallScore ?? null,
            communityConfidenceTier: commSummary?.confidenceTier ?? 'insufficient_evidence',
            communityWarning: commSummary?.activeWarnings?.[0],
            communityQueueMinutes: commSummary?.queueEstimate?.estimatedWaitMinutes,
            cpoConflict: commSummary?.cpoConflict,
            accessRestrictions: nextNode.accessValidation?.accessRestrictions,
            accessNotes: nextNode.accessValidation?.accessNotes,
            // Data quality and provenance metadata
            canonicalNetwork: normalizeNetworkName(station.network).canonicalNetwork,
            tariffClassification: classifyTariff(station.pricePerKwh).classification,
            stallAvailabilityStatus: classifyStallAvailability(station.totalStalls, station.availableStalls).status,
            provenanceConfidence: station.accessMetadata?.accessConfidence ?? 0.8
          };

          const newLabel: RcspLabel = {
            nodeId: nextNode.id,
            soc: targetSoc,
            time: newTime,
            cost: newCost,
            stops: [...label.stops, stop],
          };

          // Dominance pruning at the station node.
          const existingLabels = labelMap.get(nextNode.id) ?? [];
          if (isLabelDominated(newLabel, existingLabels)) continue;
          const kept = pruneDominated(newLabel, existingLabels);
          labelMap.set(nextNode.id, kept);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // 3. Choose the best label at destination.
  // Lexicographic multi-objective:
  // Primary: minimum total validated journey time
  // Secondary: minimum charging expense
  // Tertiary: fewest charging stops
  // Quaternary: maximum average community reliability (tie-breaker)
  // -----------------------------------------------------------------------
  const destLabels = labelMap.get("dest") ?? [];
  if (destLabels.length === 0) return null; // no feasible route
  const best = destLabels.reduce((a, b) => {
    if (a.time !== b.time) return a.time < b.time ? a : b;
    if (a.cost !== b.cost) return a.cost < b.cost ? a : b;
    if (a.stops.length !== b.stops.length) return a.stops.length < b.stops.length ? a : b;
    const relA = a.stops.reduce((sum, s) => sum + (s.communityReliabilityScore ?? 75), 0) / Math.max(1, a.stops.length);
    const relB = b.stops.reduce((sum, s) => sum + (s.communityReliabilityScore ?? 75), 0) / Math.max(1, b.stops.length);
    return relA >= relB ? a : b;
  });

  // -----------------------------------------------------------------------
  // 4. Build the RouteOption response with fully reconstructed stop timings.
  // -----------------------------------------------------------------------
  let currentTime = origin.departureTime || '08:00 AM';
  const reconstructedStops: ChargingStop[] = best.stops.map((stop) => {
    const legDriveMins = parseDurationStringToMinutes(stop.legDriveDuration);
    const arrivalTime = addMinutesToTimeString(currentTime, legDriveMins);
    const departureTime = addMinutesToTimeString(arrivalTime, stop.chargeDurationMinutes);
    currentTime = departureTime;
    return {
      ...stop,
      arrivalTime,
      departureTime
    };
  });

  const totalDrivingMinutes = best.time - best.stops.reduce((sum, s) => sum + s.chargeDurationMinutes + 5, 0);
  const totalChargingMinutes = best.stops.reduce((sum, s) => sum + s.chargeDurationMinutes, 0);
  const stopBufferMinutes = best.stops.length * 5;

  const routeOption: RouteOption = {
    id: "route-rcsp",
    label: formatHoursMinutes(best.time),
    badge: "RCSP Optimal",
    description: `RCSP Optimizer (${reconstructedStops.length} stops)`,
    totalDuration: formatHoursMinutes(best.time),
    totalDurationMinutes: best.time,
    drivingDuration: formatHoursMinutes(totalDrivingMinutes),
    drivingDurationMinutes: totalDrivingMinutes,
    chargingDuration: formatHoursMinutes(totalChargingMinutes),
    chargingDurationMinutes: totalChargingMinutes,
    stopBufferDuration: formatHoursMinutes(stopBufferMinutes),
    stopBufferMinutes,
    totalDistanceMi: baselineDistanceMi,
    stopCount: reconstructedStops.length,
    totalEnergyKwh: Math.round((baselineDistanceMi * vehicle.referenceConsumptionWhPerMi) / 1000),
    estimatedExpenseInr: Math.round(best.cost),
    stops: reconstructedStops,
    polylineCoordinates: polyline,
    isFeasible: true,
    calculationMethod: "RCSP Optimizer",
    geometrySource: "estimated",
    roadValidated: false
  };

  return routeOption;
}

// ---------------------------------------------------------------------------
// Helper: dominance test – a label dominates another if it has at least as much
// remaining SOC, not higher total time, not higher cost, and not more stops.
// ---------------------------------------------------------------------------
function isLabelDominated(candidate: RcspLabel, existing: RcspLabel[]): boolean {
  for (const lab of existing) {
    if (
      lab.soc >= candidate.soc &&
      lab.time <= candidate.time &&
      lab.cost <= candidate.cost &&
      lab.stops.length <= candidate.stops.length
    ) {
      return true;
    }
  }
  return false;
}

function pruneDominated(candidate: RcspLabel, existing: RcspLabel[]): RcspLabel[] {
  // Remove any existing label that is strictly dominated by candidate
  const kept: RcspLabel[] = [];
  for (const lab of existing) {
    if (
      !(
        candidate.soc >= lab.soc &&
        candidate.time <= lab.time &&
        candidate.cost <= lab.cost &&
        candidate.stops.length <= lab.stops.length
      )
    ) {
      kept.push(lab);
    }
  }
  kept.push(candidate);
  return kept;
}

// ---------------------------------------------------------------------------
// Note on limitations:
// - Road distances between intermediate waypoints are approximated with haversine
//   straight‑line distances. The UI already distinguishes "Energy‑Constrained Path
//   Simulation" when OSRM geometry is unavailable, so this behavior is consistent.
// - Time per mile uses the same 1.33 min/mi factor as the greedy implementation.
// - Charging power is limited to the minimum of vehicle max DC kw and station
//   ratedPowerKw; the minimum‑power floor introduced in Phase 3 has been removed.
// - The solver works with 5 % SOC increments to keep the state‑space tractable.
//   This discretisation may cause a small deviation from a truly continuous
//   optimum; the report documents the trade‑off.
// ---------------------------------------------------------------------------

