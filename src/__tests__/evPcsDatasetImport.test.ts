import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  loadPcsStations,
  searchStations,
  getStationsInBbox,
  getStationsAlongCorridor,
  getStationById,
  getStationStats,
  haversineDistanceMi
} from '../../server/stationDataService';
import { chargingStations } from '../data/stationCatalogue';
import { isDefaultPatnaDelhiCorridor } from '../services/routingService';

describe('Phase 6D: EV PCS National Charging Station Dataset Import Suite', () => {
  const rawPath = path.resolve(process.cwd(), 'server', 'data', 'evPcsRawRecords.json');
  const stationsPath = path.resolve(process.cwd(), 'server', 'data', 'evPcsStations.json');
  const reportPath = path.resolve(process.cwd(), 'docs', 'ev-pcs-import-report.md');

  // ==========================================================================
  // 1. Dataset Extraction & File Integrity Tests
  // ==========================================================================

  it('1. should verify that the raw extracted PCS records file exists and is populated', () => {
    expect(fs.existsSync(rawPath)).toBe(true);
    const stats = fs.statSync(rawPath);
    // Raw JSON is ~17 MB
    expect(stats.size).toBeGreaterThan(10 * 1024 * 1024);
  });

  it('2. should verify that the normalized stations file exists and exceeds 25,000 unique hubs', () => {
    expect(fs.existsSync(stationsPath)).toBe(true);
    const stats = fs.statSync(stationsPath);
    expect(stats.size).toBeGreaterThan(30 * 1024 * 1024);

    const stations = loadPcsStations();
    expect(stations.length).toBeGreaterThan(25000);
  });

  it('3. should verify the comprehensive Markdown import report exists', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const content = fs.readFileSync(reportPath, 'utf-8');
    expect(content).toContain('EV_PCS_Data_29277.pdf');
    expect(content).toContain('1,159 Pages');
    expect(content).toContain('Total Source Pages Processed');
  });

  // ==========================================================================
  // 2. Data Normalization & Spatial Quality Tests
  // ==========================================================================

  it('4. should verify coordinate validity within Indian territorial bounds', () => {
    const stations = loadPcsStations();
    const sample = stations.slice(0, 500);

    for (const st of sample) {
      expect(st.coordinates).toBeDefined();
      expect(Array.isArray(st.coordinates)).toBe(true);
      expect(st.coordinates.length).toBe(2);

      const [lat, lng] = st.coordinates;
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);

      // India bounds: 6.0 <= lat <= 38.0 and 68.0 <= lng <= 98.0
      expect(lat).toBeGreaterThanOrEqual(6.0);
      expect(lat).toBeLessThanOrEqual(38.0);
      expect(lng).toBeGreaterThanOrEqual(68.0);
      expect(lng).toBeLessThanOrEqual(98.0);
    }
  });

  it('5. should verify that LEV chargers (<=3.5 kW) are properly classified and separated', () => {
    const stations = loadPcsStations();
    const levStations = stations.filter((s) => (s as any)._meta?.is_lev === true);
    const fastStations = stations.filter((s) => s.ratedPowerKw >= 30);

    expect(levStations.length).toBeGreaterThan(10000);
    expect(fastStations.length).toBeGreaterThan(3000);

    // Verify fast stations have valid high-power connectors
    for (const fs of fastStations.slice(0, 50)) {
      expect(fs.ratedPowerKw).toBeGreaterThanOrEqual(30);
      const maxConnKw = Math.max(...fs.connectors.map((c) => c.maxPowerKw));
      expect(maxConnKw).toBeGreaterThanOrEqual(30);
    }
  });

  it('6. should verify stable ID structure (sta-pcs-*) across all records', () => {
    const stations = loadPcsStations();
    const sample = stations.slice(0, 100);

    for (const st of sample) {
      expect(st.id).toMatch(/^sta-pcs-[a-f0-9]{12}$/);
      expect(st.name).toBeTruthy();
      expect(st.address).toContain('India');
      expect(st.connectors.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ==========================================================================
  // 3. Server Spatial Query & Search Service Tests
  // ==========================================================================

  it('7. should accurately compute haversine distance in miles', () => {
    // Delhi (28.6139, 77.2090) to Agra (27.1767, 78.0081) is approx 115-125 miles
    const dist = haversineDistanceMi(28.6139, 77.209, 27.1767, 78.0081);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(130);
  });

  it('8. should search stations by text query and state filter', () => {
    const delhiResults = searchStations('Delhi', { state: 'Delhi', minPowerKw: 25, limit: 20 });
    expect(delhiResults.length).toBeGreaterThan(0);
    expect(delhiResults.length).toBeLessThanOrEqual(20);

    for (const st of delhiResults) {
      expect(st.ratedPowerKw).toBeGreaterThanOrEqual(25);
      const metaState = (st as any)._meta?.state || '';
      expect(metaState.toLowerCase()).toContain('delhi');
    }
  });

  it('9. should search stations by CPO / Operator filter', () => {
    const tataResults = searchStations('', { cpo: 'Tata Power', minPowerKw: 30, limit: 15 });
    expect(tataResults.length).toBeGreaterThan(0);

    for (const st of tataResults) {
      expect(st.canonicalNetwork).toBe('Tata Power EZ Charge');
      expect(st.ratedPowerKw).toBeGreaterThanOrEqual(30);
    }
  });

  it('10. should query stations within a geographical bounding box (BBox)', () => {
    // Bounding box around Bengaluru: Lat 12.8 to 13.1, Lon 77.4 to 77.8
    const bangaloreStations = getStationsInBbox(12.8, 13.1, 77.4, 77.8, {
      minPowerKw: 30,
      excludeLev: true,
      limit: 50
    });

    expect(bangaloreStations.length).toBeGreaterThan(0);
    for (const st of bangaloreStations) {
      const [lat, lng] = st.coordinates;
      expect(lat).toBeGreaterThanOrEqual(12.8);
      expect(lat).toBeLessThanOrEqual(13.1);
      expect(lng).toBeGreaterThanOrEqual(77.4);
      expect(lng).toBeLessThanOrEqual(77.8);
      expect(st.ratedPowerKw).toBeGreaterThanOrEqual(30);
    }
  });

  it('11. should discover fast charging stations along a multi-point road polyline corridor', () => {
    // Delhi to Agra corridor polyline points
    const delhiToAgraPolyline: [number, number][] = [
      [28.6139, 77.209],
      [28.4089, 77.3178], // Faridabad
      [28.1487, 77.332],  // Palwal
      [27.8974, 77.4912], // Kosi Kalan
      [27.4924, 77.6737], // Mathura
      [27.1767, 78.0081]  // Agra
    ];

    const corridorStations = getStationsAlongCorridor(delhiToAgraPolyline, 25, {
      excludeLev: true,
      minPowerKw: 30,
      limit: 50
    });

    expect(corridorStations.length).toBeGreaterThan(0);
    for (const st of corridorStations) {
      expect(st.ratedPowerKw).toBeGreaterThanOrEqual(30);
      expect(st.accessMetadata?.actualDetourMi).toBeDefined();
      expect(st.accessMetadata!.actualDetourMi).toBeLessThanOrEqual(25);
    }
  });

  it('12. should retrieve a station by unique ID', () => {
    const stations = loadPcsStations();
    const firstStation = stations[0];
    const retrieved = getStationById(firstStation.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(firstStation.id);
    expect(retrieved?.name).toBe(firstStation.name);
  });

  it('13. should return comprehensive dataset statistics matching the national registry', () => {
    const stats = getStationStats();
    expect(stats.total).toBeGreaterThan(25000);
    expect(stats.withCoordinates).toBe(stats.total);
    expect(stats.statesCount).toBeGreaterThanOrEqual(30);
    expect(stats.cposCount).toBeGreaterThan(15);
    expect(stats.fastChargerCount).toBeGreaterThan(3000);
    expect(stats.levCount).toBeGreaterThan(10000);
  });

  // ==========================================================================
  // 4. Preservation & Regression Fidelity Tests
  // ==========================================================================

  it('14. should preserve the 20 curated baseline stations', () => {
    expect(chargingStations).toBeDefined();
    expect(chargingStations.length).toBe(20);

    const tataKisanPath = chargingStations.find((s) => s.id === 'sta-lucknow-tata');
    expect(tataKisanPath).toBeDefined();
    expect(tataKisanPath?.name).toContain('Kisan Path');
    expect(tataKisanPath?.ratedPowerKw).toBe(150);
  });

  it('15. should preserve the default Patna-to-Delhi corridor detection', () => {
    const patnaOrigin = {
      id: 'origin',
      name: 'Patna',
      coordinates: [25.5941, 85.1376] as [number, number],
      batterySoc: 95
    };
    const delhiDest = {
      id: 'dest',
      name: 'Delhi',
      coordinates: [28.6139, 77.209] as [number, number],
      batterySoc: 10
    };

    expect(isDefaultPatnaDelhiCorridor(patnaOrigin, delhiDest, [])).toBe(true);

    // Non-Patna origin should not trigger fixture
    const bhopalOrigin = {
      id: 'origin',
      name: 'Bhopal',
      coordinates: [23.2599, 77.4126] as [number, number],
      batterySoc: 95
    };
    expect(isDefaultPatnaDelhiCorridor(bhopalOrigin, delhiDest, [])).toBe(false);
  });
});
