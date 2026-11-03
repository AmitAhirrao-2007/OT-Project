import {
  ChargingStop,
  RouteOption,
  RouteGeometryStatus,
  Waypoint,
  RouteCalculationRequest,
  InfeasibilityDetails
} from '../types/route';
import { ChargingStation } from '../types/station';
import { chargingStations } from '../data/stationCatalogue';
import { calculateChargingDuration, calculateLegEnergy, checkLegFeasibility } from './energyModel';
import { demoTrip } from '../data/demoRoute';
import { solveRcsp } from './rcspSolver';
import {
  validateStationRoadAccess,
  evaluateBackupCharger,
  RoadAccessValidationResult
} from './roadAccessService';
import {
  classifyTariff,
  classifyStallAvailability,
  normalizeNetworkName
} from './catalogueService';
import { globalLiveDataService } from './providers/liveDataService';
import {
  formatHoursMinutes,
  parseDurationStringToMinutes,
  parsePricePerKwh,
  addMinutesToTimeString
} from '../utils/timeUtils';
import {
  haversineDistanceMi,
  getEligibleStations,
  projectStationOnPolyline
} from '../utils/geoUtils';
import {
  calculateTomTomTrafficRoute,
  calculateRoadRouteAlternatives,
  CandidateRoadPath
} from './traffic/trafficService';
import { TrafficRouteSummary } from '../types/traffic';

export {
  formatHoursMinutes,
  parseDurationStringToMinutes,
  parsePricePerKwh,
  addMinutesToTimeString,
  haversineDistanceMi,
  getEligibleStations,
  projectStationOnPolyline
};

export type { RouteCalculationRequest };

export interface RouteCalculationResult {
  routeOptions: RouteOption[];
  activeRouteId: string;
}


/**
 * Checks whether the requested journey strictly corresponds to the Patna-to-Delhi demonstration corridor.
 * Requires both origin and destination latitude AND longitude to match within ~25 km tolerance,
 * and direction to be Patna -> Delhi with no custom waypoints.
 */
export function isDefaultPatnaDelhiCorridor(
  origin: Waypoint,
  destination: Waypoint,
  waypoints: Waypoint[] = []
): boolean {
  if (waypoints.length > 0) return false;

  // The demo corridor is strictly for the exact default "Patna" to "Delhi" trip.
  // If the user selects a specific street address, locality (e.g. Kankarbagh), or custom place,
  // it must use dynamic routing with their exact coordinates.
  if (origin.isCustom || destination.isCustom) return false;
  if (origin.name !== 'Patna' || (destination.name !== 'Delhi' && destination.name !== 'New Delhi')) {
    return false;
  }

  const PATNA: [number, number] = [25.5941, 85.1376];
  const DELHI: [number, number] = [28.6139, 77.2090];
  const tol = 0.05; // strict coordinate match for the calibrated demo fixture

  const originMatchesPatna =
    Math.abs(origin.coordinates[0] - PATNA[0]) < tol &&
    Math.abs(origin.coordinates[1] - PATNA[1]) < tol;

  const destMatchesDelhi =
    Math.abs(destination.coordinates[0] - DELHI[0]) < tol &&
    Math.abs(destination.coordinates[1] - DELHI[1]) < tol;

  return originMatchesPatna && destMatchesDelhi;
}

/**
 * Attempts to fetch real road geometries and road distance from OSRM driving service.
 * Enforces a strict 3.5s timeout. Returns null on timeout or network error.
 */
export async function fetchRoadGeometry(
  points: [number, number][]
): Promise<{
  coordinates: [number, number][];
  distanceMi: number;
  durationMinutes: number;
  legs?: { distanceMi: number; durationMinutes: number }[];
} | null> {
  if (points.length < 2) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const coordsStr = points.map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const geojsonCoords: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] // convert [lon, lat] -> [lat, lon]
    );

    const distanceMi = route.distance * 0.000621371; // meters to miles
    const durationMinutes = route.duration / 60; // seconds to minutes

    const legs = Array.isArray(route.legs)
      ? route.legs.map((l: { distance: number; duration: number }) => ({
          distanceMi: Math.max(1, Math.round(l.distance * 0.000621371)),
          durationMinutes: Math.max(1, Math.round(l.duration / 60))
        }))
      : undefined;

    return {
      coordinates: geojsonCoords,
      distanceMi: Math.max(1, Math.round(distanceMi)),
      durationMinutes: Math.max(1, Math.round(durationMinutes)),
      legs
    };
  } catch {
    return null;
  }
}


/**
 * Recomputes the Patna-to-Delhi demonstration fixture with full physical battery feasibility,
 * genuine vehicle charging capabilities, station tariff data, and arrival timing.
 */
