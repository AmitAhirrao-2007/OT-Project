/**
 * Canonical Connector Type Normalization & Compatibility Matching
 * Phase 6G.2: Ensures seamless matching across national PCS records,
 * curated station catalogues, vehicle profiles, and crowd queue reports.
 */

export function normalizeConnectorType(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return 'CCS2';

  const clean = raw.trim();
  const lower = clean.toLowerCase();

  // 1. CCS / CCS2 / Combined Charging System
  if (
    lower.includes('ccs') ||
    lower.includes('combo') ||
    lower.includes('iec 62196-3') ||
    lower === 'ccs-2' ||
    lower === 'ccs 2'
  ) {
    return 'CCS2';
  }

  // 2. Type 2 / Mennekes / AC Type 2
  if (
    lower.includes('type 2') ||
    lower.includes('type2') ||
    lower.includes('mennekes') ||
    lower.includes('iec 62196-2')
  ) {
    return 'Type 2';
  }

  // 3. CHAdeMO
  if (lower.includes('chademo')) {
    return 'CHAdeMO';
  }

  // 4. GB/T
  if (lower.includes('gb/t') || lower.includes('gbt')) {
    return 'GB/T';
  }

  // 5. Bharat Standards
  if (lower.includes('bharat dc') || lower.includes('dc-001') || lower.includes('dc001')) {
    return 'Bharat DC-001';
  }
  if (lower.includes('bharat ac') || lower.includes('ac-001') || lower.includes('ac001')) {
    return 'Bharat AC-001';
  }

  // 6. Type 1 / J1772
  if (lower.includes('type 1') || lower.includes('type1') || lower.includes('j1772')) {
    return 'Type 1';
  }

  // 7. NACS / Tesla
  if (lower.includes('nacs') || lower.includes('tesla')) {
    return 'NACS';
  }

  return clean;
}

/**
 * Checks whether a station connector satisfies a driver's vehicle plug type
 */
export function areConnectorsCompatible(vehiclePlug: string, stationConnector: string): boolean {
  const normV = normalizeConnectorType(vehiclePlug);
  const normS = normalizeConnectorType(stationConnector);
  return normV === normS;
}

