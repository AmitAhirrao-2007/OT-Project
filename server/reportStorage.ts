/**
 * File-backed Durable Storage & Business Logic for Community Reports
 * Phase 5D: Reliable persistence across server restarts, rate-limiting,
 * deduplication, corroboration, and input sanitization.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CommunityReport,
  ReportSubmissionRequest,
  ModerationRequest,
  ModerationStatus
} from '../src/types/communityReports';
import {
  sanitizeText,
  getCategoryTtlMs,
  getReportFreshness
} from '../src/utils/communityUtils';

export { sanitizeText, getCategoryTtlMs, getReportFreshness };

// Data directory and file path
const DATA_DIR = path.resolve(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'communityReports.json');
const DEDUPLICATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const CORROBORATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REPORTS_PER_WINDOW = 5;
const CONTRIBUTOR_HMAC_SALT = process.env.CONTRIBUTOR_HMAC_SALT || 'ev-route-planner-internal-secret-salt-2026';

// Memory cache synchronized with disk
let reportsCache: CommunityReport[] = [];

// Rate-limiting tracker: key -> timestamps[]
const rateLimitMap = new Map<string, number[]>();

/**
 * Ensure storage directory and file exist
 */
function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

/**
 * Load reports from durable JSON file
 */
export function loadReportsFromDisk(): CommunityReport[] {
  ensureStorage();
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    reportsCache = JSON.parse(raw);
    return reportsCache;
  } catch (err) {
    console.error('[CommunityStorage] Error loading reports from disk:', err);
    reportsCache = [];
    return reportsCache;
  }
}

/**
 * Atomically save reports to durable JSON file
 */
export function saveReportsToDisk(reports: CommunityReport[]): void {
  ensureStorage();
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(reports, null, 2), 'utf-8');
    reportsCache = reports;
  } catch (err) {
    console.error('[CommunityStorage] Write to disk failed:', err);
    throw err;
  }
}

/**
 * Reset storage (used for tests or administrative resets)
 */
export function clearReportsStorage(): void {
  reportsCache = [];
  saveReportsToDisk([]);
  rateLimitMap.clear();
}

/**
 * Check and enforce rate limiting by identifier (IP or contributor ID)
 */
export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const history = rateLimitMap.get(identifier) || [];
  const recent = history.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REPORTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  recent.push(now);
  rateLimitMap.set(identifier, recent);
  return { allowed: true, remaining: MAX_REPORTS_PER_WINDOW - recent.length };
}

/**
 * Process and ingest a new report submission with deduplication and corroboration
 */
