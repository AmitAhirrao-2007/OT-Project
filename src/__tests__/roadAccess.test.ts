import { describe, it, expect } from 'vitest';
import {
  calculateBearing,
  bearingToCardinalDirection,
  calculateRouteHeading,
  validateStationRoadAccess,
  evaluateBackupCharger
} from '../services/roadAccessService';
import { ChargingStation } from '../types/station';
import { RouteCalculationRequest } from '../types/route';
import { initialVehicleProfile } from '../data/demoVehicle';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { calculateTripRoutes } from '../services/routingService';
import { solveRcsp } from '../services/rcspSolver';
import { getEligibleStations } from '../utils/geoUtils';
import { chargingStations } from '../data/stationCatalogue';

describe('Phase 5A Real-Road Charger Accessibility & Carriageway Validation', () => {
  const mockBaseStation: ChargingStation = {
    id: 'test-sta-1',
    name: 'Test Charger Alpha',
    network: 'TestNet',
    address: 'Expressway Mile 50',
    coordinates: [26.0, 81.0],
    ratedPowerKw: 150,
    totalStalls: 4,
    availableStalls: 3,
    connectors: [{ type: 'CCS', maxPowerKw: 150, count: 4, availableCount: 3 }],
    amenities: ['restaurant', 'restroom'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 5m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['UPI'],
    dataSource: 'Reference Simulation'
  };

  // Scenario 1
  it('1. should validate direct two-way access for bidirectional highway stations', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'both',
        supportedDirections: ['both', 'eastbound', 'westbound'],
        actualDetourMi: 0.4,
        accessConfidence: 0.95
      }
    };

    const polyline: [number, number][] = [
      [26.0, 82.0],
      [26.0, 80.0] // Westbound
    ];

    const result = validateStationRoadAccess(station, polyline, 30, 0.2);
    expect(result.isAccessible).toBe(true);
    expect(result.accessStatus).toBe('verified');
    expect(result.carriageway).toBe('both');
    expect(result.actualDetourMi).toBe(0.4);
  });

  // Scenario 2
  it('2. should reject or flag stations on divided highways with opposing carriageway access', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'divided_unidirectional',
        supportedDirections: ['eastbound'], // Only accessible when traveling East
        actualDetourMi: 0.5,
        accessConfidence: 0.95
      }
    };

    const westboundPolyline: [number, number][] = [
      [26.0, 82.0],
      [26.0, 80.0] // Heading 270 deg (Westbound)
    ];

    const result = validateStationRoadAccess(station, westboundPolyline, 30, 0.2);
    expect(result.isAccessible).toBe(false);
    expect(result.rejectionReason).toContain('Opposite carriageway with median barrier');
    expect(result.rejectionReason).toContain('westbound');
  });

  // Scenario 3
  it('3. should allow access on divided highway when vehicle travel direction matches carriageway direction', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'divided_unidirectional',
        supportedDirections: ['eastbound'],
        actualDetourMi: 0.5,
        accessConfidence: 0.95
      }
    };

    const eastboundPolyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0] // Heading 90 deg (Eastbound)
    ];

    const result = validateStationRoadAccess(station, eastboundPolyline, 30, 0.2);
    expect(result.isAccessible).toBe(true);
    expect(result.carriageway).toBe('divided_unidirectional');
  });

  // Scenario 4
  it('4. should correctly determine vehicle travel heading and cardinal direction from polyline progression', () => {
    // Northbound
    const northHeading = calculateBearing([25.0, 80.0], [26.0, 80.0]);
    expect(northHeading).toBeCloseTo(0, 0);
    expect(bearingToCardinalDirection(northHeading)).toBe('northbound');

    // Eastbound
    const eastHeading = calculateBearing([25.0, 80.0], [25.0, 81.0]);
    expect(eastHeading).toBeCloseTo(90, 0);
    expect(bearingToCardinalDirection(eastHeading)).toBe('eastbound');

    // Southbound
    const southHeading = calculateBearing([26.0, 80.0], [25.0, 80.0]);
    expect(southHeading).toBeCloseTo(180, 0);
    expect(bearingToCardinalDirection(southHeading)).toBe('southbound');

    // Westbound
    const westHeading = calculateBearing([25.0, 81.0], [25.0, 80.0]);
    expect(westHeading).toBeCloseTo(270, 0);
    expect(bearingToCardinalDirection(westHeading)).toBe('westbound');

    // Multi-segment polyline heading lookup
    const multiSegmentPolyline: [number, number][] = [
      [25.0, 80.0],
      [25.0, 81.0], // Eastbound for ~60 miles
      [26.0, 81.0]  // Then Northbound
    ];
    const headingEarly = calculateRouteHeading(multiSegmentPolyline, 20);
    expect(headingEarly.travelDirection).toBe('eastbound');

    const headingLate = calculateRouteHeading(multiSegmentPolyline, 80);
    expect(headingLate.travelDirection).toBe('northbound');
  });

  // Scenario 5
  it('5. should calculate actual road detour including entrance spur coordinates', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      coordinates: [26.05, 81.05],
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'both',
        entranceCoordinates: [26.02, 81.02],
        accessConfidence: 0.9
      }
    };

    const polyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0]
    ];

    // Detour should be computed from entrance coordinates to charger + perpendicular off-ramp spur
    const result = validateStationRoadAccess(station, polyline, 50, 1.5);
    expect(result.isAccessible).toBe(true);
    expect(result.actualDetourMi).toBeGreaterThan(1.5); // Greater than direct perpendicular distance
    expect(result.entranceCoordinates).toEqual([26.02, 81.02]);
  });

  // Scenario 6
  it('6. should fall back to estimated road detour when entrance coordinates are missing', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'both',
        accessConfidence: 0.8
      }
    };

    const polyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0]
    ];

    const perpendicularDetour = 2.5;
    const result = validateStationRoadAccess(station, polyline, 50, perpendicularDetour);
    expect(result.isAccessible).toBe(true);
    // When entrance coordinates are omitted, round-trip spur estimate is 2x perpendicular distance
    expect(result.actualDetourMi).toBe(5.0);
  });

  // Scenario 7
  it('7. should reject stations marked as inaccessible', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'inaccessible',
        carriagewayAccess: 'unknown',
        accessRestrictions: ['Bridge collapsed', 'Access ramp closed indefinitely'],
        accessConfidence: 1.0
      }
    };

    const polyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0]
    ];

    const result = validateStationRoadAccess(station, polyline, 50, 0.5);
    expect(result.isAccessible).toBe(false);
    expect(result.accessStatus).toBe('inaccessible');
    expect(result.rejectionReason).toContain('inaccessible');
  });

  // Scenario 8
  it('8. should apply penalty/uncertainty tag to stations with uncertain road access', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'uncertain',
        carriagewayAccess: 'unknown',
        accessConfidence: 0.4,
        accessNotes: 'Gated facility with unconfirmed public entry'
      }
    };

    const polyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0]
    ];

    const result = validateStationRoadAccess(station, polyline, 50, 1.0);
    expect(result.isAccessible).toBe(true);
    expect(result.accessStatus).toBe('uncertain');
    expect(result.accessConfidence).toBeLessThan(0.5);
    expect(result.accessNotes).toContain('Gated');
  });

  // Scenario 9
  it('9. should verify reachability of configured backup charging station', () => {
    const stationA: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-primary',
      coordinates: [26.0, 81.0],
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'both',
        backupStationId: 'sta-backup'
      }
    };

    const stationB: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-backup',
      name: 'Backup Charger Plaza',
      coordinates: [26.05, 81.05] // ~4.5 miles away
    };

    const evalResult = evaluateBackupCharger(
      stationA,
      [stationA, stationB],
      initialVehicleProfile,
      12 // 12% arrival SoC at primary
    );

    expect(evalResult.backupStationId).toBe('sta-backup');
    expect(evalResult.backupStationName).toBe('Backup Charger Plaza');
    expect(evalResult.backupReachable).toBe(true);
    expect(evalResult.distanceToBackupMi).toBeLessThan(10);
    expect(evalResult.estimatedSocAtBackup).toBeGreaterThan(3);
  });

  // Scenario 10
  it('10. should mark backup charger as unreachable if vehicle cannot reach it on remaining reserve', () => {
    const stationA: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-primary',
      coordinates: [26.0, 81.0],
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'both',
        backupStationId: 'sta-far-backup'
      }
    };

    const farStation: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-far-backup',
      name: 'Faraway Charger',
      coordinates: [28.0, 81.0] // ~138 miles away
    };

    const evalResult = evaluateBackupCharger(
      stationA,
      [stationA, farStation],
      initialVehicleProfile,
      10 // only 10% arrival SoC at primary
    );

    expect(evalResult.backupReachable).toBe(false);
    expect(evalResult.reason).toContain('Insufficient battery');
    expect(evalResult.estimatedSocAtBackup).toBeLessThan(3);
  });

  // Scenario 11
  it('11. should handle stations with restricted premises access (e.g. hotel guests only, toll road only)', () => {
    const station: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'restricted_premises',
        accessRestrictions: ['Patrons and hotel guests only', 'Valet parking fee ₹200'],
        accessConfidence: 0.9
      }
    };

    const polyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0]
    ];

    const result = validateStationRoadAccess(station, polyline, 50, 0.5);
    expect(result.isAccessible).toBe(true);
    expect(result.carriageway).toBe('restricted_premises');
    expect(result.accessRestrictions).toHaveLength(2);
    expect(result.accessRestrictions![0]).toContain('hotel guests');
  });

  // Scenario 12
  it('12. should maintain 100% backward compatibility for stations lacking accessMetadata (defaults to estimated)', () => {
    const legacyStation: ChargingStation = {
      ...mockBaseStation,
      accessMetadata: undefined
    };

    const polyline: [number, number][] = [
      [26.0, 80.0],
      [26.0, 82.0]
    ];

    const result = validateStationRoadAccess(legacyStation, polyline, 50, 1.2);
    expect(result.isAccessible).toBe(true);
    expect(result.accessStatus).toBe('estimated');
    expect(result.carriageway).toBe('unknown');
    expect(result.actualDetourMi).toBe(2.4); // 2 * 1.2
    expect(result.accessConfidence).toBe(0.5);
  });

  // Scenario 13
  it('13. should integrate access validation into greedy corridor selection (inaccessible stations skipped)', () => {
    const inaccessibleStation: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-inaccessible-test',
      accessMetadata: {
        roadAccessStatus: 'inaccessible',
        carriagewayAccess: 'unknown'
      }
    };

    const eligible = getEligibleStations(
      [inaccessibleStation, mockBaseStation],
      initialVehicleProfile,
      initialPlanOptions,
      initialChargingSettings
    );

    // Inaccessible station should be excluded at the eligibility stage
    expect(eligible.map((s) => s.id)).not.toContain('sta-inaccessible-test');
    expect(eligible.map((s) => s.id)).toContain('test-sta-1');
  });

  // Scenario 14
  it('14. should integrate access validation into RCSP graph construction (inaccessible stations excluded from nodes)', () => {
    // Synthetic 100-mile straight-line corridor from [0, 0] to [1.4474, 0]
    const accessibleStation: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-rcsp-accessible',
      coordinates: [0.5, 0.0], // ~34.5 miles
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'both',
        actualDetourMi: 0.2
      }
    };

    const inaccessibleStation: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-rcsp-inaccessible',
      coordinates: [0.8, 0.0], // ~55 miles
      accessMetadata: {
        roadAccessStatus: 'inaccessible',
        carriagewayAccess: 'unknown',
        actualDetourMi: 999
      }
    };

    const oppositeCarriagewayStation: ChargingStation = {
      ...mockBaseStation,
      id: 'sta-rcsp-opposite',
      coordinates: [0.6, 0.0], // ~41 miles
      accessMetadata: {
        roadAccessStatus: 'verified',
        carriagewayAccess: 'divided_unidirectional',
        supportedDirections: ['southbound'], // Route travels Northbound (bearing 0 deg)
        actualDetourMi: 0.3
      }
    };

    const prevStations = [...chargingStations];
    (chargingStations as unknown as ChargingStation[]).length = 0;
    chargingStations.push(accessibleStation, inaccessibleStation, oppositeCarriagewayStation);

    try {
      const req: RouteCalculationRequest = {
        origin: { id: 'o', name: 'Start', coordinates: [0, 0], batterySoc: 60 },
        destination: { id: 'd', name: 'Finish', coordinates: [1.4474, 0], batterySoc: 10 },
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const rcspResult = solveRcsp(req);
      expect(rcspResult).not.toBeNull();
      // Should pick accessibleStation and NEVER choose inaccessibleStation or oppositeCarriagewayStation
      const stopIds = rcspResult!.stops.map((s) => s.stationId);
      expect(stopIds).toContain('sta-rcsp-accessible');
      expect(stopIds).not.toContain('sta-rcsp-inaccessible');
      expect(stopIds).not.toContain('sta-rcsp-opposite');
      expect(rcspResult!.stops[0].roadAccessStatus).toBe('verified');
      expect(rcspResult!.stops[0].actualDetourMi).toBe(0.2);
    } finally {
      (chargingStations as unknown as ChargingStation[]).length = 0;
      chargingStations.push(...prevStations);
    }
  });

  // Scenario 15
  it('15. should enrich ChargingStop with access verification details, detour, and backup information', async () => {
    // Custom route requiring charging
    const req: RouteCalculationRequest = {
      origin: { id: 'o', name: 'Varanasi', coordinates: [25.3176, 82.9739], batterySoc: 40 },
      destination: { id: 'd', name: 'Agra', coordinates: [27.1767, 78.0081], batterySoc: 10 },
      waypoints: [],
      vehicle: initialVehicleProfile,
      planOptions: { ...initialPlanOptions, useRcspOptimizer: false },
      chargingSettings: initialChargingSettings,
      routingSettings: initialRoutingSettings
    };

    const result = await calculateTripRoutes(req);
    expect(result.routeOptions.length).toBeGreaterThan(0);

    const firstRoute = result.routeOptions[0];
    if (firstRoute.stops.length > 0) {
      const stop = firstRoute.stops[0];
      // Expect road access fields to be populated
      expect(stop.roadAccessStatus).toBeDefined();
      expect(['verified', 'estimated', 'uncertain']).toContain(stop.roadAccessStatus);
      expect(typeof stop.actualDetourMi).toBe('number');
      if (stop.backupStationId) {
        expect(typeof stop.backupReachable).toBe('boolean');
      }
    }
  });
});
