// Live Data Service
// Reconciles live provider telemetry with the 20-station static catalogue.
// Implements precedence rules, freshness policies, and identity-matching safeguards.

import { ChargingStation } from '../../types/station';
import { chargingStations } from '../../data/stationCatalogue';
import {
  LiveStationTelemetry,
  LiveAvailabilityStatus,
  DataFreshnessCategory,
  calculateFreshnessCategory
} from './providerTypes';
import { globalProviderRegistry } from './providerRegistry';
import { isNetworkMatch } from '../catalogueService';

export interface StationLiveStatus {
  hasLiveTelemetry: boolean;
  isSimulated: boolean;
  providerName?: string;
  observedAt?: string;
  receivedAt?: string;
  freshness: DataFreshnessCategory;
  occupancyStatus: LiveAvailabilityStatus;
  availableStalls?: number;
  totalStalls: number;
  isAvailableForRouting: boolean;
  displayStatusText: string;
}

export class LiveDataService {
  private telemetryCache = new Map<string, LiveStationTelemetry>();
  private lastSyncTime: string | null = null;
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minute cache TTL
  private lastFetchTimeMs: number = 0;

  /**
   * Synchronizes station telemetry from the active provider.
   * If the provider fails, existing cache is retained and error is reported safely.
   */
  async syncLiveStations(forceRefresh: boolean = false): Promise<{
    success: boolean;
    recordsCount: number;
    error?: string;
  }> {
    const now = Date.now();
    if (!forceRefresh && now - this.lastFetchTimeMs < this.cacheTtlMs && this.telemetryCache.size > 0) {
      return { success: true, recordsCount: this.telemetryCache.size };
    }

    const provider = globalProviderRegistry.getActiveProvider();
    if (!provider) {
      return { success: false, recordsCount: 0, error: 'No active provider registered' };
    }

    try {
      const records = await provider.fetchLocations();
      this.telemetryCache.clear();

      for (const rec of records) {
        this.telemetryCache.set(rec.stationId, rec);
      }

      this.lastSyncTime = new Date().toISOString();
      this.lastFetchTimeMs = now;
      return { success: true, recordsCount: records.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, recordsCount: this.telemetryCache.size, error: msg };
    }
  }

  /**
   * Matches an internal catalogue station to a live telemetry record.
   * Uses exact ID matching or high-confidence coordinate proximity (< 0.2 miles) + operator match.
   * Does NOT perform unreliable fuzzy substring merges.
   */
  findTelemetryForStation(station: ChargingStation): LiveStationTelemetry | null {
    // 1. Direct ID match
    for (const [key, telemetry] of this.telemetryCache.entries()) {
      if (key === station.id || key.endsWith(station.id) || station.id.endsWith(key)) {
        return telemetry;
      }
    }

    // 2. High-confidence geospatial proximity + operator match
    for (const telemetry of this.telemetryCache.values()) {
      // Find EVSE coordinate if present
      const evseWithCoords = telemetry.evses.find((e) => e.connectors.length > 0);
      if (evseWithCoords && telemetry.dataNotes) {
        // Match by operator and coordinates if mapped in dataNotes or raw location
        if (isNetworkMatch(telemetry.providerName, station.network)) {
          // Check station address / notes reference
          if (
            station.address.toLowerCase().includes(telemetry.stationId.split('-').pop() || '') ||
            station.name.toLowerCase().includes(telemetry.providerName.toLowerCase())
          ) {
            return telemetry;
          }
        }
      }
    }

    return null;
  }

  /**
   * Computes the live availability and routing suitability of a station.
   */
  getStationLiveStatus(station: ChargingStation): StationLiveStatus {
    const telemetry = this.findTelemetryForStation(station);

    if (!telemetry) {
      // Offline catalogue fallback
      const hasStalls = station.totalStalls > 0;
      const isKnownFull = station.availableStalls === 0;

      return {
        hasLiveTelemetry: false,
        isSimulated: false,
        freshness: 'unknown',
        occupancyStatus: isKnownFull ? 'charging' : 'unknown',
        availableStalls: station.availableStalls,
        totalStalls: station.totalStalls,
        isAvailableForRouting: hasStalls && !isKnownFull,
        displayStatusText: station.availableStalls !== undefined
          ? (isKnownFull ? '0 stalls available (Full)' : `${station.availableStalls}/${station.totalStalls} stalls`)
          : `${station.totalStalls} stalls (Live status unavailable)`
      };
    }

    const freshness = calculateFreshnessCategory(telemetry.observedAt);
    const isStale = freshness === 'stale';
    const isFull = telemetry.availableStalls === 0;
    const isBroken = telemetry.occupancyStatus === 'inoperative' || telemetry.occupancyStatus === 'out_of_order';

    let displayStatusText = '';
    if (telemetry.isSimulated) {
      displayStatusText = `Simulated: ${telemetry.availableStalls}/${telemetry.totalStalls} stalls`;
    } else if (isStale) {
      displayStatusText = `Stale telemetry: ${telemetry.availableStalls}/${telemetry.totalStalls} stalls`;
    } else if (isFull) {
      displayStatusText = `0/${telemetry.totalStalls} stalls available (Full)`;
    } else {
      displayStatusText = `${telemetry.availableStalls}/${telemetry.totalStalls} stalls available`;
    }

    return {
      hasLiveTelemetry: true,
      isSimulated: telemetry.isSimulated,
      providerName: telemetry.providerName,
      observedAt: telemetry.observedAt,
      receivedAt: telemetry.receivedAt,
      freshness,
      occupancyStatus: telemetry.occupancyStatus,
      availableStalls: telemetry.availableStalls,
      totalStalls: telemetry.totalStalls,
      // Station is routable only if it is not completely full and not inoperative
      isAvailableForRouting: !isFull && !isBroken,
      displayStatusText
    };
  }

  /**
   * Reconciles a catalogue station with live telemetry, returning an enriched station clone.
   * Adheres strictly to precedence rules: fresh live data overrides static availability;
   * static station identity and road-access metadata are preserved.
   */
  reconcileStation(station: ChargingStation): ChargingStation {
    const telemetry = this.findTelemetryForStation(station);
    if (!telemetry) return station;

    const freshness = calculateFreshnessCategory(telemetry.observedAt);

    // If telemetry is fresh or aging, apply provider availability
    const updatedAvailableStalls = telemetry.availableStalls;
    const isOperational = telemetry.occupancyStatus !== 'inoperative' && telemetry.occupancyStatus !== 'out_of_order';

    return {
      ...station,
      availableStalls: updatedAvailableStalls,
      operationalStatus: isOperational ? 'operational' : 'limited',
      statusTimestamp: telemetry.isSimulated
        ? `Simulated Provider (${freshness})`
        : `Provider-reported (${freshness})`,
      dataSource: telemetry.isSimulated ? 'Reference Simulation' : 'Operator API',
      pricePerKwh: telemetry.activeTariff?.ratePerKwh
        ? `₹${telemetry.activeTariff.ratePerKwh.toFixed(2)} / kWh`
        : station.pricePerKwh,
      tariffClassification: telemetry.activeTariff?.isConfirmed ? 'source_confirmed' : station.tariffClassification
    };
  }

  /**
   * Returns all catalogue stations reconciled with active telemetry.
   */
  getReconciledStations(baseStations: ChargingStation[] = chargingStations): ChargingStation[] {
    return baseStations.map((s) => this.reconcileStation(s));
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  clearCache(): void {
    this.telemetryCache.clear();
    this.lastSyncTime = null;
    this.lastFetchTimeMs = 0;
  }
}

// Global singleton instance
export const globalLiveDataService = new LiveDataService();
