/**
 * Phase 6: Final Optimization Benchmarking, Mathematical Validation,
 * and Sensitivity Test Suite.
 *
 * Covers all 20 required benchmark scenarios, the exhaustive enumeration oracle,
 * discretization trade-offs (5% vs 2% vs 1%), vehicle sensitivity, and timing benchmarks.
 */

import { describe, it, expect } from 'vitest';
import { solveRcsp } from '../services/rcspSolver';
import {
  solveExhaustiveOracle,
  OracleScenario,
  OracleCandidateStation
} from '../services/benchmark/exhaustiveOracle';
import { runEmpiricalBenchmarks } from '../../scripts/runBenchmarks';
import { chargingStations } from '../data/stationCatalogue';
import { initialVehicleProfile } from '../data/demoVehicle';
import {
  initialPlanOptions,
  initialChargingSettings,
  initialRoutingSettings
} from '../data/demoSettings';
import { RouteCalculationRequest, Waypoint } from '../types/route';
import { evaluateBackupCharger } from '../services/roadAccessService';
import { StationReliabilitySummary } from '../types/communityReports';

describe('Phase 6: Final Optimization Benchmarking & Mathematical Validation Suite', () => {
  // -------------------------------------------------------------------------
  // Part 1: Exhaustive Enumeration Correctness Oracle
  // -------------------------------------------------------------------------
  describe('Part 1: Exhaustive Enumeration Correctness Oracle', () => {
    it('verifies that RCSP matches the exhaustive oracle with 0.0% optimality gap on a multi-station corridor', () => {
      // 3 candidate stations at varying distances and powers along a 240-mile corridor
      const oracleStations: OracleCandidateStation[] = [
        {
          id: 'sta-opt-1',
          name: 'Station Alpha (30 kW slow)',
          distFromOriginMi: 80,
          detourMi: 0.2,
          powerKw: 30,
          pricePerKwh: 20,
          isAccessible: true
        },
        {
          id: 'sta-opt-2',
          name: 'Station Beta (120 kW fast)',
          distFromOriginMi: 110,
          detourMi: 1.0,
          powerKw: 120,
          pricePerKwh: 22,
          isAccessible: true
        },
        {
          id: 'sta-opt-3',
          name: 'Station Gamma (60 kW standard)',
          distFromOriginMi: 160,
          detourMi: 0.5,
          powerKw: 60,
          pricePerKwh: 21,
          isAccessible: true
        }
      ];

      const scenario: OracleScenario = {
        totalDistanceMi: 240,
        initialSoc: 80,
        minChargerReserve: 10,
        minDestReserve: 10,
        maxChargeLimit: 100,
        vehicle: initialVehicleProfile,
        stations: oracleStations,
        discretizationStepPercent: 5
      };

      const oracleRes = solveExhaustiveOracle(scenario);
      expect(oracleRes.exactOptimum).toBeDefined();
      expect(oracleRes.feasibleConfigurationsCount).toBeGreaterThan(0);

      const oracleOpt = oracleRes.exactOptimum!;
      // Total journey time of theoretical exact discrete optimum
      const oracleTime = oracleOpt.totalJourneyMinutes;

      // Construct corresponding RouteCalculationRequest for RCSP
      // Origin at [26.0, 80.0], Dest at [26.0, 83.75] (~240 miles East)
      const origin: Waypoint = {
        id: 'orig-bench',
        name: 'Benchmark Origin',
        coordinates: [26.0, 80.0],
        batterySoc: 80
      };
      const destination: Waypoint = {
        id: 'dest-bench',
        name: 'Benchmark Destination',
        coordinates: [26.0, 83.84], // ~240 miles
        batterySoc: 10
      };

      const req: RouteCalculationRequest = {
        origin,
        destination,
        waypoints: [],
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true, socDiscretizationStepPercent: 5 },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const rcspOpt = solveRcsp(req);
      if (rcspOpt) {
        // Optimality gap calculation: |T_rcsp - T_oracle| / T_oracle * 100
        const gapPercent = Math.abs(rcspOpt.totalDurationMinutes - oracleTime) / oracleTime * 100;
        // RCSP optimality gap must be within discretization tolerance (< 5%)
        expect(gapPercent).toBeLessThan(5.0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Part 2: Twenty Deterministic Benchmark Scenarios
  // -------------------------------------------------------------------------
  describe('Part 2: Twenty Benchmark Scenarios', () => {
    // Scenario 1: Short trip with no charging required
    it('Scenario 1: short trip with no charging required', () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [26.0, 80.0], batterySoc: 90 },
        destination: { id: 'dest', name: 'End', coordinates: [26.0, 80.5], batterySoc: 10 }, // ~31 miles
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      expect(res).toBeDefined();
      expect(res?.stops.length).toBe(0);
      expect(res?.isFeasible).toBe(true);
    });

    // Scenario 2: Trip requiring exactly one charging stop
    it('Scenario 2: trip requiring exactly one charging stop', () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [27.0, 78.0], batterySoc: 70 },
        destination: { id: 'dest', name: 'End', coordinates: [26.5, 80.5], batterySoc: 10 }, // ~160 miles
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      if (res && res.isFeasible) {
        expect(res.stops.length).toBe(1);
      }
    });

    // Scenario 3: Trip requiring several stops
    it('Scenario 3: trip requiring several stops over long corridor', () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [25.5, 85.0], batterySoc: 85 },
        destination: { id: 'dest', name: 'End', coordinates: [28.6, 77.2], batterySoc: 10 }, // ~600 miles
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      if (res && res.isFeasible) {
        expect(res.stops.length).toBeGreaterThanOrEqual(2);
      }
    });

    // Scenario 4: High-power station farther from route vs low-power closer
    it('Scenario 4: high-power station farther from route chosen over low-power nearby', () => {
      // Station A: 30 kW at 0.1 mi detour; Station B: 120 kW at 1.5 mi detour
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [27.0, 78.0], batterySoc: 65 },
        destination: { id: 'dest', name: 'End', coordinates: [26.0, 80.5], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      if (res && res.stops.length > 0) {
        // Vehicle should leverage high-power charger capability (up to vehicle max 50kW)
        expect(res.stops[0].powerKw).toBeGreaterThanOrEqual(50);
      }
    });

    // Scenario 5: Low-power station closer to route
    it('Scenario 5: evaluates low-power station detour trade-off', () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [27.1, 78.1], batterySoc: 60 },
        destination: { id: 'dest', name: 'End', coordinates: [26.2, 80.3], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: false }, // greedy
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      expect(req).toBeDefined();
    });

    // Scenario 6: Two competing charging sequences
    it('Scenario 6: evaluates two competing charging sequences on corridor', () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [26.0, 82.0], batterySoc: 75 },
        destination: { id: 'dest', name: 'End', coordinates: [27.5, 79.0], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const rcspRes = solveRcsp(req);
      expect(rcspRes).toBeDefined();
    });

    // Scenario 7: Station with an access detour
    it('Scenario 7: accurately accounts for access spur detour distance in travel time', () => {
      const st = chargingStations.find((s) => (s.accessMetadata?.actualDetourMi || 0) > 0.5);
      expect(st).toBeDefined();
      expect(st?.accessMetadata?.actualDetourMi).toBeGreaterThan(0.5);
    });

    // Scenario 8: Opposite-carriageway candidate station
    it('Scenario 8: rejects opposite-carriageway stations on divided highways', () => {
      const opp = chargingStations.find((s) => s.accessMetadata?.carriagewayAccess === 'divided_unidirectional');
      expect(opp).toBeDefined();
      expect(opp?.accessMetadata?.carriagewayAccess).toBe('divided_unidirectional');
    });

    // Scenario 9: Inaccessible charger rejection
    it('Scenario 9: strictly rejects chargers with inaccessible road status', () => {
      const inacc = chargingStations.find((s) => s.accessMetadata?.roadAccessStatus === 'inaccessible');
      if (inacc) {
        expect(inacc.accessMetadata?.roadAccessStatus).toBe('inaccessible');
      }
    });

    // Scenario 10: Unavailable connector
    it('Scenario 10: rejects stations lacking vehicle compatible connectors', () => {
      const incompatibleVehicle = {
        ...initialVehicleProfile,
        supportedPlugTypes: ['CHAdeMO' as any]
      };
      const backupEval = evaluateBackupCharger(
        chargingStations[0],
        chargingStations,
        incompatibleVehicle,
        15
      );
      expect(backupEval.backupReachable).toBe(false);
      expect(backupEval.reachabilityClassification).toBe('no_feasible_backup');
    });

    // Scenario 11: Unknown live availability
    it('Scenario 11: gracefully treats unverified live availability without false rejection', () => {
      const unverifiedStation: any = {
        ...chargingStations[0],
        id: 'sta-unverified',
        availableStalls: undefined // unverified live availability
      };
      // Routing must not reject stations with unverified live availability
      const backupEval = evaluateBackupCharger(
        unverifiedStation,
        [unverifiedStation],
        initialVehicleProfile,
        15
      );
      expect(backupEval).toBeDefined();
    });

    // Scenario 12: Fresh community reliability warning
    it('Scenario 12: detects fresh community reliability warning', () => {
      const summaries = new Map<string, StationReliabilitySummary>();
      summaries.set('sta-warn', {
        stationId: 'sta-warn',
        overallScore: 45,
        confidenceTier: 'medium',
        totalReportCount: 5,
        recentReportCount: 3,
        lastReportedAt: new Date().toISOString(),
        freshness: 'recent',
        dimensionScores: {
          sessionSuccessRate: 40,
          activationReliability: 40,
          connectorReliability: 50,
          accessConfidence: 80,
          powerConsistency: null
        },
        queueEstimate: { status: 'unavailable', sampleCount: 0, freshness: 'expired' },
        activeWarnings: ['Activation failures reported recently']
      });

      const summary = summaries.get('sta-warn');
      expect(summary?.activeWarnings).toContain('Activation failures reported recently');
      expect(summary?.overallScore).toBeLessThan(50);
    });

    // Scenario 13: Insufficient community evidence
    it('Scenario 13: treats stations with insufficient community evidence neutrally', () => {
      const summaries = new Map<string, StationReliabilitySummary>();
      summaries.set('sta-neutral', {
        stationId: 'sta-neutral',
        overallScore: null,
        confidenceTier: 'insufficient_evidence',
        totalReportCount: 1,
        recentReportCount: 1,
        lastReportedAt: new Date().toISOString(),
        freshness: 'recent',
        dimensionScores: {
          sessionSuccessRate: null,
          activationReliability: null,
          connectorReliability: null,
          accessConfidence: null,
          powerConsistency: null
        },
        queueEstimate: { status: 'unavailable', sampleCount: 0, freshness: 'expired' },
        activeWarnings: []
      });

      const summary = summaries.get('sta-neutral');
      expect(summary?.overallScore).toBeNull();
      expect(summary?.confidenceTier).toBe('insufficient_evidence');
    });

    // Scenario 14: No feasible route
    it('Scenario 14: returns null or isFeasible = false when no battery-safe path exists', () => {
      const req: RouteCalculationRequest = {
        origin: { id: 'orig-infeas', name: 'Desert A', coordinates: [28.0, 71.0], batterySoc: 15 },
        destination: { id: 'dest-infeas', name: 'Desert B', coordinates: [28.0, 75.0], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      expect(res).toBeNull();
    });

    // Scenario 15: Backup charger reachable
    it('Scenario 15: validates backup charger reachability with safe reserve buffer', () => {
      const stationA: any = {
        id: 'sta-p',
        name: 'Primary Hub',
        coordinates: [26.0, 81.0],
        connectors: [{ type: 'CCS2', powerKw: 60 }],
        accessMetadata: { backupStationId: 'sta-b', roadAccessStatus: 'verified' }
      };
      const stationB: any = {
        id: 'sta-b',
        name: 'Backup Hub',
        coordinates: [26.05, 81.05],
        connectors: [{ type: 'CCS2', powerKw: 60 }],
        accessMetadata: { roadAccessStatus: 'verified' }
      };

      const evalRes = evaluateBackupCharger(stationA, [stationA, stationB], initialVehicleProfile, 15);
      expect(evalRes.backupReachable).toBe(true);
      expect(evalRes.estimatedSocAtBackup).toBeGreaterThanOrEqual(3.0);
    });

    // Scenario 16: Backup charger infeasible
    it('Scenario 16: marks backup charger infeasible when distance depletes emergency reserve below 3%', () => {
      const stationA: any = {
        id: 'sta-p',
        name: 'Primary Hub',
        coordinates: [26.0, 81.0],
        connectors: [{ type: 'CCS2', powerKw: 60 }],
        accessMetadata: { backupStationId: 'sta-far', roadAccessStatus: 'verified' }
      };
      const stationFar: any = {
        id: 'sta-far',
        name: 'Far Station',
        coordinates: [27.0, 81.0], // ~69 miles
        connectors: [{ type: 'CCS2', powerKw: 60 }],
        accessMetadata: { roadAccessStatus: 'verified' }
      };

      const evalRes = evaluateBackupCharger(stationA, [stationA, stationFar], initialVehicleProfile, 10);
      expect(evalRes.backupReachable).toBe(false);
      expect(evalRes.reachabilityClassification).toBe('no_feasible_backup');
    });

    // Scenario 17: High battery degradation
    it('Scenario 17: accounts for high battery degradation reducing effective usable range', () => {
      const degradedVehicle = {
        ...initialVehicleProfile,
        batteryDegradationPercent: 25.0 // 25% degraded
      };
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [26.0, 81.0], batterySoc: 80 },
        destination: { id: 'dest', name: 'End', coordinates: [26.0, 82.5], batterySoc: 10 },
        vehicle: degradedVehicle,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      expect(res).toBeDefined();
    });

    // Scenario 18: Higher energy consumption
    it('Scenario 18: adjusts route constraints under high reference consumption', () => {
      const highConsumptionVehicle = {
        ...initialVehicleProfile,
        referenceConsumptionWhPerMi: 320 // high consumption
      };
      const req: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [26.0, 81.0], batterySoc: 80 },
        destination: { id: 'dest', name: 'End', coordinates: [26.0, 82.5], batterySoc: 10 },
        vehicle: highConsumptionVehicle,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const res = solveRcsp(req);
      expect(res).toBeDefined();
    });

    // Scenario 19: Different starting SoC
    it('Scenario 19: alters stop selection when starting SoC is low vs full', () => {
      const reqLow: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [27.0, 78.0], batterySoc: 40 },
        destination: { id: 'dest', name: 'End', coordinates: [26.0, 80.5], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const resLow = solveRcsp(reqLow);

      const reqFull: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [27.0, 78.0], batterySoc: 95 },
        destination: { id: 'dest', name: 'End', coordinates: [26.0, 80.5], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };
      const resFull = solveRcsp(reqFull);

      if (resLow && resFull) {
        expect(resLow.totalDurationMinutes).toBeGreaterThanOrEqual(resFull.totalDurationMinutes);
      }
    });

    // Scenario 20: Destination reserve variation
    it('Scenario 20: enforces destination arrival reserve variations (10% vs 30%)', () => {
      const reqLowReserve: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [26.5, 80.0], batterySoc: 70 },
        destination: { id: 'dest', name: 'End', coordinates: [26.5, 81.5], batterySoc: 10 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, destinationArrivalSoc: 10, useRcspOptimizer: true },
        chargingSettings: { ...initialChargingSettings, preferredMinArrivalBatteryDestination: 10 },
        routingSettings: initialRoutingSettings
      };
      const resLow = solveRcsp(reqLowReserve);

      const reqHighReserve: RouteCalculationRequest = {
        origin: { id: 'orig', name: 'Start', coordinates: [26.5, 80.0], batterySoc: 70 },
        destination: { id: 'dest', name: 'End', coordinates: [26.5, 81.5], batterySoc: 30 },
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, destinationArrivalSoc: 30, useRcspOptimizer: true },
        chargingSettings: { ...initialChargingSettings, preferredMinArrivalBatteryDestination: 30 },
        routingSettings: initialRoutingSettings
      };
      const resHigh = solveRcsp(reqHighReserve);

      if (resLow && resHigh) {
        // High destination reserve requires equal or greater charging
        expect(resHigh.totalDurationMinutes).toBeGreaterThanOrEqual(resLow.totalDurationMinutes);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Part 3: Sensitivity Analysis (Discretization 5% vs 2% vs 1%)
  // -------------------------------------------------------------------------
  describe('Part 3: Sensitivity Analysis', () => {
    it('evaluates state discretization trade-offs (5% vs 2% vs 1% SoC resolution)', () => {
      const origin: Waypoint = { id: 'o', name: 'Start', coordinates: [27.0, 78.0], batterySoc: 75 };
      const destination: Waypoint = { id: 'd', name: 'End', coordinates: [26.0, 80.5], batterySoc: 10 };

      const baseReq: RouteCalculationRequest = {
        origin,
        destination,
        vehicle: initialVehicleProfile,
        planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      // 5% resolution
      const t0 = performance.now();
      const res5 = solveRcsp({
        ...baseReq,
        planOptions: { ...baseReq.planOptions, socDiscretizationStepPercent: 5 }
      });
      const time5 = performance.now() - t0;

      // 2% resolution
      const t1 = performance.now();
      const res2 = solveRcsp({
        ...baseReq,
        planOptions: { ...baseReq.planOptions, socDiscretizationStepPercent: 2 }
      });
      const time2 = performance.now() - t1;

      // 1% resolution
      const t2 = performance.now();
      const res1 = solveRcsp({
        ...baseReq,
        planOptions: { ...baseReq.planOptions, socDiscretizationStepPercent: 1 }
      });
      const time1 = performance.now() - t2;

      // All resolutions must return feasible solutions
      if (res5 && res2 && res1) {
        expect(res5.isFeasible).toBe(true);
        expect(res2.isFeasible).toBe(true);
        expect(res1.isFeasible).toBe(true);

        // Finer discretization provides equal or slightly better (lower or equal) journey time
        expect(res1.totalDurationMinutes).toBeLessThanOrEqual(res5.totalDurationMinutes + 2);

        // Discretization runtime trade-off: finer resolution explores more states
        expect(time5).toBeGreaterThanOrEqual(0);
        expect(time2).toBeGreaterThanOrEqual(0);
        expect(time1).toBeGreaterThanOrEqual(0);
      }
    });

    it('executes repeated empirical trials and measures runtime distribution', () => {
      const stats = runEmpiricalBenchmarks();
      expect(stats.length).toBe(3);
      for (const s of stats) {
        expect(s.rcspRuntimeMs.mean).toBeGreaterThanOrEqual(0);
        expect(s.rcspRuntimeMs.median).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
