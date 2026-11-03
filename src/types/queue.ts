/**
 * Phase 6G: Smart Charging Queue, Waiting-Time Prediction & Priority Queue Types
 * Additive data model for real-time occupancy, queue waiting prediction, and station ranking.
 */

import { ChargingStation, SupportedConnectorType } from './station';

export type QueueDataSource =
  | 'operator_managed_queue'   // Operator actively managing individual vehicle FIFO queue
  | 'operator_aggregate_report' // Authorized operator reported aggregate count
  | 'hardware_telemetry'       // Automated live equipment telemetry (OCPI / EVSE controller)
  | 'operator_live'           // Authorized CPO live API (EVSE status & active sessions)
  | 'verified_availability'   // Verified dynamic third-party aggregator feed
  | 'community_report'        // Voluntary crowd reports from EV drivers at the station
  | 'simulated_queue'         // Illustrative simulated queue for unmonitored corridor stations
  | 'historical_estimate'     // Statistical model based on observed historical patterns
  | 'unavailable';            // No live or reported queue data exists

export type QueueConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type QueueEntryStatus =
  | 'WAITING'
  | 'CALLED'
  | 'ASSIGNED'
  | 'CHARGING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type OperatorRole =
  | 'driver'
  | 'charging_operator_owner'
  | 'charging_operator_admin'
  | 'station_manager'
  | 'station_operator'
  | 'operator_auditor'
  | 'platform_admin';

export type OrganisationVerificationStatus =
  | 'pending_verification'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface Organisation {
  id: string;
  name: string;
  cpoBrand: string;
  verificationStatus: OrganisationVerificationStatus;
  contactEmail: string;
  contactPhone?: string;
  ownerUserId: string;
  createdAt: number;
  approvedAt?: number;
  approvedBy?: string;
  claimedStationIds: string[];
}

export interface OperatorUser {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  organisationId?: string;
  assignedStationIds?: string[];
  isVerified: boolean;
  createdAt: number;
}

export interface StationClaim {
  id: string;
  stationId: string;
  stationName: string;
  organisationId: string;
  organisationName: string;
  requestedBy: string;
  requesterEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  cpoProofNotes?: string;
}

export type EVSEStatus =
  | 'available'
  | 'charging'
  | 'occupied'
  | 'faulted'
  | 'out_of_service'
  | 'unknown';

export type ConnectorOperationalStatus =
  | 'available'
  | 'occupied'
  | 'charging'
  | 'faulted'
  | 'reserved';

export interface StationConnector {
  id: string;
  evseId: string;
  connectorType: SupportedConnectorType | string;
  maxPowerKw: number;
  status: ConnectorOperationalStatus;
  currentSessionId?: string;
  currentQueueEntryId?: string;
  lastStatusUpdate: number;
}

export interface EVSE {
  id: string;
  stationId: string;
  evseIdentifier: string; // e.g. "EVSE-01", "Bay A"
  status: EVSEStatus;
  connectors: StationConnector[];
}

export interface ChargingSession {
  id: string;
  stationId: string;
  evseId: string;
  connectorId: string;
  connectorType: string;
  queueEntryId?: string;
  driverId?: string;
  vehicleModel?: string;
  startSocPercent?: number;
  currentSocPercent?: number;
  targetSocPercent?: number;
  powerKw: number;
  energyDeliveredKwh: number;
  startTime: number;
  projectedEndTime: number;
  actualEndTime?: number;
  status: 'active' | 'completed' | 'stopped' | 'faulted';
  operatorNotes?: string;
}

export interface QueueEntryAuditRecord {
  timestamp: number;
  actor: string;
  actorRole: string;
  fromStatus?: QueueEntryStatus;
  toStatus: QueueEntryStatus;
  note?: string;
}

export interface QueueEntry {
  id: string;
  stationId: string;
  connectorType: SupportedConnectorType | string;
  checkInTime: number;
  queuePosition: number;
  status: QueueEntryStatus;
  reportingSource: 'operator_portal' | 'driver_qr_checkin' | 'manual_operator_entry' | 'telemetry';
  vehicleModel?: string;
  vehicleRegLast4?: string;
  driverName?: string;
  driverPhone?: string;
  driverId?: string;
  estimatedEnergyKwh?: number;
  estimatedDurationMinutes?: number;
  assignedEvseId?: string;
  assignedConnectorId?: string;
  assignedSessionId?: string;
  calledTime?: number;
  assignedTime?: number;
  chargingStartTime?: number;
  completedTime?: number;
  lastUpdatedAt: number;
  auditHistory: QueueEntryAuditRecord[];
}

export interface OperatorAggregateReport {
  id: string;
  stationId: string;
  connectorType: SupportedConnectorType | string;
  vehiclesWaiting: number;
  isUnavailable: boolean;
  reportedBy: string;
  reportedByRole: string;
  timestamp: number;
  note?: string;
}

export interface OperationalQueueEvent {
  id: string;
  type:
    | 'VEHICLE_JOINED_QUEUE'
    | 'QUEUE_POSITION_CHANGED'
    | 'VEHICLE_CALLED'
    | 'CONNECTOR_ASSIGNED'
    | 'CHARGING_STARTED'
    | 'CHARGING_COMPLETED'
    | 'CONNECTOR_AVAILABLE'
    | 'CONNECTOR_FAULTED'
    | 'AGGREGATE_COUNT_UPDATED'
    | 'STATION_QUEUE_UNAVAILABLE'
    | 'STATION_CROWDED';
  stationId: string;
  connectorType: string;
  queueEntryId?: string;
  evseId?: string;
  connectorId?: string;
  sessionId?: string;
  payload: Record<string, any>;
  timestamp: number;
  actor: string;
}

