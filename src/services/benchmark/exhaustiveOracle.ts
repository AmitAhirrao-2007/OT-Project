/**
 * Exhaustive Enumeration Correctness Oracle
 * Phase 6: Academic ground-truth verification engine for small-scale EV routing graphs.
 *
 * Independently enumerates all feasible charging sequences and discrete target SoCs
 * without label-setting dominance pruning, to establish the exact theoretical optimum.
 */

import { VehicleProfile } from '../../types/vehicle';
import { calculateLegEnergy, calculateChargingDuration } from '../energyModel';

export interface OracleCandidateStation {
  id: string;
  name: string;
  distFromOriginMi: number;
  detourMi: number;
  powerKw: number;
  pricePerKwh: number;
  isAccessible: boolean;
}

export interface OracleScenario {
  totalDistanceMi: number;
  initialSoc: number;
  minChargerReserve: number;
  minDestReserve: number;
  maxChargeLimit: number;
  vehicle: VehicleProfile;
  stations: OracleCandidateStation[];
  discretizationStepPercent?: number;
}

export interface OracleSolution {
  stops: {
    stationId: string;
    arrivalSoc: number;
    targetSoc: number;
    chargeMinutes: number;
    costInr: number;
  }[];
  totalDrivingMinutes: number;
  totalChargingMinutes: number;
  totalStopBufferMinutes: number;
  totalDetourMinutes: number;
  totalJourneyMinutes: number;
  totalCostInr: number;
  destinationArrivalSoc: number;
  isFeasible: boolean;
}

export interface OracleBenchmarkResult {
  exactOptimum: OracleSolution | null;
  totalConfigurationsEvaluated: number;
  feasibleConfigurationsCount: number;
}

/**
 * Runs brute-force exhaustive enumeration over all possible stop combinations and target SoCs.
 */
export function solveExhaustiveOracle(scenario: OracleScenario): OracleBenchmarkResult {
  const {
    totalDistanceMi,
    initialSoc,
    minChargerReserve,
    minDestReserve,
    maxChargeLimit,
    vehicle,
    stations,
    discretizationStepPercent = 5
  } = scenario;

  // Filter accessible stations sorted by forward distance along corridor
  const eligibleStations = stations
    .filter((s) => s.isAccessible)
    .sort((a, b) => a.distFromOriginMi - b.distFromOriginMi);

  let bestSolution: OracleSolution | null = null;
  let totalEvaluated = 0;
  let feasibleCount = 0;

  // Recursive search over station subsets
  function searchPaths(
    currentStationIdx: number,
    currentDist: number,
    currentSoc: number,
    accumulatedTime: number,
    accumulatedCost: number,
    stopsTaken: OracleSolution['stops'],
    totalChargeMins: number,
    totalDetourMins: number
  ) {
    // 1. Can we reach the final destination directly from here?
    const distToDest = totalDistanceMi - currentDist;
    const destEnergy = calculateLegEnergy({ distanceMi: distToDest, vehicle });
    const destArrivalSoc = Number((currentSoc - destEnergy.socPercent).toFixed(1));
    const destDriveMins = Math.round(distToDest * 1.33);

    totalEvaluated++;

    if (destArrivalSoc >= minDestReserve) {
      feasibleCount++;
      const stopBufferMins = stopsTaken.length * 5;
      const totalJourney = accumulatedTime + destDriveMins + stopBufferMins;

      // Lexicographic check: 1) Min Time, 2) Min Cost, 3) Fewest Stops
      let isBetter = false;
      if (!bestSolution) {
        isBetter = true;
      } else if (totalJourney < bestSolution.totalJourneyMinutes) {
        isBetter = true;
      } else if (totalJourney === bestSolution.totalJourneyMinutes) {
        if (accumulatedCost < bestSolution.totalCostInr) {
          isBetter = true;
        } else if (accumulatedCost === bestSolution.totalCostInr) {
          isBetter = stopsTaken.length < bestSolution.stops.length;
        }
      }

      if (isBetter) {
        bestSolution = {
          stops: [...stopsTaken],
          totalDrivingMinutes: Math.round(totalDistanceMi * 1.33),
          totalChargingMinutes: totalChargeMins,
          totalStopBufferMinutes: stopBufferMins,
          totalDetourMinutes: totalDetourMins,
          totalJourneyMinutes: totalJourney,
          totalCostInr: Math.round(accumulatedCost),
          destinationArrivalSoc: destArrivalSoc,
          isFeasible: true
        };
      }
    }

    // 2. Branch forward to each subsequent candidate station ahead
    for (let nextIdx = currentStationIdx + 1; nextIdx < eligibleStations.length; nextIdx++) {
      const nextStation = eligibleStations[nextIdx];
      const legDist = nextStation.distFromOriginMi - currentDist;
      if (legDist <= 0) continue;

      const legEnergy = calculateLegEnergy({ distanceMi: legDist, vehicle });
      const arrivalSoc = Number((currentSoc - legEnergy.socPercent).toFixed(1));

      // Battery reachability constraint
      if (arrivalSoc < minChargerReserve) continue;

      const legDriveMins = Math.round(legDist * 1.33);
      const detourDriveMins = Math.round(nextStation.detourMi * 1.33);
      const actualPowerKw = Math.min(vehicle.maxDcChargingKw, nextStation.powerKw);

      // Enumerate all discrete target SoCs at this station
      const step = discretizationStepPercent;
      for (
        let targetSoc = Math.max(arrivalSoc + step, arrivalSoc);
        targetSoc <= maxChargeLimit;
        targetSoc += step
      ) {
        const chargeEstimate = calculateChargingDuration({
          usableCapacityKwh: vehicle.usableBatteryKwh,
          degradationPercent: vehicle.batteryDegradationPercent,
          maxDcChargingKw: actualPowerKw,
          stationPowerKw: nextStation.powerKw,
          currentSocPercent: Math.max(0, arrivalSoc),
          targetSocPercent: targetSoc
        });

        const chargeMinutes = Math.max(5, chargeEstimate.durationMinutes);
        const costInr = chargeEstimate.energyAddedKwh * nextStation.pricePerKwh;

        const newStop = {
          stationId: nextStation.id,
          arrivalSoc,
          targetSoc,
          chargeMinutes,
          costInr
        };

        searchPaths(
          nextIdx,
          nextStation.distFromOriginMi,
          targetSoc,
          accumulatedTime + legDriveMins + chargeMinutes + detourDriveMins,
          accumulatedCost + costInr,
          [...stopsTaken, newStop],
          totalChargeMins + chargeMinutes,
          totalDetourMins + detourDriveMins
        );
      }
    }
  }

  // Initiate search from origin
  searchPaths(-1, 0, initialSoc, 0, 0, [], 0, 0);

  return {
    exactOptimum: bestSolution,
    totalConfigurationsEvaluated: totalEvaluated,
    feasibleConfigurationsCount: feasibleCount
  };
}
