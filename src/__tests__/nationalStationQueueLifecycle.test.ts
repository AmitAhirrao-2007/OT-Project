/**
 * National EV PCS Charging Station Live Queue Lifecycle & Production Hardening Suite
 * Tests end-to-end integration with actual national PCS stations from the 28,350 BEE/MNRE dataset.
 * Covers:
 * 1. National station verification (sta-pcs-58fad8f122f2, Agra Ashok Auto Sales, Page 1098).
 * 2. 4 WAITING tickets in CCS2 queue and 0 in Type 2 queue (connector independence).
 * 3. Driver perspective: Map marker badges and wait prediction.
 * 4. Operator lifecycle: Call next vehicle -> Assign connector -> Start session -> Complete session.
 * 5. Driver perspective update: Badge drops to 3 waiting without counting charging cars as waiting.
 * 6. Server-side authorization & 403 Forbidden enforcement on unauthorized operators.
 * 7. Concurrency protection against duplicate connector assignment.
 * 8. Atomic persistence & automated .bak backup corruption recovery.
 * 9. National coverage overview across all 28,350 stations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStationEVSEs,
  getStationQueueEntries,
  callNextVehicle,
  assignConnectorToQueueEntry,
  startChargingSession,
  completeChargingSession,
  getAuthoritativeStationQueue,
  resetOperatorDbForTesting,
  loadOperatorDb,
  getNationalCoverageOverview,
  searchNationalStationsForOperator,
  simulateCorruptionAndRecover,
  getOperatorUserByEmail
} from '../../server/operatorQueueStorage';
import {
  authorizeStationAccess
} from '../../server/operatorApiMiddleware';
import {
  getMarkerQueueBadge,
  predictQueueAtArrival
} from '../services/queue/chargingQueueService';
import { getStationById } from '../../server/stationDataService';
import { VehicleProfile } from '../types/vehicle';

const AGRA_NATIONAL_STATION_ID = 'sta-pcs-58fad8f122f2';

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

describe('EVSure National Station Queue Lifecycle & Security Suite', () => {
  beforeEach(() => {
    resetOperatorDbForTesting();
  });

  describe('1. National Dataset Inspection & Seed Verification', () => {
    it('should resolve real national PCS station from BEE/MNRE dataset (Agra Ashok Auto Sales)', () => {
      const station = getStationById(AGRA_NATIONAL_STATION_ID);
      expect(station).toBeDefined();
      expect(station?.id).toBe(AGRA_NATIONAL_STATION_ID);
      expect(station?.name).toContain('Agra Ashok Auto Sales');
      expect(station?.coordinates).toBeDefined();
      expect(station?.coordinates[0]).toBeCloseTo(27.200798, 2);
      expect(station?.coordinates[1]).toBeCloseTo(78.008796, 2);
    });

    it('should have approved operator claim and verified equipment for Agra Hub', () => {
      const db = loadOperatorDb();
      const claim = db.stationClaims.find((c) => c.stationId === AGRA_NATIONAL_STATION_ID);
      expect(claim).toBeDefined();
      expect(claim?.status).toBe('approved');
      expect(claim?.organisationId).toBe('org-tata-power');

      const evses = getStationEVSEs(AGRA_NATIONAL_STATION_ID);
      expect(evses.length).toBe(4); // 3 CCS2 + 1 Type 2

      // Check connectors
      const allConnectors = evses.flatMap((e) => e.connectors);
      const ccs2Connectors = allConnectors.filter((c) => c.connectorType === 'CCS2');
      const type2Connectors = allConnectors.filter((c) => c.connectorType === 'Type 2');

      expect(ccs2Connectors.length).toBe(3);
      expect(type2Connectors.length).toBe(1);

      // Initial equipment status: 2 charging, 1 available for CCS2; 1 available for Type 2
      const ccsCharging = ccs2Connectors.filter((c) => c.status === 'charging').length;
      const ccsAvailable = ccs2Connectors.filter((c) => c.status === 'available').length;
      expect(ccsCharging).toBe(2);
      expect(ccsAvailable).toBe(1);
      expect(type2Connectors[0].status).toBe('available');
    });

    it('should have seeded 4 WAITING entries in CCS2 and 0 in Type 2 (Connector Independence)', () => {
      const ccsEntries = getStationQueueEntries(AGRA_NATIONAL_STATION_ID, 'CCS2');
      const ccsWaiting = ccsEntries.filter((e) => e.status === 'WAITING');
      expect(ccsWaiting.length).toBe(4);

      const type2Entries = getStationQueueEntries(AGRA_NATIONAL_STATION_ID, 'Type 2');
      const type2Waiting = type2Entries.filter((e) => e.status === 'WAITING');
      expect(type2Waiting.length).toBe(0);
    });
  });

  describe('2. Driver Facing Perspective & Initial Queue Badges', () => {
    it('should report 4 waiting for CCS2 driver on Agra Hub map badge and popup', () => {
      const queueData = getAuthoritativeStationQueue(AGRA_NATIONAL_STATION_ID);
      expect(queueData).not.toBeNull();
      expect(queueData?.overallVehiclesWaiting).toBe(4);
      expect(queueData?.primaryDataSource).toBe('operator_managed_queue');
      expect(queueData?.confidence).toBe('high');

      // CCS2 badge
      const badge = getMarkerQueueBadge(queueData, testVehicleCcs);
      expect(badge.hasData).toBe(true);
      expect(badge.waitingCount).toBe(4);
      expect(badge.badgeText).toBe('4 waiting');
      expect(badge.badgeClass).toContain('rose');
      expect(badge.dataSource).toBe('operator_managed_queue');
    });

    it('should report 0 waiting for Type 2 driver on the exact same station', () => {
      const queueData = getAuthoritativeStationQueue(AGRA_NATIONAL_STATION_ID);
      expect(queueData).not.toBeNull();

      // Type 2 badge
      const badge = getMarkerQueueBadge(queueData, testVehicleType2);
      expect(badge.hasData).toBe(true);
      expect(badge.waitingCount).toBe(0);
      expect(badge.badgeText).toBe('0 waiting');
      expect(badge.badgeClass).toContain('emerald');
    });

    it('should accurately predict queue waiting time at arrival for CCS2 vehicle', () => {
      const station = getStationById(AGRA_NATIONAL_STATION_ID)!;
      const queueData = getAuthoritativeStationQueue(AGRA_NATIONAL_STATION_ID);
      const ccsStatus = queueData?.connectorQueues['CCS2'] || null;

      const now = Date.now();
      const arrivalIn40Min = now + 40 * 60 * 1000;

      const prediction = predictQueueAtArrival({
        station,
        connectorType: 'CCS2',
        currentQueueStatus: ccsStatus,
        arrivalTimestampMs: arrivalIn40Min,
        currentTimestampMs: now,
        vehicle: testVehicleCcs,
        arrivalSocPercent: 20,
        targetSocPercent: 80
      });

      expect(prediction).toBeDefined();
      expect(prediction.confidence).toBe('high');
      expect(prediction.dataSource).toBe('operator_managed_queue');
      expect(prediction.estimatedWaitAtArrivalMinutes).toBeGreaterThan(0);
      expect(prediction.predictionRationale).toContain('operator');
    });
  });

  describe('3. Operator FIFO Lifecycle: Call Next -> Assign -> Start Session -> Complete', () => {
    it('should transition queue when operator calls vehicle and starts charging, dropping waiting count to 3', () => {
      const actor = 'manager.agra@tatapower.com';

      // Step A: Operator calls the next vehicle in line (q-agra-01)
      const called = callNextVehicle(AGRA_NATIONAL_STATION_ID, 'CCS2', actor);
      expect(called).toBeDefined();
      expect(called?.id).toBe('q-agra-01');
      expect(called?.status).toBe('CALLED');

      // The waiting count immediately drops to 3 because q-agra-01 is now CALLED
      const queueAfterCall = getAuthoritativeStationQueue(AGRA_NATIONAL_STATION_ID);
      const badgeAfterCall = getMarkerQueueBadge(queueAfterCall, testVehicleCcs);
      expect(badgeAfterCall.waitingCount).toBe(3);
      expect(badgeAfterCall.badgeText).toBe('3 waiting');
      expect(badgeAfterCall.badgeClass).toContain('amber');

      // Step B: Operator assigns available connector (conn-agra-3a)
      const assignResult = assignConnectorToQueueEntry('q-agra-01', 'conn-agra-3a', actor);
      expect(assignResult.success).toBe(true);
      expect(assignResult.entry?.status).toBe('ASSIGNED');
      expect(assignResult.entry?.assignedConnectorId).toBe('conn-agra-3a');

      // Step C: Operator starts charging session
      const startResult = startChargingSession('q-agra-01', actor);
      expect(startResult.success).toBe(true);
      expect(startResult.session).toBeDefined();
      expect(startResult.session?.status).toBe('active');
      expect(startResult.session?.connectorId).toBe('conn-agra-3a');

      // Step D: Re-inspect driver view
      const queueAfterStart = getAuthoritativeStationQueue(AGRA_NATIONAL_STATION_ID);
      expect(queueAfterStart).not.toBeNull();
      expect(queueAfterStart?.overallVehiclesWaiting).toBe(3);

      const driverBadge = getMarkerQueueBadge(queueAfterStart, testVehicleCcs);
      expect(driverBadge.waitingCount).toBe(3);
      expect(driverBadge.badgeText).toBe('3 waiting');

      // Verify that active charging vehicles do NOT count as waiting vehicles
      const db = loadOperatorDb();
      const activeSessions = db.sessions.filter(
        (s) => s.stationId === AGRA_NATIONAL_STATION_ID && s.status === 'active'
      );
      expect(activeSessions.length).toBe(3); // 2 previous + 1 newly started
      expect(queueAfterStart?.overallVehiclesWaiting).toBe(3); // Only WAITING vehicles count

      // Verify Type 2 remains completely independent at 0 waiting
      const type2Badge = getMarkerQueueBadge(queueAfterStart, testVehicleType2);
      expect(type2Badge.waitingCount).toBe(0);
      expect(type2Badge.badgeText).toBe('0 waiting');

      // Step E: Complete a charging session
      const completeResult = completeChargingSession(startResult.session!.id, actor);
      expect(completeResult.success).toBe(true);
      expect(completeResult.session?.status).toBe('completed');

      // Connector conn-agra-3a is now freed and available
      const evsesAfterComplete = getStationEVSEs(AGRA_NATIONAL_STATION_ID);
      const freedConn = evsesAfterComplete.flatMap((e) => e.connectors).find((c) => c.id === 'conn-agra-3a');
      expect(freedConn?.status).toBe('available');
    });
  });

  describe('4. Concurrency Protection', () => {
    it('should reject assigning an already occupied or charging connector to another vehicle', () => {
      const actor = 'manager.agra@tatapower.com';

      // Call next vehicle
      callNextVehicle(AGRA_NATIONAL_STATION_ID, 'CCS2', actor);

      // Attempt to assign conn-agra-1a (which is already charging sess-agra-101)
      const conflictResult = assignConnectorToQueueEntry('q-agra-01', 'conn-agra-1a', actor);
      expect(conflictResult.success).toBe(false);
      expect(conflictResult.message).toContain('Simultaneous assignment prevented');

      // Assign the legitimate free connector conn-agra-3a
      const validAssign = assignConnectorToQueueEntry('q-agra-01', 'conn-agra-3a', actor);
      expect(validAssign.success).toBe(true);

      // Now call vehicle #2 (q-agra-02)
      callNextVehicle(AGRA_NATIONAL_STATION_ID, 'CCS2', actor);

      // Attempt duplicate assignment of conn-agra-3a to q-agra-02
      const duplicateResult = assignConnectorToQueueEntry('q-agra-02', 'conn-agra-3a', actor);
      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.message).toContain('Simultaneous assignment prevented');
    });
  });

  describe('5. Server-Side Security & Access Control Enforcement', () => {
    it('should allow authorized station manager to manage their claimed station', () => {
      const agraManager = getOperatorUserByEmail('manager.agra@tatapower.com');
      expect(agraManager).toBeDefined();

      const auth = authorizeStationAccess(agraManager!, AGRA_NATIONAL_STATION_ID, 'manage_queue');
      expect(auth.authorized).toBe(true);
      expect(auth.status).toBe(200);
    });

    it('should allow platform admin full access across all stations', () => {
      const admin = getOperatorUserByEmail('admin@evsure.internal');
      expect(admin).toBeDefined();

      const auth = authorizeStationAccess(admin!, AGRA_NATIONAL_STATION_ID, 'manage_queue');
      expect(auth.authorized).toBe(true);
      expect(auth.status).toBe(200);
    });

    it('should return 403 Forbidden when unauthorized external operator attempts to modify station', () => {
      const unauthorizedUser = getOperatorUserByEmail('unauthorized.operator@external-cpo.in');
      expect(unauthorizedUser).toBeDefined();

      const auth = authorizeStationAccess(unauthorizedUser!, AGRA_NATIONAL_STATION_ID, 'manage_queue');
      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(403);
      expect(auth.code).toBe('FORBIDDEN');
      expect(auth.message).toContain('not verified or approved');
    });

    it('should return 403 Forbidden when read-only auditor attempts to modify queue', () => {
      const auditor = getOperatorUserByEmail('auditor@evsure.internal');
      expect(auditor).toBeDefined();

      const auth = authorizeStationAccess(auditor!, AGRA_NATIONAL_STATION_ID, 'manage_queue');
      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(403);
      expect(auth.code).toBe('FORBIDDEN');
      expect(auth.message).toContain('Auditor accounts have read-only');
    });

    it('should return 401 Unauthorized when unauthenticated request attempts modifying operations', () => {
      const auth = authorizeStationAccess(null, AGRA_NATIONAL_STATION_ID, 'manage_queue');
      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(401);
      expect(auth.code).toBe('UNAUTHORIZED');
    });
  });

  describe('6. Production Persistence & Automated Corruption Auto-Recovery', () => {
    it('should automatically recover database from .bak backup snapshot when corrupted', () => {
      // Simulate file corruption and verify recovery
      const recovered = simulateCorruptionAndRecover();
      expect(recovered).toBe(true);

      const recoveredDb = loadOperatorDb();
      expect(recoveredDb).toBeDefined();
      expect(recoveredDb.organisations.length).toBeGreaterThan(0);
      expect(recoveredDb.stationClaims.length).toBeGreaterThan(0);

      // Verify that after recovery, Agra Hub data is fully intact
      const agraQueue = getAuthoritativeStationQueue(AGRA_NATIONAL_STATION_ID);
      expect(agraQueue).not.toBeNull();
      expect(agraQueue?.overallVehiclesWaiting).toBe(4);
    });
  });

  describe('7. National Coverage Overview (28,350 Stations)', () => {
    it('should return accurate national overview metrics across the entire 28,350 dataset', () => {
      const overview = getNationalCoverageOverview();
      expect(overview.totalNationalStations).toBe(28350);
      expect(overview.claimedStationsCount).toBeGreaterThanOrEqual(3);
      expect(overview.approvedStationsCount).toBeGreaterThanOrEqual(3);
      expect(overview.verifiedEquipmentStationsCount).toBeGreaterThanOrEqual(1);

      // Agra station must be listed in activeOperatorHubs
      const agraHub = overview.activeOperatorHubs.find((h) => h.stationId === AGRA_NATIONAL_STATION_ID);
      expect(agraHub).toBeDefined();
      expect(agraHub?.stationName).toContain('Agra Ashok Auto Sales');
      expect(agraHub?.cpoBrand).toContain('Tata Power');
      expect(agraHub?.vehiclesWaiting).toBe(4);
      expect(agraHub?.queueMode).toBe('Method A (FIFO)');

      // Unmonitored stations count should represent genuine dataset reality
      expect(overview.unmonitoredStationsCount).toBeGreaterThan(28000);
    });

    it('should allow searching the national 28,350 catalogue by query and state', () => {
      const searchResult = searchNationalStationsForOperator('Agra Ashok', undefined, undefined, 20, 0);
      expect(searchResult.stations.length).toBeGreaterThan(0);
      expect(searchResult.totalCount).toBeGreaterThan(0);

      const foundAgraStation = searchResult.stations.find((s) => s.id === AGRA_NATIONAL_STATION_ID);
      expect(foundAgraStation).toBeDefined();
    });
  });
});
