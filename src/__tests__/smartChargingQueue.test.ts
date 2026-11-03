import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MinHeap,
  ChargingStationPriorityQueue
} from '../services/queue/chargingStationPriorityQueue';
import {
  predictQueueAtArrival
} from '../services/queue/chargingQueueService';
import {
  submitQueueReport,
  getAggregatedStationQueue,
  actionToWaitingCount,
  generatePseudonym,
  clearQueueReportsForTest
} from '../../server/queueStorage';
import {
  StationRecommendationCandidate,
  ConnectorQueueStatus
} from '../types/queue';
import { ChargingStation } from '../types/station';
import { VehicleProfile } from '../types/vehicle';
import { calculateTripRoutes } from '../services/routingService';
import { demoTrip } from '../data/demoRoute';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';

describe('Phase 6G: Smart Charging Queue, Waiting-Time Prediction & Priority Queue Suite', () => {
  const mockVehicle: VehicleProfile = {
    id: 'tata-nexon-ev-max',
    name: 'Tata Nexon EV Max',
    manufacturer: 'Tata',
    model: 'Nexon EV Max',
    year: 2023,
    batteryCapacityKwh: 40.5,
    usableBatteryKwh: 38.0,
    maxDcChargingKw: 50,
    maxAcChargingKw: 7.2,
    referenceConsumptionWhPerMi: 245,
    maximumSpeedMph: 83,
    relativeSpeedPercent: 100,
    batteryDegradationPercent: 5.1,
    supportedPlugTypes: ['CCS', 'Type 2'],
    selectedPlugTypes: ['CCS', 'Type 2'],
    liveDataConnected: false,
    saveActivity: true,
    imageSvgType: 'suv'
  };

  const sampleStation1: ChargingStation = {
    id: 'test-cpo-station-1',
    name: 'Tata Power Fast Charger - Expressway Hub',
    network: 'Tata Power EZ Charge',
    address: 'NH-19 KM 120, Mathura, UP',
    coordinates: [27.4924, 77.6737],
    ratedPowerKw: 60,
    totalStalls: 4,
    availableStalls: 2,
    connectors: [
      { type: 'CCS2', maxPowerKw: 60, count: 2, availableCount: 1, canonicalType: 'CCS2' },
      { type: 'Type 2', maxPowerKw: 22, count: 2, availableCount: 1, canonicalType: 'Type 2' }
    ],
    amenities: ['restaurant', 'restroom'],
    pricePerKwh: '₹22.00 / kWh',
    statusTimestamp: new Date().toISOString(),
    operationalStatus: 'operational',
    tariffClassification: 'source_confirmed',
    openingHours: '24/7',
    paymentMethods: ['App', 'RFID'],
    dataSource: 'Operator API'
  };

  const sampleStation2: ChargingStation = {
    id: 'test-cpo-station-2',
    name: 'Jio-bp Pulse Mega Charger',
    network: 'Jio-bp pulse',
    address: 'NH-19 KM 145, Agra Bypass',
    coordinates: [27.1767, 78.0081],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 4,
    connectors: [
      { type: 'CCS2', maxPowerKw: 120, count: 4, availableCount: 4, canonicalType: 'CCS2' }
    ],
    amenities: ['coffee', 'wifi'],
    pricePerKwh: '₹24.00 / kWh',
    statusTimestamp: new Date().toISOString(),
    operationalStatus: 'operational',
    tariffClassification: 'source_confirmed',
    openingHours: '24/7',
    paymentMethods: ['App'],
    dataSource: 'Operator API'
  };

  describe('1. Binary Min-Heap Core Mechanics', () => {
    it('correctly inserts and extracts numbers in ascending priority order', () => {
      const heap = new MinHeap<number>((a, b) => a - b);
      heap.push(42);
      heap.push(10);
      heap.push(25);
      heap.push(5);
      heap.push(18);

      expect(heap.size()).toBe(5);
      expect(heap.peek()).toBe(5);

      expect(heap.pop()).toBe(5);
      expect(heap.pop()).toBe(10);
      expect(heap.pop()).toBe(18);
      expect(heap.pop()).toBe(25);
      expect(heap.pop()).toBe(42);
      expect(heap.isEmpty()).toBe(true);
      expect(heap.pop()).toBeUndefined();
    });

    it('extractAllSorted yields full non-destructive sorted array without mutating original', () => {
      const heap = new MinHeap<number>((a, b) => a - b);
      [50, 12, 33, 9, 75].forEach((n) => heap.push(n));

      const sorted = heap.extractAllSorted();
      expect(sorted).toEqual([9, 12, 33, 50, 75]);
      expect(heap.size()).toBe(5); // Original size preserved
    });
  });

  describe('2. Hard Feasibility Filtering in Station Priority Queue', () => {
    it('accepts feasible candidate and rejects unfeasible or road-inaccessible candidates', () => {
      const pq = new ChargingStationPriorityQueue({ priority: 'best_overall_trip_time' });

      const feasibleCand: StationRecommendationCandidate = {
        station: sampleStation1,
        connectorType: 'CCS2',
        powerKw: 60,
        detourDistanceMi: 1.2,
        detourDurationMinutes: 3,
        expectedArrivalTime: '10:30 AM',
        arrivalTimestampMs: Date.now() + 3600000,
        queueStatus: null,
        prediction: null,
        estimatedWaitMinutes: 0,
        estimatedChargeMinutes: 28,
        totalStopImpactMinutes: 31,
        estimatedPriceInr: 450,
        reliabilityScore: 85,
        isFeasible: true,
        recommendationRank: 0,
        isBestChoice: false
      };

      const infeasibleCand: StationRecommendationCandidate = {
        ...feasibleCand,
        isFeasible: false // e.g. insufficient battery reserve
      };

      const blockedAccessCand: StationRecommendationCandidate = {
        ...feasibleCand,
        station: {
          ...sampleStation1,
          accessMetadata: {
            roadAccessStatus: 'inaccessible',
            carriagewayAccess: 'restricted_premises'
          }
        }
      };

      expect(pq.addCandidate(feasibleCand)).toBe(true);
      expect(pq.addCandidate(infeasibleCand)).toBe(false);
      expect(pq.addCandidate(blockedAccessCand)).toBe(false);
      expect(pq.size()).toBe(1);
    });
  });

  describe('3. Multi-Criteria Recommendation Priorities & Ranking', () => {
    const candidateA: StationRecommendationCandidate = {
      station: sampleStation1,
      connectorType: 'CCS2',
      powerKw: 60,
      detourDistanceMi: 1.0,
      detourDurationMinutes: 2,
      expectedArrivalTime: '10:30 AM',
      arrivalTimestampMs: Date.now() + 3600000,
      queueStatus: null,
      prediction: null,
      estimatedWaitMinutes: 20, // 20 min queue wait
      estimatedChargeMinutes: 30,
      totalStopImpactMinutes: 52, // 2 + 20 + 30
      estimatedPriceInr: 380, // cheaper
      reliabilityScore: 70,
      isFeasible: true,
      recommendationRank: 0,
      isBestChoice: false
    };

    const candidateB: StationRecommendationCandidate = {
      station: sampleStation2,
      connectorType: 'CCS2',
      powerKw: 120, // faster charger
      detourDistanceMi: 3.5, // slightly longer detour
      detourDurationMinutes: 6,
      expectedArrivalTime: '10:45 AM',
      arrivalTimestampMs: Date.now() + 4500000,
      queueStatus: null,
      prediction: null,
      estimatedWaitMinutes: 0, // 0 min queue wait!
      estimatedChargeMinutes: 18, // 120 kW charges fast
      totalStopImpactMinutes: 24, // 6 + 0 + 18 = 24 min (much lower total impact!)
      estimatedPriceInr: 460,
      reliabilityScore: 92, // more reliable
      isFeasible: true,
      recommendationRank: 0,
      isBestChoice: false
    };

    it('ranks candidateB #1 under best_overall_trip_time due to lower total stop impact (24m vs 52m)', () => {
      const pq = new ChargingStationPriorityQueue({ priority: 'best_overall_trip_time' });
      pq.addCandidate(candidateA);
      pq.addCandidate(candidateB);

      const ranked = pq.getRankedRecommendations();
      expect(ranked[0].station.id).toBe(sampleStation2.id);
      expect(ranked[0].isBestChoice).toBe(true);
      expect(ranked[0].bestChoiceRationale).toContain('lower than alternatives');
    });

    it('ranks candidateB #1 under shortest_queue due to 0 min wait', () => {
      const pq = new ChargingStationPriorityQueue({ priority: 'shortest_queue' });
      pq.addCandidate(candidateA);
      pq.addCandidate(candidateB);

      const ranked = pq.getRankedRecommendations();
      expect(ranked[0].station.id).toBe(sampleStation2.id);
      expect(ranked[0].estimatedWaitMinutes).toBe(0);
    });

    it('ranks candidateA #1 under lowest_cost due to cheaper charging rate (₹380 vs ₹460)', () => {
      const pq = new ChargingStationPriorityQueue({ priority: 'lowest_cost' });
      pq.addCandidate(candidateA);
      pq.addCandidate(candidateB);

      const ranked = pq.getRankedRecommendations();
      expect(ranked[0].station.id).toBe(sampleStation1.id);
      expect(ranked[0].estimatedPriceInr).toBe(380);
    });

    it('ranks candidateB #1 under most_reliable due to 92% vs 70% community reliability', () => {
      const pq = new ChargingStationPriorityQueue({ priority: 'most_reliable' });
      pq.addCandidate(candidateA);
      pq.addCandidate(candidateB);

      const ranked = pq.getRankedRecommendations();
      expect(ranked[0].station.id).toBe(sampleStation2.id);
      expect(ranked[0].reliabilityScore).toBe(92);
    });
  });

  describe('4. Dynamic Arrival-Time Queue Prediction (Not Just Current Time)', () => {
    it('accurately predicts 0 min wait when driver arrives in 35 min and currently charging cars will finish', () => {
      const now = Date.now();
      const arrivalIn35Min = now + 35 * 60 * 1000;

      // Currently 2 stalls, both occupied, 0 cars waiting right now
      const currentStatus: ConnectorQueueStatus = {
        connectorType: 'CCS2',
        totalPoints: 2,
        availablePoints: 0,
        occupiedPoints: 2,
        outOfOrderPoints: 0,
        vehiclesWaiting: 0,
        estimatedWaitMinutes: 18,
        confidence: 'high',
        dataSource: 'operator_live',
        updatedAt: now
      };

      const prediction = predictQueueAtArrival({
        station: sampleStation1,
        connectorType: 'CCS2',
        currentQueueStatus: currentStatus,
        arrivalTimestampMs: arrivalIn35Min,
        currentTimestampMs: now,
        vehicle: mockVehicle,
        arrivalSocPercent: 20,
        targetSocPercent: 80
      });

      // Since average session is ~35 min, the 2 stalls will finish during the 35 min drive!
      expect(prediction.estimatedWaitAtArrivalMinutes).toBe(0);
      expect(prediction.projectedVehiclesWaiting).toBe(0);
      expect(prediction.predictionRationale).toContain('sessions projected to clear');
      expect(prediction.confidence).toBe('high');
    });

    it('predicts residual wait when queue length exceeds stalls clearing before arrival', () => {
      const now = Date.now();
      const arrivalIn15Min = now + 15 * 60 * 1000;

      // Currently 2 stalls, both occupied, AND 3 cars waiting in queue
      const currentStatus: ConnectorQueueStatus = {
        connectorType: 'CCS2',
        totalPoints: 2,
        availablePoints: 0,
        occupiedPoints: 2,
        outOfOrderPoints: 0,
        vehiclesWaiting: 3,
        estimatedWaitMinutes: 52,
        confidence: 'medium',
        dataSource: 'community_report',
        updatedAt: now
      };

      const prediction = predictQueueAtArrival({
        station: sampleStation1,
        connectorType: 'CCS2',
        currentQueueStatus: currentStatus,
        arrivalTimestampMs: arrivalIn15Min,
        currentTimestampMs: now,
        vehicle: mockVehicle,
        arrivalSocPercent: 20,
        targetSocPercent: 80
      });

      expect(prediction.estimatedWaitAtArrivalMinutes).toBeGreaterThan(15);
      expect(prediction.projectedVehiclesWaiting).toBeGreaterThan(0);
      expect(prediction.estimatedPlugInTime).not.toBeNull();
      expect(prediction.estimatedDepartureTime).not.toBeNull();
    });

    it('returns unavailable when station has no queue or community reporting data', () => {
      const prediction = predictQueueAtArrival({
        station: sampleStation1,
        connectorType: 'CCS2',
        currentQueueStatus: null,
        arrivalTimestampMs: Date.now() + 3600000,
        vehicle: mockVehicle,
        arrivalSocPercent: 20,
        targetSocPercent: 80
      });

      expect(prediction.estimatedWaitAtArrivalMinutes).toBeNull();
      expect(prediction.dataSource).toBe('unavailable');
      expect(prediction.confidence).toBe('unknown');
      expect(prediction.predictionRationale).toContain('unavailable');
    });
  });

  describe('5. Community Queue Reporting & Anti-Abuse Controls', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      clearQueueReportsForTest();
    });

    it('accepts voluntary queue report and generates pseudonymous contributor hash', () => {
      const pseudonym = generatePseudonym('192.168.1.55');
      expect(pseudonym).toMatch(/^driver-[a-f0-9]{10}$/);

      const res = submitQueueReport(
        {
          stationId: sampleStation1.id,
          stationName: sampleStation1.name,
          connectorType: 'CCS2',
          action: '1_waiting'
        },
        '192.168.1.55'
      );

      expect(res.success).toBe(true);
      expect(res.report?.vehiclesWaiting).toBe(1);
      expect(res.report?.reporterPseudonym).toBe(pseudonym);
    });

    it('rejects duplicate report submitted for the same station within deduplication window', () => {
      const clientIp = '10.0.0.88';

      const first = submitQueueReport(
        {
          stationId: sampleStation2.id,
          stationName: sampleStation2.name,
          connectorType: 'CCS2',
          action: 'no_waiting'
        },
        clientIp
      );
      expect(first.success).toBe(true);

      const duplicate = submitQueueReport(
        {
          stationId: sampleStation2.id,
          stationName: sampleStation2.name,
          connectorType: 'CCS2',
          action: '2_waiting'
        },
        clientIp
      );
      expect(duplicate.success).toBe(false);
      expect(duplicate.message.toLowerCase()).toContain('recently submitted');
    });

    it('maps actions correctly to expected waiting vehicle counts', () => {
      expect(actionToWaitingCount('no_waiting')).toBe(0);
      expect(actionToWaitingCount('charger_available')).toBe(0);
      expect(actionToWaitingCount('queue_cleared')).toBe(0);
      expect(actionToWaitingCount('1_waiting')).toBe(1);
      expect(actionToWaitingCount('2_waiting')).toBe(2);
      expect(actionToWaitingCount('3_waiting')).toBe(3);
      expect(actionToWaitingCount('4_plus_waiting')).toBe(4);
      expect(actionToWaitingCount('custom_count', 7)).toBe(7);
    });
  });

  describe('6. Connector Group Separation (CCS2 vs Type 2)', () => {
    it('aggregates CCS2 and Type 2 queues separately without conflating stalls', () => {
      submitQueueReport(
        {
          stationId: sampleStation1.id,
          stationName: sampleStation1.name,
          connectorType: 'CCS2',
          action: '1_waiting'
        },
        '10.0.1.5'
      );

      const queueData = getAggregatedStationQueue(sampleStation1.id);
      expect(queueData).not.toBeNull();
      if (!queueData) return;

      // Station 1 has 2 CCS2 and 2 Type 2 stalls
      expect(queueData.connectorQueues['CCS2']).toBeDefined();
      expect(queueData.connectorQueues['Type 2']).toBeDefined();
      expect(queueData.connectorQueues['CCS2'].totalPoints).toBe(2);
      expect(queueData.connectorQueues['Type 2'].totalPoints).toBe(2);
      expect(queueData.connectorQueues['CCS2'].vehiclesWaiting).toBe(1);
    });
  });

  describe('7. Controlled Optimizer Invariance Check', () => {
    it('produces identical route calculation when queueWaitMinutesMap is empty or omitted', async () => {
      const baseReq = {
        origin: demoTrip.origin,
        destination: demoTrip.destination,
        waypoints: [],
        vehicle: mockVehicle,
        planOptions: initialPlanOptions,
        chargingSettings: initialChargingSettings,
        routingSettings: initialRoutingSettings
      };

      const resWithoutQueue = await calculateTripRoutes(baseReq);
      const resWithEmptyQueue = await calculateTripRoutes({
        ...baseReq,
        queueWaitMinutesMap: new Map()
      });

      expect(resWithoutQueue.activeRouteId).toBe(resWithEmptyQueue.activeRouteId);
      expect(resWithoutQueue.routeOptions.length).toBe(resWithEmptyQueue.routeOptions.length);
      expect(resWithoutQueue.routeOptions[0].stops.length).toBe(resWithEmptyQueue.routeOptions[0].stops.length);
    });
  });
});
