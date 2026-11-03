/**
 * Community Charging Reliability Network - Data Types & Interfaces
 * Phase 5D: Driver Reporting, Verification, and Multi-Dimensional Reliability Scoring
 */

import { SupportedConnectorType } from './station';

/**
 * High-level categories for driver reports
 */
export type ReportCategory =
  | 'session_outcome'
  | 'connector_status'
  | 'station_availability'
  | 'road_access'
  | 'payment_issue';

/**
 * Specific conditions observed by EV drivers per category
 */
export type SessionOutcomeCondition =
  | 'session_started_successfully'
  | 'session_completed_successfully'
  | 'activation_failed'
  | 'stopped_unexpectedly'
  | 'low_power_delivered';

export type ConnectorCondition =
  | 'connector_working'
  | 'connector_damaged'
  | 'connector_unavailable'
  | 'connector_occupied'
  | 'connector_obstructed';

export type StationAvailabilityCondition =
  | 'station_fully_occupied'
  | 'no_compatible_connector'
  | 'queue_observed'
  | 'station_closed'
  | 'out_of_service';

export type RoadAccessCondition =
  | 'entrance_accessible'
  | 'entrance_blocked'
  | 'wrong_carriageway'
  | 'restricted_premises'
  | 'road_entrance_mismatch'
  | 'uturn_unavailable';

export type PaymentIssueCondition =
  | 'app_activation_failure'
  | 'rfid_activation_failure'
  | 'payment_rejected'
  | 'session_start_failure';

export type ObservedCondition =
  | SessionOutcomeCondition
  | ConnectorCondition
  | StationAvailabilityCondition
  | RoadAccessCondition
  | PaymentIssueCondition;

/**
 * Contributor identity classes
 */
export type ContributorClass =
  | 'guest'              // Pseudonymous unverified guest driver
  | 'authenticated'      // Signed-in driver
  | 'trusted'            // Vetted contributor / community champion
  | 'cpo_telemetry';     // Automated operator telemetry (never overwrites community, kept distinct)

/**
 * Report moderation lifecycle
 */
export type ModerationStatus =
  | 'pending'            // Submitted, awaiting automatic or administrative review
  | 'published'          // Passed initial checks and visible to community
  | 'corroborated'       // Confirmed by 2+ independent contributors
  | 'disputed'           // Conflicting reports or flagged by users
  | 'rejected'           // Rejected by moderation (spam/abuse)
  | 'expired';           // Past category TTL

/**
 * Time-based freshness classification
 */
export type FreshnessClassification =
  | 'recent'             // Within category high-confidence window
  | 'aging'              // Older observation, decaying weight
  | 'stale'              // Low predictive weight
  | 'expired';           // Reached end of relevance

/**
 * Statistical confidence tiers
 */
export type ConfidenceTier =
  | 'high'                 // 10+ weighted corroborating observations
  | 'medium'               // 5 - 9 weighted observations
  | 'low'                  // 2 - 4 weighted observations
  | 'insufficient_evidence'; // < 2 observations (explicit honesty: never invent precision)

/**
 * Core individual community report
 */
export interface CommunityReport {
  reportId: string;
  stationId: string;
  evseId?: string;
  connectorId?: string;
  connectorType?: SupportedConnectorType;
  category: ReportCategory;
  condition: ObservedCondition;
  observationDetails?: string;    // Sanitized free-text (max 280 chars)
  observedAt: string;             // ISO-8601 string recorded by driver
  receivedAt: string;             // ISO-8601 string assigned authoritatively by server
  contributorId: string;          // Pseudonymous identifier (e.g. anon-hash or user UUID)
  contributorClass: ContributorClass;
  moderationStatus: ModerationStatus;
  corroborationCount: number;
  corroboratingContributors: string[]; // List of pseudonymous IDs confirming this incident
  waitTimeMinutes?: number;       // Observed queue wait in minutes (for queue reports)
  deliveredPowerKw?: number;      // Observed delivered power (for low power reports)
  resolvedAt?: string;            // ISO timestamp if issue was resolved
  lastReviewedAt?: string;        // ISO timestamp of latest moderation review
}

/**
 * Report submission payload from client
 */
export interface ReportSubmissionRequest {
  stationId: string;
  evseId?: string;
  connectorId?: string;
  connectorType?: SupportedConnectorType;
  category: ReportCategory;
  condition: ObservedCondition;
  observationDetails?: string;
  observedAt?: string;            // Optional; server defaults to current time if absent
  contributorId?: string;         // Guest token or user ID
  waitTimeMinutes?: number;
  deliveredPowerKw?: number;
}

/**
 * Moderation request
 */
export interface ModerationRequest {
  reportId: string;
  action: 'approve' | 'reject' | 'dispute' | 'corroborate' | 'resolve';
  reason?: string;
  moderatorId?: string;
}

/**
 * Aggregated multi-dimensional station reliability summary
 */
export interface StationReliabilitySummary {
  stationId: string;
  overallScore: number | null;    // 0-100 Bayesian posterior score (null if insufficient evidence)
  confidenceTier: ConfidenceTier;
  totalReportCount: number;
  recentReportCount: number;
  lastReportedAt: string | null;
  freshness: FreshnessClassification;

  // Multi-dimensional breakdown
  dimensionScores: {
    sessionSuccessRate: number | null;    // % success (outcomes)
    activationReliability: number | null; // % activation success
    connectorReliability: number | null;  // % connectors operational
    accessConfidence: number | null;      // % road entrance unobstructed
    powerConsistency: number | null;      // % delivered power close to advertised
  };

  // Queue and wait-time estimation
  queueEstimate: {
    status: 'available' | 'unavailable';
    estimatedWaitMinutes?: number;
    observedWaitRange?: { min: number; max: number };
    sampleCount: number;
    freshness: FreshnessClassification;
  };

  // Active risk warnings
  activeWarnings: string[];

  // CPO Telemetry vs Community Discrepancy Alert
  cpoConflict?: {
    hasConflict: boolean;
    cpoStatus: string;
    communityWarning: string;
  };
}

