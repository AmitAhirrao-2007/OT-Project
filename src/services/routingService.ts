import { ChargingStop, RouteOption, Waypoint } from '../types/route';
import { VehicleProfile } from '../types/vehicle';
import { ChargingSettings, PlanOptions, RoutingSettings } from '../types/settings';
import { ChargingStation } from '../types/station';
import { chargingStations } from '../data/stationCatalogue';
import { calculateChargingDuration, calculateLegEnergy, checkLegFeasibility } from './energyModel';
import { demoTrip } from '../data/demoRoute';

export interface RouteCalculationRequest {
  origin: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  vehicle: VehicleProfile;
  planOptions: PlanOptions;
  chargingSettings: ChargingSettings;
  routingSettings: RoutingSettings;
}

export interface RouteCalculationResult {
  routeOptions: RouteOption[];
  activeRouteId: string;
}

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
 * Formats minutes into standard "X h Y min" or "Y min" string.
 */
export function formatHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/**
 * Parses duration strings such as "3 h 38 min" or "41 min" into total integer minutes.
 */
export function parseDurationStringToMinutes(str: string): number {
  if (!str) return 0;
  let total = 0;
  const hMatch = str.match(/(\d+)\s*h/i);
  const mMatch = str.match(/(\d+)\s*min/i);
  if (hMatch) total += parseInt(hMatch[1], 10) * 60;
  if (mMatch) total += parseInt(mMatch[1], 10);
  return total || 0;
}

/**
 * Parses station tariff strings such as "₹22.50 / kWh" into numeric tariff values.
 */
export function parsePricePerKwh(priceStr?: string): number {
  if (!priceStr) return 21.0;
  const match = priceStr.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 21.0;
}

/**
 * Adds minutes to an HH:MM AM/PM string, wrapping around 24 hours.
 */
