// Indian EV Charging-Station Catalogue Service
// Provides geospatial coordinate validation, network & connector normalization,
// tariff classification, anomaly detection, and data-quality auditing.

import {
  ChargingStation,
  TariffClassification,
  StallAvailabilityStatus,
  StationProvenance
} from '../types/station';
import { chargingStations } from '../data/stationCatalogue';

// ============================================================================
// 1. NETWORK NORMALIZATION & ALIAS MAPPING
// ============================================================================

export interface NetworkNormalizationResult {
  canonicalNetwork: string;
  originalNetwork: string;
  isRecognized: boolean;
}

const NETWORK_ALIASES: Record<string, string> = {
  // Tata Power
  'tata power ez charge': 'Tata Power EZ Charge',
  'tata power': 'Tata Power EZ Charge',
  'tata': 'Tata Power EZ Charge',
  'tata motors': 'Tata Power EZ Charge',
  'tata motors ez charge': 'Tata Power EZ Charge',

  // Adani TotalEnergies
  'adani totalenergies': 'Adani TotalEnergies',
  'adani total energies': 'Adani TotalEnergies',
  'adani gas': 'Adani TotalEnergies',
  'adani': 'Adani TotalEnergies',

  // Jio-bp pulse
  'jio-bp pulse': 'Jio-bp pulse',
  'jio-bp': 'Jio-bp pulse',
  'jiobp': 'Jio-bp pulse',
  'jio bp': 'Jio-bp pulse',
  'jio bp pulse': 'Jio-bp pulse',

  // Statiq
  'statiq': 'Statiq',
  'statiq ev': 'Statiq',
  'statiq fast hub': 'Statiq',

  // Zeon Charging
  'zeon charging': 'Zeon Charging',
  'zeon': 'Zeon Charging',

  // Renovatio
  'renovatio': 'Renovatio',
  'renovatio e-charge': 'Renovatio',

  // Charge_IN by Mahindra
  'charge_in by mahindra': 'Charge_IN by Mahindra',
  'charge_in': 'Charge_IN by Mahindra',
  'chargein': 'Charge_IN by Mahindra',
  'mahindra charge_in': 'Charge_IN by Mahindra',

  // ChargeZone
  'chargezone': 'ChargeZone',
  'charge zone': 'ChargeZone',

  // Statcon Energiaa
  'statcon energiaa': 'Statcon Energiaa',
  'statcon': 'Statcon Energiaa'
};

/**
 * Normalizes a charging network name to its canonical commercial identity.
 * Retains the original network string and marks whether the network is recognized.
 */
export function normalizeNetworkName(network: string): NetworkNormalizationResult {
  if (!network || typeof network !== 'string') {
    return {
      canonicalNetwork: 'Unknown Operator',
      originalNetwork: network || '',
      isRecognized: false
    };
  }

  const key = network.trim().toLowerCase();
  const canonical = NETWORK_ALIASES[key];

  if (canonical) {
    return {
      canonicalNetwork: canonical,
      originalNetwork: network,
      isRecognized: true
    };
  }

  // Preserve unrecognized operator name rather than discarding it
  return {
    canonicalNetwork: network.trim(),
    originalNetwork: network,
    isRecognized: false
  };
}

/**
 * Checks whether two network strings refer to the same operator,
 * matching against aliases, canonical names, or case-insensitive raw strings.
 */
export function isNetworkMatch(networkA: string, networkB: string): boolean {
  if (!networkA || !networkB) return false;
  if (networkA.toLowerCase().trim() === networkB.toLowerCase().trim()) return true;

  const normA = normalizeNetworkName(networkA).canonicalNetwork.toLowerCase();
  const normB = normalizeNetworkName(networkB).canonicalNetwork.toLowerCase();
  return normA === normB;
}

// ============================================================================
// 2. CONNECTOR NORMALIZATION & COMPATIBILITY
// ============================================================================

export interface ConnectorNormalizationResult {
  canonicalType: string;
  originalType: string;
  isStandard: boolean;
}

