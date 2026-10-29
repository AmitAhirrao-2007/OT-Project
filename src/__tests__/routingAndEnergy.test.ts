import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMi,
  formatHoursMinutes,
  parseDurationStringToMinutes,
  parsePricePerKwh,
  addMinutesToTimeString,
  isDefaultPatnaDelhiCorridor,
  getEligibleStations,
  projectStationOnPolyline,
  calculateTripRoutes
} from '../services/routingService';
import {
  calculateLegEnergy,
  calculateChargingDuration,
  checkLegFeasibility,
  getEffectiveBatteryCapacity
} from '../services/energyModel';
import {
  formatDistance,
  formatSpeed,
  formatConsumption,
  formatTemperature
} from '../utils/units';
import { initialVehicleProfile, availableVehicles } from '../data/demoVehicle';
import {
  initialPlanOptions,
  initialChargingSettings,
  initialRoutingSettings
} from '../data/demoSettings';
import { chargingStations } from '../data/stationCatalogue';
import { demoTrip } from '../data/demoRoute';
import { ChargingStation } from '../types/station';
import { Waypoint } from '../types/route';

describe('EV Route Planner — Core Correctness Test Suite', () => {
  // 1. Haversine Distance
  describe('1. Haversine distance calculations', () => {
    it('calculates zero distance for identical coordinates', () => {
      const coord: [number, number] = [25.5941, 85.1376];
      expect(haversineDistanceMi(coord, coord)).toBe(0);
    });

    it('calculates realistic straight-line distance between Patna and Delhi', () => {
      const patna: [number, number] = [25.5941, 85.1376];
      const delhi: [number, number] = [28.6139, 77.2090];
      const dist = haversineDistanceMi(patna, delhi);
      expect(dist).toBeGreaterThan(500);
      expect(dist).toBeLessThan(600);
    });
  });

  // 2. Unit Conversions
  describe('2. Unit conversions (Imperial vs. Metric)', () => {
    it('formats distance correctly in miles and kilometers', () => {
      expect(formatDistance(100, 'imperial')).toBe('100 mi');
      expect(formatDistance(100, 'metric')).toBe('161 km');
    });

    it('formats speed correctly in mph and km/h', () => {
      expect(formatSpeed(60, 'imperial')).toBe('60 mph');
      expect(formatSpeed(60, 'metric')).toBe('97 km/h');
    });

    it('formats energy consumption accurately', () => {
      expect(formatConsumption(245, 'imperial')).toBe('245 Wh/mi');
      expect(formatConsumption(245, 'metric')).toBe('152 Wh/km');
    });

    it('formats temperature in Fahrenheit and Celsius', () => {
      expect(formatTemperature(72, 'F')).toBe('72°F');
      expect(formatTemperature(72, 'C')).toBe('22°C');
      expect(formatTemperature(32, 'C')).toBe('0°C');
    });
  });

  // 3. Energy Consumption Model
  describe('3. Energy consumption modeling', () => {
    it('scales consumption with aerodynamic speed drag ratio ^ 1.8', () => {
      const legStandard = calculateLegEnergy({
        distanceMi: 100,
        vehicle: initialVehicleProfile,
        ambientTempF: 72,
        relativeSpeedPercent: 100
      });

      const legFaster = calculateLegEnergy({
        distanceMi: 100,
        vehicle: initialVehicleProfile,
        ambientTempF: 72,
        relativeSpeedPercent: 120
      });

      expect(legFaster.energyKwh).toBeGreaterThan(legStandard.energyKwh * 1.3);
    });

    it('applies cold weather penalty below 65°F and AC penalty above 85°F', () => {
      const normal = calculateLegEnergy({ distanceMi: 50, vehicle: initialVehicleProfile, ambientTempF: 72 });
      const cold = calculateLegEnergy({ distanceMi: 50, vehicle: initialVehicleProfile, ambientTempF: 35 });
      const hot = calculateLegEnergy({ distanceMi: 50, vehicle: initialVehicleProfile, ambientTempF: 105 });

      expect(cold.energyKwh).toBeGreaterThan(normal.energyKwh);
      expect(hot.energyKwh).toBeGreaterThan(normal.energyKwh);
    });
  });

  // 4. Battery Degradation
  describe('4. Battery degradation handling', () => {
    it('reduces usable capacity once and does not double-count', () => {
      const effectiveCap = getEffectiveBatteryCapacity(initialVehicleProfile);
      // 38.0 kWh usable * (1 - 0.051) = 36.062 kWh
      expect(effectiveCap).toBeCloseTo(36.06, 1);

      // Verify charging calculation applies degradation once
      const estimate = calculateChargingDuration({
        usableCapacityKwh: initialVehicleProfile.usableBatteryKwh,
        degradationPercent: initialVehicleProfile.batteryDegradationPercent,
        maxDcChargingKw: 50,
        stationPowerKw: 150,
        currentSocPercent: 10,
        targetSocPercent: 80
      });

      expect(estimate.effectiveCapacityKwh).toBeCloseTo(36.06, 1);
    });
  });

  // 5. Charging Time & Piecewise Taper Curves
  describe('5. Charging-time and curve taper calculations', () => {
    it('uses vehicle maxDcChargingKw constraint rather than speed', () => {
      // Tata Nexon EV Max has maxDcChargingKw = 50 kW
      const nexonEstimate = calculateChargingDuration({
        usableCapacityKwh: initialVehicleProfile.usableBatteryKwh,
        degradationPercent: initialVehicleProfile.batteryDegradationPercent,
        maxDcChargingKw: initialVehicleProfile.maxDcChargingKw,
        stationPowerKw: 240, // 240 kW station
        currentSocPercent: 10,
        targetSocPercent: 60
      });

      // Hyundai Ioniq 5 has maxDcChargingKw = 240 kW
      const ioniq = availableVehicles.find((v) => v.id === 'hyundai-ioniq-5')!;
      const ioniqEstimate = calculateChargingDuration({
        usableCapacityKwh: ioniq.usableBatteryKwh,
        degradationPercent: ioniq.batteryDegradationPercent,
        maxDcChargingKw: ioniq.maxDcChargingKw,
        stationPowerKw: 240,
        currentSocPercent: 10,
        targetSocPercent: 60
      });

      // Nexon charges at 50 kW, Ioniq charges at 240 kW; average power must reflect this
      expect(nexonEstimate.averagePowerKw).toBeLessThanOrEqual(50);
      expect(ioniqEstimate.averagePowerKw).toBeGreaterThan(150);
    });

    it('demonstrates power taper past 60% and 80%', () => {
      // 10% to 50% (peak constant stage)
      const stage1 = calculateChargingDuration({
        usableCapacityKwh: 40,
        maxDcChargingKw: 100,
        stationPowerKw: 100,
        currentSocPercent: 10,
        targetSocPercent: 50
      });

      // 60% to 100% (tapered stage)
      const stageTaper = calculateChargingDuration({
        usableCapacityKwh: 40,
        maxDcChargingKw: 100,
        stationPowerKw: 100,
        currentSocPercent: 60,
        targetSocPercent: 100
      });

      // Both add 40% SoC (16 kWh), but stageTaper must take longer due to tapering
      expect(stageTaper.durationMinutes).toBeGreaterThan(stage1.durationMinutes * 1.3);
      expect(stageTaper.averagePowerKw).toBeLessThan(stage1.averagePowerKw);
    });
  });

  // 6. Station Pricing
  describe('6. Station-specific tariff pricing', () => {
    it('parses station price strings into numeric tariffs', () => {
      expect(parsePricePerKwh('₹22.50 / kWh')).toBe(22.5);
      expect(parsePricePerKwh('₹19.00 / kWh')).toBe(19.0);
      expect(parsePricePerKwh('₹21.00')).toBe(21.0);
      expect(parsePricePerKwh(undefined)).toBe(21.0);
    });
  });

  // 7. Connector Compatibility
  describe('7. Connector compatibility filtering', () => {
    it('filters out stations when vehicle plug types do not match', () => {
      const ccsOnlyVehicle = { ...initialVehicleProfile, selectedPlugTypes: ['CCS' as const] };
      const chAdeMoStation: ChargingStation = {
        ...chargingStations[0],
        id: 'chademo-only-hub',
        connectors: [{ type: 'CHAdeMO', maxPowerKw: 50, count: 2 }]
      };

      const eligible = getEligibleStations([chAdeMoStation], ccsOnlyVehicle, initialPlanOptions, initialChargingSettings);
      expect(eligible).toHaveLength(0);
    });

    it('retains stations with matching vehicle connector', () => {
      const ccsVehicle = { ...initialVehicleProfile, selectedPlugTypes: ['CCS' as const] };
      const eligible = getEligibleStations(chargingStations, ccsVehicle, initialPlanOptions, initialChargingSettings);
      expect(eligible.length).toBeGreaterThanOrEqual(8);
    });
  });

  // 8. Excluded and Avoided Stations
  describe('8. Station exclusion and network avoidance', () => {
    it('filters excluded charger IDs', () => {
      const excludedId = chargingStations[0].id;
      const settings = { ...initialChargingSettings, excludedChargers: [excludedId] };
      const eligible = getEligibleStations(chargingStations, initialVehicleProfile, initialPlanOptions, settings);
      expect(eligible.some((s) => s.id === excludedId)).toBe(false);
    });

    it('filters avoided network operators', () => {
      const settings = { ...initialChargingSettings, avoidedNetworks: ['Adani Total Energies'] };
      const eligible = getEligibleStations(chargingStations, initialVehicleProfile, initialPlanOptions, settings);
      expect(eligible.some((s) => s.network === 'Adani Total Energies')).toBe(false);
    });
  });

  // 9. Zero Available Stalls
  describe('9. Zero available stalls distinction', () => {
    it('does not replace 0 available stalls with totalStalls', () => {
      const stationZero: ChargingStation = {
        ...chargingStations[0],
        totalStalls: 4,
        availableStalls: 0
      };

      // When minimum stalls requirement is 2, a station with 0 available stalls must be excluded
      const settings = { ...initialChargingSettings, minimumChargerStalls: 2 };
      const eligible = getEligibleStations([stationZero], initialVehicleProfile, initialPlanOptions, settings);
      expect(eligible).toHaveLength(0);
    });

    it('permits station with 0 available stalls if minimum stalls is 1 (unreserved walkup)', () => {
      const stationZero: ChargingStation = {
        ...chargingStations[0],
        totalStalls: 4,
        availableStalls: 0
      };

      const settings = { ...initialChargingSettings, minimumChargerStalls: 1 };
      const eligible = getEligibleStations([stationZero], initialVehicleProfile, initialPlanOptions, settings);
      expect(eligible).toHaveLength(1);
    });
  });

  // 10. Route Leg Battery Feasibility
  describe('10. Route leg battery feasibility and clamping removal', () => {
    it('does NOT clamp arrival SoC to positive numbers when battery is depleted', () => {
      // 180 miles in a 38 kWh battery at 245 Wh/mi consumes ~44 kWh (exceeds 100% capacity)
      const res = checkLegFeasibility(50, 180, initialVehicleProfile, 10);
      expect(res.arrivalSoc).toBeLessThan(0); // must be negative, never clamped to 8%!
      expect(res.isFeasible).toBe(false);
      expect(res.deficitSoc).toBeGreaterThan(10);
    });

    it('marks leg feasible when arrival battery is comfortably above minimum reserve', () => {
      const res = checkLegFeasibility(90, 40, initialVehicleProfile, 10);
      expect(res.arrivalSoc).toBeGreaterThan(60);
      expect(res.isFeasible).toBe(true);
      expect(res.deficitSoc).toBe(0);
    });
  });

  // 11. Route Summary Arithmetic
  describe('11. Route summary single-source-of-truth arithmetic', () => {
    it('ensures total duration strictly equals driving + charging + stop buffer', () => {
      for (const route of demoTrip.routeOptions) {
        const expectedTotal = route.drivingDurationMinutes + route.chargingDurationMinutes + route.stopBufferMinutes;
        expect(route.totalDurationMinutes).toBe(expectedTotal);
        expect(route.stopBufferMinutes).toBe(route.stops.length * 5);
      }
    });

    it('formats duration strings consistently', () => {
      expect(formatHoursMinutes(881)).toBe('14 h 41 min');
      expect(parseDurationStringToMinutes('14 h 41 min')).toBe(881);
      expect(addMinutesToTimeString('12:31 AM', 120)).toBe('2:31 AM');
    });
  });

  // 12. Default-Corridor Coordinate Detection
  describe('12. Default-corridor coordinate detection', () => {
    it('returns true for exact Patna to Delhi coordinates with no custom waypoints', () => {
      const patna: Waypoint = { id: 'p', name: 'Patna', coordinates: [25.5941, 85.1376], batterySoc: 95 };
      const delhi: Waypoint = { id: 'd', name: 'Delhi', coordinates: [28.6139, 77.2090], batterySoc: 10 };
      expect(isDefaultPatnaDelhiCorridor(patna, delhi, [])).toBe(true);
    });

    it('returns false for reverse Delhi to Patna direction', () => {
      const patna: Waypoint = { id: 'p', name: 'Patna', coordinates: [25.5941, 85.1376], batterySoc: 95 };
      const delhi: Waypoint = { id: 'd', name: 'Delhi', coordinates: [28.6139, 77.2090], batterySoc: 10 };
      expect(isDefaultPatnaDelhiCorridor(delhi, patna, [])).toBe(false);
    });

    it('returns false when intermediate custom waypoints exist', () => {
      const patna: Waypoint = { id: 'p', name: 'Patna', coordinates: [25.5941, 85.1376], batterySoc: 95 };
      const delhi: Waypoint = { id: 'd', name: 'Delhi', coordinates: [28.6139, 77.2090], batterySoc: 10 };
      const wp: Waypoint = { id: 'w1', name: 'Lucknow', coordinates: [26.8467, 80.9462], batterySoc: 50 };
      expect(isDefaultPatnaDelhiCorridor(patna, delhi, [wp])).toBe(false);
    });

    it('returns false for unrelated cities with similar latitudes', () => {
      // Jaipur [26.91, 75.78] to Meerut [28.98, 77.70]
      const jaipur: Waypoint = { id: 'j', name: 'Jaipur', coordinates: [26.9124, 75.7873], batterySoc: 95 };
      const meerut: Waypoint = { id: 'm', name: 'Meerut', coordinates: [28.9845, 77.7064], batterySoc: 10 };
      expect(isDefaultPatnaDelhiCorridor(jaipur, meerut, [])).toBe(false);
    });
  });

  // 13. Polyline Station Projection
  describe('13. Polyline station projection and spatial distance', () => {
    it('projects a station onto a line segment and calculates detour distance', () => {
      const polyline: [number, number][] = [
        [25.5, 85.0],
        [26.5, 83.0],
        [27.5, 80.0]
      ];
      const azamgarhStation: [number, number] = [26.0684, 83.1859];
      const proj = projectStationOnPolyline(azamgarhStation, polyline);

      expect(proj.detourMi).toBeLessThan(35);
      expect(proj.distFromOriginMi).toBeGreaterThan(50);
    });
  });

  // 14. Preference Consistency
  describe('14. Preference consistency across Plan Options and Charging Settings', () => {
    it('has matching empty preferred networks defaults', () => {
      expect(initialPlanOptions.preferredNetworks).toEqual([]);
      expect(initialChargingSettings.preferredNetworks).toEqual([]);
    });

    it('has matching destination arrival SoC defaults', () => {
      expect(initialPlanOptions.destinationArrivalSoc).toBe(10);
      expect(initialChargingSettings.preferredMinArrivalBatteryDestination).toBe(10);
    });
  });

  // 15. No Feasible Route Behavior
  describe('15. Infeasible journey handling', () => {
    it('returns isFeasible = false when no eligible stations exist and distance exceeds range', async () => {
      const remoteOrigin: Waypoint = {
        id: 'rem-orig',
        name: 'Remote Mountain A',
        coordinates: [32.0, 76.0],
        batterySoc: 30
      };
      const remoteDest: Waypoint = {
        id: 'rem-dest',
        name: 'Remote Valley B',
        coordinates: [34.0, 78.0],
        batterySoc: 10
      };

      // Vehicle with 30% battery cannot travel 250 miles with 0 stations
      const result = await calculateTripRoutes({
        origin: remoteOrigin,
        destination: remoteDest,
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      });

      // Must be flagged as infeasible and must NOT arbitrarily select first station in catalogue
      expect(result.routeOptions.every((r) => r.isFeasible === false)).toBe(true);
      expect(result.routeOptions[0].stops).toHaveLength(0);
    });
  });
});
