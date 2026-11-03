/**
 * Phase 6J: Automated Simulated Queue Service
 * Generates deterministic, realistic queue counts and turnover predictions
 * for unmonitored corridor stations displaying 'Queue unknown'.
 *
 * Requirements:
 * 1. Realistic configurable distribution:
 *    0 waiting (15%), 1 (20%), 2 (25%), 3 (20%), 4 (12%), 5 (5%), 6-8 (3%).
 * 2. Separate queues for compatible connector groups (e.g. CCS2 vs Type 2).
 *    Never invent unsupported connectors.
 * 3. Never invent fake operator sessions, fake active charging sessions, or fake occupied hardware stalls.
 * 4. Precedence: Real Operator > Community > Simulated fallback > Unknown.
 * 5. Deterministic and stable during zoom/pan/hover/re-render; regenerates on new route calculation or explicit refresh.
 */

import {
  StationQueueData,
  ConnectorQueueStatus
} from '../../types/queue';
import { ChargingStation } from '../../types/station';
import { normalizeConnectorType } from '../../utils/connectorUtils';
import { chargingStations as catalogueStations } from '../../data/stationCatalogue';

/**
 * 32-bit FNV-1a hash algorithm to produce a deterministic unit float [0, 1)
 */
export function hashKeyToUnitFloat(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Maps a uniform random float [0, 1) to the required realistic EV queue distribution:
 * - 0 waiting: 15% [0.00, 0.15)
 * - 1 waiting: 20% [0.15, 0.35)
 * - 2 waiting: 25% [0.35, 0.60)
 * - 3 waiting: 20% [0.60, 0.80)
 * - 4 waiting: 12% [0.80, 0.92)
 * - 5 waiting:  5% [0.92, 0.97)
 * - 6 waiting:  1% [0.97, 0.98)
 * - 7 waiting:  1% [0.98, 0.99)
 * - 8 waiting:  1% [0.99, 1.00)
 */
export function sampleSimulatedQueueCount(rand: number): number {
  const clamped = Math.max(0, Math.min(0.999999, rand));
  if (clamped < 0.15) return 0;
  if (clamped < 0.35) return 1;
  if (clamped < 0.60) return 2;
  if (clamped < 0.80) return 3;
  if (clamped < 0.92) return 4;
  if (clamped < 0.97) return 5;
  if (clamped < 0.98) return 6;
  if (clamped < 0.99) return 7;
  return 8;
}

/**
 * Internal state for the simulation service
 */
class SimulatedQueueServiceImpl {
  private enabled: boolean = true;
  private currentSessionKey: string = 'default_patna_delhi';
  private currentSeed: number = 1;
  private sessionCreatedAt: number = Date.now();
  private stationRegistry: Map<string, ChargingStation> = new Map();
  private sessionCache: Map<string, StationQueueData> = new Map();

  constructor() {
    // Pre-populate catalogue stations
    for (const st of catalogueStations) {
      this.stationRegistry.set(st.id, st);
    }
  }

  public isSimulationEnabled(): boolean {
    return this.enabled;
  }

  public setSimulationEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getSessionKey(): string {
    return this.currentSessionKey;
  }

  public getSeed(): number {
    return this.currentSeed;
  }

  /**
   * Sets the active route session key and seed.
   * Clears cached simulated data so stations along the new route evaluate freshly.
   */
  public setRouteSession(sessionKey: string, seed: number = 1): void {
    if (this.currentSessionKey !== sessionKey || this.currentSeed !== seed) {
      this.currentSessionKey = sessionKey;
      this.currentSeed = seed;
      this.sessionCreatedAt = Date.now();
      this.sessionCache.clear();
    }
  }

  /**
   * Refreshes simulated queues by incrementing the seed and invalidating the cache.
   */
  public refreshSimulatedQueues(): number {
    this.currentSeed += 1;
    this.sessionCreatedAt = Date.now();
    this.sessionCache.clear();
    return this.currentSeed;
  }

  /**
   * Registers a station with known connector configuration and rated power
   */
  public registerStation(station: ChargingStation): void {
    if (!station || !station.id) return;
    this.stationRegistry.set(station.id, station);
  }

  /**
   * Batch registers multiple stations
   */
  public registerStations(stations: ChargingStation[]): void {
    for (const st of stations) {
      this.registerStation(st);
    }
  }

  /**
   * Generates or retrieves simulated queue data for a given station.
   * Returns null if simulation is disabled.
   */
  public getOrGenerateSimulatedQueue(
    stationId: string,
    stationFallback?: ChargingStation
  ): StationQueueData | null {
    if (!this.enabled) return null;

    if (stationFallback) {
      this.registerStation(stationFallback);
    }

    if (this.sessionCache.has(stationId)) {
      return this.sessionCache.get(stationId)!;
    }

    const station = this.stationRegistry.get(stationId) || stationFallback;
    const generated = this.generateQueueData(stationId, station);
    this.sessionCache.set(stationId, generated);
    return generated;
  }

  /**
   * Synthesizes deterministic queue records for a station
   */
  private generateQueueData(
    stationId: string,
    station?: ChargingStation
  ): StationQueueData {
    const stationName = station?.name || `Charging Hub ${stationId}`;
    const stationPower = station?.ratedPowerKw || 60;
    const connectors = station?.connectors || [];

    // Identify unique canonical connector groups present at this station
    const connectorGroups: Map<string, { count: number; maxPowerKw: number }> = new Map();

    if (connectors.length > 0) {
      for (const conn of connectors) {
        const canonical = normalizeConnectorType(conn.canonicalType || conn.type || 'CCS2');
        const existing = connectorGroups.get(canonical);
        const count = conn.count || 1;
        const power = conn.maxPowerKw || stationPower;
        if (existing) {
          existing.count += count;
          existing.maxPowerKw = Math.max(existing.maxPowerKw, power);
        } else {
          connectorGroups.set(canonical, { count, maxPowerKw: power });
        }
      }
    } else {
      // Default to CCS2 if no explicit connector details available
      connectorGroups.set('CCS2', { count: station?.totalStalls || 2, maxPowerKw: stationPower });
    }

    const connectorQueues: Record<string, ConnectorQueueStatus> = {};
    let totalWaiting = 0;
    let totalPointsAll = 0;

    for (const [canonicalType, info] of connectorGroups.entries()) {
      const stalls = Math.max(1, info.count);
      totalPointsAll += stalls;

      // Deterministic PRNG key for this station + connector + session + seed
      const prngKey = `${this.currentSessionKey}:${this.currentSeed}:${stationId}:${canonicalType}`;
      const rand = hashKeyToUnitFloat(prngKey);
      const waitingCount = sampleSimulatedQueueCount(rand);
      totalWaiting += waitingCount;

      // Calibrate turnaround wait time per vehicle ahead
      const isAc = canonicalType.toLowerCase().includes('type 2') || info.maxPowerKw <= 22;
      const avgTurnoverMinutes = isAc
        ? 75
        : info.maxPowerKw >= 100
        ? 20
        : info.maxPowerKw >= 50
        ? 35
        : 45;

      const estWaitMinutes = waitingCount === 0
        ? 0
        : Math.round((waitingCount * avgTurnoverMinutes) / stalls);

      const waitRange: [number, number] = waitingCount === 0
        ? [0, 0]
        : [Math.max(1, Math.round(estWaitMinutes * 0.75)), Math.round(estWaitMinutes * 1.25 + 3)];

      // Construct connector queue status according to strict rules:
      // - Never fake occupied hardware stalls (availablePoints: stalls, occupiedPoints: 0)
      // - Never fake active charging sessions
      // - Explicitly tagged as simulated_queue with low confidence
      const connStatus: ConnectorQueueStatus = {
        connectorType: canonicalType,
        totalPoints: stalls,
        availablePoints: stalls,
        occupiedPoints: 0,
        outOfOrderPoints: 0,
        vehiclesWaiting: waitingCount,
        peopleWaiting: 0,
        estimatedWaitMinutes: estWaitMinutes,
        estimatedWaitRange: waitRange,
        confidence: 'low',
        dataSource: 'simulated_queue',
        updatedAt: this.sessionCreatedAt,
        activeSessionCount: 0,
        queueEntries: [],
        operatorAggregateCount: null,
        isAuthoritativeOperator: false
      };

      connectorQueues[canonicalType] = connStatus;
    }

    return {
      stationId,
      stationName,
      connectorQueues,
      overallVehiclesWaiting: totalWaiting,
      primaryDataSource: 'simulated_queue',
      confidence: 'low',
      lastReportedTimestamp: this.sessionCreatedAt,
      reportCountRecent: 0,
      isStale: false,
      connectorsTotal: totalPointsAll,
      connectorsAvailable: totalPointsAll,
      connectorsOccupied: 0,
      connectorsFaulted: 0,
      operatorManaged: false
    };
  }
}

export const simulatedQueueService = new SimulatedQueueServiceImpl();

