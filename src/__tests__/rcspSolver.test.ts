import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { solveRcsp } from '../services/rcspSolver';
import { RouteCalculationRequest } from '../types/route';
import { VehicleProfile } from '../types/vehicle';
import { ChargingStation } from '../types/station';
import { chargingStations } from '../data/stationCatalogue';
import { getEligibleStations, projectStationOnPolyline } from '../services/routingService';
import { calculateChargingDuration } from '../services/energyModel';

// Helper to clone original stations and restore after test
let originalStations: ChargingStation[] = [];

beforeEach(() => {
  originalStations = [...chargingStations];
});

afterEach(() => {
  // restore original global stations
  (chargingStations as unknown as ChargingStation[]).length = 0;
  chargingStations.push(...originalStations);
});

function createVehicle(): VehicleProfile {
  return {
    id: 'test-vehicle',
    name: 'Test EV',
    usableBatteryKwh: 40,
    batteryDegradationPercent: 0,
    maxDcChargingKw: 50,
    referenceConsumptionWhPerMi: 250,
    selectedPlugTypes: ['CCS'],
    relativeSpeedPercent: 100,
  } as any;
}

function createStation(id: string, lat: number, lon: number, powerKw: number): ChargingStation {
  return {
    id,
    name: `Station ${id}`,
    network: 'TestNet',
    address: 'Test Address',
    coordinates: [lat, lon] as [number, number],
    ratedPowerKw: powerKw,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [{ type: 'CCS' as const, maxPowerKw: powerKw, count: 2 }],
    amenities: [],
    pricePerKwh: '₹22.5',
  } as any;
}

describe('RCSP Solver – deterministic scenarios', () => {
  it('chooses higher‑power station despite slightly longer detour', () => {
    // Override global station list with two custom stations along a ~100-mile journey
    (chargingStations as unknown as ChargingStation[]).length = 0;
    // Station A at ~30 mi (lat 0.4342, lon 0): 15 kW (slow charger on direct path)
    const stationA = createStation('A', 0.4342, 0, 15);
    // Station B at ~35 mi (lat 0.5066, lon 0.05): 50 kW (fast charger with minor 3.5 mi lateral detour)
    const stationB = createStation('B', 0.5066, 0.05, 50);
    chargingStations.push(stationA, stationB);

    // 100-mile journey from (0, 0) to (1.4474, 0).
    // Starting with 40% SoC in a 40 kWh battery (250 Wh/mi consumption = 62.5% SoC for 100 miles).
    // Direct journey arrives at 40 - 62.5 = -22.5% < 10% min destination reserve (strictly infeasible).
    // Both stations can be reached with arrival SoC > 10% min charger reserve.
    // Station B (50 kW) saves ~35 min charging time compared to Station A (15 kW).
    const request: RouteCalculationRequest = {
      origin: { id: 'o', name: 'O', coordinates: [0, 0], batterySoc: 40 },
      destination: { id: 'd', name: 'D', coordinates: [1.4474, 0], batterySoc: 0 },
      vehicle: createVehicle(),
      planOptions: {
        chargeStops: 'Optimal',
        destinationArrivalSoc: 10,
        avoidTolls: false,
        avoidHighways: false,
        avoidFerriesAndTrains: false,
        avoidBorders: false,
        preferredNetworks: []
      } as any,
      chargingSettings: {
        chargeCards: [],
        preferredNetworks: [],
        avoidedNetworks: [],
        excludedChargers: [],
        minimumChargerStalls: 1,
        maximumChargeLimit: 100,
        restroomAvailable: false,
        trailerFriendly: false,
        dogFriendly: false,
        familyFriendly: false,
        preferredMinArrivalBatteryCharger: 10,
        preferredMinArrivalBatteryDestination: 10
      } as any,
      routingSettings: {
        chargeStops: 'Optimal',
        avoidTolls: false,
        avoidBorders: false,
        avoidHighways: false,
        avoidFerries: false,
        realTimeTraffic: false,
        adjustSpeed: false,
        weatherChoice: 'Real-time',
        seasonalWeatherDescription: ''
      } as any,
    };

    // Verify candidate stations survive eligibility and projection corridor filters
    const eligible = getEligibleStations(chargingStations, request.vehicle, request.planOptions, request.chargingSettings);
    expect(eligible.map(s => s.id)).toContain('A');
    expect(eligible.map(s => s.id)).toContain('B');

    const polyline: [number, number][] = [request.origin.coordinates, request.destination.coordinates];
    const projB = projectStationOnPolyline(stationB.coordinates, polyline);
    expect(projB.detourMi).toBeLessThanOrEqual(25);
    expect(projB.distFromOriginMi).toBeGreaterThan(5);
    expect(projB.distFromOriginMi).toBeLessThan(95);

    const rcspResult = solveRcsp(request);
    expect(rcspResult).not.toBeNull();
    // Expect exactly one stop (the high‑power station B) because 15 kW Station A
    // requires a much longer charging duration.
    expect(rcspResult!.stopCount).toBe(1);
    expect(rcspResult!.stops[0].stationId).toBe('B');

    // Verify that total duration is strictly less than route using low-power Station A
    const lowPowerLegDist = 30; // miles to Station A
    const greedyChargingTime = (() => {
      const legEnergy = (lowPowerLegDist * 250) / 1000; // kWh
      const startSoc = 40;
      const arrivalSoc = startSoc - (legEnergy / 40) * 100;
      const targetSoc = 100;
      const chargeEst = calculateChargingDuration({
        usableCapacityKwh: 40,
        degradationPercent: 0,
        maxDcChargingKw: 15,
        stationPowerKw: 15,
        currentSocPercent: arrivalSoc,
        targetSocPercent: targetSoc,
      });
      const driveMin = Math.round(100 * 1.33);
      return driveMin + Math.max(5, chargeEst.durationMinutes) + 5;
    })();

    expect(rcspResult!.totalDurationMinutes).toBeLessThan(greedyChargingTime);
  });
});