function replanPatnaDelhiFixture(req: RouteCalculationRequest): RouteCalculationResult {
  const { origin, destination, vehicle, planOptions, chargingSettings, routingSettings } = req;
  const initialSoc = origin.batterySoc !== undefined ? origin.batterySoc : 95;
  const minChargerReserve = chargingSettings.preferredMinArrivalBatteryCharger || 10;
  const minDestReserve =
    planOptions.destinationArrivalSoc ||
    chargingSettings.preferredMinArrivalBatteryDestination ||
    10;
  const maxChargeLimit = Math.min(100, chargingSettings.maximumChargeLimit || 100);
  const preferred = planOptions.preferredNetworks || chargingSettings.preferredNetworks || [];
  const avoided = chargingSettings.avoidedNetworks || [];
  const excluded = chargingSettings.excludedChargers || [];

  const updatedOptions = demoTrip.routeOptions.map((opt) => {
    let currentSoc = initialSoc;
    let accumulatedTime = origin.departureTime || '12:31 AM';
    let allStopsFeasible = true;
    let totalExpenseInr = 0;

    const updatedStops: ChargingStop[] = opt.stops.map((stop) => {
      const isExcluded = excluded.includes(stop.stationId) || avoided.includes(stop.network);
      const isPreferred = preferred.includes(stop.network);

      // 1. Calculate leg energy consumption based on active vehicle
      const legDriveMinutes = parseDurationStringToMinutes(stop.legDriveDuration);
      const legFeasibility = checkLegFeasibility(
        currentSoc,
        stop.legDistanceMi,
        vehicle,
        minChargerReserve
      );

      const arrivalSoc = legFeasibility.arrivalSoc;
      const legFeasible = legFeasibility.isFeasible && !isExcluded;
      if (!legFeasible) {
        allStopsFeasible = false;
      }

      // 2. Target departure SoC respects maximum charge limit and strategy
      let targetSoc = Math.min(maxChargeLimit, Math.max(arrivalSoc + 20, stop.departureSoc));
      if (opt.id === 'route-fewest') {
        targetSoc = Math.min(maxChargeLimit, Math.max(targetSoc, 85));
      } else if (opt.id === 'route-fewer') {
        targetSoc = Math.min(maxChargeLimit, Math.max(targetSoc, 78));
      }

      // 3. Calculate charging duration using actual vehicle maxDcChargingKw
      const actualChargingPowerKw = Math.min(vehicle.maxDcChargingKw, stop.powerKw);
      const chargeEstimate = calculateChargingDuration({
        usableCapacityKwh: vehicle.usableBatteryKwh,
        degradationPercent: vehicle.batteryDegradationPercent,
        maxDcChargingKw: actualChargingPowerKw,
        stationPowerKw: stop.powerKw,
        currentSocPercent: Math.max(0, arrivalSoc),
        targetSocPercent: targetSoc
      });

      const chargeMinutes = Math.max(5, chargeEstimate.durationMinutes);
      const arrivalTime = addMinutesToTimeString(accumulatedTime, legDriveMinutes);
      const departureTime = addMinutesToTimeString(arrivalTime, chargeMinutes);
      accumulatedTime = departureTime;

      // 4. Calculate cost from genuine station pricing
      const tariffPerKwh = parsePricePerKwh(stop.priceEstimate);
      const energyAdded = chargeEstimate.energyAddedKwh;
      totalExpenseInr += Math.round(energyAdded * tariffPerKwh);

      // Advance battery SoC for next leg
      currentSoc = targetSoc;

      const commSummary = req.communitySummaries?.get(stop.stationId);

      return {
        ...stop,
        stallsAvailable: stop.stallsAvailable !== undefined ? stop.stallsAvailable : undefined,
        powerKw: stop.powerKw,
        arrivalSoc,
        departureSoc: targetSoc,
        chargeDurationMinutes: chargeMinutes,
        energyAddedKwh: energyAdded,
        arrivalTime,
        departureTime,
        isFeasible: legFeasible,
        isPreferred,
        isExcluded,
        communityReliabilityScore: commSummary?.overallScore ?? stop.communityReliabilityScore ?? null,
        communityConfidenceTier: commSummary?.confidenceTier ?? stop.communityConfidenceTier ?? 'insufficient_evidence',
        communityWarning: commSummary?.activeWarnings?.[0] ?? stop.communityWarning,
        communityQueueMinutes: commSummary?.queueEstimate?.estimatedWaitMinutes ?? stop.communityQueueMinutes,
        cpoConflict: commSummary?.cpoConflict ?? stop.cpoConflict
      };
    });

    // Final leg to destination
    const stopsDistSum = updatedStops.reduce((sum, s) => sum + s.legDistanceMi, 0);
    const finalLegDist = Math.max(15, opt.totalDistanceMi - stopsDistSum);
    const finalLegEnergy = calculateLegEnergy({ distanceMi: finalLegDist, vehicle });
    const destArrivalSoc = Number((currentSoc - finalLegEnergy.socPercent).toFixed(1));
    const destFeasible = destArrivalSoc >= minDestReserve;

    if (!destFeasible) {
      allStopsFeasible = false;
    }

    let infeasibilityDetails: InfeasibilityDetails | undefined = undefined;
    if (!allStopsFeasible) {
      let lastFeasibleIdx = -1;
      for (let i = 0; i < updatedStops.length; i++) {
        if (updatedStops[i].isFeasible && updatedStops[i].arrivalSoc >= minChargerReserve) {
          lastFeasibleIdx = i;
        } else {
          break;
        }
      }

      const lastStop = lastFeasibleIdx >= 0 ? updatedStops[lastFeasibleIdx] : undefined;
      const lastCoord = lastStop ? lastStop.coordinates : origin.coordinates;
      const remainingMiles = Math.max(1, Math.round(haversineDistanceMi(lastCoord, destination.coordinates)));
      const remainingEnergyKwh = Math.round(((remainingMiles * vehicle.referenceConsumptionWhPerMi) / 1000) * 10) / 10;
      const requiredSocPercent = Math.min(100, Math.round((remainingEnergyKwh / vehicle.usableBatteryKwh) * 100));

      infeasibilityDetails = {
        lastReachableStation: lastStop ? {
          id: lastStop.stationId,
          name: lastStop.name,
          coordinates: lastStop.coordinates,
          arrivalSoc: lastStop.arrivalSoc
        } : undefined,
        remainingDistanceMi: remainingMiles,
        remainingEnergyKwh,
        requiredSocPercent,
        reason: lastStop
          ? `Battery depleted after charging at "${lastStop.name}". Next leg to destination requires ${remainingEnergyKwh} kWh (${requiredSocPercent}% SoC), exceeding available battery reserve.`
          : `Battery depleted before reaching first charging stop or destination. Required range is ${remainingMiles} mi (${remainingEnergyKwh} kWh).`,
        suggestedAction: initialSoc < 90
          ? `Charge vehicle to 100% SoC before departure (currently ${initialSoc}%).`
          : `Add an intermediate charging stop or lower minimum arrival battery reserve.`
      };
    }

    const chargingDurationMinutes = updatedStops.reduce((sum, s) => sum + s.chargeDurationMinutes, 0);
    const stopBufferMinutes = updatedStops.length * 5;
    const totalDurationMinutes = opt.drivingDurationMinutes + chargingDurationMinutes + stopBufferMinutes;
    const totalDurationStr = formatHoursMinutes(totalDurationMinutes);

    const demoTrafficSummary: TrafficRouteSummary = {
      status: 'unavailable',
      provider: 'TomTom Orbis Traffic',
      trafficTravelTimeMinutes: opt.drivingDurationMinutes,
      freeFlowTravelTimeMinutes: opt.drivingDurationMinutes,
      trafficDelayMinutes: 0,
      lastUpdated: new Date().toISOString(),
      segments: [],
      incidents: []
    };

    return {
      ...opt,
      stops: updatedStops,
      chargingDurationMinutes,
      chargingDuration: formatHoursMinutes(chargingDurationMinutes),
      stopBufferMinutes,
      stopBufferDuration: formatHoursMinutes(stopBufferMinutes),
      totalDurationMinutes,
      totalDuration: totalDurationStr,
      label: totalDurationStr,
      totalEnergyKwh: Math.round((opt.totalDistanceMi * vehicle.referenceConsumptionWhPerMi) / 1000),
      estimatedExpenseInr: totalExpenseInr,
      isFeasible: allStopsFeasible,
      isCompleteEvJourney: allStopsFeasible && updatedStops.length > 0,
      chargerDataStatus: 'catalogue_verified' as const,
      feasibilityNote: allStopsFeasible ? undefined : 'Road route available — complete EV journey not currently feasible.',
      infeasibilityDetails,
      trafficSummary: demoTrafficSummary,
      geometrySource: 'osrm' as const,
      geometryStatus: 'OSRM_ROAD_GEOMETRY' as const,
      roadValidated: true
    };
  });

  // Pick active route agreeing with user options
  let activeRouteId = 'route-optimal';
  if (planOptions.avoidTolls || routingSettings.avoidTolls) {
    activeRouteId = 'route-fewest';
  } else if (planOptions.chargeStops === 'Fewest' || routingSettings.chargeStops === 'Fewest') {
    activeRouteId = 'route-fewest';
  } else if (planOptions.chargeStops === 'Fewer' || routingSettings.chargeStops === 'Fewer') {
    activeRouteId = 'route-fewer';
  }

  return {
    routeOptions: updatedOptions,
    activeRouteId
  };
}

/**
 * Core Route Calculation Function
 */
