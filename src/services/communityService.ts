/**
 * Community Reliability Engine & Client Service
 * Phase 5D: Multi-dimensional Bayesian reliability scoring, time-decayed
 * weights, confidence tiers, queue estimation, and CPO-conflict detection.
 */

import {
  CommunityReport,
  ReportSubmissionRequest,
  StationReliabilitySummary,
  ConfidenceTier,
  FreshnessClassification,
  ModerationRequest
} from '../types/communityReports';
import { getReportFreshness } from '../utils/communityUtils';

// Backend Proxy URL (defaults to localhost:3001)
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/api';

/**
 * Beta-binomial Bayesian Prior Constants
 * Alpha_0 = 2.0 (assumed successes), Beta_0 = 0.5 (assumed failures)
 * Prior Mean = 2.0 / 2.5 = 80%, Prior Weight = 2.5 observations.
 * Reflects baseline assumption of a functional station without falsely claiming certainty.
 */
export const BAYESIAN_PRIOR_ALPHA = 2.0;
export const BAYESIAN_PRIOR_BETA = 0.5;

/**
 * Contributor Class Reliability Weights
 */
export const CONTRIBUTOR_WEIGHTS: Record<string, number> = {
  trusted: 1.25,
  authenticated: 1.0,
  guest: 0.8,
  cpo_telemetry: 1.0
};

/**
 * Calculate exponential time decay factor: exp(-ln(2) * (age / halfLife))
 */
export function calculateTimeDecayWeight(
  observedAtIso: string,
  categoryHalfLifeHours: number,
  nowIso: string = new Date().toISOString()
): number {
  const ageMs = Math.max(0, new Date(nowIso).getTime() - new Date(observedAtIso).getTime());
  const ageHours = ageMs / (1000 * 60 * 60);
  const decayRate = Math.LN2 / categoryHalfLifeHours;
  return Math.exp(-decayRate * ageHours);
}

/**
 * Determine overall freshness for a collection of reports
 */
export function determineAggregatedFreshness(reports: CommunityReport[]): FreshnessClassification {
  if (reports.length === 0) return 'expired';
  const recentCount = reports.filter((r) => getReportFreshness(r) === 'recent').length;
  if (recentCount > 0) return 'recent';

  const agingCount = reports.filter((r) => getReportFreshness(r) === 'aging').length;
  if (agingCount > 0) return 'aging';

  const staleCount = reports.filter((r) => getReportFreshness(r) === 'stale').length;
  if (staleCount > 0) return 'stale';

  return 'expired';
}

/**
 * Deterministic pure function to compute station reliability summary
 */
