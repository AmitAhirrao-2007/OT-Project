/**
 * File-backed Durable Storage & Aggregation for Community Queue Reports
 * Phase 6G: Rate-limiting, deduplication, geofencing, HMAC pseudonymity, and connector-group synthesis.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CommunityQueueReport,
  QueueReportSubmission,
  StationQueueData,
  ConnectorQueueStatus,
  QueueReportAction
} from '../src/types/queue';
import { getStationById } from './stationDataService';
import { chargingStations } from '../src/data/stationCatalogue';
import { normalizeConnectorType } from '../src/utils/connectorUtils';
import { getAuthoritativeStationQueue } from './operatorQueueStorage';

const STATION_ID_ALIASES: Record<string, string[]> = {
  'tata-kisan-path': ['sta-lucknow-tata'],
  'sta-lucknow-tata': ['tata-kisan-path']
};

const DATA_DIR = path.resolve(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'communityQueueReports.json');
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REPORTS_PER_WINDOW = 4;
const DEDUPLICATION_WINDOW_MS = 3 * 60 * 1000; // 3 minutes for identical station
const EXPIRY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours (120 minutes)
const CONTRIBUTOR_HMAC_SALT = process.env.CONTRIBUTOR_HMAC_SALT || 'ev-route-planner-queue-salt-2026';

let queueReportsCache: CommunityQueueReport[] = [];
const rateLimitMap = new Map<string, number[]>();

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export function getInitialSeedReports(): CommunityQueueReport[] {
  const now = Date.now();
  return [
    {
      id: 'seed-queue-azamgarh',
      stationId: 'sta-azamgarh-adani',
      stationName: 'Adani TotalEnergies - Purvanchal Expressway',
      connectorType: 'CCS2',
      action: '4_plus_waiting',
      vehiclesWaiting: 4,
      reporterPseudonym: 'driver-7a49f120c1',
      timestamp: now - 8 * 60 * 1000,
      isGeofenceVerified: true
    },
    {
      id: 'seed-queue-haidergarh',
      stationId: 'sta-haidergarh-renovatio',
      stationName: 'Renovatio e-charge - Haidergarh',
      connectorType: 'CCS2',
      action: '1_waiting',
      vehiclesWaiting: 1,
      reporterPseudonym: 'driver-9b12e34a78',
      timestamp: now - 12 * 60 * 1000,
      isGeofenceVerified: true
    },
    {
      id: 'seed-queue-sitapur',
      stationId: 'sta-sitapur-adani',
      stationName: 'Adani TGas - Navabad Grant (Sitapur)',
      connectorType: 'CCS2',
      action: 'no_waiting',
      vehiclesWaiting: 0,
      reporterPseudonym: 'driver-33fc82110a',
      timestamp: now - 5 * 60 * 1000,
      isGeofenceVerified: true
    },
    {
      id: 'seed-queue-kisan-path',
      stationId: 'tata-kisan-path',
      stationName: 'Tata Power EZ Charge - Kisan Path Bypass',
      connectorType: 'CCS2',
      action: '2_waiting',
      vehiclesWaiting: 2,
      reporterPseudonym: 'driver-21de894451',
      timestamp: now - 15 * 60 * 1000,
      isGeofenceVerified: false
    }
  ];
}

export function loadQueueReports(): CommunityQueueReport[] {
  ensureStorage();
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const now = Date.now();
    if (Array.isArray(parsed) && parsed.length > 0) {
      queueReportsCache = parsed;
      // If seed reports are older than 90 minutes, refresh their timestamps so development and testing stays fresh
      let updated = false;
      for (const r of queueReportsCache) {
        if (r.id.startsWith('seed-queue-') && now - r.timestamp > 90 * 60 * 1000) {
          r.timestamp = now - 6 * 60 * 1000;
          updated = true;
        }
      }
      if (updated) {
        saveQueueReports();
      }
    } else {
      queueReportsCache = getInitialSeedReports();
      saveQueueReports();
    }
    return queueReportsCache;
  } catch {
    queueReportsCache = getInitialSeedReports();
    return queueReportsCache;
  }
}

export function saveQueueReports(): void {
  ensureStorage();
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(queueReportsCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('[QueueStorage] Failed to save queue reports:', err);
  }
}

export function generatePseudonym(ipOrClient: string): string {
  const hmac = crypto.createHmac('sha256', CONTRIBUTOR_HMAC_SALT);
  hmac.update(ipOrClient);
  return 'driver-' + hmac.digest('hex').slice(0, 10);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Maps queue action to numeric vehicle count
 */
export function actionToWaitingCount(action: QueueReportAction, customCount?: number): number {
  switch (action) {
    case 'no_waiting':
    case 'charger_available':
    case 'queue_cleared':
      return 0;
    case '1_waiting':
      return 1;
    case '2_waiting':
      return 2;
    case '3_waiting':
      return 3;
    case '4_plus_waiting':
      return 4;
    case 'all_occupied':
      return 1;
    case 'custom_count':
      return typeof customCount === 'number' && customCount >= 0 ? customCount : 1;
    default:
      return 0;
  }
}

