import { describe, it, expect } from 'vitest';
import { getMarkerQueueBadge } from '../services/queue/chargingQueueService';
import { StationQueueData } from '../types/queue';
import { initialVehicleProfile } from '../data/demoVehicle';
import { VehicleProfile } from '../types/vehicle';

describe('Phase 6G.1 & 6G.2 — Map Marker Queue Badges Suite', () => {
  const nexonVehicle: VehicleProfile = {
    ...initialVehicleProfile,
    selectedPlugTypes: ['CCS', 'Type 2']
  };

  const type2OnlyVehicle: VehicleProfile = {
    ...initialVehicleProfile,
    selectedPlugTypes: ['Type 2']
  };

  describe('1. Direct Map Marker Queue Count Badges', () => {
    it('1.1 renders "4 waiting" badge for high-queue station (Adani Azamgarh)', () => {
      const mockQueue: StationQueueData = {
        stationId: 'sta-azamgarh-adani',
        stationName: 'Adani TotalEnergies - Purvanchal Expressway',
        primaryDataSource: 'community_report',
        confidence: 'high',
        reportCountRecent: 1,
        lastReportedTimestamp: Date.now() - 5 * 60 * 1000,
        overallVehiclesWaiting: 4,
        isStale: false,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 4,
            availablePoints: 0,
            totalPoints: 2,
            occupiedPoints: 2,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 5 * 60 * 1000,
            estimatedWaitMinutes: 38
          }
        }
      };

      const badge = getMarkerQueueBadge(mockQueue, nexonVehicle);
      expect(badge.hasData).toBe(true);
      expect(badge.badgeText).toBe('4 waiting');
      expect(badge.waitingCount).toBe(4);
      expect(badge.badgeClass).toContain('bg-rose-600');
      expect(badge.connectorType).toBe('CCS2');
      expect(badge.label).toBe('4 vehicles waiting');
    });

    it('1.2 renders "1 waiting" badge for moderate-queue station (Renovatio Haidergarh)', () => {
      const mockQueue: StationQueueData = {
        stationId: 'sta-haidergarh-renovatio',
        stationName: 'Renovatio e-charge - Haidergarh',
        primaryDataSource: 'community_report',
        confidence: 'high',
        reportCountRecent: 1,
        lastReportedTimestamp: Date.now() - 2 * 60 * 1000,
        overallVehiclesWaiting: 1,
        isStale: false,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 1,
            availablePoints: 1,
            totalPoints: 2,
            occupiedPoints: 1,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 2 * 60 * 1000,
            estimatedWaitMinutes: 10
          }
        }
      };

      const badge = getMarkerQueueBadge(mockQueue, nexonVehicle);
      expect(badge.hasData).toBe(true);
      expect(badge.badgeText).toBe('1 waiting');
      expect(badge.waitingCount).toBe(1);
      expect(badge.badgeClass).toContain('bg-amber-500');
      expect(badge.connectorType).toBe('CCS2');
      expect(badge.label).toBe('1 vehicle waiting');
    });

    it('1.3 renders "0 waiting" badge and "0 vehicles reported waiting" label for clear station', () => {
      const mockQueue: StationQueueData = {
        stationId: 'sta-sitapur-adani',
        stationName: 'Adani TotalEnergies - Sitapur Bypass',
        primaryDataSource: 'community_report',
        confidence: 'high',
        reportCountRecent: 1,
        lastReportedTimestamp: Date.now() - 3 * 60 * 1000,
        overallVehiclesWaiting: 0,
        isStale: false,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 0,
            availablePoints: 2,
            totalPoints: 2,
            occupiedPoints: 0,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 3 * 60 * 1000,
            estimatedWaitMinutes: 0
          }
        }
      };

      const badge = getMarkerQueueBadge(mockQueue, nexonVehicle);
      expect(badge.hasData).toBe(true);
      expect(badge.badgeText).toBe('0 waiting');
      expect(badge.label).toBe('0 vehicles reported waiting');
      expect(badge.waitingCount).toBe(0);
      expect(badge.badgeClass).toContain('bg-emerald-600');
    });

    it('1.4 renders neutral "Queue unknown" badge when no reports exist', () => {
      const emptyQueue: StationQueueData = {
        stationId: 'sta-unknown-hub',
        stationName: 'Unknown Charging Hub',
        primaryDataSource: 'unavailable',
        confidence: 'unknown',
        reportCountRecent: 0,
        lastReportedTimestamp: 0,
        overallVehiclesWaiting: 0,
        isStale: true,
        connectorQueues: {}
      };

      const badge = getMarkerQueueBadge(emptyQueue, nexonVehicle);
      expect(badge.hasData).toBe(false);
      expect(badge.badgeText).toBe('Queue unknown');
      expect(badge.label).toBe('Queue unknown');
      expect(badge.waitingCount).toBeNull();
      expect(badge.badgeClass).toContain('bg-slate-800');
    });

    it('1.5 marks stale queue reports (> 45 min) appropriately', () => {
      const staleQueue: StationQueueData = {
        stationId: 'sta-stale-hub',
        stationName: 'Stale Hub',
        primaryDataSource: 'community_report',
        confidence: 'low',
        reportCountRecent: 1,
        lastReportedTimestamp: Date.now() - 50 * 60 * 1000,
        overallVehiclesWaiting: 2,
        isStale: true,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 2,
            availablePoints: 0,
            totalPoints: 2,
            occupiedPoints: 2,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'low',
            updatedAt: Date.now() - 50 * 60 * 1000,
            estimatedWaitMinutes: 15
          }
        }
      };

      const badge = getMarkerQueueBadge(staleQueue, nexonVehicle);
      expect(badge.isStale).toBe(true);
      expect(badge.badgeText).toBe('2 waiting (stale)');
    });
  });

  describe('2. Connector-Specific Queue Segregation & Normalization', () => {
    it('2.1 matches vehicle plug type: CCS2 user gets CCS2 queue, Type 2 user gets Type 2 queue', () => {
      const multiConnectorStation: StationQueueData = {
        stationId: 'sta-multi-hub',
        stationName: 'Multi Connector Hub',
        primaryDataSource: 'community_report',
        confidence: 'high',
        reportCountRecent: 2,
        lastReportedTimestamp: Date.now() - 10 * 60 * 1000,
        overallVehiclesWaiting: 4,
        isStale: false,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 4,
            availablePoints: 0,
            totalPoints: 2,
            occupiedPoints: 2,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 10 * 60 * 1000,
            estimatedWaitMinutes: 38
          },
          'Type 2': {
            connectorType: 'Type 2',
            vehiclesWaiting: 1,
            availablePoints: 1,
            totalPoints: 2,
            occupiedPoints: 1,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 10 * 60 * 1000,
            estimatedWaitMinutes: 8
          }
        }
      };

      // Nexon EV driver prefers CCS (normalized to CCS2)
      const ccsBadge = getMarkerQueueBadge(multiConnectorStation, nexonVehicle);
      expect(ccsBadge.connectorType).toBe('CCS2');
      expect(ccsBadge.waitingCount).toBe(4);
      expect(ccsBadge.badgeText).toBe('4 waiting');

      // Type 2 EV driver only supports AC Type 2
      const acBadge = getMarkerQueueBadge(multiConnectorStation, type2OnlyVehicle);
      expect(acBadge.connectorType).toBe('Type 2');
      expect(acBadge.waitingCount).toBe(1);
      expect(acBadge.badgeText).toBe('1 waiting');

      // Never sums incompatible connector queues
      expect(ccsBadge.waitingCount).not.toBe(5);
      expect(acBadge.waitingCount).not.toBe(5);
    });

    it('2.2 canonical normalization matches "CCS" to "CCS2" queue status', () => {
      const ccsStation: StationQueueData = {
        stationId: 'sta-azamgarh-adani',
        stationName: 'Adani TotalEnergies',
        primaryDataSource: 'community_report',
        confidence: 'high',
        reportCountRecent: 1,
        lastReportedTimestamp: Date.now() - 5 * 60 * 1000,
        overallVehiclesWaiting: 4,
        isStale: false,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 4,
            availablePoints: 0,
            totalPoints: 4,
            occupiedPoints: 4,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 5 * 60 * 1000,
            estimatedWaitMinutes: 35
          }
        }
      };

      // Vehicle with plug 'CCS'
      const badge = getMarkerQueueBadge(ccsStation, {
        ...initialVehicleProfile,
        selectedPlugTypes: ['CCS']
      });

      expect(badge.hasData).toBe(true);
      expect(badge.connectorType).toBe('CCS2');
      expect(badge.badgeText).toBe('4 waiting');
    });
  });

  describe('3. Non-Ranking Numeric Badge Compliance', () => {
    it('3.1 never uses station ranking (#1, #2) as queue counts', () => {
      const mockQueue: StationQueueData = {
        stationId: 'sta-azamgarh-adani',
        stationName: 'Adani TotalEnergies - Purvanchal Expressway',
        primaryDataSource: 'community_report',
        confidence: 'high',
        reportCountRecent: 1,
        lastReportedTimestamp: Date.now() - 5 * 60 * 1000,
        overallVehiclesWaiting: 4,
        isStale: false,
        connectorQueues: {
          'CCS2': {
            connectorType: 'CCS2',
            vehiclesWaiting: 4,
            availablePoints: 0,
            totalPoints: 2,
            occupiedPoints: 2,
            outOfOrderPoints: 0,
            dataSource: 'community_report',
            confidence: 'high',
            updatedAt: Date.now() - 5 * 60 * 1000,
            estimatedWaitMinutes: 38
          }
        }
      };

      const badge = getMarkerQueueBadge(mockQueue, nexonVehicle);
      // Strict requirement: Do not display station ranking numbers (such as #1, #2, #3) in place of queue counts
      expect(badge.badgeText).not.toContain('#');
      expect(badge.badgeText).toBe('4 waiting');
    });
  });
});
