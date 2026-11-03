/**
 * Isomorphic Community Utilities
 * Pure functions for report freshness, category TTL, and text sanitization.
 * Safe for both browser and Node.js runtimes.
 */

import {
  CommunityReport,
  ReportCategory,
  FreshnessClassification
} from '../types/communityReports';

/**
 * Sanitize plain text (strip tags, remove control chars, limit length)
 */
export function sanitizeText(input?: string, maxLength: number = 280): string | undefined {
  if (!input) return undefined;
  return input
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/[^\x20-\x7E\u0900-\u097F\n.,!?\-()]/g, '') // Allow ASCII, Devanagari, punctuation
    .trim()
    .slice(0, maxLength);
}

/**
 * Calculate report TTL and expiration based on category
 */
export function getCategoryTtlMs(category: ReportCategory): number {
  switch (category) {
    case 'station_availability':
      return 2 * 60 * 60 * 1000; // 2 hours
    case 'session_outcome':
    case 'payment_issue':
      return 48 * 60 * 60 * 1000; // 48 hours
    case 'connector_status':
      return 72 * 60 * 60 * 1000; // 72 hours
    case 'road_access':
      return 7 * 24 * 60 * 60 * 1000; // 7 days (168 hours)
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/**
 * Determine freshness classification for a report relative to a given timestamp
 */
export function getReportFreshness(
  report: CommunityReport,
  nowIso: string = new Date().toISOString()
): FreshnessClassification {
  const now = new Date(nowIso).getTime();
  const observedTime = new Date(report.observedAt).getTime();
  const ageMs = Math.max(0, now - observedTime);
  const ttlMs = getCategoryTtlMs(report.category);

  if (report.resolvedAt || ageMs >= ttlMs) {
    return 'expired';
  }
  if (ageMs <= ttlMs * 0.25) {
    return 'recent';
  }
  if (ageMs <= ttlMs * 0.75) {
    return 'aging';
  }
  return 'stale';
}