/**
 * Submits a new community queue report with validation, geofencing, rate limiting, and deduplication
 */
export function submitQueueReport(
  submission: QueueReportSubmission,
  clientIp: string = '127.0.0.1'
): { success: boolean; message: string; report?: CommunityQueueReport } {
  loadQueueReports();

  if (!submission.stationId) {
    return { success: false, message: 'Missing stationId' };
  }

  const pseudonym = generatePseudonym(clientIp);
  const now = Date.now();

  // 1. Rate-limiting check
  const timestamps = rateLimitMap.get(pseudonym) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_REPORTS_PER_WINDOW) {
    return {
      success: false,
      message: `Rate limit reached. Max ${MAX_REPORTS_PER_WINDOW} reports per 10 minutes.`
    };
  }

  // 2. Deduplication check (same user reporting same station in < 3 min)
  const isDuplicate = queueReportsCache.some(
    (r) =>
      r.stationId === submission.stationId &&
      r.reporterPseudonym === pseudonym &&
      now - r.timestamp < DEDUPLICATION_WINDOW_MS
  );
  if (isDuplicate) {
    return {
      success: false,
      message: 'You recently submitted a report for this station. Please wait a few minutes.'
    };
  }

  // 3. Geofence verification (optional if reporterCoordinates provided)
  let isGeofenceVerified = false;
  let distanceMeters: number | undefined;

  const station = getStationById(submission.stationId);
  if (station && submission.reporterCoordinates) {
    distanceMeters = Math.round(
      haversineMeters(
        submission.reporterCoordinates[0],
        submission.reporterCoordinates[1],
        station.coordinates[0],
        station.coordinates[1]
      )
    );
    // Verified if driver is within 500 meters of the station
    isGeofenceVerified = distanceMeters <= 500;
  }

  const vehiclesWaiting = actionToWaitingCount(submission.action, submission.vehiclesWaiting);

  const report: CommunityQueueReport = {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stationId: submission.stationId,
    stationName: submission.stationName || station?.name || 'Charging Station',
    connectorType: submission.connectorType || 'CCS2',
    action: submission.action,
    vehiclesWaiting,
    peopleWaiting: submission.peopleWaiting,
    comment: submission.comment ? submission.comment.slice(0, 160) : undefined,
    reporterPseudonym: pseudonym,
    timestamp: now,
    isGeofenceVerified,
    distanceFromStationMeters: distanceMeters
  };

  queueReportsCache.push(report);
  saveQueueReports();

  // Update rate limiter
  recent.push(now);
  rateLimitMap.set(pseudonym, recent);

  return {
    success: true,
    message: isGeofenceVerified
      ? 'Thank you! Geofence-verified queue report submitted.'
      : 'Thank you! Voluntary crowd report submitted.',
    report
  };
}

export function clearQueueReportsForTest(): void {
  queueReportsCache = [];
  rateLimitMap.clear();
  try {
    ensureStorage();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), 'utf-8');
  } catch {}
}

/**
 * Gets aggregated queue status for a station based on authoritative operator data + community reports
 */