const CONNECTOR_ALIASES: Record<string, string> = {
  // CCS / CCS2
  'ccs': 'CCS2',
  'ccs2': 'CCS2',
  'ccs 2': 'CCS2',
  'ccs-2': 'CCS2',
  'iec 62196-3': 'CCS2',

  // Type 2 (AC)
  'type 2': 'Type 2',
  'type2': 'Type 2',
  'type-2': 'Type 2',
  'mennekes': 'Type 2',

  // CHAdeMO
  'chademo': 'CHAdeMO',

  // GB/T (Indian heavy commercial / legacy e-bus)
  'gb/t': 'GB/T',
  'gbt': 'GB/T',

  // Bharat Standards (Govt of India DHI standards)
  'bharat dc-001': 'Bharat DC-001',
  'bharat-dc-001': 'Bharat DC-001',
  'bharat ac-001': 'Bharat AC-001',
  'bharat-ac-001': 'Bharat AC-001',

  // NACS / Tesla
  'nacs': 'NACS',
  'tesla': 'NACS',

  // Level 2 / J1772
  'level 2': 'Level 2',
  'level2': 'Level 2',
  'j1772': 'Level 2'
};

/**
 * Normalizes a connector string to its canonical standard type.
 */
export function normalizeConnectorType(rawType: string): ConnectorNormalizationResult {
  if (!rawType || typeof rawType !== 'string') {
    return {
      canonicalType: 'Unknown',
      originalType: rawType || '',
      isStandard: false
    };
  }

  const key = rawType.trim().toLowerCase();
  const canonical = CONNECTOR_ALIASES[key];

  if (canonical) {
    return {
      canonicalType: canonical,
      originalType: rawType,
      isStandard: true
    };
  }

  return {
    canonicalType: rawType.trim(),
    originalType: rawType,
    isStandard: false
  };
}

/**
 * Evaluates whether a station connector satisfies any of the vehicle's selected plug types.
 * Accounts for canonical aliasing (e.g., vehicle 'CCS' matches station 'CCS2').
 */
export function isConnectorCompatible(
  stationConnectorType: string,
  vehicleSelectedPlugs: string[]
): boolean {
  if (!stationConnectorType || !vehicleSelectedPlugs || vehicleSelectedPlugs.length === 0) {
    return false;
  }

  const stationNorm = normalizeConnectorType(stationConnectorType).canonicalType;

  return vehicleSelectedPlugs.some((vPlug) => {
    const vehicleNorm = normalizeConnectorType(vPlug).canonicalType;
    if (stationNorm === vehicleNorm) return true;

    // CCS and CCS2 interoperability
    if (
      (stationNorm === 'CCS2' || stationNorm === 'CCS') &&
      (vehicleNorm === 'CCS2' || vehicleNorm === 'CCS')
    ) {
      return true;
    }

    return false;
  });
}

// ============================================================================
// 3. TARIFF PARSING & CLASSIFICATION
// ============================================================================

export interface TariffResult {
  tariffPerKwh: number;
  classification: TariffClassification;
  isEstimated: boolean;
  displayLabel: string;
  rawPriceString?: string;
  sessionFeeInr?: number;
}

/**
 * Parses and classifies tariff strings, distinguishing confirmed prices,
 * estimated defaults, session fees, free charging, and invalid inputs.
 */
export function classifyTariff(priceStr?: string): TariffResult {
  if (!priceStr || typeof priceStr !== 'string' || priceStr.trim() === '') {
    return {
      tariffPerKwh: 21.0,
      classification: 'estimated_default',
      isEstimated: true,
      displayLabel: '₹21.00 / kWh (Estimated default)',
      rawPriceString: priceStr
    };
  }

  const clean = priceStr.trim();

  // 1. Check for free charging
  if (/free|₹0(\.00)?|inr\s*0/i.test(clean)) {
    return {
      tariffPerKwh: 0,
      classification: 'free',
      isEstimated: false,
      displayLabel: 'Free Charging',
      rawPriceString: clean
    };
  }

  // 2. Check for fixed session fee without per-kWh rate
  if (/session\s*fee|fixed\s*fee|per\s*session/i.test(clean) && !/\/(\s*kwh|\s*unit)/i.test(clean)) {
    const match = clean.match(/(\d+(?:\.\d+)?)/);
    const sessionFee = match ? parseFloat(match[1]) : 0;
    return {
      tariffPerKwh: 21.0, // fallback per-kWh baseline
      classification: 'session_fee',
      isEstimated: true,
      sessionFeeInr: sessionFee,
      displayLabel: `Session Fee ₹${sessionFee} + ₹21.00/kWh (Estimated)`,
      rawPriceString: clean
    };
  }

  // 3. Extract per-kWh rate
  const rateMatch = clean.match(/(?:₹|inr|rs\.?)?\s*(\d+(?:\.\d+)?)/i);
  if (rateMatch) {
    const parsedRate = parseFloat(rateMatch[1]);
    if (parsedRate > 0 && parsedRate <= 100) {
      return {
        tariffPerKwh: parsedRate,
        classification: 'source_confirmed',
        isEstimated: false,
        displayLabel: `₹${parsedRate.toFixed(2)} / kWh`,
        rawPriceString: clean
      };
    }
  }

  // 4. Invalid or unparseable format
  return {
    tariffPerKwh: 21.0,
    classification: 'invalid',
    isEstimated: true,
    displayLabel: '₹21.00 / kWh (Fallback tariff)',
    rawPriceString: clean
  };
}