export function computeStationReliability(
  reports: CommunityReport[],
  stationId: string,
  cpoStatus?: string,
  nowIso: string = new Date().toISOString()
): StationReliabilitySummary {
  // Filter active, non-rejected reports for this station
  const stationReports = reports.filter(
    (r) => r.stationId === stationId && r.moderationStatus !== 'rejected' && !r.resolvedAt
  );

  // If no reports exist
  if (stationReports.length === 0) {
    return {
      stationId,
      overallScore: null,
      confidenceTier: 'insufficient_evidence',
      totalReportCount: 0,
      recentReportCount: 0,
      lastReportedAt: null,
      freshness: 'expired',
      dimensionScores: {
        sessionSuccessRate: null,
        activationReliability: null,
        connectorReliability: null,
        accessConfidence: null,
        powerConsistency: null
      },
      queueEstimate: {
        status: 'unavailable',
        sampleCount: 0,
        freshness: 'expired'
      },
      activeWarnings: []
    };
  }

  // Sort by receivedAt descending
  stationReports.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const lastReportedAt = stationReports[0].observedAt;
  const recentReports = stationReports.filter((r) => getReportFreshness(r, nowIso) === 'recent');

  // Track weighted counts per dimension
  let sessionSuccessWeight = 0;
  let sessionFailureWeight = 0;

  let activationSuccessWeight = 0;
  let activationFailureWeight = 0;

  let connectorWorkingWeight = 0;
  let connectorDamagedWeight = 0;

  let accessClearWeight = 0;
  let accessBlockedWeight = 0;

  let powerNormalWeight = 0;
  let powerLowWeight = 0;

  const activeWarnings: string[] = [];
  const queueWaitObservations: number[] = [];

  for (const rep of stationReports) {
    const freshness = getReportFreshness(rep, nowIso);
    if (freshness === 'expired') continue;

    // Base time-decay half life
    let halfLifeHours = 48;
    if (rep.category === 'station_availability') halfLifeHours = 2;
    else if (rep.category === 'road_access') halfLifeHours = 168; // 7 days
    else if (rep.category === 'connector_status') halfLifeHours = 72;

    const timeDecay = calculateTimeDecayWeight(rep.observedAt, halfLifeHours, nowIso);
    const contributorMultiplier = CONTRIBUTOR_WEIGHTS[rep.contributorClass] || 0.8;
    const weight = timeDecay * contributorMultiplier * (rep.corroborationCount >= 2 ? 1.2 : 1.0);

    // Dimension mapping
    switch (rep.condition) {
      case 'session_completed_successfully':
      case 'session_started_successfully':
        sessionSuccessWeight += weight;
        activationSuccessWeight += weight;
        break;

      case 'activation_failed':
      case 'app_activation_failure':
      case 'rfid_activation_failure':
      case 'session_start_failure':
        sessionFailureWeight += weight;
        activationFailureWeight += weight;
        if (!activeWarnings.includes('Activation failures reported recently')) {
          activeWarnings.push('Activation failures reported recently');
        }
        break;

      case 'stopped_unexpectedly':
        sessionFailureWeight += weight;
        if (!activeWarnings.includes('Unexpected charging session interruptions reported')) {
          activeWarnings.push('Unexpected charging session interruptions reported');
        }
        break;

      case 'low_power_delivered':
        powerLowWeight += weight;
        if (!activeWarnings.includes('Reduced charging power reported')) {
          activeWarnings.push('Reduced charging power reported');
        }
        break;

      case 'connector_working':
        connectorWorkingWeight += weight;
        break;

      case 'connector_damaged':
      case 'connector_obstructed':
      case 'connector_unavailable':
        connectorDamagedWeight += weight;
        if (!activeWarnings.includes(`Connector issue reported (${rep.condition.replace(/_/g, ' ')})`)) {
          activeWarnings.push(`Connector issue reported (${rep.condition.replace(/_/g, ' ')})`);
        }
        break;

      case 'entrance_accessible':
        accessClearWeight += weight;
        break;

      case 'entrance_blocked':
      case 'wrong_carriageway':
      case 'restricted_premises':
      case 'road_entrance_mismatch':
      case 'uturn_unavailable':
        accessBlockedWeight += weight;
        if (!activeWarnings.includes(`Access restriction reported: ${rep.condition.replace(/_/g, ' ')}`)) {
          activeWarnings.push(`Access restriction reported: ${rep.condition.replace(/_/g, ' ')}`);
        }
        break;

      case 'queue_observed':
        if (typeof rep.waitTimeMinutes === 'number' && freshness === 'recent') {
          queueWaitObservations.push(rep.waitTimeMinutes);
        }
        break;

      default:
        break;
    }
  }

  // Effective overall sample size across all weighted observations
  const totalEffectiveObservations =
    sessionSuccessWeight +
    sessionFailureWeight +
    activationSuccessWeight +
    activationFailureWeight +
    connectorWorkingWeight +
    connectorDamagedWeight +
    accessClearWeight +
    accessBlockedWeight +
    powerLowWeight;

  // Determine statistical confidence tier
  let confidenceTier: ConfidenceTier = 'insufficient_evidence';
  if (totalEffectiveObservations >= 10) {
    confidenceTier = 'high';
  } else if (totalEffectiveObservations >= 5) {
    confidenceTier = 'medium';
  } else if (totalEffectiveObservations >= 2) {
    confidenceTier = 'low';
  }

  // Dimension Scores Calculation using Bayesian posterior mean
  const calcBayesianScore = (succ: number, fail: number): number | null => {
    if (succ + fail < 0.5) return null;
    const posterior = (BAYESIAN_PRIOR_ALPHA + succ) / (BAYESIAN_PRIOR_ALPHA + BAYESIAN_PRIOR_BETA + succ + fail);
    return Math.round(posterior * 100);
  };

  const sessionScore = calcBayesianScore(sessionSuccessWeight, sessionFailureWeight);
  const activationScore = calcBayesianScore(activationSuccessWeight, activationFailureWeight);
  const connectorScore = calcBayesianScore(connectorWorkingWeight, connectorDamagedWeight);
  const accessScore = calcBayesianScore(accessClearWeight, accessBlockedWeight);
  const powerScore = calcBayesianScore(powerNormalWeight, powerLowWeight);

  // Overall Score: weighted composite of available dimension scores
  let overallScore: number | null = null;
  if (confidenceTier !== 'insufficient_evidence') {
    const scores = [sessionScore, activationScore, connectorScore, accessScore].filter(
      (s): s is number => s !== null
    );
    if (scores.length > 0) {
      const avg = scores.reduce((sum, val) => sum + val, 0) / scores.length;
      overallScore = Math.round(avg);
    }
  }

  // Queue Wait-Time Estimation
  let queueEstimate: StationReliabilitySummary['queueEstimate'] = {
    status: 'unavailable',
    sampleCount: queueWaitObservations.length,
    freshness: determineAggregatedFreshness(stationReports.filter((r) => r.category === 'station_availability'))
  };

  if (queueWaitObservations.length >= 2) {
    queueWaitObservations.sort((a, b) => a - b);
    const mid = Math.floor(queueWaitObservations.length / 2);
    const median = queueWaitObservations.length % 2 !== 0
      ? queueWaitObservations[mid]
      : Math.round((queueWaitObservations[mid - 1] + queueWaitObservations[mid]) / 2);

    queueEstimate = {
      status: 'available',
      estimatedWaitMinutes: median,
      observedWaitRange: {
        min: queueWaitObservations[0],
        max: queueWaitObservations[queueWaitObservations.length - 1]
      },
      sampleCount: queueWaitObservations.length,
      freshness: 'recent'
    };
  }

  // CPO Telemetry vs Community Discrepancy Detection
  let cpoConflict: StationReliabilitySummary['cpoConflict'] = undefined;
  if (cpoStatus && cpoStatus.toLowerCase().includes('available')) {
    // If official CPO says Available, but community reported multiple failures or blocked entrance
    const severeFailures = stationReports.filter(
      (r) =>
        getReportFreshness(r, nowIso) === 'recent' &&
        ['activation_failed', 'connector_damaged', 'entrance_blocked'].includes(r.condition)
    );
    if (severeFailures.length >= 2 || severeFailures.some((r) => r.corroborationCount >= 2)) {
      cpoConflict = {
        hasConflict: true,
        cpoStatus: 'Available (CPO Telemetry)',
        communityWarning: `${severeFailures.length} recent community report(s) indicate active failure or blockage`
      };
    }
  }

  return {
    stationId,
    overallScore,
    confidenceTier,
    totalReportCount: stationReports.length,
    recentReportCount: recentReports.length,
    lastReportedAt,
    freshness: determineAggregatedFreshness(stationReports),
    dimensionScores: {
      sessionSuccessRate: sessionScore,
      activationReliability: activationScore,
      connectorReliability: connectorScore,
      accessConfidence: accessScore,
      powerConsistency: powerScore
    },
    queueEstimate,
    activeWarnings,
    cpoConflict
  };
}