export async function calculateTripRoutes(
  req: RouteCalculationRequest
): Promise<RouteCalculationResult> {
  const { origin, destination, waypoints = [], vehicle, planOptions, chargingSettings, routingSettings } = req;

  // 1. Strict default-corridor detection:
  // Must match Patna to Delhi coordinates within tolerance, in that direction, with zero custom waypoints.
  if (isDefaultPatnaDelhiCorridor(origin, destination, waypoints)) {
    return replanPatnaDelhiFixture(req);
  }

  // --- Dynamic Road Calculation for Arbitrary / Custom Routes ---
  const initialEndpoints: [number, number][] = [
    origin.coordinates,
    ...waypoints.map((w) => w.coordinates),
    destination.coordinates
  ];

  // 2. Fetch road geometry and provider-supported alternative paths
  const roadAlternatives = await calculateRoadRouteAlternatives(initialEndpoints, {
    routeType: planOptions.routePreference || routingSettings.routePreference || 'fastest',
    avoidTolls: planOptions.avoidTolls || routingSettings.avoidTolls,
    avoidHighways: planOptions.avoidHighways || routingSettings.avoidHighways,
    avoidFerries: planOptions.avoidFerriesAndTrains || routingSettings.avoidFerries,
    maxAlternatives: 3
  });

  const pathPlans: {
    roadPath: CandidateRoadPath;
    id: string;
    name: string;
    badge: string;
    targetSoc: number;
    alternativeIndex: number;
  }[] = [];

  if (roadAlternatives.length >= 3) {
    pathPlans.push(
      { roadPath: roadAlternatives[0], id: 'route-optimal', name: roadAlternatives[0].name, badge: 'Fastest', targetSoc: 72, alternativeIndex: 0 },
      { roadPath: roadAlternatives[1], id: 'route-fewer', name: roadAlternatives[1].name, badge: 'Alt Road 1', targetSoc: 78, alternativeIndex: 1 },
      { roadPath: roadAlternatives[2], id: 'route-fewest', name: roadAlternatives[2].name, badge: 'Alt Road 2', targetSoc: 85, alternativeIndex: 2 }
    );
  } else if (roadAlternatives.length === 2) {
    pathPlans.push(
      { roadPath: roadAlternatives[0], id: 'route-optimal', name: roadAlternatives[0].name, badge: 'Fastest', targetSoc: 72, alternativeIndex: 0 },
      { roadPath: roadAlternatives[1], id: 'route-fewer', name: roadAlternatives[1].name, badge: 'Alt Road 1', targetSoc: 78, alternativeIndex: 1 }
    );
    if (planOptions.useRcspOptimizer) {
      pathPlans.push(
        { roadPath: roadAlternatives[1], id: 'route-fewest', name: `${roadAlternatives[1].name} (Fewest Stops)`, badge: '+Fewest Stops', targetSoc: 88, alternativeIndex: 2 }
      );
    }
  } else if (roadAlternatives.length === 1) {
    const p0 = roadAlternatives[0];
    pathPlans.push(
      { roadPath: p0, id: 'route-optimal', name: p0.name || 'Primary Route', badge: 'Fastest', targetSoc: 72, alternativeIndex: 0 }
    );
    if (planOptions.useRcspOptimizer) {
      pathPlans.push(
        { roadPath: p0, id: 'route-fewer', name: 'Fewer Stops', badge: '+14 min', targetSoc: 82, alternativeIndex: 1 },
        { roadPath: p0, id: 'route-fewest', name: 'Fewest Stops', badge: '+42 min', targetSoc: 90, alternativeIndex: 2 }
      );
    }
  } else {
    // Fallback geometric path with genuine Haversine distance and interpolated coordinates
    let directDistMi = 0;
    for (let i = 1; i < initialEndpoints.length; i++) {
      directDistMi += haversineDistanceMi(initialEndpoints[i - 1], initialEndpoints[i]);
    }
    const estDist = Math.max(1, Math.round(directDistMi * 1.25));
    const estMinutes = Math.max(1, Math.round(estDist * 1.35));

    // Interpolate points between endpoints to provide a visible connected polyline
    const interpolatedCoords: [number, number][] = [];
    for (let i = 1; i < initialEndpoints.length; i++) {
      const p1 = initialEndpoints[i - 1];
      const p2 = initialEndpoints[i];
      const steps = Math.max(8, Math.min(60, Math.round(haversineDistanceMi(p1, p2) / 8)));
      for (let s = 0; s < steps; s++) {
        const frac = s / steps;
        interpolatedCoords.push([
          Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(5)),
          Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(5))
        ]);
      }
    }
    interpolatedCoords.push(initialEndpoints[initialEndpoints.length - 1]);

    const fallbackPath: CandidateRoadPath = {
      id: 'road-path-0',
      name: 'Direct Road Estimate',
      coordinates: interpolatedCoords,
      distanceMi: estDist,
      durationMinutes: estMinutes,
      freeFlowDurationMinutes: estMinutes,
      trafficDelayMinutes: 0,
      trafficSummary: {
        status: 'unavailable',
        provider: 'Fallback',
        trafficTravelTimeMinutes: estMinutes,
        freeFlowTravelTimeMinutes: estMinutes,
        trafficDelayMinutes: 0,
        lastUpdated: new Date().toISOString(),
        segments: [],
        incidents: []
      },
      legs: [{ distanceMi: estDist, durationMinutes: estMinutes, trafficDelayMinutes: 0 }],
      routeType: 'fastest',
      source: 'geometric_fallback'
    };
    pathPlans.push(
      { roadPath: fallbackPath, id: 'route-optimal', name: 'Direct Estimate', badge: 'Approx. Geometry', targetSoc: 72, alternativeIndex: 0 }
    );
    if (planOptions.useRcspOptimizer) {
      pathPlans.push(
        { roadPath: fallbackPath, id: 'route-fewer', name: 'Fewer Stops', badge: '+14 min', targetSoc: 82, alternativeIndex: 1 },
        { roadPath: fallbackPath, id: 'route-fewest', name: 'Fewest Stops', badge: '+42 min', targetSoc: 90, alternativeIndex: 2 }
      );
    }
  }

  // 3. Battery and charging constraints
  const initialSoc = origin.batterySoc !== undefined ? origin.batterySoc : 95;
  const minChargerReserve = chargingSettings.preferredMinArrivalBatteryCharger || 10;
  const minDestReserve =
    planOptions.destinationArrivalSoc ||
    chargingSettings.preferredMinArrivalBatteryDestination ||
    10;
  const maxChargeLimit = Math.min(100, chargingSettings.maximumChargeLimit || 100);

  const stationsToUse = globalLiveDataService.getReconciledStations(chargingStations);
  const eligibleStations = getEligibleStations(stationsToUse, vehicle, planOptions, chargingSettings);
  const maxDetourMi = 25; // max 25 miles from route corridor

  interface StationWithProjection {
    station: ChargingStation;
    detourMi: number;
    distFromOriginMi: number;
    accessValidation: RoadAccessValidationResult;
    isPinned?: boolean;
  }

  const generatedOptions: RouteOption[] = [];

  // 4. Run the EV optimizer independently against EACH candidate road path
  for (const plan of pathPlans) {
    const roadPath = plan.roadPath;
    const roadPolyline = roadPath.coordinates;
    const roadDistanceMi = roadPath.distanceMi;
    const roadDurationMinutes = roadPath.durationMinutes;

    // Spatially identify candidate charging stations along this specific candidate road corridor
    // Start with local curated stations and expand with National EV PCS registry stations
    const combinedEligible = [...eligibleStations];

    try {
      if (typeof fetch === 'function' && roadPolyline && roadPolyline.length >= 2) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const pcsRes = await fetch('/api/stations/corridor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            polyline: roadPolyline,
            corridorRadiusMi: maxDetourMi,
            excludeLev: true,
            minPowerKw: 25,
            limit: 150
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (pcsRes.ok) {
          const pcsData = await pcsRes.json();
          if (Array.isArray(pcsData.stations)) {
            const seenIds = new Set(combinedEligible.map((s) => s.id));
            const compatiblePcs = getEligibleStations(pcsData.stations, vehicle, planOptions, chargingSettings);
            for (const pcsSt of compatiblePcs) {
              if (!seenIds.has(pcsSt.id)) {
                seenIds.add(pcsSt.id);
                combinedEligible.push(pcsSt);
              }
            }
          }
        }
      }
    } catch {
      // In offline or unit-test environments without proxy server, rely on curated stations
    }

    const corridorStations: StationWithProjection[] = [];
    for (const st of combinedEligible) {
      const proj = projectStationOnPolyline(st.coordinates, roadPolyline);
      if (proj.detourMi <= maxDetourMi && proj.distFromOriginMi > 5 && proj.distFromOriginMi < roadDistanceMi - 5) {
        const access = validateStationRoadAccess(
          st,
          roadPolyline,
          proj.distFromOriginMi,
          proj.detourMi
        );

        if (access.isAccessible) {
          corridorStations.push({
            station: st,
            detourMi: access.actualDetourMi,
            distFromOriginMi: proj.distFromOriginMi,
            accessValidation: access
          });
        }
      }
    }

    let isTripFeasible = true;
    let totalExpenseInr = 0;
    let chargerDataStatus: 'catalogue_verified' | 'unavailable_outside_catalogue' | 'incomplete_data' | 'unverified_poi' =
      corridorStations.length > 0 ? 'catalogue_verified' : 'unavailable_outside_catalogue';
    let feasibilityNote: string | undefined = undefined;

    // Check user-pinned charging stops in waypoints and integrate them into corridor stations
    const pinnedChargers = waypoints.filter((w) => w.type === 'charging_pinned');
    for (const pw of pinnedChargers) {
      if (pw.verificationState === 'unverified_charger_poi' || !pw.stationId) {
        isTripFeasible = false;
        chargerDataStatus = 'unverified_poi';
        feasibilityNote = `Pinned stop "${pw.name}" is an unverified POI lacking technical charging specifications.`;
      } else {
        const station: ChargingStation =
          combinedEligible.find((s) => s.id === pw.stationId) ||
          chargingStations.find((s) => s.id === pw.stationId) || {
            id: pw.stationId,
            name: pw.name,
            network: pw.subTitle?.split('·')[0]?.trim() || 'CPO',
            canonicalNetwork: pw.subTitle?.split('·')[0]?.trim() || 'CPO',
            address: pw.address || pw.subTitle || 'Pinned Charging Location',
            coordinates: pw.coordinates,
            ratedPowerKw: pw.powerKw || 50,
            totalStalls: 2,
            availableStalls: 2,
            stallAvailabilityStatus: 'unknown' as const,
            connectors: [{ type: 'CCS2', maxPowerKw: pw.powerKw || 50, count: 2, availableCount: 2, canonicalType: 'CCS 2' }],
            amenities: [],
            pricePerKwh: '₹21.00 / kWh',
            tariffClassification: 'estimated_default' as const,
            operationalStatus: 'operational' as const,
            statusTimestamp: new Date().toISOString(),
            openingHours: '24/7',
            paymentMethods: ['App'],
            dataSource: 'Operator API' as const
          };

        if (station) {
          const supportsPlug = station.connectors.some((c) => {
            const cType = c.type.toLowerCase();
            return vehicle.selectedPlugTypes.some((vp) =>
              cType.includes(vp.toLowerCase()) || vp.toLowerCase().includes(cType)
            );
          });
          if (!supportsPlug) {
            isTripFeasible = false;
            feasibilityNote = `Connector mismatch: Station "${station.name}" (${station.connectors.map((c) => c.type).join(', ')}) does not support vehicle selected plug types (${vehicle.selectedPlugTypes.join(', ')}).`;
          }

          const proj = projectStationOnPolyline(pw.coordinates, roadPolyline);
          const access = validateStationRoadAccess(
            station,
            roadPolyline,
            proj.distFromOriginMi,
            proj.detourMi
          );

          corridorStations.push({
            station,
            detourMi: access.actualDetourMi,
            distFromOriginMi: proj.distFromOriginMi,
            accessValidation: access,
            isPinned: true
          });
        }
      }
    }

    corridorStations.sort((a, b) => a.distFromOriginMi - b.distFromOriginMi);

    let currentSoc = initialSoc;
    let currDistFromOrigin = 0;
    let accumulatedTime = origin.departureTime || '08:00 AM';
    const stops: ChargingStop[] = [];

    while (currDistFromOrigin < roadDistanceMi) {
      const distToDest = roadDistanceMi - currDistFromOrigin;
      const directDestEnergy = calculateLegEnergy({ distanceMi: distToDest, vehicle });
      const directDestArrivalSoc = Number((currentSoc - directDestEnergy.socPercent).toFixed(1));

      // Can we reach final destination directly with required reserve?
      // (Only skip charging if there are NO upcoming mandatory pinned charging stops)
      const hasUpcomingPinned = corridorStations.some(
        (cand) => cand.isPinned && cand.distFromOriginMi > currDistFromOrigin
      );

      if (directDestArrivalSoc >= minDestReserve && !hasUpcomingPinned) {
        break; // Destination reachable directly and no pinned stops ahead
      }

      // We need a charging stop. Find all reachable candidate stations ahead of currDistFromOrigin
      const reachableCandidates = corridorStations.filter((cand) => {
        if (cand.distFromOriginMi <= currDistFromOrigin) return false;
        const legDist = cand.distFromOriginMi - currDistFromOrigin;
        const legEnergy = calculateLegEnergy({ distanceMi: legDist, vehicle });
        const arrivalSoc = currentSoc - legEnergy.socPercent;
        return arrivalSoc >= minChargerReserve;
      });

      if (reachableCandidates.length === 0) {
        isTripFeasible = false;
        if (corridorStations.length === 0) {
          chargerDataStatus = 'unavailable_outside_catalogue';
          feasibilityNote = 'No verified charging stations found along corridor in local catalogue (20 Indian stations) or National Registry. Real global routing requires live OCPI network connection.';
        } else if (!feasibilityNote) {
          feasibilityNote = `Battery depleted before reaching next charger (Arrival SoC: ${directDestArrivalSoc}%).`;
        }
        break;
      }

      // Pick the best station among reachable ones (User-pinned chargers take absolute priority):
      reachableCandidates.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        const preferred = planOptions.preferredNetworks || chargingSettings.preferredNetworks || [];
        const aPref = preferred.includes(a.station.network) ? 30 : 0;
        const bPref = preferred.includes(b.station.network) ? 30 : 0;
        const aPowerScore = a.station.ratedPowerKw * 0.1;
        const bPowerScore = b.station.ratedPowerKw * 0.1;
        const aDetourPenalty = a.detourMi * 1.5;
        const bDetourPenalty = b.detourMi * 1.5;

        const summaryA = req.communitySummaries?.get(a.station.id);
        const summaryB = req.communitySummaries?.get(b.station.id);
        const aRelScore = summaryA?.overallScore ?? 75;
        const bRelScore = summaryB?.overallScore ?? 75;
        const aRelPenalty = (summaryA?.activeWarnings.length || 0) > 0 ? 25 : 0;
        const bRelPenalty = (summaryB?.activeWarnings.length || 0) > 0 ? 25 : 0;

        const aQueueWait = req.queueWaitMinutesMap?.get(a.station.id) ?? 0;
        const bQueueWait = req.queueWaitMinutesMap?.get(b.station.id) ?? 0;

        const aScore = a.distFromOriginMi + aPref + aPowerScore - aDetourPenalty + aRelScore * 0.15 - aRelPenalty - aQueueWait * 0.5;
        const bScore = b.distFromOriginMi + bPref + bPowerScore - bDetourPenalty + bRelScore * 0.15 - bRelPenalty - bQueueWait * 0.5;
        return bScore - aScore;
      });

      const chosen = reachableCandidates[0];
      const legDist = Math.round(chosen.distFromOriginMi - currDistFromOrigin);
      const legEnergy = calculateLegEnergy({ distanceMi: legDist, vehicle });
      const arrivalSoc = Number((currentSoc - legEnergy.socPercent).toFixed(1));

      const targetSoc = Math.min(
        maxChargeLimit,
        Math.max(arrivalSoc + 25, plan.targetSoc)
      );

      const actualPowerKw = Math.min(vehicle.maxDcChargingKw, chosen.station.ratedPowerKw);
      const chargeEstimate = calculateChargingDuration({
        usableCapacityKwh: vehicle.usableBatteryKwh,
        degradationPercent: vehicle.batteryDegradationPercent,
        maxDcChargingKw: actualPowerKw,
        stationPowerKw: chosen.station.ratedPowerKw,
        currentSocPercent: Math.max(0, arrivalSoc),
        targetSocPercent: targetSoc
      });

      const legDriveMinutes = Math.round(legDist * 1.33);
      const arrivalTime = addMinutesToTimeString(accumulatedTime, legDriveMinutes);
      const chargeMinutes = Math.max(8, chargeEstimate.durationMinutes);
      const departureTime = addMinutesToTimeString(arrivalTime, chargeMinutes);
      accumulatedTime = departureTime;

      const tariffPerKwh = parsePricePerKwh(chosen.station.pricePerKwh);
      const energyAdded = chargeEstimate.energyAddedKwh;
      totalExpenseInr += Math.round(energyAdded * tariffPerKwh);

      const preferred = planOptions.preferredNetworks || chargingSettings.preferredNetworks || [];

      const backupEval = evaluateBackupCharger(
        chosen.station,
        chargingStations,
        vehicle,
        arrivalSoc,
        req.communitySummaries,
        minChargerReserve
      );

      const commSummary = req.communitySummaries?.get(chosen.station.id);

      stops.push({
        id: `custom-stop-${plan.id}-${stops.length + 1}`,
        stationId: chosen.station.id,
        name: chosen.station.name,
        network: chosen.station.network,
        address: chosen.station.address,
        coordinates: chosen.station.coordinates,
        powerKw: chosen.station.ratedPowerKw,
        stallsTotal: chosen.station.totalStalls,
        stallsAvailable: chosen.station.availableStalls !== undefined ? chosen.station.availableStalls : undefined,
        arrivalTime,
        departureTime,
        arrivalSoc,
        departureSoc: targetSoc,
        chargeDurationMinutes: chargeMinutes,
        energyAddedKwh: energyAdded,
        legDriveDuration: formatHoursMinutes(legDriveMinutes),
        legDistanceMi: legDist,
        amenities: chosen.station.amenities,
        priceEstimate: chosen.station.pricePerKwh,
        isFeasible: arrivalSoc >= minChargerReserve,
        isPreferred: preferred.includes(chosen.station.network),
        isPinned: Boolean(chosen.isPinned),
        isExcluded: false,
        roadAccessStatus: chosen.accessValidation.accessStatus,
        carriagewayAccess: chosen.accessValidation.carriageway,
        entranceCoordinates: chosen.accessValidation.entranceCoordinates,
        actualDetourMi: chosen.detourMi,
        backupStationId: backupEval.backupStationId,
        backupStationName: backupEval.backupStationName,
        backupReachable: backupEval.backupReachable,
        reachabilityClassification: backupEval.reachabilityClassification,
        communityReliabilityScore: commSummary?.overallScore ?? null,
        communityConfidenceTier: commSummary?.confidenceTier ?? 'insufficient_evidence',
        communityWarning: commSummary?.activeWarnings?.[0],
        communityQueueMinutes: commSummary?.queueEstimate?.estimatedWaitMinutes,
        cpoConflict: commSummary?.cpoConflict,
        accessRestrictions: chosen.accessValidation.accessRestrictions,
        accessNotes: chosen.accessValidation.accessNotes,
        canonicalNetwork: normalizeNetworkName(chosen.station.network).canonicalNetwork,
        tariffClassification: classifyTariff(chosen.station.pricePerKwh).classification,
        stallAvailabilityStatus: classifyStallAvailability(chosen.station.totalStalls, chosen.station.availableStalls).status,
        provenanceConfidence: chosen.station.accessMetadata?.accessConfidence ?? 0.8
      });

      currDistFromOrigin = chosen.distFromOriginMi;
      currentSoc = targetSoc;
    }

    // Verify destination reserve feasibility
    const remainingDist = roadDistanceMi - currDistFromOrigin;
    const remainingEnergy = calculateLegEnergy({ distanceMi: remainingDist, vehicle });
    const projectedArrivalSoc = Number((currentSoc - remainingEnergy.socPercent).toFixed(1));
    if (projectedArrivalSoc < minDestReserve) {
      isTripFeasible = false;
    }

    // Feature B: Connect origin -> stops in sequence -> destination with real road geometry
    let finalPolyline = roadPolyline && roadPolyline.length >= 2 ? roadPolyline : initialEndpoints;
    let finalDistanceMi = roadDistanceMi;
    let finalDriveMinutes = roadDurationMinutes;
    let optGeometrySource: 'osrm' | 'tomtom' | 'estimated' =
      roadPath.source === 'orbis_v3' || roadPath.source === 'legacy_v1'
        ? 'tomtom'
        : roadPath.source === 'osrm'
        ? 'osrm'
        : 'estimated';

    if (stops.length > 0) {
      const stopWaypoints: [number, number][] = [origin.coordinates];
      for (const s of stops) {
        const last = stopWaypoints[stopWaypoints.length - 1];
        if (Math.abs(last[0] - s.coordinates[0]) > 0.0005 || Math.abs(last[1] - s.coordinates[1]) > 0.0005) {
          stopWaypoints.push(s.coordinates);
        }
      }
      stopWaypoints.push(destination.coordinates);

      try {
        const tomtomMultiRoad = await calculateTomTomTrafficRoute(stopWaypoints);
        const roadMultiData = tomtomMultiRoad
          ? {
              coordinates: tomtomMultiRoad.coordinates,
              distanceMi: tomtomMultiRoad.distanceMi,
              durationMinutes: tomtomMultiRoad.durationMinutes,
              legs: tomtomMultiRoad.legs
            }
          : await fetchRoadGeometry(stopWaypoints);

        if (roadMultiData && roadMultiData.coordinates && roadMultiData.coordinates.length >= 2) {
          finalPolyline = roadMultiData.coordinates;
          finalDistanceMi = roadMultiData.distanceMi;
          finalDriveMinutes = roadMultiData.durationMinutes;
          if (tomtomMultiRoad) {
            optGeometrySource = 'tomtom';
          } else {
            optGeometrySource = 'osrm';
          }

          // Revalidate individual legs with actual road distance if legs returned
          if (roadMultiData.legs && roadMultiData.legs.length === stops.length + 1) {
            let legSoc = initialSoc;
            let legTime = origin.departureTime || '08:00 AM';
            let allStopsFeasible = true;
            let recalculatedExpense = 0;

            for (let i = 0; i < stops.length; i++) {
              const legRoadDist = roadMultiData.legs[i].distanceMi;
              const legRoadMins = roadMultiData.legs[i].durationMinutes;
              const legEnergy = calculateLegEnergy({ distanceMi: legRoadDist, vehicle });
              const arrSoc = Number((legSoc - legEnergy.socPercent).toFixed(1));

              if (arrSoc < minChargerReserve) {
                allStopsFeasible = false;
              }

              const targetSoc = Math.min(
                maxChargeLimit,
                Math.max(arrSoc + 20, stops[i].departureSoc)
              );
              const actualKw = Math.min(vehicle.maxDcChargingKw, stops[i].powerKw);
              const chargeEst = calculateChargingDuration({
                usableCapacityKwh: vehicle.usableBatteryKwh,
                degradationPercent: vehicle.batteryDegradationPercent,
                maxDcChargingKw: actualKw,
                stationPowerKw: stops[i].powerKw,
                currentSocPercent: Math.max(0, arrSoc),
                targetSocPercent: targetSoc
              });

              const chargeMins = Math.max(5, chargeEst.durationMinutes);
              const arrivalTime = addMinutesToTimeString(legTime, legRoadMins);
              const departureTime = addMinutesToTimeString(arrivalTime, chargeMins);
              legTime = departureTime;

              const tariff = parsePricePerKwh(stops[i].priceEstimate);
              recalculatedExpense += Math.round(chargeEst.energyAddedKwh * tariff);

              stops[i] = {
                ...stops[i],
                legDistanceMi: legRoadDist,
                legDriveDuration: formatHoursMinutes(legRoadMins),
                arrivalSoc: arrSoc,
                departureSoc: targetSoc,
                chargeDurationMinutes: chargeMins,
                energyAddedKwh: chargeEst.energyAddedKwh,
                arrivalTime,
                departureTime,
                isFeasible: arrSoc >= minChargerReserve
              };

              legSoc = targetSoc;
            }

            const finalLegDist = roadMultiData.legs[roadMultiData.legs.length - 1].distanceMi;
            const finalEnergy = calculateLegEnergy({ distanceMi: finalLegDist, vehicle });
            const finalArrSoc = Number((legSoc - finalEnergy.socPercent).toFixed(1));
            if (finalArrSoc < minDestReserve) {
              allStopsFeasible = false;
            }

            totalExpenseInr = recalculatedExpense;
            if (!allStopsFeasible) {
              isTripFeasible = false;
            }
          }
        }
      } catch {
        // Fall back gracefully to corridor polyline if road router fails
      }
    }

    let geometryStatus: RouteGeometryStatus = 'APPROXIMATE_GEOMETRY';
    if (!finalPolyline || finalPolyline.length < 2) {
      geometryStatus = 'GEOMETRY_UNAVAILABLE';
    } else if (optGeometrySource === 'tomtom') {
      geometryStatus = 'PROVIDER_ROAD_GEOMETRY';
    } else if (optGeometrySource === 'osrm') {
      geometryStatus = 'OSRM_ROAD_GEOMETRY';
    } else {
      geometryStatus = 'APPROXIMATE_GEOMETRY';
    }

    // Infeasibility diagnosis
    let infeasibilityDetails: InfeasibilityDetails | undefined = undefined;
    if (!isTripFeasible) {
      let lastFeasibleIdx = -1;
      for (let i = 0; i < stops.length; i++) {
        if (stops[i].isFeasible && stops[i].arrivalSoc >= minChargerReserve) {
          lastFeasibleIdx = i;
        } else {
          break;
        }
      }

      const lastStop = lastFeasibleIdx >= 0 ? stops[lastFeasibleIdx] : undefined;
      const lastCoord = lastStop ? lastStop.coordinates : origin.coordinates;
      const remainingMiles = Math.max(1, Math.round(haversineDistanceMi(lastCoord, destination.coordinates)));
      const remainingEnergyKwh = Math.round(((remainingMiles * vehicle.referenceConsumptionWhPerMi) / 1000) * 10) / 10;
      const requiredSocPercent = Math.min(100, Math.round((remainingEnergyKwh / vehicle.usableBatteryKwh) * 100));

      const reason = lastStop
        ? `Battery depleted after charging at "${lastStop.name}". Next leg requires ~${remainingEnergyKwh} kWh (${requiredSocPercent}% SoC), exceeding available battery reserve.`
        : `Battery depleted before reaching first charging station or destination. Required range is ${remainingMiles} mi (${remainingEnergyKwh} kWh).`;

      const suggestedAction = initialSoc < 90
        ? `Charge vehicle to 100% SoC before departure (currently ${initialSoc}%).`
        : `Add an intermediate verified fast charging hub along this corridor or reduce cruising speed to conserve energy.`;

      infeasibilityDetails = {
        lastReachableStation: lastStop ? {
          id: lastStop.stationId,
          name: lastStop.name,
          coordinates: lastStop.coordinates,
          arrivalSoc: lastStop.arrivalSoc
        } : undefined,
        remainingDistanceMi: remainingMiles,
        remainingEnergyKwh,
        requiredSocPercent,
        reason,
        suggestedAction
      };

      if (!feasibilityNote || !feasibilityNote.includes('complete EV journey not currently feasible')) {
        feasibilityNote = `Road route available — complete EV journey not currently feasible.${feasibilityNote ? ` ${feasibilityNote}` : ''}`;
      }
    }

    const totalChargingMinutes = stops.reduce((sum, s) => sum + s.chargeDurationMinutes, 0);
    const stopBufferMinutes = stops.length * 5;
    const totalDurationMinutes = finalDriveMinutes + totalChargingMinutes + stopBufferMinutes;
    const totalDurationStr = formatHoursMinutes(totalDurationMinutes);

    generatedOptions.push({
      id: plan.id,
      label: totalDurationStr,
      badge: plan.badge,
      description: `${plan.name} (${stops.length} stops)`,
      totalDuration: totalDurationStr,
      totalDurationMinutes,
      drivingDuration: formatHoursMinutes(finalDriveMinutes),
      drivingDurationMinutes: finalDriveMinutes,
      chargingDuration: formatHoursMinutes(totalChargingMinutes),
      chargingDurationMinutes: totalChargingMinutes,
      stopBufferDuration: formatHoursMinutes(stopBufferMinutes),
      stopBufferMinutes,
      totalDistanceMi: finalDistanceMi,
      stopCount: stops.length,
      totalEnergyKwh: Math.round((finalDistanceMi * vehicle.referenceConsumptionWhPerMi) / 1000),
      estimatedExpenseInr: totalExpenseInr,
      stops,
      polylineCoordinates: finalPolyline,
      isFeasible: isTripFeasible,
      isCompleteEvJourney: isTripFeasible && stops.length > 0,
      chargerDataStatus,
      feasibilityNote,
      infeasibilityDetails,
      calculationMethod: optGeometrySource === 'tomtom'
        ? 'TomTom Orbis Road Router'
        : optGeometrySource === 'osrm'
        ? 'OSRM Road Router + Calibrated Model'
        : 'Energy-Constrained Path Simulation',
      geometrySource: optGeometrySource,
      geometryStatus,
      roadValidated: Boolean(optGeometrySource !== 'estimated'),
      trafficSummary: roadPath.trafficSummary,
      alternativeIndex: plan.alternativeIndex,
      routeName: plan.name,
      hasTolls: roadPath.hasTolls
    });
  }

  // Identify recommended EV route (fastest among feasible options, or primary option if none)
  const feasibleOpts = generatedOptions.filter((o) => o.isFeasible);
  const recommendedOpt = feasibleOpts.length > 0
    ? feasibleOpts.reduce((best, curr) => curr.totalDurationMinutes < best.totalDurationMinutes ? curr : best, feasibleOpts[0])
    : generatedOptions[0];

  if (recommendedOpt) {
    recommendedOpt.isRecommended = true;
  }

  let activeRouteId = generatedOptions[0]?.id || 'route-optimal';
  if (planOptions.avoidTolls || routingSettings.avoidTolls) {
    const tollFree = generatedOptions.find((o) => !o.hasTolls);
    if (tollFree) activeRouteId = tollFree.id;
  } else if (planOptions.chargeStops === 'Fewest' || routingSettings.chargeStops === 'Fewest') {
    const fewest = generatedOptions.find((o) => o.id === 'route-fewest');
    if (fewest) activeRouteId = fewest.id;
  } else if (planOptions.chargeStops === 'Fewer' || routingSettings.chargeStops === 'Fewer') {
    const fewer = generatedOptions.find((o) => o.id === 'route-fewer');
    if (fewer) activeRouteId = fewer.id;
  }

  // 7. If RCSP optimizer is requested, solve with RCSP and perform road validation
  if (planOptions.useRcspOptimizer) {
    const primaryPolyline = roadAlternatives[0]?.coordinates || initialEndpoints;
    const rcspCandidate = solveRcsp(req);
    if (rcspCandidate) {
      let finalPolyline = rcspCandidate.polylineCoordinates;
      let finalDistanceMi = rcspCandidate.totalDistanceMi;
      let finalDriveMinutes = rcspCandidate.drivingDurationMinutes;
      let isRcspFeasible = rcspCandidate.isFeasible;
      let geometrySource: 'osrm' | 'tomtom' | 'estimated' = 'estimated';
      let roadValidated = false;
      let updatedStops = rcspCandidate.stops;
      let totalExpenseInr = rcspCandidate.estimatedExpenseInr;

      // Query OSRM or TomTom geometry through all selected stops and waypoints
      const allIntermediatePoints: { coordinates: [number, number]; distFromOriginMi: number }[] = [
        ...rcspCandidate.stops.map((s) => ({ coordinates: s.coordinates, distFromOriginMi: projectStationOnPolyline(s.coordinates, primaryPolyline).distFromOriginMi })),
        ...waypoints.map((w) => ({ coordinates: w.coordinates, distFromOriginMi: projectStationOnPolyline(w.coordinates, primaryPolyline).distFromOriginMi }))
      ];
      allIntermediatePoints.sort((a, b) => a.distFromOriginMi - b.distFromOriginMi);

      const uniquePoints: [number, number][] = [origin.coordinates];
      for (const p of allIntermediatePoints) {
        const last = uniquePoints[uniquePoints.length - 1];
        if (haversineDistanceMi(last, p.coordinates) > 0.1) {
          uniquePoints.push(p.coordinates);
        }
      }
      uniquePoints.push(destination.coordinates);

      let rcspTrafficSummary = roadAlternatives[0]?.trafficSummary || {
        status: 'unavailable',
        provider: 'TomTom Orbis Traffic',
        trafficTravelTimeMinutes: finalDriveMinutes,
        freeFlowTravelTimeMinutes: finalDriveMinutes,
        trafficDelayMinutes: 0,
        lastUpdated: new Date().toISOString(),
        segments: [],
        incidents: []
      };
      const tomtomRoad = await calculateTomTomTrafficRoute(uniquePoints);
      const roadData = tomtomRoad
        ? {
            coordinates: tomtomRoad.coordinates,
            distanceMi: tomtomRoad.distanceMi,
            durationMinutes: tomtomRoad.durationMinutes,
            legs: tomtomRoad.legs
          }
        : await fetchRoadGeometry(uniquePoints);

      if (tomtomRoad) {
        rcspTrafficSummary = tomtomRoad.trafficSummary;
        geometrySource = 'tomtom';
      } else if (roadData) {
        geometrySource = 'osrm';
      }

      if (roadData) {
        finalPolyline = roadData.coordinates;
        finalDistanceMi = roadData.distanceMi;
        finalDriveMinutes = roadData.durationMinutes;

        // Revalidate battery energy and arrival SoCs against real road leg distances
        if (roadData.legs && roadData.legs.length === rcspCandidate.stops.length + 1) {
          let currSoc = initialSoc;
          let accTime = origin.departureTime || '08:00 AM';
          let allLegsOk = true;
          let recalculatedExpense = 0;

          const revalidatedStops: ChargingStop[] = [];
          for (let i = 0; i < rcspCandidate.stops.length; i++) {
            const origStop = rcspCandidate.stops[i];
            const legDist = roadData.legs[i].distanceMi;
            const legDriveMins = roadData.legs[i].durationMinutes;
            const legEnergy = calculateLegEnergy({ distanceMi: legDist, vehicle });
            const arrSoc = Number((currSoc - legEnergy.socPercent).toFixed(1));

            if (arrSoc < minChargerReserve) {
              allLegsOk = false;
            }

            const targetSoc = Math.min(
              maxChargeLimit,
              Math.max(arrSoc + 20, origStop.departureSoc)
            );
            const actualKw = Math.min(vehicle.maxDcChargingKw, origStop.powerKw);
            const chargeEst = calculateChargingDuration({
              usableCapacityKwh: vehicle.usableBatteryKwh,
              degradationPercent: vehicle.batteryDegradationPercent,
              maxDcChargingKw: actualKw,
              stationPowerKw: origStop.powerKw,
              currentSocPercent: Math.max(0, arrSoc),
              targetSocPercent: targetSoc
            });

            const chargeMins = Math.max(5, chargeEst.durationMinutes);
            const arrivalTime = addMinutesToTimeString(accTime, legDriveMins);
            const departureTime = addMinutesToTimeString(arrivalTime, chargeMins);
            accTime = departureTime;

            const tariff = parsePricePerKwh(origStop.priceEstimate);
            recalculatedExpense += Math.round(chargeEst.energyAddedKwh * tariff);

            revalidatedStops.push({
              ...origStop,
              legDistanceMi: legDist,
              legDriveDuration: formatHoursMinutes(legDriveMins),
              arrivalSoc: arrSoc,
              departureSoc: targetSoc,
              chargeDurationMinutes: chargeMins,
              energyAddedKwh: chargeEst.energyAddedKwh,
              arrivalTime,
              departureTime,
              isFeasible: arrSoc >= minChargerReserve
            });

            currSoc = targetSoc;
          }

          // Check final destination leg
          const lastLegDist = roadData.legs[roadData.legs.length - 1].distanceMi;
          const finalEnergy = calculateLegEnergy({ distanceMi: lastLegDist, vehicle });
          const finalArrSoc = Number((currSoc - finalEnergy.socPercent).toFixed(1));
          if (finalArrSoc < minDestReserve) {
            allLegsOk = false;
          }

          updatedStops = revalidatedStops;
          totalExpenseInr = recalculatedExpense;
          isRcspFeasible = allLegsOk;
          roadValidated = allLegsOk;
        } else {
          // If legs not available, check destination reserve based on total road distance
          const remainingDist = Math.max(1, finalDistanceMi - updatedStops.reduce((sum, s) => sum + s.legDistanceMi, 0));
          const finalEnergy = calculateLegEnergy({ distanceMi: remainingDist, vehicle });
          const lastDepartureSoc = updatedStops.length > 0 ? updatedStops[updatedStops.length - 1].departureSoc : initialSoc;
          const finalArrSoc = Number((lastDepartureSoc - finalEnergy.socPercent).toFixed(1));
          if (finalArrSoc < minDestReserve) {
            isRcspFeasible = false;
          }
          roadValidated = isRcspFeasible;
        }
      }

      const totalChargingMinutes = updatedStops.reduce((sum, s) => sum + s.chargeDurationMinutes, 0);
      const stopBufferMinutes = updatedStops.length * 5;
      const totalDurationMinutes = finalDriveMinutes + totalChargingMinutes + stopBufferMinutes;
      const totalDurationStr = formatHoursMinutes(totalDurationMinutes);

      let rcspInfeasibilityDetails: InfeasibilityDetails | undefined = undefined;
      if (!isRcspFeasible) {
        let lastFeasibleIdx = -1;
        for (let i = 0; i < updatedStops.length; i++) {
          if (updatedStops[i].isFeasible && updatedStops[i].arrivalSoc >= minChargerReserve) {
            lastFeasibleIdx = i;
          } else {
            break;
          }
        }
        const lastStop = lastFeasibleIdx >= 0 ? updatedStops[lastFeasibleIdx] : undefined;
        const lastCoord = lastStop ? lastStop.coordinates : origin.coordinates;
        const remainingMiles = Math.max(1, Math.round(haversineDistanceMi(lastCoord, destination.coordinates)));
        const remainingEnergyKwh = Math.round(((remainingMiles * vehicle.referenceConsumptionWhPerMi) / 1000) * 10) / 10;
        const requiredSocPercent = Math.min(100, Math.round((remainingEnergyKwh / vehicle.usableBatteryKwh) * 100));

        rcspInfeasibilityDetails = {
          lastReachableStation: lastStop ? {
            id: lastStop.stationId,
            name: lastStop.name,
            coordinates: lastStop.coordinates,
            arrivalSoc: lastStop.arrivalSoc
          } : undefined,
          remainingDistanceMi: remainingMiles,
          remainingEnergyKwh,
          requiredSocPercent,
          reason: lastStop
            ? `Battery depleted after "${lastStop.name}". Remaining ${remainingMiles} mi requires ${remainingEnergyKwh} kWh (${requiredSocPercent}% SoC).`
            : `Battery depleted before reaching first charging station or destination.`,
          suggestedAction: initialSoc < 90
            ? `Charge vehicle to 100% SoC before departure (currently ${initialSoc}%).`
            : `Add an intermediate charging hub along the corridor.`
        };
      }

      const rcspOption: RouteOption = {
        id: 'route-rcsp',
        label: totalDurationStr,
        badge: isRcspFeasible ? 'RCSP Optimal' : 'Infeasible on Road',
        description: `RCSP Optimizer (${updatedStops.length} stops)`,
        totalDuration: totalDurationStr,
        totalDurationMinutes,
        drivingDuration: formatHoursMinutes(finalDriveMinutes),
        drivingDurationMinutes: finalDriveMinutes,
        chargingDuration: formatHoursMinutes(totalChargingMinutes),
        chargingDurationMinutes: totalChargingMinutes,
        stopBufferDuration: formatHoursMinutes(stopBufferMinutes),
        stopBufferMinutes,
        totalDistanceMi: finalDistanceMi,
        stopCount: updatedStops.length,
        totalEnergyKwh: Math.round((finalDistanceMi * vehicle.referenceConsumptionWhPerMi) / 1000),
        estimatedExpenseInr: totalExpenseInr,
        stops: updatedStops,
        polylineCoordinates: finalPolyline,
        isFeasible: isRcspFeasible,
        isCompleteEvJourney: isRcspFeasible && updatedStops.length > 0,
        chargerDataStatus: updatedStops.length > 0 || (generatedOptions[0] && generatedOptions[0].chargerDataStatus === 'catalogue_verified')
          ? 'catalogue_verified'
          : 'unavailable_outside_catalogue',
        feasibilityNote: isRcspFeasible ? undefined : 'Road route available — complete EV journey not currently feasible.',
        infeasibilityDetails: rcspInfeasibilityDetails,
        calculationMethod: 'RCSP Optimizer',
        geometrySource,
        geometryStatus: geometrySource === 'tomtom'
          ? 'PROVIDER_ROAD_GEOMETRY'
          : geometrySource === 'osrm'
          ? 'OSRM_ROAD_GEOMETRY'
          : 'APPROXIMATE_GEOMETRY',
        roadValidated,
        trafficSummary: rcspTrafficSummary
      };

      if (isRcspFeasible) {
        generatedOptions.unshift(rcspOption);
        activeRouteId = 'route-rcsp';
      } else {
        // If RCSP is infeasible on real road distance, still provide it for user inspection,
        // but mark greedy fallback as active with clear identification
        generatedOptions.push(rcspOption);
        const fallback = generatedOptions.find((o) => o.id === 'route-optimal') || generatedOptions[0];
        if (fallback) {
          fallback.calculationMethod = 'Greedy Fallback';
          fallback.badge = 'Greedy Fallback';
          activeRouteId = fallback.id;
        }
      }
    } else {
      // RCSP found no candidate sequence at all; fallback to greedy
      const fallback = generatedOptions.find((o) => o.id === 'route-optimal') || generatedOptions[0];
      if (fallback) {
        fallback.calculationMethod = 'Greedy Fallback';
        fallback.badge = 'Greedy Fallback';
        activeRouteId = fallback.id;
      }
    }
  }

  if (generatedOptions.length > 0 && !generatedOptions.some((o) => o.id === activeRouteId)) {
    activeRouteId = generatedOptions[0].id;
  }

  return {
    routeOptions: generatedOptions,
    activeRouteId
  };
}
