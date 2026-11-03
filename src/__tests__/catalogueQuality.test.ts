import { describe, it, expect } from 'vitest';
import { chargingStations } from '../data/stationCatalogue';
import {
  normalizeNetworkName,
  isNetworkMatch,
  normalizeConnectorType,
  isConnectorCompatible,
  classifyTariff,
  classifyStallAvailability,
  validateStationRecord,
  auditStationCatalogue,
  buildStationProvenance,
  curatedCorridorStations
} from '../services/catalogueService';
import { ChargingStation } from '../types/station';
import { getEligibleStations } from '../utils/geoUtils';
import { initialVehicleProfile } from '../data/demoVehicle';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { solveRcsp } from '../services/rcspSolver';
import { calculateTripRoutes } from '../services/routingService';

describe('Phase 5B Indian EV Charging-Station Catalogue Audit & Quality Suite', () => {
  const baseSyntheticStation: ChargingStation = {
    id: 'sta-synthetic-test',
    name: 'Synthetic Test Supercharger',
    network: 'Tata Power',
    address: 'Highway Plaza KM 50',
    coordinates: [26.0, 81.0],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 2,
    connectors: [{ type: 'CCS2', maxPowerKw: 120, count: 4, availableCount: 2 }],
    amenities: ['restaurant', 'restroom'],
    pricePerKwh: '₹22.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 10m ago',
    openingHours: '24/7',
    paymentMethods: ['UPI'],
    dataSource: 'Reference Simulation'
  };

  // 1. Catalogue record count
  it('1. should accurately determine catalogue record count (20 stations, rejecting ~900 myth)', () => {
    expect(chargingStations.length).toBe(20);
    const audit = auditStationCatalogue();
    expect(audit.totalRecords).toBe(20);
  });

  // 2. Duplicate IDs
  it('2. should verify unique station IDs in catalogue and detect synthetic duplicates', () => {
    const audit = auditStationCatalogue();
    expect(audit.duplicateIds).toHaveLength(0);

    const dupList = [baseSyntheticStation, { ...baseSyntheticStation, name: 'Duplicate Copy' }];
    const dupAudit = auditStationCatalogue(dupList);
    expect(dupAudit.duplicateIds).toContain('sta-synthetic-test');
  });

  // 3. Invalid coordinates
  it('3. should detect invalid coordinates (NaN, Infinity, non-numeric)', () => {
    const invalidCoords: ChargingStation = {
      ...baseSyntheticStation,
      coordinates: [NaN, 81.0]
    };
    const result = validateStationRecord(invalidCoords);
    expect(result.isValid).toBe(false);
    expect(result.anomalies.some((a) => a.includes('NaN'))).toBe(true);
  });

  // 4. Reversed coordinate detection
  it('4. should detect reversed [lng, lat] coordinates where identifiable', () => {
    // Inverted: longitude (81.0) passed as latitude, latitude (26.0) passed as longitude
    const inverted: ChargingStation = {
      ...baseSyntheticStation,
      coordinates: [81.0, 26.0]
    };
    const result = validateStationRecord(inverted);
    expect(result.hasReversedCoordinates).toBe(true);
    expect(result.anomalies.some((a) => a.includes('Inverted coordinates'))).toBe(true);
  });

  // 5. Duplicate station locations
  it('5. should identify stations with identical coordinates and distinguish multi-charger sites', () => {
    const siteCharger1: ChargingStation = {
      ...baseSyntheticStation,
      id: 'sta-site-1',
      coordinates: [26.0684, 83.1859]
    };
    const siteCharger2: ChargingStation = {
      ...baseSyntheticStation,
      id: 'sta-site-2',
      coordinates: [26.0684, 83.1859]
    };

    const audit = auditStationCatalogue([siteCharger1, siteCharger2]);
    expect(audit.duplicateCoordinates.length).toBe(1);
    expect(audit.duplicateCoordinates[0].stationIds).toEqual(['sta-site-1', 'sta-site-2']);
  });

  // 6. Operator alias normalization
  it('6. should normalize known operator aliases to canonical identities', () => {
    expect(normalizeNetworkName('Tata Power').canonicalNetwork).toBe('Tata Power EZ Charge');
    expect(normalizeNetworkName('tata').canonicalNetwork).toBe('Tata Power EZ Charge');
    expect(normalizeNetworkName('Adani Gas').canonicalNetwork).toBe('Adani TotalEnergies');
    expect(normalizeNetworkName('Jio-bp').canonicalNetwork).toBe('Jio-bp pulse');
    expect(normalizeNetworkName('Zeon').canonicalNetwork).toBe('Zeon Charging');
    expect(isNetworkMatch('Tata Power', 'Tata Power EZ Charge')).toBe(true);
  });

  // 7. Unknown network handling
  it('7. should preserve unknown operators rather than discarding or mutating them', () => {
    const unknownOp = 'Local Village Solar Co-op';
    const norm = normalizeNetworkName(unknownOp);
    expect(norm.isRecognized).toBe(false);
    expect(norm.canonicalNetwork).toBe(unknownOp);
    expect(norm.originalNetwork).toBe(unknownOp);
  });

  // 8. Connector normalization
  it('8. should normalize connector standard variants to canonical types', () => {
    expect(normalizeConnectorType('CCS').canonicalType).toBe('CCS2');
    expect(normalizeConnectorType('CCS2').canonicalType).toBe('CCS2');
    expect(normalizeConnectorType('ccs-2').canonicalType).toBe('CCS2');
    expect(normalizeConnectorType('Type 2').canonicalType).toBe('Type 2');
    expect(normalizeConnectorType('Bharat DC-001').canonicalType).toBe('Bharat DC-001');
    expect(normalizeConnectorType('NACS').canonicalType).toBe('NACS');
  });

  // 9. Unknown connector handling
  it('9. should safely handle unknown or proprietary connectors', () => {
    const unknownConn = normalizeConnectorType('CustomProprietaryPlug');
    expect(unknownConn.isStandard).toBe(false);
    expect(unknownConn.canonicalType).toBe('CustomProprietaryPlug');
  });

  // 10. Connector incompatibility
  it('10. should correctly evaluate vehicle connector compatibility including CCS2 aliasing', () => {
    // CCS vehicle should match CCS2 station
    expect(isConnectorCompatible('CCS2', ['CCS'])).toBe(true);
    expect(isConnectorCompatible('CCS', ['CCS2'])).toBe(true);
    // CCS vehicle incompatible with CHAdeMO or GB/T
    expect(isConnectorCompatible('CHAdeMO', ['CCS'])).toBe(false);
    expect(isConnectorCompatible('GB/T', ['CCS'])).toBe(false);
  });

  // 11. Invalid charging power
  it('11. should flag invalid, negative, or zero charging power', () => {
    const zeroPower: ChargingStation = {
      ...baseSyntheticStation,
      ratedPowerKw: 0
    };
    const res1 = validateStationRecord(zeroPower);
    expect(res1.isValid).toBe(false);
    expect(res1.anomalies.some((a) => a.includes('ratedPowerKw'))).toBe(true);

    const negPower: ChargingStation = {
      ...baseSyntheticStation,
      ratedPowerKw: -50
    };
    const res2 = validateStationRecord(negPower);
    expect(res2.isValid).toBe(false);
  });

  // 12. Missing charging power
  it('12. should flag missing or NaN charging power ratings', () => {
    const missingPower: ChargingStation = {
      ...baseSyntheticStation,
      ratedPowerKw: NaN
    };
    const res = validateStationRecord(missingPower);
    expect(res.isValid).toBe(false);
  });

  // 13. Invalid stall counts
  it('13. should flag invalid total stalls and availableStalls > totalStalls', () => {
    const invalidStalls: ChargingStation = {
      ...baseSyntheticStation,
      totalStalls: 2,
      availableStalls: 5 // impossible: 5 available of 2 total
    };
    const res = validateStationRecord(invalidStalls);
    expect(res.isValid).toBe(false);
    expect(res.anomalies.some((a) => a.includes('Anomaly: available > total'))).toBe(true);
  });

  // 14. Zero versus unknown available stalls
  it('14. should distinguish known zero available stalls from untracked/unknown availability', () => {
    // 0 available = known full
    const full = classifyStallAvailability(4, 0);
    expect(full.status).toBe('known_full');
    expect(full.displayLabel).toContain('0/4 stalls available (Full)');

    // undefined available = unknown live status
    const untracked = classifyStallAvailability(4, undefined);
    expect(untracked.status).toBe('unknown');
    expect(untracked.displayLabel).toContain('Live occupancy unverified');

    // 2 available = known available
    const available = classifyStallAvailability(4, 2);
    expect(available.status).toBe('known_available');
  });

  // 15. Valid INR tariff parsing
  it('15. should parse valid ₹ INR per-kWh tariffs accurately', () => {
    const t1 = classifyTariff('₹22.50 / kWh');
    expect(t1.tariffPerKwh).toBe(22.5);
    expect(t1.classification).toBe('source_confirmed');
    expect(t1.isEstimated).toBe(false);

    const t2 = classifyTariff('INR 19.50/unit');
    expect(t2.tariffPerKwh).toBe(19.5);
    expect(t2.classification).toBe('source_confirmed');
  });

  // 16. Missing tariff classification
  it('16. should classify missing tariff as estimated default without silently claiming operator confirmation', () => {
    const tMissing = classifyTariff(undefined);
    expect(tMissing.tariffPerKwh).toBe(21.0);
    expect(tMissing.classification).toBe('estimated_default');
    expect(tMissing.isEstimated).toBe(true);
    expect(tMissing.displayLabel).toContain('Estimated default');
  });

  // 17. Session-fee handling
  it('17. should distinguish session fees from per-kWh energy tariffs', () => {
    const tSession = classifyTariff('Fixed Session Fee ₹100');
    expect(tSession.classification).toBe('session_fee');
    expect(tSession.sessionFeeInr).toBe(100);
    expect(tSession.isEstimated).toBe(true);
  });

  // 18. Estimated tariff labeling
  it('18. should properly classify free and promotional charging', () => {
    const tFree = classifyTariff('Free charging for EV users');
    expect(tFree.tariffPerKwh).toBe(0);
    expect(tFree.classification).toBe('free');
    expect(tFree.isEstimated).toBe(false);
  });

  // 19. Provenance compatibility
  it('19. should build structured field-level provenance across all station attributes', () => {
    const station = chargingStations[0]; // Azamgarh
    const prov = buildStationProvenance(station);
    expect(prov.identity?.status).toBe('verified');
    expect(prov.coordinates?.status).toBe('verified');
    expect(prov.network?.status).toBe('verified');
    expect(prov.roadAccess?.status).toBe('verified');
    expect(prov.operationalStatus?.status).toBe('source_reported');
  });

  // 20. Missing verification timestamps
  it('20. should not fabricate verification timestamps for unverified stations', () => {
    const unverifiedStation: ChargingStation = {
      ...baseSyntheticStation,
      accessMetadata: undefined
    };
    const prov = buildStationProvenance(unverifiedStation);
    expect(prov.roadAccess?.status).toBe('estimated');
    expect(prov.roadAccess?.confidence).toBeLessThan(0.8);
  });

  // 21. Backward compatibility with old station records
  it('21. should maintain 100% backward compatibility for legacy records without access or provenance metadata', () => {
    const legacyStation: ChargingStation = {
      id: 'sta-legacy-record',
      name: 'Legacy Highway Charger',
      network: 'OldNet',
      address: 'Old Bypass KM 10',
      coordinates: [26.0, 81.0],
      ratedPowerKw: 50,
      totalStalls: 2,
      connectors: [{ type: 'CCS', maxPowerKw: 50, count: 2 }],
      amenities: ['restroom'],
      pricePerKwh: '₹20.00 / kWh',
      operationalStatus: 'operational',
      statusTimestamp: 'Old Timestamp',
      openingHours: '24/7',
      paymentMethods: ['Cash', 'UPI'],
      dataSource: 'Reference Simulation'
    };

    const res = validateStationRecord(legacyStation);
    expect(res.isValid).toBe(true);

    const eligible = getEligibleStations(
      [legacyStation],
      initialVehicleProfile,
      initialPlanOptions,
      initialChargingSettings
    );
    expect(eligible.length).toBe(1);
    expect(eligible[0].id).toBe('sta-legacy-record');
  });

  // 22. Road-access metadata compatibility
  it('22. should preserve Phase 5A road access fields alongside Phase 5B provenance', () => {
    const station = chargingStations[0];
    expect(station.accessMetadata).toBeDefined();
    expect(station.accessMetadata?.carriagewayAccess).toBe('both');
    expect(station.accessMetadata?.entranceCoordinates).toEqual([26.0682, 83.1855]);
    expect(station.accessMetadata?.backupStationId).toBe('sta-haidergarh-renovatio');
  });

  // 23. RCSP candidate filtering
  it('23. should seamlessly integrate normalized network and connector matching into RCSP', () => {
    // Custom RCSP request along synthetic corridor
    const req = {
      origin: { id: 'o', name: 'Start', coordinates: [0, 0] as [number, number], batterySoc: 60 },
      destination: { id: 'd', name: 'Finish', coordinates: [1.4474, 0] as [number, number], batterySoc: 10 },
      waypoints: [],
      vehicle: initialVehicleProfile, // selectedPlugTypes: ['CCS']
      planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
      chargingSettings: {
        ...initialChargingSettings,
        // User prefers 'Tata Power' (which is normalized to 'Tata Power EZ Charge')
        preferredNetworks: ['Tata Power']
      },
      routingSettings: initialRoutingSettings
    };

    // Candidate station with 'CCS2' connector and 'Tata Power EZ Charge' network
    const candidate: ChargingStation = {
      ...baseSyntheticStation,
      id: 'sta-rcsp-tata-ccs2',
      coordinates: [0.5, 0.0],
      network: 'Tata Power EZ Charge',
      connectors: [{ type: 'CCS2', maxPowerKw: 120, count: 2, availableCount: 2 }]
    };

    const prevStations = [...chargingStations];
    (chargingStations as unknown as ChargingStation[]).length = 0;
    chargingStations.push(candidate);

    try {
      const res = solveRcsp(req);
      expect(res).not.toBeNull();
      expect(res!.stops.length).toBeGreaterThan(0);
      expect(res!.stops[0].stationId).toBe('sta-rcsp-tata-ccs2');
      expect(res!.stops[0].canonicalNetwork).toBe('Tata Power EZ Charge');
    } finally {
      (chargingStations as unknown as ChargingStation[]).length = 0;
      chargingStations.push(...prevStations);
    }
  });

  // 24. Greedy candidate filtering
  it('24. should filter avoided networks and select preferred networks using alias normalization in greedy routing', async () => {
    const req = {
      origin: { id: 'o', name: 'Varanasi', coordinates: [25.3176, 82.9739] as [number, number], batterySoc: 40 },
      destination: { id: 'd', name: 'Agra', coordinates: [27.1767, 78.0081] as [number, number], batterySoc: 10 },
      waypoints: [],
      vehicle: initialVehicleProfile,
      planOptions: { ...initialPlanOptions, useRcspOptimizer: false },
      chargingSettings: {
        ...initialChargingSettings,
        // Avoid 'Jio-bp' alias (matches 'Jio-bp pulse' stations)
        avoidedNetworks: ['Jio-bp']
      },
      routingSettings: initialRoutingSettings
    };

    const result = await calculateTripRoutes(req);
    expect(result.routeOptions.length).toBeGreaterThan(0);

    const firstRoute = result.routeOptions[0];
    // No selected stop should be Jio-bp pulse
    for (const stop of firstRoute.stops) {
      expect(isNetworkMatch(stop.network, 'Jio-bp')).toBe(false);
      expect(stop.canonicalNetwork).toBeDefined();
      expect(stop.tariffClassification).toBeDefined();
    }
  });

  // Performance audit
  it('25. should execute catalogue audit in under 15 milliseconds', () => {
    const t0 = performance.now();
    const audit = auditStationCatalogue();
    const durationMs = performance.now() - t0;
    expect(audit.totalRecords).toBe(20);
    expect(durationMs).toBeLessThan(15);
  });

  // Curated corridor dataset validation
  it('26. should verify curated corridor subsets exist in the active catalogue', () => {
    expect(curatedCorridorStations.purvanchalExpressway.length).toBe(3);
    expect(curatedCorridorStations.sitapurBareillyDelhi.length).toBe(5);
    expect(curatedCorridorStations.delhiJaipurHighway.length).toBe(2);
    expect(curatedCorridorStations.mumbaiPuneExpressway.length).toBe(2);
    expect(curatedCorridorStations.bengaluruChennaiHighway.length).toBe(2);
    expect(curatedCorridorStations.grandTrunkRoadNH19.length).toBe(3);

    // Verify all IDs in curated subsets exist in chargingStations
    const allIds = new Set(chargingStations.map((s) => s.id));
    Object.values(curatedCorridorStations).forEach((corridorIds) => {
      corridorIds.forEach((id) => {
        expect(allIds.has(id)).toBe(true);
      });
    });
  });
});