// ============================================================================
// 4. STALL AVAILABILITY CLASSIFICATION
// ============================================================================

/**
 * Classifies stall occupancy without treating missing data as zero stalls
 * or zero stalls as missing data.
 */
export function classifyStallAvailability(
  totalStalls: number,
  availableStalls?: number
): { status: StallAvailabilityStatus; displayLabel: string; isValid: boolean } {
  if (typeof totalStalls !== 'number' || isNaN(totalStalls) || totalStalls <= 0) {
    return {
      status: 'unknown',
      displayLabel: 'Invalid stall count',
      isValid: false
    };
  }

  if (availableStalls === undefined || availableStalls === null) {
    return {
      status: 'unknown',
      displayLabel: `${totalStalls} stalls (Live occupancy unverified)`,
      isValid: true
    };
  }

  if (typeof availableStalls !== 'number' || isNaN(availableStalls) || availableStalls < 0) {
    return {
      status: 'unknown',
      displayLabel: `${totalStalls} stalls (Invalid availability)`,
      isValid: false
    };
  }

  if (availableStalls > totalStalls) {
    return {
      status: 'unknown',
      displayLabel: `${availableStalls}/${totalStalls} stalls (Anomaly: available > total)`,
      isValid: false
    };
  }

  if (availableStalls === 0) {
    return {
      status: 'known_full',
      displayLabel: `0/${totalStalls} stalls available (Full)`,
      isValid: true
    };
  }

  return {
    status: 'known_available',
    displayLabel: `${availableStalls}/${totalStalls} stalls available`,
    isValid: true
  };
}

// ============================================================================
// 5. COORDINATE & STRUCTURAL ANOMALY VALIDATION
// ============================================================================

export interface StationValidationResult {
  stationId: string;
  isValid: boolean;
  hasReversedCoordinates: boolean;
  isWithinIndiaCoverage: boolean;
  anomalies: string[];
  warnings: string[];
}

/**
 * Validates a single charging station record for structural integrity,
 * coordinate validity, bounding box constraints, power ratings, and stall counts.
 */
