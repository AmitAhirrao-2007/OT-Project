// Mock OCPI Provider Implementation
// Clearly labeled as SIMULATED PROVIDER DATA for deterministic local testing.
// Never passes simulated data off as live operator telemetry.

import {
  IChargingNetworkProvider,
  LiveStationTelemetry,
  NormalizedTariff,
  ProviderSyncDiagnostics,
  DataSourceType
} from '../providerTypes';
import { mockOcpiLocations, mockOcpiTariffs } from './mockData';
import { normalizeOcpiLocation } from '../ocpi/ocpiNormalizer';
import { normalizeOcpiTariff } from '../ocpi/ocpiTariffAdapter';

export interface MockProviderOptions {
  simulateNetworkLatencyMs?: number;
  simulateFailure?: boolean;
  failureMessage?: string;
  customLocations?: typeof mockOcpiLocations;
}

export class MockOcpiProvider implements IChargingNetworkProvider {
  readonly providerId = 'mock-ocpi-india';
  readonly providerName = 'Simulated Indian OCPI Sandbox';
  readonly protocol = 'OCPI_2_2_1';
  readonly sourceType: DataSourceType = 'simulated_mock';

  private options: MockProviderOptions;
  private diagnostics: ProviderSyncDiagnostics = {
    providerId: 'mock-ocpi-india',
    protocol: 'OCPI_2_2_1',
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastFailedSyncAt: null,
    recordsReceived: 0,
    recordsAccepted: 0,
    recordsRejected: 0,
    staleRecordCount: 0,
    averageResponseTimeMs: 0
  };

  constructor(options: MockProviderOptions = {}) {
    this.options = options;
  }

  setOptions(options: Partial<MockProviderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  async initialize(): Promise<{ success: boolean; error?: string }> {
    if (this.options.simulateFailure) {
      return { success: false, error: this.options.failureMessage || 'Mock provider initialization failed' };
    }
    return { success: true };
  }

  async fetchLocations(): Promise<LiveStationTelemetry[]> {
    const t0 = performance.now();

    if (this.options.simulateNetworkLatencyMs) {
      await new Promise((res) => setTimeout(res, this.options.simulateNetworkLatencyMs));
    }

    if (this.options.simulateFailure) {
      this.diagnostics.lastSyncAt = new Date().toISOString();
      this.diagnostics.lastFailedSyncAt = new Date().toISOString();
      this.diagnostics.failureReason = this.options.failureMessage || 'Simulated network disconnect';
      throw new Error(this.diagnostics.failureReason);
    }

    const locations = this.options.customLocations || mockOcpiLocations;
    const telemetry: LiveStationTelemetry[] = [];
    let staleCount = 0;

    for (const loc of locations) {
      const item = normalizeOcpiLocation(loc, {
        providerId: this.providerId,
        providerName: this.providerName,
        sourceType: 'simulated_mock'
      });

      if (item.freshness === 'stale') staleCount++;
      telemetry.push(item);
    }

    const duration = performance.now() - t0;
    this.diagnostics.lastSyncAt = new Date().toISOString();
    this.diagnostics.lastSuccessfulSyncAt = new Date().toISOString();
    this.diagnostics.recordsReceived = locations.length;
    this.diagnostics.recordsAccepted = telemetry.length;
    this.diagnostics.staleRecordCount = staleCount;
    this.diagnostics.averageResponseTimeMs = Math.round(duration);

    return telemetry;
  }

  async fetchLocationById(locationId: string): Promise<LiveStationTelemetry | null> {
    const list = await this.fetchLocations();
    return list.find((s) => s.stationId === locationId || s.stationId.endsWith(locationId)) || null;
  }

  async fetchTariffs(): Promise<NormalizedTariff[]> {
    return mockOcpiTariffs.map(normalizeOcpiTariff);
  }

  getDiagnostics(): ProviderSyncDiagnostics {
    return { ...this.diagnostics };
  }
}

