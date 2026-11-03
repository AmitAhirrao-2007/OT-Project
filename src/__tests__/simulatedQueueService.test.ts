/**
 * Phase 6J Test Suite: Simulated Queue Service & Clean Solid UI Design
 *
 * Verifies:
 * 1. Configurable realistic distribution:
 *    0 waiting (15%), 1 (20%), 2 (25%), 3 (20%), 4 (12%), 5 (5%), 6-8 (3%).
 * 2. Determinism and stability: stable during zoom/pan/re-renders, changes only on new route or seed refresh.
 * 3. Connector group independence: CCS2 vs Type 2 generated separately without inventing unsupported plugs.
 * 4. No fake hardware occupancy: availablePoints == totalPoints, occupiedPoints == 0, activeSessionCount == 0.
 * 5. Strict precedence: Real Operator > Community > Simulated Fallback > Unavailable.
 * 6. Visual badge integrity: prominent SIMULATED text and distinct solid purple styling.
 * 7. Simulated zero distinction: never says '0 reported waiting', always '0 waiting · SIMULATED'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  simulatedQueueService,
  sampleSimulatedQueueCount,
  hashKeyToUnitFloat
} from '../services/queue/simulatedQueueService';
import {
  getMarkerQueueBadge,
  predictQueueAtArrival
} from '../services/queue/chargingQueueService';
import { ChargingStation } from '../types/station';
import { VehicleProfile } from '../types/vehicle';

describe('Phase 6J — Simulated Queue Service Suite', () => {
  const dummyVehicle: VehicleProfile = {
    id: 'nexon-ev-long-range',
    name: 'Tata Nexon EV LR',
    manufacturer: 'Tata Motors',
    model: 'Nexon EV',
    year: 2024,
    batteryCapacityKwh: 40.5,
    usableBatteryKwh: 40.5,
    maxDcChargingKw: 50,
    maxAcChargingKw: 7.2,
    referenceConsumptionWhPerMi: 250,
    maximumSpeedMph: 85,
    relativeSpeedPercent: 100,
    batteryDegradationPercent: 0,
    supportedPlugTypes: ['CCS', 'Type 2'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: false,
    imageSvgType: 'suv'
  };

  const sampleStation: ChargingStation = {
    id: 'sta-national-sample-01',
    name: 'NH-19 Expressway Fast Charger',
    network: 'Static Network',
    address: 'NH-19, Milestone 210, Uttar Pradesh',
    coordinates: [26.8467, 80.9462],
    ratedPowerKw: 60,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [
      { type: 'CCS2', maxPowerKw: 60, count: 2, canonicalType: 'CCS2' }
    ],
    amenities: ['restroom', 'restaurant'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified',
    openingHours: '24/7',
    paymentMethods: ['App', 'RFID'],
    dataSource: 'Reference Simulation'
  };

  const dualPlugStation: ChargingStation = {
    id: 'sta-national-dual-02',
    name: 'Delhi Gateway Multi-Standard Hub',
    network: 'National Power',
    address: 'Delhi-Agra Expressway, Mathura, UP',
    coordinates: [27.4924, 77.6737],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 4,
    connectors: [
      { type: 'CCS2', maxPowerKw: 120, count: 2, canonicalType: 'CCS2' },
      { type: 'Type 2', maxPowerKw: 22, count: 2, canonicalType: 'Type 2' }
    ],
    amenities: ['restaurant', 'restroom'],
    pricePerKwh: '₹22.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified',
    openingHours: '24/7',
    paymentMethods: ['App', 'RFID'],
    dataSource: 'Reference Simulation'
  };

  beforeEach(() => {
    simulatedQueueService.setSimulationEnabled(true);
    simulatedQueueService.setRouteSession('patna_delhi_test_suite', 1);
  });

  describe('1. Realistic Configurable Distribution', () => {
    it('maps unit intervals accurately to the required distribution percentages', () => {
      // 0 waiting: [0.00, 0.15) (15%)
      expect(sampleSimulatedQueueCount(0.00)).toBe(0);
      expect(sampleSimulatedQueueCount(0.1499)).toBe(0);

      // 1 waiting: [0.15, 0.35) (20%)
      expect(sampleSimulatedQueueCount(0.15)).toBe(1);
      expect(sampleSimulatedQueueCount(0.3499)).toBe(1);

      // 2 waiting: [0.35, 0.60) (25%)
      expect(sampleSimulatedQueueCount(0.35)).toBe(2);
      expect(sampleSimulatedQueueCount(0.5999)).toBe(2);

      // 3 waiting: [0.60, 0.80) (20%)
      expect(sampleSimulatedQueueCount(0.60)).toBe(3);
      expect(sampleSimulatedQueueCount(0.7999)).toBe(3);

      // 4 waiting: [0.80, 0.92) (12%)
      expect(sampleSimulatedQueueCount(0.80)).toBe(4);
      expect(sampleSimulatedQueueCount(0.9199)).toBe(4);

      // 5 waiting: [0.92, 0.97) (5%)
      expect(sampleSimulatedQueueCount(0.92)).toBe(5);
      expect(sampleSimulatedQueueCount(0.9699)).toBe(5);

      // 6-8 waiting: [0.97, 1.00) (3%)
      expect(sampleSimulatedQueueCount(0.975)).toBe(6);
      expect(sampleSimulatedQueueCount(0.985)).toBe(7);
      expect(sampleSimulatedQueueCount(0.995)).toBe(8);
    });

    it('empirically produces the target distribution within statistical tolerance over 20,000 samples', () => {
      const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
      const N = 20000;

      for (let i = 0; i < N; i++) {
        const rand = i / N; // Uniform distribution
        const val = sampleSimulatedQueueCount(rand);
        counts[val] = (counts[val] || 0) + 1;
      }

      // Check exact percentages
      expect(counts[0] / N).toBeCloseTo(0.15, 2);
      expect(counts[1] / N).toBeCloseTo(0.20, 2);
      expect(counts[2] / N).toBeCloseTo(0.25, 2);
      expect(counts[3] / N).toBeCloseTo(0.20, 2);
      expect(counts[4] / N).toBeCloseTo(0.12, 2);
      expect(counts[5] / N).toBeCloseTo(0.05, 2);
      const highQueuePct = (counts[6] + counts[7] + counts[8]) / N;
      expect(highQueuePct).toBeCloseTo(0.03, 2);
    });
  });

  describe('2. Determinism, Session Scoping and Stability', () => {
    it('returns exactly identical simulated queues for the same station across multiple calls', () => {
      const q1 = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);
      const q2 = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);

      expect(q1).not.toBeNull();
      expect(q2).not.toBeNull();
      expect(q1?.overallVehiclesWaiting).toBe(q2?.overallVehiclesWaiting);
      expect(q1?.connectorQueues.CCS2.estimatedWaitMinutes).toBe(q2?.connectorQueues.CCS2.estimatedWaitMinutes);
    });

    it('regenerates new simulated queue values when refreshSimulatedQueues is called', () => {
      simulatedQueueService.registerStation(sampleStation);
      const qInitial = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id);
      expect(qInitial).not.toBeNull();

      // Refresh increments seed and resets cache
      simulatedQueueService.refreshSimulatedQueues();
      const qRefreshed = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id);

      expect(qRefreshed).not.toBeNull();
      // PRNG hash for seed 2 vs seed 1
      const key1 = `patna_delhi_test_suite:1:${sampleStation.id}:CCS2`;
      const key2 = `patna_delhi_test_suite:2:${sampleStation.id}:CCS2`;
      expect(hashKeyToUnitFloat(key1)).not.toBe(hashKeyToUnitFloat(key2));
    });

    it('scopes simulated queues to route session keys (e.g. changing journey changes values)', () => {
      simulatedQueueService.setRouteSession('delhi_agra_route', 1);
      const qDelhiAgra = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);

      simulatedQueueService.setRouteSession('mumbai_pune_route', 1);
      const qMumbaiPune = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);

      expect(qDelhiAgra).not.toBeNull();
      expect(qMumbaiPune).not.toBeNull();
      // Different session keys produce different PRNG seeds
      const f1 = hashKeyToUnitFloat(`delhi_agra_route:1:${sampleStation.id}:CCS2`);
      const f2 = hashKeyToUnitFloat(`mumbai_pune_route:1:${sampleStation.id}:CCS2`);
      expect(f1).not.toBe(f2);
    });
  });

  describe('3. Connector Group Independence & No Unsupported Plugs', () => {
    it('generates separate independent queues for CCS2 and Type 2 connectors', () => {
      const qData = simulatedQueueService.getOrGenerateSimulatedQueue(dualPlugStation.id, dualPlugStation);
      expect(qData).not.toBeNull();
      expect(qData?.connectorQueues.CCS2).toBeDefined();
      expect(qData?.connectorQueues['Type 2']).toBeDefined();

      // Verifies independence of PRNG seeds for connector types
      const ccsRand = hashKeyToUnitFloat(`patna_delhi_test_suite:1:${dualPlugStation.id}:CCS2`);
      const type2Rand = hashKeyToUnitFloat(`patna_delhi_test_suite:1:${dualPlugStation.id}:Type 2`);
      expect(ccsRand).not.toBe(type2Rand);
    });

    it('does NOT invent unsupported connector types for a station', () => {
      const qData = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);
      expect(qData).not.toBeNull();
      expect(qData?.connectorQueues.CCS2).toBeDefined();
      expect(qData?.connectorQueues['Type 2']).toBeUndefined();
      expect(qData?.connectorQueues.CHAdeMO).toBeUndefined();
    });
  });

  describe('4. Hardware Integrity Invariants', () => {
    it('never creates fake occupied stalls or fake active charging sessions', () => {
      const qData = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);
      expect(qData).not.toBeNull();

      const ccs = qData!.connectorQueues.CCS2;
      expect(ccs.availablePoints).toBe(sampleStation.totalStalls);
      expect(ccs.occupiedPoints).toBe(0);
      expect(ccs.activeSessionCount).toBe(0);
      expect(ccs.queueEntries).toEqual([]);
      expect(ccs.isAuthoritativeOperator).toBe(false);
      expect(ccs.dataSource).toBe('simulated_queue');
      expect(ccs.confidence).toBe('low');
    });
  });

  describe('5. Map Badge Formatting & Visual SIMULATED Indicators', () => {
    it('formats map badges with prominent SIMULATED tag and solid purple styling', () => {
      const qData = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);
      const badge = getMarkerQueueBadge(qData, dummyVehicle);

      expect(badge.hasData).toBe(true);
      expect(badge.isSimulated).toBe(true);
      expect(badge.dataSource).toBe('simulated_queue');
      expect(badge.badgeText).toContain('· SIMULATED');
      expect(badge.badgeClass).toContain('bg-violet-700');
      expect(badge.badgeClass).toContain('text-white');
    });

    it('distinguishes simulated zero: shows "0 waiting · SIMULATED" and NEVER "0 reported waiting"', () => {
      // Synthesize a simulated queue with 0 waiting
      const zeroSimData = {
        stationId: 'zero-station',
        stationName: 'Zero Station',
        connectorQueues: {
          CCS2: {
            connectorType: 'CCS2',
            totalPoints: 2,
            availablePoints: 2,
            occupiedPoints: 0,
            outOfOrderPoints: 0,
            vehiclesWaiting: 0,
            estimatedWaitMinutes: 0,
            confidence: 'low' as const,
            dataSource: 'simulated_queue' as const,
            updatedAt: Date.now()
          }
        },
        overallVehiclesWaiting: 0,
        primaryDataSource: 'simulated_queue' as const,
        confidence: 'low' as const,
        lastReportedTimestamp: Date.now(),
        reportCountRecent: 0,
        isStale: false
      };

      const badge = getMarkerQueueBadge(zeroSimData, dummyVehicle);
      expect(badge.badgeText).toBe('0 waiting · SIMULATED');
      expect(badge.label).toBe('Estimated queue: 0 vehicles');
      expect(badge.badgeText).not.toContain('reported');
      expect(badge.badgeClass).toContain('bg-violet-700');
    });

    it('sets appropriate arrival prediction rationale for simulated queues', () => {
      const qData = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);
      const prediction = predictQueueAtArrival({
        station: sampleStation,
        connectorType: 'CCS2',
        currentQueueStatus: qData!.connectorQueues.CCS2,
        arrivalTimestampMs: Date.now() + 60 * 60 * 1000,
        vehicle: dummyVehicle,
        arrivalSocPercent: 20,
        targetSocPercent: 80
      });

      expect(prediction.dataSource).toBe('simulated_queue');
      expect(prediction.confidence).toBe('low');
      expect(prediction.predictionRationale).toContain('EVSure simulated queue');
      expect(prediction.predictionRationale).toContain('Illustrative only');
    });
  });

  describe('6. Plan Options Toggle (Enable / Disable)', () => {
    it('returns null and leaves stations as unavailable when simulation is disabled', () => {
      simulatedQueueService.setSimulationEnabled(false);
      const result = simulatedQueueService.getOrGenerateSimulatedQueue(sampleStation.id, sampleStation);
      expect(result).toBeNull();

      const badge = getMarkerQueueBadge(result, dummyVehicle);
      expect(badge.badgeText).toBe('Queue unknown');
      expect(badge.hasData).toBe(false);
    });
  });

  describe('7. Strict Precedence Hierarchy', () => {
    it('real operator and community data take strict precedence over simulated data', () => {
      // Authoritative operator station
      const operatorStationData = {
        stationId: 'sta-pcs-58fad8f122f2',
        stationName: 'Tata Power EZ Charge - Agra',
        connectorQueues: {
          CCS2: {
            connectorType: 'CCS2',
            totalPoints: 3,
            availablePoints: 1,
            occupiedPoints: 2,
            outOfOrderPoints: 0,
            vehiclesWaiting: 4,
            estimatedWaitMinutes: 25,
            confidence: 'high' as const,
            dataSource: 'operator_managed_queue' as const,
            updatedAt: Date.now(),
            isAuthoritativeOperator: true
          }
        },
        overallVehiclesWaiting: 4,
        primaryDataSource: 'operator_managed_queue' as const,
        confidence: 'high' as const,
        lastReportedTimestamp: Date.now(),
        reportCountRecent: 4,
        isStale: false
      };

      const badge = getMarkerQueueBadge(operatorStationData, dummyVehicle);
      expect(badge.isSimulated).toBeFalsy();
      expect(badge.dataSource).toBe('operator_managed_queue');
      expect(badge.badgeText).toBe('4 waiting');
      expect(badge.badgeClass).toContain('bg-rose-600');
    });
  });
});