export function validateStationRecord(station: ChargingStation): StationValidationResult {
  const anomalies: string[] = [];
  const warnings: string[] = [];
  let hasReversedCoordinates = false;
  let isWithinIndiaCoverage = true;

  // 1. Station ID validation
  if (!station.id || typeof station.id !== 'string' || station.id.trim() === '') {
    anomalies.push('Missing or invalid station ID');
  }

  // 2. Name validation
  if (!station.name || typeof station.name !== 'string' || station.name.trim() === '') {
    anomalies.push('Missing or empty station name');
  }

  // 3. Coordinate validation
  if (
    !station.coordinates ||
    !Array.isArray(station.coordinates) ||
    station.coordinates.length !== 2
  ) {
    anomalies.push('Coordinates must be a 2-element [lat, lng] array');
    isWithinIndiaCoverage = false;
  } else {
    const [lat, lng] = station.coordinates;

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      anomalies.push('Coordinates contain NaN or non-numeric values');
      isWithinIndiaCoverage = false;
    } else if (!isFinite(lat) || !isFinite(lng)) {
      anomalies.push('Coordinates contain non-finite numbers (Infinity)');
      isWithinIndiaCoverage = false;
    } else {
      // Check for coordinate inversion: [lng, lat] instead of [lat, lng]
      // India latitude is ~6.5 to ~37.5, longitude is ~68.0 to ~97.5
      if (lat >= 68.0 && lat <= 98.0 && lng >= 6.0 && lng <= 38.0) {
        hasReversedCoordinates = true;
        anomalies.push(`Inverted coordinates detected: [${lat}, ${lng}] looks like [lng, lat]`);
      }

      // Check standard Indian territorial bounds
      if (lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0) {
        isWithinIndiaCoverage = false;
        warnings.push(`Coordinates [${lat}, ${lng}] are outside India bounding box (Lat: 6-38, Lng: 68-98)`);
      }
    }
  }

  // 4. Power validation
  if (typeof station.ratedPowerKw !== 'number' || isNaN(station.ratedPowerKw) || station.ratedPowerKw <= 0) {
    anomalies.push(`Invalid ratedPowerKw: ${station.ratedPowerKw} kW (must be positive number)`);
  } else if (station.ratedPowerKw > 500) {
    warnings.push(`Unusually high power rating: ${station.ratedPowerKw} kW`);
  }

  // 5. Connector validation
  if (!station.connectors || !Array.isArray(station.connectors) || station.connectors.length === 0) {
    anomalies.push('Station has no connectors defined');
  } else {
    station.connectors.forEach((conn, idx) => {
      if (!conn.type) anomalies.push(`Connector #${idx + 1} has missing type`);
      if (typeof conn.maxPowerKw !== 'number' || conn.maxPowerKw <= 0) {
        anomalies.push(`Connector #${idx + 1} has invalid maxPowerKw (${conn.maxPowerKw})`);
      }
      if (typeof conn.count !== 'number' || conn.count <= 0) {
        anomalies.push(`Connector #${idx + 1} has invalid count (${conn.count})`);
      }
    });
  }

  // 6. Stalls validation
  const stallCheck = classifyStallAvailability(station.totalStalls, station.availableStalls);
  if (!stallCheck.isValid) {
    anomalies.push(stallCheck.displayLabel);
  }

  // 7. Tariff validation
  const tariffCheck = classifyTariff(station.pricePerKwh);
  if (tariffCheck.classification === 'invalid') {
    warnings.push(`Unrecognized tariff string format: "${station.pricePerKwh}"`);
  }

  return {
    stationId: station.id || 'unknown',
    isValid: anomalies.length === 0,
    hasReversedCoordinates,
    isWithinIndiaCoverage,
    anomalies,
    warnings
  };
}

// ============================================================================
// 6. FULL CATALOGUE AUDIT ENGINE
// ============================================================================

export interface CatalogueAuditReport {
  totalRecords: number;
  validRecordsCount: number;
  invalidRecordsCount: number;
  reversedCoordinateCount: number;
  outsideCoverageCount: number;
  duplicateIds: string[];
  duplicateCoordinates: { coords: [number, number]; stationIds: string[] }[];
  fieldInventory: Record<string, { present: number; missing: number; invalid: number; suspicious: number }>;
  networkDistribution: Record<string, number>;
  connectorDistribution: Record<string, number>;
  tariffDistribution: Record<TariffClassification, number>;
  provenanceSummary: {
    verifiedCount: number;
    estimatedCount: number;
    uncertainCount: number;
    inaccessibleCount: number;
  };
}

/**
 * Runs a full diagnostic audit over an array of station records (defaults to chargingStations).
 * Separated from normal route-planning runtime to avoid performance overhead.
 */
