/**
 * Real Live Traffic Provider Types & Interfaces
 * Phase 6B: Provider-independent traffic abstractions
 */

export type TrafficDataStatus =
  | 'live'
  | 'stale'
  | 'unavailable'
  | 'unsupported'
  | 'missing_credentials'
  | 'error';

export type TrafficCongestionLevel =
  | 'free_flow' // Normal, green (>= 0.90 speed ratio)
  | 'minor'     // Slight delay, light green/yellow (0.75 <= ratio < 0.90)
  | 'moderate'  // Noticeable slowdown, amber/orange (0.50 <= ratio < 0.75)
  | 'heavy'     // Congestion, red (< 0.50)
  | 'blocked'   // Road closed / blocked, dark crimson
  | 'unknown';  // Traffic unknown / no coverage, neutral slate

export interface TrafficSegment {
  id: string;
  coordinates: [number, number][]; // [[lat, lng], ...]
  congestionLevel: TrafficCongestionLevel;
  currentSpeedKph?: number;
  freeFlowSpeedKph?: number;
  currentSpeedMph?: number;
  freeFlowSpeedMph?: number;
  speedRatio?: number; // current / free-flow (e.g. 0.4 = 40% of normal speed)
  delaySeconds?: number;
  roadName?: string;
  roadClosed?: boolean;
  provider?: string;
  confidence?: number;
  lastUpdated?: string;
}

export type IncidentCategory =
  | 'accident'
  | 'construction'
  | 'road_closure'
  | 'hazard'
  | 'congestion'
  | 'weather'
  | 'other';

export interface TrafficIncident {
  id: string;
  category: IncidentCategory;
  description: string;
  coordinates: [number, number]; // [lat, lng]
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  startTime?: string;
  endTime?: string;
  delaySeconds?: number;
  roadClosed?: boolean;
}

export interface TrafficFlowResult {
  status: TrafficDataStatus;
  provider: string; // e.g. 'TomTom Orbis Traffic'
  timestamp: string; // ISO timestamp
  lastUpdatedMinutesAgo: number;
  segments: TrafficSegment[];
  incidents: TrafficIncident[];
  trafficTileUrlTemplate?: string;
  attribution: string;
  coverageSupported: boolean;
  notes?: string;
}

export interface TrafficRouteSummary {
  status: TrafficDataStatus;
  provider: string;
  trafficTravelTimeMinutes: number;
  freeFlowTravelTimeMinutes: number;
  trafficDelayMinutes: number;
  lastUpdated: string;
  segments: TrafficSegment[];
  incidents: TrafficIncident[];
}

export interface TrafficProvider {
  id: string;
  name: string;
  hasCredentials: () => boolean;
  getTrafficFlow: (bbox: [number, number, number, number]) => Promise<TrafficFlowResult>;
  getTrafficIncidents: (bbox: [number, number, number, number]) => Promise<TrafficIncident[]>;
  getTrafficTileUrlTemplate: () => string | null;
}

