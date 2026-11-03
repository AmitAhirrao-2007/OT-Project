// Provider Interfaces and Live Telemetry Data Types
// Decouples route planning from specific external CPO protocols (e.g. OCPI 2.2.1, OCPI 2.3.0).

export type LiveAvailabilityStatus =
  | 'available'
  | 'charging'
  | 'reserved'
  | 'blocked'
  | 'inoperative'
  | 'out_of_order'
  | 'planned'
  | 'removed'
  | 'unknown'
  | 'stale';

export type DataFreshnessCategory =
  | 'fresh'     // < 15 minutes old
  | 'aging'     // 15 - 60 minutes old
  | 'stale'     // > 60 minutes old
  | 'unknown';   // Missing timestamp or unverified

export type DataSourceType =
  | 'live_provider'          // Genuine authorized live CPO connection
  | 'authorized_sandbox'     // Official operator test sandbox
  | 'simulated_mock'         // Deterministic local simulation fixture
  | 'static_catalogue';      // Offline baseline catalogue

export interface LiveConnectorState {
  connectorId: string;
  standard: string;
  canonicalStandard: string;
  powerKw: number;
  status: LiveAvailabilityStatus;
  lastUpdated?: string;
}

export interface LiveEvseState {
  evseId: string;
  uid?: string;
  status: LiveAvailabilityStatus;
  connectors: LiveConnectorState[];
  lastUpdated?: string;
}

export interface NormalizedTariffElement {
  componentType: 'ENERGY' | 'FLAT' | 'TIME' | 'PARKING_TIME';
  price: number;
  stepSize?: number;
}

export interface NormalizedTariff {
  tariffId: string;
  currency: string;
  ratePerKwh: number;
  sessionFee?: number;
  ratePerMinute?: number;
  isConfirmed: boolean;
  tariffElements: NormalizedTariffElement[];
}

export interface LiveStationTelemetry {
  stationId: string;
  providerId: string;
  providerName: string;
  sourceType: DataSourceType;
  isSimulated: boolean;
  observedAt: string;   // ISO timestamp reported by provider
  receivedAt: string;   // ISO timestamp recorded upon receipt
  freshness: DataFreshnessCategory;
  totalStalls: number;
  availableStalls: number;
  occupancyStatus: LiveAvailabilityStatus;
  evses: LiveEvseState[];
  activeTariff?: NormalizedTariff;
  dataNotes?: string;
}

export interface ProviderSyncDiagnostics {
  providerId: string;
  protocol: string;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  failureReason?: string;
  recordsReceived: number;
  recordsAccepted: number;
  recordsRejected: number;
  staleRecordCount: number;
  averageResponseTimeMs: number;
}

export interface IChargingNetworkProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly protocol: 'OCPI_2_2_1' | 'OCPI_2_3_0' | 'MOCK';
  readonly sourceType: DataSourceType;

  initialize(): Promise<{ success: boolean; error?: string }>;
  fetchLocations(): Promise<LiveStationTelemetry[]>;
  fetchLocationById(locationId: string): Promise<LiveStationTelemetry | null>;
  fetchTariffs?(): Promise<NormalizedTariff[]>;
  getDiagnostics(): ProviderSyncDiagnostics;
}

/**
 * Calculates data freshness category from observation timestamp.
 * Configurable thresholds: fresh < 15 min, aging 15-60 min, stale > 60 min.
 */
export function calculateFreshnessCategory(
  observedAtIso?: string,
  nowMs: number = Date.now()
): DataFreshnessCategory {
  if (!observedAtIso) return 'unknown';

  const observedMs = Date.parse(observedAtIso);
  if (isNaN(observedMs)) return 'unknown';

  const ageMs = nowMs - observedMs;
  if (ageMs < 0) {
    // Clock skew: observation claims to be in future, treat as aging/suspicious
    return 'aging';
  }

  const ageMinutes = ageMs / (1000 * 60);

  if (ageMinutes < 15) return 'fresh';
  if (ageMinutes < 60) return 'aging';
  return 'stale';
}