export function auditStationCatalogue(stations: ChargingStation[] = chargingStations): CatalogueAuditReport {
  const duplicateIds: string[] = [];
  const seenIds = new Set<string>();

  const coordMap = new Map<string, string[]>();
  let validCount = 0;
  let reversedCoordCount = 0;
  let outsideCoverageCount = 0;

  const networkDist: Record<string, number> = {};
  const connectorDist: Record<string, number> = {};
  const tariffDist: Record<TariffClassification, number> = {
    source_confirmed: 0,
    user_reported: 0,
    estimated_default: 0,
    session_fee: 0,
    free: 0,
    unknown: 0,
    invalid: 0
  };

  const provenanceSummary = {
    verifiedCount: 0,
    estimatedCount: 0,
    uncertainCount: 0,
    inaccessibleCount: 0
  };

  const inventory: Record<string, { present: number; missing: number; invalid: number; suspicious: number }> = {
    id: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    name: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    network: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    address: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    coordinates: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    connectors: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    ratedPowerKw: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    totalStalls: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    availableStalls: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    pricePerKwh: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    amenities: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    operationalStatus: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    accessMetadata: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    entranceCoordinates: { present: 0, missing: 0, invalid: 0, suspicious: 0 },
    backupStationId: { present: 0, missing: 0, invalid: 0, suspicious: 0 }
  };

  stations.forEach((st) => {
    // ID Check
    if (st.id) {
      inventory.id.present++;
      if (seenIds.has(st.id)) duplicateIds.push(st.id);
      seenIds.add(st.id);
    } else {
      inventory.id.missing++;
      inventory.id.invalid++;
    }

    // Name
    if (st.name) inventory.name.present++;
    else {
      inventory.name.missing++;
      inventory.name.invalid++;
    }

    // Network
    if (st.network) {
      inventory.network.present++;
      const normNet = normalizeNetworkName(st.network).canonicalNetwork;
      networkDist[normNet] = (networkDist[normNet] || 0) + 1;
    } else {
      inventory.network.missing++;
    }

    // Address
    if (st.address) inventory.address.present++;
    else inventory.address.missing++;

    // Coordinates
    if (st.coordinates && Array.isArray(st.coordinates) && st.coordinates.length === 2) {
      inventory.coordinates.present++;
      const [lat, lng] = st.coordinates;
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      const list = coordMap.get(key) || [];
      list.push(st.id);
      coordMap.set(key, list);

      if (lat >= 68.0 && lat <= 98.0 && lng >= 6.0 && lng <= 38.0) {
        reversedCoordCount++;
        inventory.coordinates.suspicious++;
      }
      if (lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0) {
        outsideCoverageCount++;
        inventory.coordinates.suspicious++;
      }
    } else {
      inventory.coordinates.missing++;
      inventory.coordinates.invalid++;
    }

    // Rated Power
    if (typeof st.ratedPowerKw === 'number' && st.ratedPowerKw > 0) {
      inventory.ratedPowerKw.present++;
      if (st.ratedPowerKw > 500) inventory.ratedPowerKw.suspicious++;
    } else {
      inventory.ratedPowerKw.missing++;
      inventory.ratedPowerKw.invalid++;
    }

    // Total Stalls
    if (typeof st.totalStalls === 'number' && st.totalStalls > 0) {
      inventory.totalStalls.present++;
    } else {
      inventory.totalStalls.missing++;
      inventory.totalStalls.invalid++;
    }

    // Available Stalls
    if (st.availableStalls !== undefined) {
      inventory.availableStalls.present++;
      if (st.availableStalls > st.totalStalls || st.availableStalls < 0) {
        inventory.availableStalls.invalid++;
      }
    } else {
      inventory.availableStalls.missing++;
    }

    // Connectors
    if (st.connectors && st.connectors.length > 0) {
      inventory.connectors.present++;
      st.connectors.forEach((c) => {
        const normConn = normalizeConnectorType(c.type).canonicalType;
        connectorDist[normConn] = (connectorDist[normConn] || 0) + 1;
      });
    } else {
      inventory.connectors.missing++;
      inventory.connectors.invalid++;
    }

    // Tariff
    if (st.pricePerKwh) {
      inventory.pricePerKwh.present++;
      const tClass = classifyTariff(st.pricePerKwh).classification;
      tariffDist[tClass] = (tariffDist[tClass] || 0) + 1;
    } else {
      inventory.pricePerKwh.missing++;
      tariffDist.estimated_default++;
    }

    // Amenities
    if (st.amenities && st.amenities.length > 0) inventory.amenities.present++;
    else inventory.amenities.missing++;

    // Operational Status
    if (st.operationalStatus) inventory.operationalStatus.present++;
    else inventory.operationalStatus.missing++;

    // Road Access & Provenance
    if (st.accessMetadata) {
      inventory.accessMetadata.present++;
      if (st.accessMetadata.entranceCoordinates) inventory.entranceCoordinates.present++;
      else inventory.entranceCoordinates.missing++;

      if (st.accessMetadata.backupStationId) inventory.backupStationId.present++;
      else inventory.backupStationId.missing++;

      if (st.accessMetadata.roadAccessStatus === 'verified') provenanceSummary.verifiedCount++;
      else if (st.accessMetadata.roadAccessStatus === 'estimated') provenanceSummary.estimatedCount++;
      else if (st.accessMetadata.roadAccessStatus === 'uncertain') provenanceSummary.uncertainCount++;
      else if (st.accessMetadata.roadAccessStatus === 'inaccessible') provenanceSummary.inaccessibleCount++;
    } else {
      inventory.accessMetadata.missing++;
      inventory.entranceCoordinates.missing++;
      inventory.backupStationId.missing++;
      provenanceSummary.estimatedCount++;
    }

    const val = validateStationRecord(st);
    if (val.isValid) validCount++;
  });

  const duplicateCoordinates: { coords: [number, number]; stationIds: string[] }[] = [];
  coordMap.forEach((ids, key) => {
    if (ids.length > 1) {
      const [latStr, lngStr] = key.split(',');
      duplicateCoordinates.push({
        coords: [parseFloat(latStr), parseFloat(lngStr)],
        stationIds: ids
      });
    }
  });

  return {
    totalRecords: stations.length,
    validRecordsCount: validCount,
    invalidRecordsCount: stations.length - validCount,
    reversedCoordinateCount: reversedCoordCount,
    outsideCoverageCount: outsideCoverageCount,
    duplicateIds,
    duplicateCoordinates,
    fieldInventory: inventory,
    networkDistribution: networkDist,
    connectorDistribution: connectorDist,
    tariffDistribution: tariffDist,
    provenanceSummary
  };
}