/**
 * Client Service Class for Community Reports
 */
export class CommunityService {
  private inMemoryCache: CommunityReport[] = [];

  constructor(initialReports: CommunityReport[] = []) {
    this.inMemoryCache = [...initialReports];
  }

  /**
   * Submit a new driver report to backend proxy
   */
  async submitReport(
    req: ReportSubmissionRequest
  ): Promise<{ success: boolean; report?: CommunityReport; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      const data = await res.json();
      if (res.ok && data.report) {
        this.inMemoryCache.push(data.report);
        return { success: true, report: data.report };
      }
      return { success: false, error: data.error || 'Submission failed' };
    } catch {
      // Local fallback for offline/test environments
      const simulatedReport: CommunityReport = {
        reportId: `local-${Date.now()}`,
        stationId: req.stationId,
        evseId: req.evseId,
        connectorId: req.connectorId,
        connectorType: req.connectorType,
        category: req.category,
        condition: req.condition,
        observationDetails: req.observationDetails,
        observedAt: req.observedAt || new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        contributorId: req.contributorId || 'guest-local',
        contributorClass: 'guest',
        moderationStatus: 'published',
        corroborationCount: 1,
        corroboratingContributors: [req.contributorId || 'guest-local'],
        waitTimeMinutes: req.waitTimeMinutes,
        deliveredPowerKw: req.deliveredPowerKw
      };
      this.inMemoryCache.push(simulatedReport);
      return { success: true, report: simulatedReport };
    }
  }

  /**
   * Fetch published reports for a station
   */
  async getReportsForStation(stationId: string): Promise<CommunityReport[]> {
    try {
      const res = await fetch(`${API_BASE}/reports?stationId=${encodeURIComponent(stationId)}`);
      if (res.ok) {
        const data = await res.json();
        return data.reports || [];
      }
    } catch {
      // Fallback to local memory cache
    }
    return this.inMemoryCache.filter((r) => r.stationId === stationId);
  }

  /**
   * Get aggregate reliability summary
   */
  async getStationReliability(
    stationId: string,
    cpoStatus?: string
  ): Promise<StationReliabilitySummary> {
    const reports = await this.getReportsForStation(stationId);
    return computeStationReliability(reports, stationId, cpoStatus);
  }

  /**
   * Moderate report (admin only)
   */
  async moderateReport(
    req: ModerationRequest,
    adminToken: string
  ): Promise<{ success: boolean; report?: CommunityReport; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/reports/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(req)
      });
      const data = await res.json();
      return { success: res.ok, report: data.report, error: data.error };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// Export singleton instance
export const communityService = new CommunityService();
