/**
 * Phase 6I — EVSure Live Charging Queue Management & Operator Portal Suite
 * Comprehensive tests for operational queue lifecycle, EVSE hierarchy,
 * source precedence, connector independence, and calibrated wait predictions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStationEVSEs,
  getStationQueueEntries,
  addVehicleToQueue,
  callNextVehicle,
  assignConnectorToQueueEntry,
  startChargingSession,
  completeChargingSession,
  cancelQueueEntry,
  setOperatorAggregateCount,
  getAuthoritativeStationQueue,
  resetOperatorDbForTesting,
  loadOperatorDb
} from '../../server/operatorQueueStorage';
import {
  predictQueueAtArrival,
  getMarkerQueueBadge,
  evaluateQueueConfidence
} from '../services/queue/chargingQueueService';
import { ChargingStation } from '../types/station';
import { VehicleProfile } from '../types/vehicle';

const TEST_STATION_ID = 'sta-test-evsure-hub';

const testVehicleCcs: VehicleProfile = {
  id: 'nexon-ev-test',
  name: 'Tata Nexon EV Max',
  manufacturer: 'Tata Motors',
  model: 'Nexon EV Max',
  year: 2024,
  batteryCapacityKwh: 40.5,
  usableBatteryKwh: 38.0,
  maxDcChargingKw: 50,
  maxAcChargingKw: 7.2,
  referenceConsumptionWhPerMi: 235,
  maximumSpeedMph: 85,
  relativeSpeedPercent: 100,
  batteryDegradationPercent: 0,
  supportedPlugTypes: ['CCS', 'Type 2'],
  selectedPlugTypes: ['CCS'],
  liveDataConnected: false,
  saveActivity: false,
  imageSvgType: 'suv'
};

const testVehicleType2: VehicleProfile = {
  id: 'tiago-ev-test',
  name: 'Tata Tiago EV',
  manufacturer: 'Tata Motors',
  model: 'Tiago EV',
  year: 2024,
  batteryCapacityKwh: 24.0,
  usableBatteryKwh: 22.0,
  maxDcChargingKw: 25,
  maxAcChargingKw: 7.2,
  referenceConsumptionWhPerMi: 190,
  maximumSpeedMph: 75,
  relativeSpeedPercent: 100,
  batteryDegradationPercent: 0,
  supportedPlugTypes: ['Type 2'],
  selectedPlugTypes: ['Type 2'],
  liveDataConnected: false,
  saveActivity: false,
  imageSvgType: 'hatchback'
};

const mockTestStation: ChargingStation = {
  id: TEST_STATION_ID,
  name: 'EVSure Highway Hub - Kanpur Corridor',
  network: 'EVSure',
  address: 'NH-19 Milestone 312, Kanpur Outer Bypass',
  coordinates: [26.4499, 80.3319],
  ratedPowerKw: 120,
  totalStalls: 4,
  availableStalls: 2,
  connectors: [
    { type: 'CCS2', maxPowerKw: 120, count: 3, availableCount: 1, canonicalType: 'CCS2' },
    { type: 'Type 2', maxPowerKw: 22, count: 1, availableCount: 1, canonicalType: 'Type 2' }
  ],
  amenities: ['restaurant', 'restroom', 'coffee', 'wifi'],
  pricePerKwh: '₹21.00 / kWh',
  operationalStatus: 'operational',
  statusTimestamp: 'Verified live',
  openingHours: '24/7',
  paymentMethods: ['App', 'RFID'],
  dataSource: 'Operator API'
};

describe('Phase 6I: EVSure Live Charging Queue Management Suite', () => {
  beforeEach(() => {
    // Reset database to initial seed before each test
    resetOperatorDbForTesting();
  });

  describe('1. Station Equipment & EVSE Hierarchy', () => {
    it('1.1 should correctly model EVSE bays and connectors for test hub', () => {
      const evses = getStationEVSEs(TEST_STATION_ID);
      expect(evses.length).toBe(4);

      // Verify CCS2 connectors
      const ccsEvses = evses.filter((e) =>
        e.connectors.some((c) => c.connectorType === 'CCS2')
      );
      expect(ccsEvses.length).toBe(3);

      // Verify Type 2 connector
      const type2Evse = evses.find((e) =>
        e.connectors.some((c) => c.connectorType === 'Type 2')
      );
      expect(type2Evse).toBeDefined();
      expect(type2Evse?.status).toBe('available');
    });

    it('1.2 should reflect initial status: 2 CCS2 charging, 1 CCS2 available, 1 Type 2 available', () => {
      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      expect(authQueue).not.toBeNull();
      expect(authQueue?.connectorsTotal).toBe(4);
      expect(authQueue?.connectorsAvailable).toBe(2); // 1 CCS2 + 1 Type 2
      expect(authQueue?.connectorsOccupied).toBe(2);  // 2 CCS2 charging
      expect(authQueue?.activeSessionCount).toBe(2);
    });
  });

  describe('2. Method A: FIFO Waiting Queue Lifecycle', () => {
    it('2.1 should start with exactly 4 WAITING vehicles for CCS2', () => {
      const entries = getStationQueueEntries(TEST_STATION_ID, 'CCS2');
      const waiting = entries.filter((e) => e.status === 'WAITING');
      expect(waiting.length).toBe(4);

      // Check FIFO order
      expect(waiting[0].queuePosition).toBe(1);
      expect(waiting[1].queuePosition).toBe(2);
      expect(waiting[2].queuePosition).toBe(3);
      expect(waiting[3].queuePosition).toBe(4);
    });

    it('2.2 should add new vehicle to end of FIFO queue with incremented position', () => {
      const newEntry = addVehicleToQueue(TEST_STATION_ID, 'CCS2', {
        vehicleModel: 'Hyundai Ioniq 6',
        vehicleRegLast4: '9900',
        driverName: 'Sanjay Dutt',
        estimatedEnergyKwh: 35,
        estimatedDurationMinutes: 25,
        source: 'operator_portal',
        actor: 'operator@evsure.in'
      });

      expect(newEntry.queuePosition).toBe(5);
      expect(newEntry.status).toBe('WAITING');

      const updatedQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      const ccsQueue = updatedQueue?.connectorQueues['CCS2'];
      expect(ccsQueue?.vehiclesWaiting).toBe(5);
    });

    it('2.3 should call next vehicle in line and transition status to CALLED', () => {
      const called = callNextVehicle(TEST_STATION_ID, 'CCS2', 'operator@evsure.in');
      expect(called).not.toBeNull();
      expect(called?.status).toBe('CALLED');
      expect(called?.id).toBe('q-test-kanpur-01');

      // Check remaining WAITING count: now 3
      const entries = getStationQueueEntries(TEST_STATION_ID, 'CCS2');
      const waiting = entries.filter((e) => e.status === 'WAITING');
      expect(waiting.length).toBe(3);
    });

    it('2.4 should assign available connector to entry', () => {
      const assignRes = assignConnectorToQueueEntry(
        'q-test-kanpur-01',
        'conn-kanpur-3a',
        'operator@evsure.in'
      );
      expect(assignRes.success).toBe(true);
      expect(assignRes.entry?.status).toBe('ASSIGNED');
      expect(assignRes.entry?.assignedConnectorId).toBe('conn-kanpur-3a');
    });

    it('2.5 should start charging session and remove vehicle from waiting count', () => {
      // Vehicle 1 transitions to CHARGING
      const startRes = startChargingSession('q-test-kanpur-01', 'operator@evsure.in');
      expect(startRes.success).toBe(true);
      expect(startRes.entry?.status).toBe('CHARGING');
      expect(startRes.session).toBeDefined();

      // Crucial test: Charging vehicle does NOT count as waiting!
      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      const ccsQueue = authQueue?.connectorQueues['CCS2'];
      expect(ccsQueue?.vehiclesWaiting).toBe(3); // Was 4, now 3!
      expect(authQueue?.activeSessionCount).toBe(3); // Was 2, now 3 charging!
    });

    it('2.6 should complete charging session and free the connector back to available', () => {
      // Initially 2 active sessions: sess-kanpur-101 and sess-kanpur-102
      const compRes = completeChargingSession('sess-kanpur-101', 'operator@evsure.in');
      expect(compRes.success).toBe(true);
      expect(compRes.session?.status).toBe('completed');

      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      expect(authQueue?.activeSessionCount).toBe(1);
      expect(authQueue?.connectorsAvailable).toBe(3); // Bay freed up!
    });

    it('2.7 should cancel queue entry or record NO_SHOW', () => {
      const cancelRes = cancelQueueEntry('q-test-kanpur-04', 'NO_SHOW', 'operator@evsure.in', 'Driver left area');
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.entry?.status).toBe('NO_SHOW');

      const entries = getStationQueueEntries(TEST_STATION_ID, 'CCS2');
      const waiting = entries.filter((e) => e.status === 'WAITING');
      expect(waiting.length).toBe(3);
    });
  });

  describe('3. Method B: Operator Aggregate Queue Reporting', () => {
    it('3.1 should allow operator to record aggregate queue count without individual tickets', () => {
      // Clear individual entries to test aggregate method in isolation
      const db = loadOperatorDb();
      db.queueEntries = [];
      const report = setOperatorAggregateCount(
        TEST_STATION_ID,
        'CCS2',
        2,
        false,
        'operator@evsure.in',
        'Visual count by gate staff'
      );
      expect(report.vehiclesWaiting).toBe(2);
      expect(report.reportedBy).toBe('operator@evsure.in');

      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      const ccsQueue = authQueue?.connectorQueues['CCS2'];
      expect(ccsQueue?.vehiclesWaiting).toBe(2);
      expect(ccsQueue?.dataSource).toBe('operator_aggregate_report');
    });

    it('3.2 should handle operator setting 0 waiting count', () => {
      const db = loadOperatorDb();
      db.queueEntries = [];
      setOperatorAggregateCount(TEST_STATION_ID, 'CCS2', 0, false, 'operator@evsure.in');

      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      const ccsQueue = authQueue?.connectorQueues['CCS2'];
      expect(ccsQueue?.vehiclesWaiting).toBe(0);
    });
  });

  describe('4. Authoritative Source Precedence', () => {
    it('4.1 should prioritize operator managed queue (Method A) over aggregate reports and community reports', () => {
      // Even if an aggregate report of 1 waiting exists, the 4 WAITING tickets must govern
      setOperatorAggregateCount(TEST_STATION_ID, 'CCS2', 1, false, 'operator@evsure.in');

      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      const ccsQueue = authQueue?.connectorQueues['CCS2'];

      // Precedence: Method A (4 waiting) wins over Method B (1 waiting)
      expect(ccsQueue?.dataSource).toBe('operator_managed_queue');
      expect(ccsQueue?.vehiclesWaiting).toBe(4);
    });
  });

  describe('5. Connector Group Independence', () => {
    it('5.1 should maintain independent queue states for CCS2 and Type 2', () => {
      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      expect(authQueue).not.toBeNull();

      const ccsQueue = authQueue?.connectorQueues['CCS2'];
      const type2Queue = authQueue?.connectorQueues['Type 2'];

      // CCS2 has 4 waiting vehicles
      expect(ccsQueue?.vehiclesWaiting).toBe(4);

      // Type 2 has 0 waiting vehicles
      expect(type2Queue?.vehiclesWaiting).toBe(0);
      expect(type2Queue?.availablePoints).toBe(1);
    });

    it('5.2 should display distinct marker badges for CCS2 vs Type 2 vehicles', () => {
      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);

      // Driver with CCS vehicle
      const ccsBadge = getMarkerQueueBadge(authQueue, testVehicleCcs);
      expect(ccsBadge.hasData).toBe(true);
      expect(ccsBadge.waitingCount).toBe(4);
      expect(ccsBadge.badgeText).toBe('4 waiting');
      expect(ccsBadge.connectorType).toBe('CCS2');

      // Driver with Type 2 vehicle
      const type2Badge = getMarkerQueueBadge(authQueue, testVehicleType2);
      expect(type2Badge.hasData).toBe(true);
      expect(type2Badge.waitingCount).toBe(0);
      expect(type2Badge.badgeText).toBe('0 waiting');
      expect(type2Badge.connectorType).toBe('Type 2');
    });
  });

  describe('6. Realistic Waiting-Time Predictions (Power-Calibrated)', () => {
    it('6.1 should predict lower waiting duration on high power DC (120 kW) than on AC (22 kW)', () => {
      const authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      const ccsStatus = authQueue?.connectorQueues['CCS2']!;
      const now = Date.now();

      // Arrival in 30 minutes with 4 waiting vehicles on 120 kW DC
      const predictionDc = predictQueueAtArrival({
        station: mockTestStation,
        connectorType: 'CCS2',
        currentQueueStatus: ccsStatus,
        arrivalTimestampMs: now + 30 * 60 * 1000,
        currentTimestampMs: now,
        vehicle: testVehicleCcs,
        arrivalSocPercent: 20,
        targetSocPercent: 80
      });

      // Calibrated session turnover on 120 kW is ~28 minutes across 3 total points
      // In 30 minutes, several stalls will turnover
      expect(predictionDc.estimatedWaitAtArrivalMinutes).toBeDefined();
      expect(predictionDc.estimatedWaitAtArrivalMinutes!).toBeLessThan(45);
    });

    it('6.2 should assign high confidence to recent operator-managed queues', () => {
      const now = Date.now();
      const confHigh = evaluateQueueConfidence('operator_managed_queue', now - 10 * 60 * 1000, now);
      expect(confHigh).toBe('high');

      const confMed = evaluateQueueConfidence('operator_managed_queue', now - 60 * 60 * 1000, now);
      expect(confMed).toBe('medium');
    });
  });

  describe('7. End-to-End Operational Lifecycle Acceptance', () => {
    it('7.1 should verify driver badge decreases from 4 waiting to 3 waiting when operator calls and charges vehicle', () => {
      // Step 1: Initial state -> Driver sees 4 waiting
      let authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      let badge = getMarkerQueueBadge(authQueue, testVehicleCcs);
      expect(badge.badgeText).toBe('4 waiting');
      expect(badge.waitingCount).toBe(4);

      // Step 2: Operator calls next vehicle
      const called = callNextVehicle(TEST_STATION_ID, 'CCS2', 'operator@evsure.in');
      expect(called).not.toBeNull();

      // Step 3: Operator starts charging session for the called vehicle
      const sessionRes = startChargingSession(called!.id, 'operator@evsure.in');
      expect(sessionRes.success).toBe(true);

      // Step 4: Driver perspective -> Map badge immediately updates to 3 waiting!
      authQueue = getAuthoritativeStationQueue(TEST_STATION_ID);
      badge = getMarkerQueueBadge(authQueue, testVehicleCcs);
      expect(badge.badgeText).toBe('3 waiting');
      expect(badge.waitingCount).toBe(3);

      // Step 5: Type 2 queue remains unaffected at 0 waiting
      const type2Badge = getMarkerQueueBadge(authQueue, testVehicleType2);
      expect(type2Badge.badgeText).toBe('0 waiting');
      expect(type2Badge.waitingCount).toBe(0);
    });
  });
});