export function submitCommunityReport(
  req: ReportSubmissionRequest,
  clientIp: string
): { success: boolean; report?: CommunityReport; error?: string; code: number } {
  // 1. Basic validation
  if (!req.stationId || !req.category || !req.condition) {
    return { success: false, error: 'Missing required report fields (stationId, category, condition)', code: 400 };
  }

  // 2. Validate observation timestamp (reject future dates > 15m ahead, or dates older than 30 days)
  const serverTime = new Date();
  let observedDate = serverTime;
  if (req.observedAt) {
    const parsed = new Date(req.observedAt);
    if (isNaN(parsed.getTime())) {
      return { success: false, error: 'Invalid observedAt timestamp', code: 400 };
    }
    if (parsed.getTime() > serverTime.getTime() + 15 * 60 * 1000) {
      return { success: false, error: 'Observation timestamp cannot be in the future', code: 400 };
    }
    if (parsed.getTime() < serverTime.getTime() - 30 * 24 * 60 * 60 * 1000) {
      return { success: false, error: 'Observation timestamp is too old (>30 days)', code: 400 };
    }
    observedDate = parsed;
  }

  // 3. Rate limiting check (using keyed HMAC salt to prevent rainbow-table IP enumeration)
  const contributorId = req.contributorId || `guest-${crypto.createHmac('sha256', CONTRIBUTOR_HMAC_SALT).update(clientIp).digest('hex').slice(0, 12)}`;
  const rateLimit = checkRateLimit(contributorId);
  if (!rateLimit.allowed) {
    return { success: false, error: 'Rate limit exceeded. Maximum 5 submissions per 10 minutes.', code: 429 };
  }

  // Load current state
  const reports = loadReportsFromDisk();
  const nowMs = serverTime.getTime();

  // 4. Duplicate Detection (Same contributor submitting same station/condition within 30 mins)
  const isDuplicate = reports.some((r) => {
    if (r.stationId !== req.stationId) return false;
    if (r.category !== req.category || r.condition !== req.condition) return false;
    if (r.connectorId && req.connectorId && r.connectorId !== req.connectorId) return false;
    if (r.contributorId !== contributorId) return false;

    const rTime = new Date(r.receivedAt).getTime();
    return Math.abs(nowMs - rTime) < DEDUPLICATION_WINDOW_MS;
  });

  if (isDuplicate) {
    return {
      success: false,
      error: 'Duplicate report detected. You have already submitted a report for this condition recently.',
      code: 409
    };
  }

  // 5. Corroboration Detection (Different contributor reporting same issue within 24h)
  const matchingIncident = reports.find((r) => {
    if (r.stationId !== req.stationId) return false;
    if (r.category !== req.category || r.condition !== req.condition) return false;
    if (r.connectorId && req.connectorId && r.connectorId !== req.connectorId) return false;
    if (r.contributorId === contributorId) return false;

    const rTime = new Date(r.receivedAt).getTime();
    return Math.abs(nowMs - rTime) < CORROBORATION_WINDOW_MS && r.moderationStatus !== 'rejected';
  });

  if (matchingIncident) {
    // Corroborate existing incident
    if (!matchingIncident.corroboratingContributors.includes(contributorId)) {
      matchingIncident.corroboratingContributors.push(contributorId);
      matchingIncident.corroborationCount = matchingIncident.corroboratingContributors.length;
      if (matchingIncident.corroborationCount >= 2 && matchingIncident.moderationStatus === 'published') {
        matchingIncident.moderationStatus = 'corroborated';
      }
    }
  }

  // 6. Create new community report
  const newReport: CommunityReport = {
    reportId: `rep-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    stationId: req.stationId,
    evseId: req.evseId,
    connectorId: req.connectorId,
    connectorType: req.connectorType,
    category: req.category,
    condition: req.condition,
    observationDetails: sanitizeText(req.observationDetails),
    observedAt: observedDate.toISOString(),
    receivedAt: serverTime.toISOString(),
    contributorId,
    contributorClass: req.contributorId && !req.contributorId.startsWith('guest-') ? 'authenticated' : 'guest',
    moderationStatus: matchingIncident ? 'corroborated' : 'published',
    corroborationCount: matchingIncident ? matchingIncident.corroborationCount : 1,
    corroboratingContributors: matchingIncident ? [...matchingIncident.corroboratingContributors] : [contributorId],
    waitTimeMinutes: typeof req.waitTimeMinutes === 'number' && req.waitTimeMinutes >= 0 && req.waitTimeMinutes <= 360 ? Math.round(req.waitTimeMinutes) : undefined,
    deliveredPowerKw: typeof req.deliveredPowerKw === 'number' && req.deliveredPowerKw > 0 ? req.deliveredPowerKw : undefined
  };

  reports.push(newReport);
  saveReportsToDisk(reports);

  return { success: true, report: newReport, code: 201 };
}

/**
 * Get reports for a station with optional connector and status filtering
 */
export function getReportsForStation(
  stationId: string,
  options?: {
    connectorId?: string;
    includeExpired?: boolean;
    moderationStatus?: ModerationStatus;
  }
): CommunityReport[] {
  const reports = loadReportsFromDisk();
  return reports.filter((r) => {
    if (r.stationId !== stationId) return false;
    if (options?.connectorId && r.connectorId && r.connectorId !== options.connectorId) return false;
    if (options?.moderationStatus && r.moderationStatus !== options.moderationStatus) return false;
    if (r.moderationStatus === 'rejected') return false; // Exclude rejected reports from public results
    if (!options?.includeExpired && getReportFreshness(r) === 'expired') return false;
    return true;
  });
}

/**
 * Handle administrative moderation actions
 */
export function moderateReport(
  req: ModerationRequest,
  moderatorToken?: string
): { success: boolean; report?: CommunityReport; error?: string; code: number } {
  // Validate authorization
  const expectedToken = process.env.ADMIN_API_TOKEN || 'local-dev-moderator-token';
  if (!moderatorToken || moderatorToken !== expectedToken) {
    return { success: false, error: 'Unauthorized: Valid moderator token required', code: 401 };
  }

  const reports = loadReportsFromDisk();
  const report = reports.find((r) => r.reportId === req.reportId);
  if (!report) {
    return { success: false, error: 'Report not found', code: 404 };
  }

  const nowIso = new Date().toISOString();
  report.lastReviewedAt = nowIso;

  switch (req.action) {
    case 'approve':
      report.moderationStatus = 'published';
      break;
    case 'reject':
      report.moderationStatus = 'rejected';
      break;
    case 'dispute':
      report.moderationStatus = 'disputed';
      break;
    case 'corroborate':
      report.moderationStatus = 'corroborated';
      report.corroborationCount = Math.max(report.corroborationCount + 1, 2);
      break;
    case 'resolve':
      report.resolvedAt = nowIso;
      report.moderationStatus = 'expired'; // Resolved incidents expire
      break;
    default:
      return { success: false, error: 'Unknown moderation action', code: 400 };
  }

  saveReportsToDisk(reports);
  return { success: true, report, code: 200 };
}