export function addMinutesToTimeString(startTime: string, minutesToAdd: number): string {
  const match = startTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  let hours = 12;
  let mins = 0;

  if (match) {
    hours = parseInt(match[1], 10);
    mins = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }

  const totalMin = (hours * 60 + mins + Math.round(minutesToAdd)) % (24 * 60);
  const newHours24 = Math.floor(totalMin / 60);
  const newMins = totalMin % 60;

  const displayHours = newHours24 % 12 === 0 ? 12 : newHours24 % 12;
  const displayMeridiem = newHours24 >= 12 ? 'PM' : 'AM';
  const displayMins = newMins.toString().padStart(2, '0');

  return `${displayHours}:${displayMins} ${displayMeridiem}`;
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

  const PATNA: [number, number] = [25.5941, 85.1376];
  const DELHI: [number, number] = [28.6139, 77.2090];
  const tol = 0.25; // ~25 km coordinate tolerance

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
): Promise<{ coordinates: [number, number][]; distanceMi: number; durationMinutes: number } | null> {
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

    return {
      coordinates: geojsonCoords,
      distanceMi: Math.max(1, Math.round(distanceMi)),
      durationMinutes: Math.max(1, Math.round(durationMinutes))
    };
  } catch {
    return null;
  }
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

      // 2. Check avoided networks
      if (avoided.includes(station.network)) return false;

      // 3. Check connector compatibility with selected vehicle plug types
      const hasCompatiblePlug = station.connectors.some((c) =>
        vehicle.selectedPlugTypes.includes(c.type)
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
      // Prioritize preferred networks
      const aPref = preferred.includes(a.network) ? 1 : 0;
      const bPref = preferred.includes(b.network) ? 1 : 0;
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
 * Recomputes the Patna-to-Delhi demonstration fixture with full physical battery feasibility,
 * genuine vehicle charging capabilities, station tariff data, and arrival timing.
 */
function replanPatnaDelhiFixture(req: RouteCalculationRequest): RouteCalculationResult {
  const { origin, vehicle, planOptions, chargingSettings, routingSettings } = req;
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
        isExcluded
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

    const chargingDurationMinutes = updatedStops.reduce((sum, s) => sum + s.chargeDurationMinutes, 0);
    const stopBufferMinutes = updatedStops.length * 5;
    const totalDurationMinutes = opt.drivingDurationMinutes + chargingDurationMinutes + stopBufferMinutes;
    const totalDurationStr = formatHoursMinutes(totalDurationMinutes);

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
      isFeasible: allStopsFeasible
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

  // 2. Fetch road geometry from OSRM with fallback to interpolated highway curve
  const initialRoadData = await fetchRoadGeometry(initialEndpoints);
  const roadDistanceMi = initialRoadData
    ? initialRoadData.distanceMi
    : Math.round(
        initialEndpoints.reduce((acc, pt, i) => {
          if (i === 0) return acc;
          return acc + haversineDistanceMi(initialEndpoints[i - 1], pt) * 1.28;
        }, 0)
      );

  const roadDurationMinutes = initialRoadData
    ? initialRoadData.durationMinutes
    : Math.round(roadDistanceMi * 1.35);

  const initialPolyline =
    initialRoadData?.coordinates ||
    initialEndpoints.reduce<[number, number][]>((acc, pt, i) => {
      if (i === 0) return [pt];
      const prev = initialEndpoints[i - 1];
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        acc.push([
          prev[0] + ((pt[0] - prev[0]) * s) / steps,
          prev[1] + ((pt[1] - prev[1]) * s) / steps
        ]);
      }
      return acc;
    }, []);

  // 3. Spatially identify candidate charging stations along the route corridor
  const eligibleStations = getEligibleStations(chargingStations, vehicle, planOptions, chargingSettings);
  const maxDetourMi = 25; // max 25 miles from route corridor

  interface StationWithProjection {
    station: ChargingStation;
    detourMi: number;
    distFromOriginMi: number;
  }

  const corridorStations: StationWithProjection[] = [];
  for (const st of eligibleStations) {
    const proj = projectStationOnPolyline(st.coordinates, initialPolyline);
    if (proj.detourMi <= maxDetourMi && proj.distFromOriginMi > 5 && proj.distFromOriginMi < roadDistanceMi - 5) {
      corridorStations.push({
        station: st,
        detourMi: proj.detourMi,
        distFromOriginMi: proj.distFromOriginMi
      });
    }
  }

  // Sort corridor stations by their progression along the route
  corridorStations.sort((a, b) => a.distFromOriginMi - b.distFromOriginMi);

  // 4. Battery constraints
  const initialSoc = origin.batterySoc !== undefined ? origin.batterySoc : 95;
  const minChargerReserve = chargingSettings.preferredMinArrivalBatteryCharger || 10;
  const minDestReserve =
    planOptions.destinationArrivalSoc ||
    chargingSettings.preferredMinArrivalBatteryDestination ||
    10;
  const maxChargeLimit = Math.min(100, chargingSettings.maximumChargeLimit || 100);

  // 5. Strategy variations
  const strategies: { id: string; name: string; targetSoc: number; badge?: string }[] = [
    { id: 'route-optimal', name: 'Optimal', targetSoc: 72, badge: 'Faster' },
    { id: 'route-fewer', name: 'Fewer stops', targetSoc: 82, badge: '+14 min' },
    { id: 'route-fewest', name: 'Fewest stops', targetSoc: 90, badge: '+42 min' }
  ];

  const generatedOptions: RouteOption[] = [];

  for (const strat of strategies) {
    let currentSoc = initialSoc;
    let currDistFromOrigin = 0;
    let accumulatedTime = origin.departureTime || '08:00 AM';
    let isTripFeasible = true;
    let totalExpenseInr = 0;
    const stops: ChargingStop[] = [];

    while (currDistFromOrigin < roadDistanceMi) {
      const distToDest = roadDistanceMi - currDistFromOrigin;
      const directDestEnergy = calculateLegEnergy({ distanceMi: distToDest, vehicle });
      const directDestArrivalSoc = Number((currentSoc - directDestEnergy.socPercent).toFixed(1));

      // Can we reach final destination directly with required reserve?
      if (directDestArrivalSoc >= minDestReserve) {
        break; // Destination reachable directly
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
        // Infeasible! No reachable station ahead under current battery reserve
        isTripFeasible = false;
        break;
      }

      // Pick the best station among reachable ones:
      // Score factors:
      // - Farther along = more battery capacity utilized
      // - Preferred network bonus
      // - Higher station kW power
      // - Lower detour distance
      reachableCandidates.sort((a, b) => {
        const preferred = planOptions.preferredNetworks || chargingSettings.preferredNetworks || [];
        const aPref = preferred.includes(a.station.network) ? 30 : 0;
        const bPref = preferred.includes(b.station.network) ? 30 : 0;
        const aPowerScore = a.station.ratedPowerKw * 0.1;
        const bPowerScore = b.station.ratedPowerKw * 0.1;
        const aDetourPenalty = a.detourMi * 1.5;
        const bDetourPenalty = b.detourMi * 1.5;

        const aScore = a.distFromOriginMi + aPref + aPowerScore - aDetourPenalty;
        const bScore = b.distFromOriginMi + bPref + bPowerScore - bDetourPenalty;
        return bScore - aScore;
      });

      const chosen = reachableCandidates[0];
      const legDist = Math.round(chosen.distFromOriginMi - currDistFromOrigin);
      const legEnergy = calculateLegEnergy({ distanceMi: legDist, vehicle });
      const arrivalSoc = Number((currentSoc - legEnergy.socPercent).toFixed(1));

      // Target departure SoC
      const targetSoc = Math.min(
        maxChargeLimit,
        Math.max(arrivalSoc + 25, strat.targetSoc)
      );

      // Use vehicle's genuine maxDcChargingKw
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

      stops.push({
        id: `custom-stop-${strat.id}-${stops.length + 1}`,
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
        isExcluded: false
      });

      currDistFromOrigin = chosen.distFromOriginMi;
      currentSoc = targetSoc;
    }

    // 6. Geometry routing through the selected charging stops
    let finalPolyline = initialPolyline;
    let finalDistanceMi = roadDistanceMi;
    let finalDriveMinutes = roadDurationMinutes;

    if (stops.length > 0) {
      const stopWaypoints: [number, number][] = [
        origin.coordinates,
        ...stops.map((s) => s.coordinates),
        destination.coordinates
      ];
      const stopsRoadData = await fetchRoadGeometry(stopWaypoints);
      if (stopsRoadData) {
        finalPolyline = stopsRoadData.coordinates;
        finalDistanceMi = stopsRoadData.distanceMi;
        finalDriveMinutes = stopsRoadData.durationMinutes;
      }
    }

    const totalChargingMinutes = stops.reduce((sum, s) => sum + s.chargeDurationMinutes, 0);
    const stopBufferMinutes = stops.length * 5;
    const totalDurationMinutes = finalDriveMinutes + totalChargingMinutes + stopBufferMinutes;
    const totalDurationStr = formatHoursMinutes(totalDurationMinutes);

    generatedOptions.push({
      id: strat.id,
      label: totalDurationStr,
      badge: strat.badge,
      description: `${strat.name} strategy (${stops.length} stops)`,
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
      calculationMethod: initialRoadData
        ? 'OSRM Road Router + Calibrated Model'
        : 'Energy-Constrained Path Simulation'
    });
  }

  let activeRouteId = 'route-optimal';
  if (planOptions.avoidTolls || routingSettings.avoidTolls) {
    activeRouteId = 'route-fewest';
  } else if (planOptions.chargeStops === 'Fewest' || routingSettings.chargeStops === 'Fewest') {
    activeRouteId = 'route-fewest';
  } else if (planOptions.chargeStops === 'Fewer' || routingSettings.chargeStops === 'Fewer') {
    activeRouteId = 'route-fewer';
  }

  return {
    routeOptions: generatedOptions,
    activeRouteId
  };
}