export type RecommendationPriority =
  | 'best_overall_trip_time' // Lowest total stop impact (detour + queue wait + charging)
  | 'shortest_queue'         // Minimum queue waiting time at arrival
  | 'fastest_charging'       // Highest power / lowest charging duration
  | 'lowest_cost'            // Lowest charging tariff / expense
  | 'most_reliable';         // Highest community reliability score

export type QueueReportAction =
  | 'no_waiting'             // 0 vehicles waiting
  | '1_waiting'              // 1 vehicle in queue
  | '2_waiting'              // 2 vehicles in queue
  | '3_waiting'              // 3 vehicles in queue
  | '4_plus_waiting'         // 4 or more vehicles in queue
  | 'charger_available'      // At least 1 compatible stall is free right now
  | 'all_occupied'           // All compatible stalls in use, no free stall
  | 'charger_fault'          // Equipment out of order / fault
  | 'queue_cleared'          // Queue has dissipated
  | 'custom_count';          // User entered exact vehicle count

export interface ConnectorQueueStatus {
  connectorType: SupportedConnectorType | string;
  totalPoints: number;
  availablePoints: number;
  occupiedPoints: number;
  outOfOrderPoints: number;
  vehiclesWaiting: number;
  peopleWaiting?: number;
  estimatedWaitMinutes: number | null;
  estimatedWaitRange?: [number, number];
  nextAvailableTime?: string | null;
  confidence: QueueConfidence;
  dataSource: QueueDataSource;
  updatedAt: number;
  // Phase 6I additions:
  activeSessionCount?: number;
  queueEntries?: QueueEntry[];
  operatorAggregateCount?: number | null;
  isAuthoritativeOperator?: boolean;
}

export interface StationQueueData {
  stationId: string;
  stationName: string;
  connectorQueues: Record<string, ConnectorQueueStatus>; // keyed by canonical connector type (e.g. CCS2, Type 2)
  overallVehiclesWaiting: number;
  primaryDataSource: QueueDataSource;
  confidence: QueueConfidence;
  lastReportedTimestamp: number;
  reportCountRecent: number;
  isStale: boolean;
  // Phase 6I additions:
  activeSessionCount?: number;
  evsesTotal?: number;
  connectorsTotal?: number;
  connectorsAvailable?: number;
  connectorsOccupied?: number;
  connectorsFaulted?: number;
  operatorManaged?: boolean;
  organisationName?: string;
}

export interface CommunityQueueReport {
  id: string;
  stationId: string;
  stationName: string;
  connectorType?: string;
  action: QueueReportAction;
  vehiclesWaiting: number;
  peopleWaiting?: number;
  comment?: string;
  reporterPseudonym: string;
  timestamp: number;
  isGeofenceVerified: boolean;
  distanceFromStationMeters?: number;
}

export interface QueueReportSubmission {
  stationId: string;
  stationName: string;
  connectorType?: string;
  action: QueueReportAction;
  vehiclesWaiting?: number;
  peopleWaiting?: number;
  comment?: string;
  reporterCoordinates?: [number, number];
}

export interface QueueArrivalPrediction {
  stationId: string;
  connectorType: string;
  expectedArrivalTime: string; // Formatted local time (e.g. "03:15 PM IST")
  arrivalTimestampMs: number;
  estimatedWaitAtArrivalMinutes: number | null;
  estimatedWaitRange?: [number, number];
  estimatedPlugInTime: string | null; // e.g. "03:25 PM IST"
  estimatedChargeDurationMinutes: number;
  estimatedDepartureTime: string | null; // e.g. "03:57 PM IST"
  projectedStallsAvailable: number;
  projectedVehiclesWaiting: number;
  confidence: QueueConfidence;
  dataSource: QueueDataSource;
  predictionRationale: string;
}

export interface StationRecommendationCandidate {
  station: ChargingStation;
  connectorType: string;
  powerKw: number;
  detourDistanceMi: number;
  detourDurationMinutes: number;
  expectedArrivalTime: string;
  arrivalTimestampMs: number;
  queueStatus: ConnectorQueueStatus | null;
  prediction: QueueArrivalPrediction | null;
  estimatedWaitMinutes: number;
  estimatedChargeMinutes: number;
  totalStopImpactMinutes: number; // Detour + Wait + Charge
  estimatedPriceInr: number;
  reliabilityScore: number | null;
  isFeasible: boolean;
  feasibilityReason?: string;
  recommendationRank: number;
  isBestChoice: boolean;
  bestChoiceRationale?: string;
}

export interface StationPriorityQueueOptions {
  priority: RecommendationPriority;
  maxCandidates?: number;
  minPowerKw?: number;
  requiredConnectorType?: string;
  userSoCArrivalBufferPercent?: number;
}

export interface NationalCoverageOverview {
  totalNationalStations: number;
  claimedStationsCount: number;
  pendingClaimsCount: number;
  approvedStationsCount: number;
  verifiedEquipmentStationsCount: number;
  individualQueueStationsCount: number;
  aggregateReportStationsCount: number;
  telemetryStationsCount: number;
  communityOnlyStationsCount: number;
  unmonitoredStationsCount: number;
  staleStationsCount: number;
  activeOperatorHubs: Array<{
    stationId: string;
    stationName: string;
    cpoBrand: string;
    status: string;
    connectorsTotal: number;
    connectorsAvailable: number;
    vehiclesWaiting: number;
    queueMode: 'Method A (FIFO)' | 'Method B (Aggregate)';
  }>;
}


