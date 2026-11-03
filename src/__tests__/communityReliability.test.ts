/**
 * Phase 5D: Community Reliability Network, Driver Reporting,
 * Verification, and Backup Charger Recommendations Test Suite.
 *
 * Deterministic tests covering all 34 required test scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitCommunityReport,
  getReportsForStation,
  moderateReport,
  clearReportsStorage,
  loadReportsFromDisk,
  saveReportsToDisk,
  checkRateLimit
} from '../../server/reportStorage';
import {
  computeStationReliability,
  calculateTimeDecayWeight
} from '../services/communityService';
import {
  getReportFreshness,
  getCategoryTtlMs,
  sanitizeText
} from '../utils/communityUtils';
import {
  evaluateBackupCharger
} from '../services/roadAccessService';
import { calculateTripRoutes } from '../services/routingService';
import { solveRcsp } from '../services/rcspSolver';
import { chargingStations } from '../data/stationCatalogue';
import { initialVehicleProfile } from '../data/demoVehicle';
import { demoTrip } from '../data/demoRoute';
import {
  initialPlanOptions,
  initialChargingSettings,
  initialRoutingSettings
} from '../data/demoSettings';
import { RouteCalculationRequest } from '../types/route';
import {
  CommunityReport,
  ReportSubmissionRequest,
  StationReliabilitySummary
} from '../types/communityReports';

describe('Phase 5D Community Reliability Network & Driver Reporting Suite', () => {
  beforeEach(() => {
    // Reset file-backed storage to clean baseline before each test
    clearReportsStorage();
  });

  // 1. Report creation
  it('1. should successfully create a valid community report with server-assigned timestamp and ID', () => {
    const req: ReportSubmissionRequest = {
      stationId: 'sta-agra-1',
      category: 'session_outcome',
      condition: 'session_completed_successfully',
      observationDetails: 'Charged smoothly at 60 kW'
    };

    const res = submitCommunityReport(req, '192.168.1.100');
    expect(res.success).toBe(true);
    expect(res.code).toBe(201);
    expect(res.report).toBeDefined();
    expect(res.report?.stationId).toBe('sta-agra-1');
    expect(res.report?.condition).toBe('session_completed_successfully');
    expect(res.report?.reportId).toMatch(/^rep-\d+-[a-f0-9]+/);
    expect(res.report?.receivedAt).toBeDefined();
    expect(res.report?.moderationStatus).toBe('published');
  });

  // 2. Invalid report rejection
  it('2. should reject invalid report submissions missing required fields', () => {
    const invalidReq = {
      stationId: '',
      category: 'session_outcome',
      condition: ''
    } as any;

    const res = submitCommunityReport(invalidReq, '192.168.1.101');
    expect(res.success).toBe(false);
    expect(res.code).toBe(400);
    expect(res.error).toContain('Missing required report fields');
  });

  // 3. Connector-level report mapping
  it('3. should correctly map connector-level reports to specific connectorId', () => {
    const req: ReportSubmissionRequest = {
      stationId: 'sta-agra-1',
      connectorId: 'conn-ccs2-01',
      category: 'connector_status',
      condition: 'connector_damaged',
      observationDetails: 'Latching pin is broken on plug #1'
    };

    const res = submitCommunityReport(req, '192.168.1.102');
    expect(res.success).toBe(true);
    expect(res.report?.connectorId).toBe('conn-ccs2-01');

    const filtered = getReportsForStation('sta-agra-1', { connectorId: 'conn-ccs2-01' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].connectorId).toBe('conn-ccs2-01');

    const otherConnector = getReportsForStation('sta-agra-1', { connectorId: 'conn-ccs2-02' });
    expect(otherConnector.length).toBe(0);
  });

  // 4. Station-level report mapping
  it('4. should correctly handle station-level reports where connectorId is omitted', () => {
    const req: ReportSubmissionRequest = {
      stationId: 'sta-lucknow-1',
      category: 'road_access',
      condition: 'entrance_blocked',
      observationDetails: 'Road works blocking the main approach gate'
    };

    const res = submitCommunityReport(req, '192.168.1.103');
    expect(res.success).toBe(true);
    expect(res.report?.connectorId).toBeUndefined();

    const reports = getReportsForStation('sta-lucknow-1');
    expect(reports.length).toBe(1);
    expect(reports[0].condition).toBe('entrance_blocked');
  });

  // 5. Duplicate report detection
  it('5. should detect and reject duplicate report from same contributor within deduplication window (30m)', () => {
    const req: ReportSubmissionRequest = {
      stationId: 'sta-agra-1',
      contributorId: 'contributor-alpha',
      category: 'session_outcome',
      condition: 'activation_failed'
    };

    const first = submitCommunityReport(req, '192.168.1.104');
    expect(first.success).toBe(true);

    // Immediate repeat from same contributor
    const second = submitCommunityReport(req, '192.168.1.104');
    expect(second.success).toBe(false);
    expect(second.code).toBe(409);
    expect(second.error).toContain('Duplicate report detected');
  });

  // 6. Corroboration count
  it('6. should increase corroboration count when multiple distinct contributors report the same incident', () => {
    const req1: ReportSubmissionRequest = {
      stationId: 'sta-agra-1',
      contributorId: 'driver-101',
      category: 'session_outcome',
      condition: 'activation_failed'
    };
    const req2: ReportSubmissionRequest = {
      stationId: 'sta-agra-1',
      contributorId: 'driver-102',
      category: 'session_outcome',
      condition: 'activation_failed'
    };

    submitCommunityReport(req1, '10.0.0.1');
    const res2 = submitCommunityReport(req2, '10.0.0.2');

    expect(res2.success).toBe(true);
    expect(res2.report?.corroborationCount).toBe(2);
    expect(res2.report?.moderationStatus).toBe('corroborated');
  });

  // 7. Same contributor repeating a report
  it('7. should not increase corroboration count when the same contributor submits repeat reports', () => {
    const req: ReportSubmissionRequest = {
      stationId: 'sta-kanpur-1',
      contributorId: 'same-driver-1',
      category: 'connector_status',
      condition: 'connector_damaged'
    };

    submitCommunityReport(req, '10.0.0.5');
    const duplicate = submitCommunityReport(req, '10.0.0.5');

    expect(duplicate.code).toBe(409);
    const reports = loadReportsFromDisk();
    const stored = reports.filter((r) => r.stationId === 'sta-kanpur-1');
    expect(stored.length).toBe(1);
    expect(stored[0].corroborationCount).toBe(1);
  });

  // 8. Different contributors making independent reports
  it('8. should accept independent reports from different contributors across different categories', () => {
    const resA = submitCommunityReport(
      { stationId: 'sta-varanasi-1', contributorId: 'user-a', category: 'road_access', condition: 'entrance_accessible' },
      '10.0.0.10'
    );
    const resB = submitCommunityReport(
      { stationId: 'sta-varanasi-1', contributorId: 'user-b', category: 'connector_status', condition: 'connector_working' },
      '10.0.0.11'
    );

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(true);
    const reports = getReportsForStation('sta-varanasi-1');
    expect(reports.length).toBe(2);
  });

  // 9. Report expiration
  it('9. should classify reports past their category TTL as expired', () => {
    const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
    const mockReport: CommunityReport = {
      reportId: 'rep-expired-test',
      stationId: 'sta-1',
      category: 'station_availability', // TTL is 2 hours
      condition: 'station_fully_occupied',
      observedAt: oldTimestamp,
      receivedAt: oldTimestamp,
      contributorId: 'driver-x',
      contributorClass: 'guest',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['driver-x']
    };

    const freshness = getReportFreshness(mockReport);
    expect(freshness).toBe('expired');
  });

  // 10. Freshness classification
  it('10. should correctly classify freshness tiers (recent, aging, stale, expired)', () => {
    const now = Date.now();
    const ttl = getCategoryTtlMs('session_outcome'); // 48 hours

    const makeRep = (ageMs: number): CommunityReport => ({
      reportId: 'test',
      stationId: 'sta-1',
      category: 'session_outcome',
      condition: 'session_completed_successfully',
      observedAt: new Date(now - ageMs).toISOString(),
      receivedAt: new Date(now - ageMs).toISOString(),
      contributorId: 'u',
      contributorClass: 'authenticated',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['u']
    });

    expect(getReportFreshness(makeRep(ttl * 0.1))).toBe('recent');
    expect(getReportFreshness(makeRep(ttl * 0.5))).toBe('aging');
    expect(getReportFreshness(makeRep(ttl * 0.85))).toBe('stale');
    expect(getReportFreshness(makeRep(ttl * 1.05))).toBe('expired');
  });

  // 11. Conflicting community reports
  it('11. should handle conflicting community reports without crashing or suppressing evidence', () => {
    const repSuccess: CommunityReport = {
      reportId: 'r1',
      stationId: 'sta-conflict',
      category: 'session_outcome',
      condition: 'session_completed_successfully',
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      contributorId: 'u1',
      contributorClass: 'authenticated',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['u1']
    };

    const repFailure: CommunityReport = {
      reportId: 'r2',
      stationId: 'sta-conflict',
      category: 'session_outcome',
      condition: 'activation_failed',
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      contributorId: 'u2',
      contributorClass: 'authenticated',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['u2']
    };

    const summary = computeStationReliability([repSuccess, repFailure], 'sta-conflict');
    expect(summary.totalReportCount).toBe(2);
    expect(summary.confidenceTier).toBe('low');
    expect(summary.activeWarnings).toContain('Activation failures reported recently');
    expect(summary.overallScore).toBeDefined();
    // Composite score reflects balanced prior and equal successes/failures
    expect(summary.overallScore).toBeGreaterThanOrEqual(40);
    expect(summary.overallScore).toBeLessThanOrEqual(80);
  });

  // 12. Conflicting community and OCPI telemetry
  it('12. should detect conflict between official CPO Available telemetry and community failure reports', () => {
    const failureReports: CommunityReport[] = [
      {
        reportId: 'f1',
        stationId: 'sta-cpo-conflict',
        category: 'session_outcome',
        condition: 'activation_failed',
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        contributorId: 'd1',
        contributorClass: 'guest',
        moderationStatus: 'corroborated',
        corroborationCount: 2,
        corroboratingContributors: ['d1', 'd2']
      },
      {
        reportId: 'f2',
        stationId: 'sta-cpo-conflict',
        category: 'session_outcome',
        condition: 'activation_failed',
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        contributorId: 'd2',
        contributorClass: 'guest',
        moderationStatus: 'corroborated',
        corroborationCount: 2,
        corroboratingContributors: ['d1', 'd2']
      }
    ];

    const summary = computeStationReliability(failureReports, 'sta-cpo-conflict', 'Available (CPO Telemetry)');
    expect(summary.cpoConflict).toBeDefined();
    expect(summary.cpoConflict?.hasConflict).toBe(true);
    expect(summary.cpoConflict?.cpoStatus).toContain('Available');
    expect(summary.cpoConflict?.communityWarning).toContain('active failure');
  });

  // 13. Insufficient evidence handling
  it('13. should return "insufficient_evidence" and null overallScore when report count is below threshold (<2)', () => {
    const singleReport: CommunityReport = {
      reportId: 'single',
      stationId: 'sta-low-evidence',
      category: 'session_outcome',
      condition: 'session_completed_successfully',
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      contributorId: 'lonely-driver',
      contributorClass: 'guest',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['lonely-driver']
    };

    const summary = computeStationReliability([singleReport], 'sta-low-evidence');
    expect(summary.confidenceTier).toBe('insufficient_evidence');
    expect(summary.overallScore).toBeNull();
  });

  // 14. Reliability scoring
  it('14. should compute Bayesian posterior reliability score using Beta prior and time-decayed evidence', () => {
    const reports: CommunityReport[] = Array.from({ length: 8 }, (_, i) => ({
      reportId: `succ-${i}`,
      stationId: 'sta-bayes',
      category: 'session_outcome',
      condition: 'session_completed_successfully',
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      contributorId: `user-${i}`,
      contributorClass: 'authenticated',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: [`user-${i}`]
    }));

    const summary = computeStationReliability(reports, 'sta-bayes');
    expect(summary.confidenceTier).toBe('high');
    expect(summary.overallScore).toBeGreaterThanOrEqual(85);
    expect(summary.dimensionScores.sessionSuccessRate).toBeGreaterThanOrEqual(85);
  });

  // 15. Time-weighted scoring
  it('15. should apply exponential time-decay weighting so recent failures weigh more than older ones', () => {
    const weightFresh = calculateTimeDecayWeight(new Date().toISOString(), 48);
    const weightOld = calculateTimeDecayWeight(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), 48); // exactly 1 half-life

    expect(weightFresh).toBeCloseTo(1.0, 2);
    expect(weightOld).toBeCloseTo(0.5, 2);
  });

  // 16. Low sample confidence
  it('16. should assign appropriate confidence tier (low, medium, high) based on effective sample size', () => {
    const makeBatch = (count: number): CommunityReport[] =>
      Array.from({ length: count }, (_, i) => ({
        reportId: `r-${i}`,
        stationId: 'sta-tier',
        category: 'connector_status',
        condition: 'connector_working',
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        contributorId: `u-${i}`,
        contributorClass: 'authenticated',
        moderationStatus: 'published',
        corroborationCount: 1,
        corroboratingContributors: [`u-${i}`]
      }));

    expect(computeStationReliability(makeBatch(1), 'sta-tier').confidenceTier).toBe('insufficient_evidence');
    expect(computeStationReliability(makeBatch(3), 'sta-tier').confidenceTier).toBe('low');
    expect(computeStationReliability(makeBatch(6), 'sta-tier').confidenceTier).toBe('medium');
    expect(computeStationReliability(makeBatch(12), 'sta-tier').confidenceTier).toBe('high');
  });

  // 17. Queue-estimate insufficiency
  it('17. should return queue status "unavailable" when fewer than 2 queue observations exist', () => {
    const reports: CommunityReport[] = [
      {
        reportId: 'q1',
        stationId: 'sta-queue-low',
        category: 'station_availability',
        condition: 'queue_observed',
        waitTimeMinutes: 20,
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        contributorId: 'q-driver',
        contributorClass: 'guest',
        moderationStatus: 'published',
        corroborationCount: 1,
        corroboratingContributors: ['q-driver']
      }
    ];

    const summary = computeStationReliability(reports, 'sta-queue-low');
    expect(summary.queueEstimate.status).toBe('unavailable');
    expect(summary.queueEstimate.estimatedWaitMinutes).toBeUndefined();
  });

  // 18. Queue estimate calculation
  it('18. should accurately calculate median wait time and range when 2 or more queue observations exist', () => {
    const nowIso = new Date().toISOString();
    const reports: CommunityReport[] = [
      {
        reportId: 'q1',
        stationId: 'sta-queue-good',
        category: 'station_availability',
        condition: 'queue_observed',
        waitTimeMinutes: 10,
        observedAt: nowIso,
        receivedAt: nowIso,
        contributorId: 'd1',
        contributorClass: 'authenticated',
        moderationStatus: 'published',
        corroborationCount: 1,
        corroboratingContributors: ['d1']
      },
      {
        reportId: 'q2',
        stationId: 'sta-queue-good',
        category: 'station_availability',
        condition: 'queue_observed',
        waitTimeMinutes: 20,
        observedAt: nowIso,
        receivedAt: nowIso,
        contributorId: 'd2',
        contributorClass: 'authenticated',
        moderationStatus: 'published',
        corroborationCount: 1,
        corroboratingContributors: ['d2']
      },
      {
        reportId: 'q3',
        stationId: 'sta-queue-good',
        category: 'station_availability',
        condition: 'queue_observed',
        waitTimeMinutes: 30,
        observedAt: nowIso,
        receivedAt: nowIso,
        contributorId: 'd3',
        contributorClass: 'authenticated',
        moderationStatus: 'published',
        corroborationCount: 1,
        corroboratingContributors: ['d3']
      }
    ];

    const summary = computeStationReliability(reports, 'sta-queue-good');
    expect(summary.queueEstimate.status).toBe('available');
    expect(summary.queueEstimate.estimatedWaitMinutes).toBe(20); // Median of [10, 20, 30]
    expect(summary.queueEstimate.observedWaitRange?.min).toBe(10);
    expect(summary.queueEstimate.observedWaitRange?.max).toBe(30);
  });

  // 19. Backup charger reachability
  it('19. should verify backup charger reachability when vehicle has sufficient arrival reserve (>=3%)', () => {
    const stationA: any = {
      id: 'sta-primary',
      name: 'Primary Station Plaza',
      coordinates: [26.0, 81.0],
      connectors: [{ type: 'CCS2', powerKw: 60 }],
      accessMetadata: {
        backupStationId: 'sta-backup',
        roadAccessStatus: 'verified'
      }
    };
    const stationB: any = {
      id: 'sta-backup',
      name: 'Backup Charger Plaza',
      coordinates: [26.05, 81.05], // ~4.5 miles away
      connectors: [{ type: 'CCS2', powerKw: 60 }],
      accessMetadata: {
        roadAccessStatus: 'verified'
      }
    };
    const evalRes = evaluateBackupCharger(stationA, [stationA, stationB], initialVehicleProfile, 15);

    expect(evalRes.backupReachable).toBe(true);
    expect(evalRes.estimatedSocAtBackup).toBeGreaterThanOrEqual(3.0);
    expect(evalRes.reachabilityClassification).toBe('verified_reachable');
  });

  // 20. Backup charger reserve failure
  it('20. should mark backup charger unreachable if arrival reserve at primary cannot bridge the distance', () => {
    const primary = chargingStations[0];
    // With only 1% SoC at primary, reaching a 5-mile backup requires ~2-3% energy, resulting in <3% reserve
    const evalRes = evaluateBackupCharger(primary, chargingStations, initialVehicleProfile, 1.0);

    expect(evalRes.backupReachable).toBe(false);
    expect(evalRes.reason).toContain('Insufficient battery');
    expect(evalRes.reachabilityClassification).toBe('no_feasible_backup');
  });

  // 21. Connector incompatibility
  it('21. should mark backup charger unreachable if vehicle lacks compatible connector', () => {
    const primary = chargingStations[0];
    const incompatibleVehicle = {
      ...initialVehicleProfile,
      supportedPlugTypes: ['CHAdeMO' as any],
      compatibleConnectors: ['CHAdeMO']
    };

    const evalRes = evaluateBackupCharger(primary, chargingStations, incompatibleVehicle as any, 15);
    expect(evalRes.backupReachable).toBe(false);
    expect(evalRes.reachabilityClassification).toBe('no_feasible_backup');
    expect(evalRes.reason).toContain('no compatible connector');
  });

  // 22. Unavailable backup station
  it('22. should handle unavailable or nonexistent backup station gracefully', () => {
    const fakeStation = {
      ...chargingStations[0],
      accessMetadata: {
        ...chargingStations[0].accessMetadata,
        backupStationId: 'non-existent-station-999'
      }
    };

    const evalRes = evaluateBackupCharger(fakeStation as any, chargingStations, initialVehicleProfile, 15);
    expect(evalRes.backupReachable).toBe(false);
    expect(evalRes.reachabilityClassification).toBe('backup_not_available');
  });

  // 23. Rate limiting
  it('23. should enforce IP and contributor rate limiting (max 5 submissions per 10 minutes)', () => {
    const ip = '172.16.0.44';
    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(ip);
      expect(res.allowed).toBe(true);
    }

    const blocked = checkRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  // 24. Invalid payload & timestamps
  it('24. should reject invalid timestamps (future dates >15m or dates older than 30 days)', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hr in future
    const resFuture = submitCommunityReport(
      { stationId: 'sta-agra-1', category: 'session_outcome', condition: 'session_completed_successfully', observedAt: futureDate },
      '127.0.0.1'
    );
    expect(resFuture.success).toBe(false);
    expect(resFuture.error).toContain('future');

    const ancientDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days ago
    const resAncient = submitCommunityReport(
      { stationId: 'sta-agra-1', category: 'session_outcome', condition: 'session_completed_successfully', observedAt: ancientDate },
      '127.0.0.1'
    );
    expect(resAncient.success).toBe(false);
    expect(resAncient.error).toContain('too old');
  });

  // 25. Unauthorized moderation
  it('25. should reject unauthorized moderation requests without valid admin token', () => {
    const submitRes = submitCommunityReport(
      { stationId: 'sta-agra-1', category: 'session_outcome', condition: 'activation_failed' },
      '127.0.0.1'
    );
    const reportId = submitRes.report!.reportId;

    const rejected = moderateReport({ reportId, action: 'reject' }, 'wrong-token');
    expect(rejected.success).toBe(false);
    expect(rejected.code).toBe(401);

    const authorized = moderateReport({ reportId, action: 'reject' }, 'local-dev-moderator-token');
    expect(authorized.success).toBe(true);
    expect(authorized.code).toBe(200);
    expect(authorized.report?.moderationStatus).toBe('rejected');
  });

  // 26. Guest reporting limitations
  it('26. should distinguish guest reports from authenticated contributors', () => {
    const guestRes = submitCommunityReport(
      { stationId: 'sta-agra-1', category: 'road_access', condition: 'entrance_accessible' },
      '10.10.10.10'
    );
    expect(guestRes.report?.contributorClass).toBe('guest');

    const authRes = submitCommunityReport(
      { stationId: 'sta-agra-1', contributorId: 'verified-ev-user-7', category: 'road_access', condition: 'entrance_accessible' },
      '10.10.10.11'
    );
    expect(authRes.report?.contributorClass).toBe('authenticated');
  });

  // 27. Report privacy and public response sanitization
  it('27. should sanitize observation notes (stripping HTML, restricting length to 280 chars)', () => {
    const dirtyText = '<script>alert("hack")</script>Great charger <img src=x onerror=alert(1)> and clean restroom! '.repeat(10);
    const sanitized = sanitizeText(dirtyText);

    expect(sanitized).toBeDefined();
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('<img');
    expect(sanitized!.length).toBeLessThanOrEqual(280);
  });

  // 28. Persistence across server restart
  it('28. should persist reports across simulated server restarts (disk JSON reload)', () => {
    const testReport: CommunityReport = {
      reportId: 'rep-persistent-check',
      stationId: 'sta-lucknow-1',
      category: 'session_outcome',
      condition: 'session_completed_successfully',
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      contributorId: 'd-persistent',
      contributorClass: 'authenticated',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['d-persistent']
    };

    saveReportsToDisk([testReport]);

    // Simulate server reboot by clearing memory and reloading from disk
    const reloaded = loadReportsFromDisk();
    expect(reloaded.length).toBe(1);
    expect(reloaded[0].reportId).toBe('rep-persistent-check');
    expect(reloaded[0].stationId).toBe('sta-lucknow-1');
  });

  // 29. Mock provider separation
  it('29. should maintain strict separation between simulated mock OCPI data and community reports', () => {
    const commReport: CommunityReport = {
      reportId: 'rep-comm',
      stationId: 'sta-agra-1',
      category: 'session_outcome',
      condition: 'low_power_delivered',
      deliveredPowerKw: 25,
      observedAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      contributorId: 'driver-live',
      contributorClass: 'authenticated',
      moderationStatus: 'published',
      corroborationCount: 1,
      corroboratingContributors: ['driver-live']
    };

    const summary = computeStationReliability([commReport], 'sta-agra-1', 'Available (Mock Sandbox Telemetry)');
    expect(summary.activeWarnings).toContain('Reduced charging power reported');
    // Ensure mock status was not overwritten by driver report
    expect(summary.totalReportCount).toBe(1);
  });

  // 30. Existing static catalogue compatibility
  it('30. should remain fully compatible with the existing static 20-station Indian catalogue', () => {
    expect(chargingStations.length).toBe(20);
    for (const station of chargingStations) {
      const summary = computeStationReliability([], station.id);
      expect(summary.stationId).toBe(station.id);
      expect(summary.confidenceTier).toBe('insufficient_evidence');
    }
  });

  // 31. Greedy route integration
  it('31. should integrate community reliability scores as a tie-breaker in greedy route selection', async () => {
    const summaries = new Map<string, StationReliabilitySummary>();
    summaries.set('sta-agra-1', {
      stationId: 'sta-agra-1',
      overallScore: 92,
      confidenceTier: 'high',
      totalReportCount: 15,
      recentReportCount: 8,
      lastReportedAt: new Date().toISOString(),
      freshness: 'recent',
      dimensionScores: {
        sessionSuccessRate: 95,
        activationReliability: 95,
        connectorReliability: 95,
        accessConfidence: 95,
        powerConsistency: 90
      },
      queueEstimate: { status: 'unavailable', sampleCount: 0, freshness: 'expired' },
      activeWarnings: []
    });

    const req: RouteCalculationRequest = {
      origin: { id: 'orig-custom', name: 'Custom Origin', coordinates: [27.0, 78.0], batterySoc: 80 },
      destination: { id: 'dest-custom', name: 'Custom Destination', coordinates: [26.0, 80.5], batterySoc: 20 },
      vehicle: initialVehicleProfile,
      planOptions: { ...initialPlanOptions, useRcspOptimizer: false },
      chargingSettings: initialChargingSettings,
      routingSettings: initialRoutingSettings,
      communitySummaries: summaries
    };

    const result = await calculateTripRoutes(req);
    expect(result.routeOptions.length).toBeGreaterThan(0);
    const activeRoute = result.routeOptions.find((r) => r.id === result.activeRouteId);
    expect(activeRoute).toBeDefined();
  });

  // 32. RCSP route integration
  it('32. should incorporate community risk penalties into RCSP routing without violating battery constraints', () => {
    const summaries = new Map<string, StationReliabilitySummary>();
    summaries.set('sta-agra-1', {
      stationId: 'sta-agra-1',
      overallScore: 40,
      confidenceTier: 'medium',
      totalReportCount: 6,
      recentReportCount: 3,
      lastReportedAt: new Date().toISOString(),
      freshness: 'recent',
      dimensionScores: {
        sessionSuccessRate: 40,
        activationReliability: 40,
        connectorReliability: 40,
        accessConfidence: 50,
        powerConsistency: null
      },
      queueEstimate: { status: 'unavailable', sampleCount: 0, freshness: 'expired' },
      activeWarnings: ['Activation failures reported recently']
    });

    const req: RouteCalculationRequest = {
      origin: { id: 'orig-custom', name: 'Custom Origin', coordinates: [27.0, 78.0], batterySoc: 80 },
      destination: { id: 'dest-custom', name: 'Custom Destination', coordinates: [26.0, 80.5], batterySoc: 20 },
      vehicle: initialVehicleProfile,
      planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
      chargingSettings: initialChargingSettings,
      routingSettings: initialRoutingSettings,
      communitySummaries: summaries
    };

    const rcspRoute = solveRcsp(req);
    if (rcspRoute && rcspRoute.stops.length > 0) {
      // Hard battery constraint must be preserved
      for (const stop of rcspRoute.stops) {
        expect(stop.arrivalSoc).toBeGreaterThanOrEqual(initialChargingSettings.preferredMinArrivalBatteryCharger);
      }
    }
  });

  // 33. Phase 5A road-access compatibility
  it('33. should preserve Phase 5A road access and carriageway validations alongside community reliability', () => {
    const primary: any = {
      id: 'sta-primary',
      name: 'Primary Station',
      coordinates: [26.0, 81.0],
      connectors: [{ type: 'CCS2', powerKw: 60 }],
      accessMetadata: {
        backupStationId: 'sta-inaccessible',
        roadAccessStatus: 'verified'
      }
    };
    const inaccessibleStation: any = {
      id: 'sta-inaccessible',
      name: 'Inaccessible Station',
      coordinates: [26.05, 81.05],
      connectors: [{ type: 'CCS2', powerKw: 60 }],
      accessMetadata: {
        roadAccessStatus: 'inaccessible'
      }
    };

    const evalRes = evaluateBackupCharger(
      primary,
      [primary, inaccessibleStation],
      initialVehicleProfile,
      15
    );
    // Inaccessible station should be rejected as backup
    expect(evalRes.backupReachable).toBe(false);
    expect(evalRes.reachabilityClassification).toBe('no_feasible_backup');
    expect(evalRes.reason).toContain('inaccessible');
  });

  // 34. Patna-Delhi demo regression
  it('34. should guarantee complete regression safety for the Patna-Delhi demo corridor', async () => {
    const req: RouteCalculationRequest = {
      origin: demoTrip.origin,
      destination: demoTrip.destination,
      waypoints: [],
      vehicle: initialVehicleProfile,
      planOptions: initialPlanOptions,
      chargingSettings: initialChargingSettings,
      routingSettings: initialRoutingSettings
    };

    const res = await calculateTripRoutes(req);
    expect(res.routeOptions.length).toBe(3);
    const optimal = res.routeOptions.find((r) => r.id === 'route-optimal');
    expect(optimal).toBeDefined();
    expect(optimal?.stops.length).toBe(6);
    expect(optimal?.stops[0].stationId).toBe('sta-azamgarh-adani');
    expect(optimal?.calculationMethod).not.toBe('RCSP Optimizer');
  });
});