export function getAggregatedStationQueue(stationId: string): StationQueueData | null {
  const authQueue = getAuthoritativeStationQueue(stationId);
  if (authQueue) {
    return authQueue;
  }
  loadQueueReports();
  const now = Date.now();

  const targetIds = [stationId, ...(STATION_ID_ALIASES[stationId] || [])];

  // Filter valid, unexpired reports for this station (< 2 hours old)
  const reports = queueReportsCache
    .filter((r) => targetIds.includes(r.stationId) && now - r.timestamp < EXPIRY_WINDOW_MS)
    .sort((a, b) => b.timestamp - a.timestamp);

  let station =
    getStationById(stationId) ||
    chargingStations.find((s) => s.id === stationId);

  if (!station && STATION_ID_ALIASES[stationId]) {
    for (const altId of STATION_ID_ALIASES[stationId]) {
      station = getStationById(altId) || chargingStations.find((s) => s.id === altId);
      if (station) break;
    }
  }

  if (!station && reports.length > 0) {
    station = {
      id: stationId,
      name: reports[0].stationName || 'Charging Station',
      connectors: [
        { type: 'CCS2', maxPowerKw: 60, count: 2, availableCount: 2, canonicalType: 'CCS2' },
        { type: 'Type 2', maxPowerKw: 22, count: 2, availableCount: 2, canonicalType: 'Type 2' }
      ]
    } as any;
  }

  if (!station) return null;

  const connectorQueues: Record<string, ConnectorQueueStatus> = {};

  // Build baseline stalls per connector group from station metadata using normalized types
  const connectors = station.connectors || [];
  for (const conn of connectors) {
    const rawType = conn.canonicalType || conn.type || 'CCS2';
    const connType = normalizeConnectorType(rawType);
    if (!connectorQueues[connType]) {
      const totalPoints = conn.count || 2;
      connectorQueues[connType] = {
        connectorType: connType,
        totalPoints,
        availablePoints: totalPoints, // default baseline
        occupiedPoints: 0,
        outOfOrderPoints: 0,
        vehiclesWaiting: 0,
        estimatedWaitMinutes: 0,
        confidence: 'unknown',
        dataSource: 'unavailable',
        updatedAt: now
      };
    } else {
      connectorQueues[connType].totalPoints += conn.count || 1;
      connectorQueues[connType].availablePoints += conn.count || 1;
    }
  }

  // Ensure any connector present in active reports also exists in connectorQueues
  for (const r of reports) {
    const rType = normalizeConnectorType(r.connectorType || 'CCS2');
    if (!connectorQueues[rType]) {
      connectorQueues[rType] = {
        connectorType: rType,
        totalPoints: 2,
        availablePoints: 2,
        occupiedPoints: 0,
        outOfOrderPoints: 0,
        vehiclesWaiting: 0,
        estimatedWaitMinutes: 0,
        confidence: 'unknown',
        dataSource: 'unavailable',
        updatedAt: now
      };
    }
  }

  // If station has no connectors array, default to CCS2 with 2 stalls
  if (Object.keys(connectorQueues).length === 0) {
    connectorQueues['CCS2'] = {
      connectorType: 'CCS2',
      totalPoints: 2,
      availablePoints: 2,
      occupiedPoints: 0,
      outOfOrderPoints: 0,
      vehiclesWaiting: 0,
      estimatedWaitMinutes: 0,
      confidence: 'unknown',
      dataSource: 'unavailable',
      updatedAt: now
    };
  }

  // If no community reports exist, return baseline with 'unavailable' data source
  if (reports.length === 0) {
    return {
      stationId,
      stationName: station.name,
      connectorQueues,
      overallVehiclesWaiting: 0,
      primaryDataSource: 'unavailable',
      confidence: 'unknown',
      lastReportedTimestamp: 0,
      reportCountRecent: 0,
      isStale: true
    };
  }

  // Aggregate by connector type using the most recent reports with normalized connector matching
  let maxOverallWaiting = 0;
  let latestTimestamp = 0;

  for (const connType of Object.keys(connectorQueues)) {
    const connReports = reports.filter((r) => {
      if (!r.connectorType) return true;
      return normalizeConnectorType(r.connectorType) === connType;
    });

    if (connReports.length > 0) {
      const latest = connReports[0];
      const ageMinutes = (now - latest.timestamp) / (60 * 1000);
      const isGeofenced = latest.isGeofenceVerified;

      // Confidence evaluation: recent + geofenced gets 'medium', otherwise 'low'
      let conf: 'high' | 'medium' | 'low' = 'low';
      if (ageMinutes < 30) {
        conf = isGeofenced ? 'high' : 'medium';
      } else if (ageMinutes < 60) {
        conf = 'medium';
      }

      const total = connectorQueues[connType].totalPoints;
      const waiting = latest.vehiclesWaiting;
      maxOverallWaiting = Math.max(maxOverallWaiting, waiting);
      latestTimestamp = Math.max(latestTimestamp, latest.timestamp);

      // Estimate occupancy and available stalls from report action
      let occupied = 0;
      let available = total;
      let outOfOrder = 0;

      if (latest.action === 'all_occupied') {
        occupied = total;
        available = 0;
      } else if (latest.action === 'charger_available') {
        available = Math.max(1, total - 1);
        occupied = Math.max(0, total - available);
      } else if (latest.action === 'charger_fault') {
        outOfOrder = 1;
        available = Math.max(0, total - 1);
      } else if (waiting > 0) {
        occupied = total;
        available = 0;
      }

      // Estimated wait minutes = (waiting * 35 min) / total
      const estWait = Math.round((waiting * 35) / total);

      connectorQueues[connType] = {
        connectorType: connType,
        totalPoints: total,
        availablePoints: available,
        occupiedPoints: occupied,
        outOfOrderPoints: outOfOrder,
        vehiclesWaiting: waiting,
        peopleWaiting: latest.peopleWaiting,
        estimatedWaitMinutes: estWait,
        estimatedWaitRange: estWait > 0 ? [Math.max(0, estWait - 5), estWait + 10] : [0, 5],
        confidence: conf,
        dataSource: 'community_report',
        updatedAt: latest.timestamp
      };
    }
  }

  const primaryConfidence = reports.length > 0
    ? (now - latestTimestamp < 30 * 60 * 1000 ? 'medium' : 'low')
    : 'unknown';

  return {
    stationId,
    stationName: station.name,
    connectorQueues,
    overallVehiclesWaiting: maxOverallWaiting,
    primaryDataSource: 'community_report',
    confidence: primaryConfidence,
    lastReportedTimestamp: latestTimestamp,
    reportCountRecent: reports.length,
    isStale: now - latestTimestamp > 45 * 60 * 1000
  };
}
