// OCPI Normalization Layer
// Translates OCPI Locations, EVSEs, and Connectors into internal LiveStationTelemetry.
// Conforms to OCPI 2.2.1 and 2.3.0 standard specifications.

import {
  OcpiLocation,
  OcpiEvse,
  OcpiConnector,
  OcpiEvseStatus
} from './ocpiTypes';
import {
  LiveAvailabilityStatus,
  LiveStationTelemetry,
  LiveEvseState,
  LiveConnectorState,
  DataSourceType,
  calculateFreshnessCategory
} from '../providerTypes';
import { normalizeConnectorType } from '../../catalogueService';

/**
 * Maps standard OCPI EVSE status strings to internal LiveAvailabilityStatus enums.
 */
export function mapOcpiEvseStatus(status?: OcpiEvseStatus | string): LiveAvailabilityStatus {
  if (!status) return 'unknown';

  switch (status.toUpperCase()) {
    case 'AVAILABLE':
      return 'available';
    case 'CHARGING':
      return 'charging';
    case 'RESERVED':
      return 'reserved';
    case 'BLOCKED':
      return 'blocked';
    case 'INOPERATIVE':
      return 'inoperative';
    case 'OUTOFORDER':
      return 'out_of_order';
    case 'PLANNED':
      return 'planned';
    case 'REMOVED':
      return 'removed';
    case 'UNKNOWN':
    default:
      return 'unknown';
  }
}

/**
 * Normalizes OCPI connector standard to internal canonical connector type.
 */
export function mapOcpiConnectorStandard(ocpiStandard: string): string {
  if (!ocpiStandard) return 'Unknown';

  const lower = ocpiStandard.toLowerCase();
  if (lower.includes('combo') || lower.includes('t2_combo') || lower.includes('ccs')) {
    return 'CCS2';
  }
  if (lower.includes('iec_62196_t2') || lower.includes('type2') || lower.includes('type 2')) {
    return 'Type 2';
  }
  if (lower.includes('chademo')) {
    return 'CHAdeMO';
  }
  if (lower.includes('tesla') || lower.includes('nacs')) {
    return 'NACS';
  }
  if (lower.includes('gbt') || lower.includes('gb/t')) {
    return 'GB/T';
  }

  return normalizeConnectorType(ocpiStandard).canonicalType;
}

/**
 * Normalizes an OCPI Connector record.
 * In OCPI specs, max_electric_power is expressed in Watts (e.g. 150000 = 150 kW).
 */
export function normalizeOcpiConnector(conn: OcpiConnector): LiveConnectorState {
  let powerKw = 0;
  if (typeof conn.max_electric_power === 'number') {
    // If > 1000, value is in Watts; convert to kW
    powerKw = conn.max_electric_power > 1000
      ? Math.round(conn.max_electric_power / 1000)
      : conn.max_electric_power;
  } else if (conn.max_voltage && conn.max_amperage) {
    powerKw = Math.round((conn.max_voltage * conn.max_amperage) / 1000);
  }

  const canonicalStandard = mapOcpiConnectorStandard(conn.standard);

  return {
    connectorId: conn.id,
    standard: conn.standard,
    canonicalStandard,
    powerKw,
    status: 'unknown', // Set at EVSE level or overridden
    lastUpdated: conn.last_updated
  };
}

/**
 * Normalizes an OCPI EVSE record and its associated connectors, preserving hierarchy.
 */
export function normalizeOcpiEvse(evse: OcpiEvse): LiveEvseState {
  const evseStatus = mapOcpiEvseStatus(evse.status);

  const connectors: LiveConnectorState[] = (evse.connectors || []).map((c) => {
    const norm = normalizeOcpiConnector(c);
    // Inherit EVSE status if connector does not possess independent state
    norm.status = evseStatus;
    return norm;
  });

  return {
    evseId: evse.uid || evse.evse_id || 'unknown-evse',
    uid: evse.uid,
    status: evseStatus,
    connectors,
    lastUpdated: evse.last_updated
  };
}

/**
 * Normalizes an entire OCPI Location into internal LiveStationTelemetry.
 * Preserves stable identifiers, counts available stalls, and computes data freshness.
 */
export function normalizeOcpiLocation(
  loc: OcpiLocation,
  options: {
    providerId: string;
    providerName: string;
    sourceType?: DataSourceType;
    receivedAtIso?: string;
  }
): LiveStationTelemetry {
  const evses: LiveEvseState[] = (loc.evses || []).map(normalizeOcpiEvse);

  const totalStalls = evses.length > 0 ? evses.length : 1;
  const availableStalls = evses.filter((e) => e.status === 'available').length;

  let overallOccupancy: LiveAvailabilityStatus = 'unknown';
  if (evses.length > 0) {
    if (availableStalls > 0) {
      overallOccupancy = 'available';
    } else if (evses.every((e) => e.status === 'charging' || e.status === 'reserved')) {
      overallOccupancy = 'charging';
    } else if (evses.every((e) => e.status === 'inoperative' || e.status === 'out_of_order')) {
      overallOccupancy = 'inoperative';
    } else if (evses.every((e) => e.status === 'blocked')) {
      overallOccupancy = 'blocked';
    } else {
      overallOccupancy = evses[0].status;
    }
  }

  const observedAt = loc.last_updated || new Date().toISOString();
  const receivedAt = options.receivedAtIso || new Date().toISOString();
  const freshness = calculateFreshnessCategory(observedAt);

  const sourceType = options.sourceType ?? 'live_provider';
  const isSimulated = sourceType === 'simulated_mock';

  return {
    stationId: `ocpi-${loc.country_code}-${loc.party_id}-${loc.id}`.toLowerCase(),
    providerId: options.providerId,
    providerName: options.providerName,
    sourceType,
    isSimulated,
    observedAt,
    receivedAt,
    freshness,
    totalStalls,
    availableStalls,
    occupancyStatus: overallOccupancy,
    evses,
    dataNotes: loc.name ? `${loc.name} (${loc.operator?.name || options.providerName})` : undefined
  };
}