// ============================================================================
// 7. CURATED INDIA TEST DATASET
// ============================================================================

/**
 * Curated subsets of verifiable stations grouped by major national corridors.
 * Provides realistic, traceable test data for academic verification.
 */
export const curatedCorridorStations = {
  // Purvanchal Expressway Corridor (East UP)
  purvanchalExpressway: [
    'sta-azamgarh-adani',
    'sta-haidergarh-renovatio',
    'sta-purvanchal-eastbound-only'
  ],
  // Sitapur - Bareilly - Delhi Highway Link
  sitapurBareillyDelhi: [
    'sta-navabad-adani',
    'sta-gularia-adani',
    'sta-kalliya-adani',
    'sta-garhmukteshwar-chargein',
    'sta-delhi-aerocity-statiq'
  ],
  // Delhi - Jaipur Highway Corridor (NH-48)
  delhiJaipurHighway: [
    'sta-neemrana-statiq',
    'sta-behror-tata'
  ],
  // Mumbai - Pune Expressway Corridor
  mumbaiPuneExpressway: [
    'sta-khalapur-jiobp',
    'sta-lonavala-tata'
  ],
  // Bengaluru - Chennai Highway Corridor (NH-44/48)
  bengaluruChennaiHighway: [
    'sta-krishnagiri-zeon',
    'sta-vellore-tata'
  ],
  // Grand Trunk Road / NH-19 Corridor
  grandTrunkRoadNH19: [
    'sta-kanpur-jiobp',
    'sta-prayagraj-jiobp',
    'sta-varanasi-tata'
  ]
};

/**
 * Attaches field-level provenance to a station based on its catalogued metadata.
 */
export function buildStationProvenance(station: ChargingStation): StationProvenance {
  const isVerifiedAccess = station.accessMetadata?.roadAccessStatus === 'verified';
  const confidence = station.accessMetadata?.accessConfidence ?? 0.7;

  return {
    identity: {
      status: 'verified',
      verifiedAt: '2026-10-30',
      method: 'simulation',
      confidence: 1.0,
      notes: 'Station identity catalogued in project dataset'
    },
    coordinates: {
      status: isVerifiedAccess ? 'verified' : 'source_reported',
      verifiedAt: '2026-10-30',
      method: isVerifiedAccess ? 'osm_overpass' : 'simulation',
      confidence: isVerifiedAccess ? 0.95 : 0.8
    },
    network: {
      status: 'verified',
      verifiedAt: '2026-10-30',
      confidence: 0.95,
      notes: `Normalized to canonical operator: ${normalizeNetworkName(station.network).canonicalNetwork}`
    },
    connectors: {
      status: 'source_reported',
      verifiedAt: '2026-10-30',
      confidence: 0.85
    },
    power: {
      status: 'source_reported',
      confidence: 0.85
    },
    tariff: {
      status: classifyTariff(station.pricePerKwh).classification === 'source_confirmed'
        ? 'source_reported'
        : 'estimated',
      confidence: classifyTariff(station.pricePerKwh).classification === 'source_confirmed' ? 0.85 : 0.5
    },
    roadAccess: {
      status: station.accessMetadata?.roadAccessStatus === 'inaccessible'
        ? 'verified'
        : (station.accessMetadata?.roadAccessStatus || 'estimated'),
      confidence,
      notes: station.accessMetadata?.accessNotes || (station.accessMetadata?.roadAccessStatus === 'inaccessible' ? 'Physically inaccessible' : undefined)
    },
    operationalStatus: {
      status: 'source_reported',
      confidence: 0.6,
      notes: 'Static catalogue status; live telemetry requires OCPI 2.2+ CPO integration'
    }
  };
}
