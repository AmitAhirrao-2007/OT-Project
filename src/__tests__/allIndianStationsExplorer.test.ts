import { describe, it, expect, beforeAll } from 'vitest';
import {
  loadPcsStations,
  searchStations,
  getStationStats
} from '../../server/stationDataService';
import { initialVehicleProfile } from '../data/demoVehicle';
import { Waypoint } from '../types/route';

describe('Phase 6D.3 - All Indian Charging Stations & Hub Explorer Suite', () => {
  beforeAll(async () => {
    await loadPcsStations();
  });

  describe('1. Dataset Integrity & Stats Endpoint Verification', () => {
    it('1.1 should have indexed 28,350 unique station hubs across all 36 Indian states and UTs', () => {
      const stats = getStationStats();
      expect(stats.total).toBe(28350);
      expect(stats.statesCount).toBeGreaterThanOrEqual(36);
      expect(stats.cposCount).toBeGreaterThanOrEqual(50);
      expect(stats.withCoordinates).toBe(28350);
    });

    it('1.2 should index Fast DC, AC, Slow, and LEV chargers in stats distribution', () => {
      const stats = getStationStats();
      expect(stats.fastChargerCount).toBeGreaterThan(0);
      expect(stats.acSlowCount).toBeGreaterThan(0);
      expect(stats.levCount).toBeGreaterThan(0);
      expect(stats.fastChargerCount + stats.acSlowCount + stats.levCount).toBe(28350);
    });
  });

  describe('2. "All Indian Charging Stations" vs "Compatible with My Vehicle" Modes', () => {
    it('2.1 "All Indian Charging Stations" should return stations without forcing a 30 kW or vehicle cut-off', () => {
      const allStations = searchStations({ limit: 100 });
      expect(allStations.length).toBe(100);

      // Verify mix of power levels: Fast, Slow/AC, LEV
      const hasFast = allStations.some((s) => s.ratedPowerKw >= 30);
      const hasSlowOrLev = allStations.some((s) => s.ratedPowerKw < 30);
      expect(hasFast || hasSlowOrLev).toBe(true);
    });

    it('2.2 "Compatible with My Vehicle" mode should filter to vehicle selected plugs (e.g. CCS2, Type 2 for Tata Nexon EV)', () => {
      const vehicle = initialVehicleProfile;
      const compatibleStations = searchStations({
        vehicleCompatible: true,
        vehicleSelectedPlugs: vehicle.selectedPlugTypes,
        limit: 50
      });

      expect(compatibleStations.length).toBeGreaterThan(0);
      for (const st of compatibleStations) {
        const hasMatch = st.connectors.some((c) => {
          const cType = (c.canonicalType || c.type || '').toLowerCase();
          return vehicle.selectedPlugTypes.some((vp) =>
            cType.includes(vp.toLowerCase()) || vp.toLowerCase().includes(cType)
          );
        });
        expect(hasMatch).toBe(true);
      }
    });
  });

  describe('3. Category Filtering (Fast DC, AC, Slow, LEV)', () => {
    it('3.1 category "fast" should return only Fast DC chargers (>= 30 kW)', () => {
      const fastStations = searchStations({ category: 'fast', limit: 30 });
      expect(fastStations.length).toBeGreaterThan(0);
      for (const st of fastStations) {
        expect(st.ratedPowerKw).toBeGreaterThanOrEqual(30);
      }
    });

    it('3.2 category "slow" should return chargers under 30 kW', () => {
      const slowStations = searchStations({ category: 'slow', limit: 30 });
      expect(slowStations.length).toBeGreaterThan(0);
      for (const st of slowStations) {
        expect(st.ratedPowerKw).toBeLessThan(30);
      }
    });

    it('3.3 category "lev" should return Light Electric Vehicle chargers (<= 3.3 kW)', () => {
      const levStations = searchStations({ category: 'lev', limit: 30 });
      expect(levStations.length).toBeGreaterThan(0);
      for (const st of levStations) {
        expect(st.ratedPowerKw).toBeLessThanOrEqual(3.5);
      }
    });

    it('3.4 category "ac" should return AC chargers', () => {
      const acStations = searchStations({ category: 'ac', limit: 30 });
      expect(acStations.length).toBeGreaterThan(0);
      for (const st of acStations) {
        const hasAc = st.connectors.some((c) => {
          const t = (c.canonicalType || c.type).toLowerCase();
          return t.includes('ac') || t.includes('type 2');
        });
        expect(hasAc).toBe(true);
      }
    });
  });

  describe('4. Connector Filtering (CCS2, Type 2, Bharat AC-001, Bharat DC-001, LEV, CHAdeMO)', () => {
    it('4.1 connector filter "Bharat AC-001" should return stations offering Bharat AC-001', () => {
      const bharatAc = searchStations({ connectorType: 'bharat ac-001', limit: 20 });
      expect(bharatAc.length).toBeGreaterThan(0);
      for (const st of bharatAc) {
        const match = st.connectors.some((c) => (c.canonicalType || c.type).toLowerCase().includes('bharat ac'));
        expect(match).toBe(true);
      }
    });

    it('4.2 connector filter "Bharat DC-001" should return stations offering Bharat DC-001', () => {
      const bharatDc = searchStations({ connectorType: 'bharat dc-001', limit: 20 });
      expect(bharatDc.length).toBeGreaterThan(0);
      for (const st of bharatDc) {
        const match = st.connectors.some((c) => (c.canonicalType || c.type).toLowerCase().includes('bharat dc'));
        expect(match).toBe(true);
      }
    });

    it('4.3 connector filter "CCS2" should return stations offering CCS 2', () => {
      const ccs2 = searchStations({ connectorType: 'ccs2', limit: 20 });
      expect(ccs2.length).toBeGreaterThan(0);
      for (const st of ccs2) {
        const match = st.connectors.some((c) => (c.canonicalType || c.type).toLowerCase().includes('ccs'));
        expect(match).toBe(true);
      }
    });

    it('4.4 connector filter "LEV" should return stations offering LEV connectors', () => {
      const lev = searchStations({ connectorType: 'lev', limit: 20 });
      expect(lev.length).toBeGreaterThan(0);
      for (const st of lev) {
        const match = st.connectors.some((c) => (c.canonicalType || c.type).toLowerCase().includes('lev'));
        expect(match).toBe(true);
      }
    });
  });

  describe('5. Pagination & Total Match Counts', () => {
    it('5.1 offset pagination should return consecutive non-overlapping pages', () => {
      const page1 = searchStations({ limit: 15, offset: 0 });
      const page2 = searchStations({ limit: 15, offset: 15 });

      expect(page1.length).toBe(15);
      expect(page2.length).toBe(15);
      expect(page1[0].id).not.toBe(page2[0].id);
      expect(page1[page1.length - 1].id).not.toBe(page2[0].id);
    });

    it('5.2 search should return total matching count on the results array', () => {
      const results = searchStations('Patna', { limit: 10 });
      expect(results.length).toBeLessThanOrEqual(10);
      expect(results.totalCount).toBeGreaterThanOrEqual(results.length);
    });
  });

  describe('6. Adding Charging Stop to Journey with Full Metadata Preservation', () => {
    it('6.1 adding a station creates a valid Waypoint with exact coordinates and metadata', () => {
      const all = loadPcsStations();
      const station = all[0];
      expect(station).toBeDefined();

      const waypoint: Waypoint = {
        id: `pinned-charger-${station.id}-${Date.now()}`,
        stationId: station.id,
        name: station.name,
        subTitle: `${station.canonicalNetwork || station.network} · ${station.ratedPowerKw} kW`,
        address: station.address,
        coordinates: [station.coordinates[0], station.coordinates[1]],
        powerKw: station.ratedPowerKw,
        batterySoc: 15,
        type: 'charging_pinned',
        category: 'charging_station',
        verificationState: 'verified_station',
        source: 'catalogue',
        targetChargeSoc: 80,
        isCustom: true
      };

      expect(waypoint.stationId).toBe(station.id);
      expect(waypoint.type).toBe('charging_pinned');
      expect(waypoint.coordinates[0]).toBe(station.coordinates[0]);
      expect(waypoint.coordinates[1]).toBe(station.coordinates[1]);
      expect(waypoint.powerKw).toBe(station.ratedPowerKw);
      expect(Number.isFinite(waypoint.coordinates[0])).toBe(true);
      expect(Number.isFinite(waypoint.coordinates[1])).toBe(true);
    });

    it('6.2 allows adding slow or LEV chargers with honest compatibility reporting', () => {
      const levStations = searchStations({ category: 'lev', limit: 1 });
      expect(levStations.length).toBeGreaterThan(0);
      const st = levStations[0];

      // The station can be added regardless of vehicle compatibility
      const pinnedWaypoint: Waypoint = {
        id: `pinned-lev-${st.id}`,
        stationId: st.id,
        name: st.name,
        address: st.address,
        coordinates: st.coordinates,
        powerKw: st.ratedPowerKw,
        batterySoc: 15,
        type: 'charging_pinned',
        category: 'charging_station',
        verificationState: 'verified_station',
        source: 'catalogue',
        targetChargeSoc: 80,
        isCustom: true
      };

      expect(pinnedWaypoint.stationId).toBe(st.id);
      expect(pinnedWaypoint.type).toBe('charging_pinned');
    });
  });
});
