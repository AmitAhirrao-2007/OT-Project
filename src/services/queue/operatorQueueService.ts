/**
 * Operator Live Queue & Station Management Service
 * Phase 6I: Frontend client service for charging station operators, driver check-in,
 * equipment management, and national catalogue claim search.
 */

import {
  Organisation,
  OperatorUser,
  StationClaim,
  EVSE,
  QueueEntry,
  ChargingSession,
  StationQueueData,
  OperatorAggregateReport,
  NationalCoverageOverview
} from '../../types/queue';
import { ChargingStation } from '../../types/station';

const OPERATOR_USER_KEY = 'evsure_operator_user';
const OPERATOR_TOKEN_KEY = 'evsure_operator_token';

export interface OperatorStationQueueResponse {
  stationId: string;
  queueData: StationQueueData | null;
  queueEntries: QueueEntry[];
  activeSessions: ChargingSession[];
  evses: EVSE[];
  timestamp: number;
}

export interface ManagedStationRecord {
  station: ChargingStation;
  claim?: StationClaim;
  queueData: StationQueueData | null;
  evses: EVSE[];
  activeSessionsCount: number;
  waitingCount: number;
}

export function getCurrentOperatorUser(): OperatorUser {
  try {
    const raw = localStorage.getItem(OPERATOR_USER_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  // Default seed user: Vikramaditya (Tata Power Agra Hub Manager)
  const defaultUser: OperatorUser = {
    id: 'user-tata-agra-manager',
    email: 'manager.agra@tatapower.com',
    name: 'Vikramaditya (Tata Power Agra Hub Manager)',
    role: 'station_manager',
    organisationId: 'org-tata-power',
    assignedStationIds: ['sta-pcs-58fad8f122f2', 'sta-pcs-940a9d6500c7'],
    isVerified: true,
    createdAt: Date.now()
  };
  return defaultUser;
}

export function setCurrentOperatorUser(user: OperatorUser, token?: string): void {
  try {
    localStorage.setItem(OPERATOR_USER_KEY, JSON.stringify(user));
    if (token) {
      localStorage.setItem(OPERATOR_TOKEN_KEY, token);
    } else {
      localStorage.setItem(OPERATOR_TOKEN_KEY, `tok-${user.id}`);
    }
  } catch {}
}

export function getCurrentOperatorToken(): string {
  try {
    const token = localStorage.getItem(OPERATOR_TOKEN_KEY);
    if (token) return token;
  } catch {}
  const user = getCurrentOperatorUser();
  return `tok-${user.id}`;
}

function getOperatorHeaders(): HeadersInit {
  const user = getCurrentOperatorUser();
  const token = getCurrentOperatorToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Actor-Email': user.email,
    'X-Actor-Role': user.role
  };
}

function notifyQueueUpdated(stationId?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('evsure:queue-updated', { detail: { stationId } }));
  }
}

export const operatorQueueService = {
  getCurrentUser(): OperatorUser {
    return getCurrentOperatorUser();
  },

  setCurrentUser(user: OperatorUser, token?: string): void {
    setCurrentOperatorUser(user, token);
  },

  async login(email: string, role?: string, name?: string): Promise<{ success: boolean; user: OperatorUser; token?: string }> {
    try {
      const res = await fetch('/api/operator/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, name })
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCurrentOperatorUser(data.user, data.token);
        return { success: true, user: data.user, token: data.token };
      }
      return { success: false, user: getCurrentOperatorUser() };
    } catch {
      return { success: false, user: getCurrentOperatorUser() };
    }
  },

  async getManagedStations(): Promise<ManagedStationRecord[]> {
    try {
      const res = await fetch('/api/operator/stations', { headers: getOperatorHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return data.stations || [];
    } catch {
      return [];
    }
  },

  async searchNationalCatalogue(params: {
    q?: string;
    state?: string;
    cpo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ stations: ChargingStation[]; totalCount: number }> {
    try {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set('q', params.q);
      if (params.state && params.state !== 'All') searchParams.set('state', params.state);
      if (params.cpo && params.cpo !== 'All') searchParams.set('cpo', params.cpo);
      if (params.limit) searchParams.set('limit', String(params.limit));
      if (params.offset) searchParams.set('offset', String(params.offset));

      const res = await fetch(`/api/operator/stations/search?${searchParams.toString()}`);
      if (!res.ok) return { stations: [], totalCount: 0 };
      const data = await res.json();
      return {
        stations: data.stations || [],
        totalCount: data.totalCount || 0
      };
    } catch {
      return { stations: [], totalCount: 0 };
    }
  },

  async getCoverageOverview(): Promise<NationalCoverageOverview | null> {
    try {
      const res = await fetch('/api/operator/coverage-overview', { headers: getOperatorHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      return data.overview || null;
    } catch {
      return null;
    }
  },

  async updateStationEquipment(
    stationId: string,
    evses: EVSE[]
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(`/api/operator/stations/${encodeURIComponent(stationId)}/equipment`, {
        method: 'PUT',
        headers: getOperatorHeaders(),
        body: JSON.stringify({ evses })
      });
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed updating station equipment'
      };
    }
  },

  async getOrganisations(): Promise<Organisation[]> {
    try {
      const res = await fetch('/api/operator/organisations', { headers: getOperatorHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return data.organisations || [];
    } catch {
      return [];
    }
  },

  async createOrganisation(org: {
    name: string;
    cpoBrand: string;
    contactEmail?: string;
    contactPhone?: string;
  }): Promise<{ success: boolean; organisation?: Organisation }> {
    try {
      const res = await fetch('/api/operator/organisations', {
        method: 'POST',
        headers: getOperatorHeaders(),
        body: JSON.stringify(org)
      });
      return await res.json();
    } catch {
      return { success: false };
    }
  },

  async updateOrganisationStatus(
    orgId: string,
    status: 'pending_verification' | 'approved' | 'rejected'
  ): Promise<{ success: boolean; organisation?: Organisation }> {
    try {
      const res = await fetch(`/api/operator/organisations/${encodeURIComponent(orgId)}/status`, {
        method: 'PATCH',
        headers: getOperatorHeaders(),
        body: JSON.stringify({ status })
      });
      return await res.json();
    } catch {
      return { success: false };
    }
  },

  async getStationClaims(): Promise<StationClaim[]> {
    try {
      const res = await fetch('/api/operator/claims', { headers: getOperatorHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return data.claims || [];
    } catch {
      return [];
    }
  },

  async submitStationClaim(
    stationId: string,
    stationName: string,
    organisationId: string,
    cpoProofNotes?: string
  ): Promise<{ success: boolean; claim?: StationClaim; message?: string }> {
    try {
      const res = await fetch('/api/operator/claims', {
        method: 'POST',
        headers: getOperatorHeaders(),
        body: JSON.stringify({ stationId, stationName, organisationId, cpoProofNotes })
      });
      return await res.json();
    } catch {
      return { success: false };
    }
  },

  async reviewStationClaim(
    claimId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<{ success: boolean; claim?: StationClaim }> {
    try {
      const res = await fetch(`/api/operator/claims/${encodeURIComponent(claimId)}`, {
        method: 'PATCH',
        headers: getOperatorHeaders(),
        body: JSON.stringify({ status, rejectionReason })
      });
      return await res.json();
    } catch {
      return { success: false };
    }
  },

  async getStationEquipment(stationId: string): Promise<EVSE[]> {
    try {
      const res = await fetch(`/api/operator/stations/${encodeURIComponent(stationId)}/equipment`, {
        headers: getOperatorHeaders()
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.evses || [];
    } catch {
      return [];
    }
  },

  async updateConnectorStatus(
    stationId: string,
    connectorId: string,
    status: 'available' | 'occupied' | 'charging' | 'faulted' | 'reserved'
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/connectors/${encodeURIComponent(connectorId)}`,
        {
          method: 'PATCH',
          headers: getOperatorHeaders(),
          body: JSON.stringify({ status })
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch {
      return { success: false };
    }
  },

  async getStationQueue(
    stationId: string,
    connectorType?: string
  ): Promise<OperatorStationQueueResponse | null> {
    try {
      let url = `/api/operator/stations/${encodeURIComponent(stationId)}/queue`;
      if (connectorType) {
        url += `?connectorType=${encodeURIComponent(connectorType)}`;
      }
      const res = await fetch(url, { headers: getOperatorHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async addVehicleToQueue(
    stationId: string,
    payload: {
      connectorType: string;
      vehicleModel?: string;
      vehicleRegLast4?: string;
      driverName?: string;
      estimatedEnergyKwh?: number;
      estimatedDurationMinutes?: number;
      source?: 'operator_portal' | 'driver_qr_checkin';
    }
  ): Promise<{ success: boolean; message: string; entry?: QueueEntry }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/queue-entries`,
        {
          method: 'POST',
          headers: getOperatorHeaders(),
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed adding vehicle to queue'
      };
    }
  },

  async callNextVehicle(
    stationId: string,
    connectorType: string = 'CCS2'
  ): Promise<{ success: boolean; message: string; entry?: QueueEntry }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/queue/call-next`,
        {
          method: 'POST',
          headers: getOperatorHeaders(),
          body: JSON.stringify({ connectorType })
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed calling next vehicle'
      };
    }
  },

  async assignConnector(
    stationId: string,
    entryId: string,
    connectorId: string
  ): Promise<{ success: boolean; message: string; entry?: QueueEntry }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/queue-entries/${encodeURIComponent(entryId)}/assign`,
        {
          method: 'POST',
          headers: getOperatorHeaders(),
          body: JSON.stringify({ connectorId })
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed assigning connector'
      };
    }
  },

  async startChargingSession(
    stationId: string,
    entryId: string
  ): Promise<{ success: boolean; message: string; session?: ChargingSession; entry?: QueueEntry }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/queue-entries/${encodeURIComponent(entryId)}/start-session`,
        {
          method: 'POST',
          headers: getOperatorHeaders()
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed starting charging session'
      };
    }
  },

  async completeChargingSession(
    stationId: string,
    sessionId: string
  ): Promise<{ success: boolean; message: string; session?: ChargingSession }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/sessions/${encodeURIComponent(sessionId)}/complete`,
        {
          method: 'POST',
          headers: getOperatorHeaders()
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed completing charging session'
      };
    }
  },

  async cancelQueueEntry(
    stationId: string,
    entryId: string,
    reason: 'CANCELLED' | 'NO_SHOW',
    note?: string
  ): Promise<{ success: boolean; message: string; entry?: QueueEntry }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/queue-entries/${encodeURIComponent(entryId)}/cancel`,
        {
          method: 'POST',
          headers: getOperatorHeaders(),
          body: JSON.stringify({ reason, note })
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed updating queue entry'
      };
    }
  },

  async setOperatorAggregateCount(
    stationId: string,
    connectorType: string,
    count: number,
    isUnavailable?: boolean,
    note?: string
  ): Promise<{ success: boolean; message: string; report?: OperatorAggregateReport }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/queue-count`,
        {
          method: 'POST',
          headers: getOperatorHeaders(),
          body: JSON.stringify({ connectorType, count, isUnavailable, note })
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed recording aggregate count'
      };
    }
  },

  async driverCheckIn(
    stationId: string,
    connectorType: string = 'CCS2',
    vehicleModel?: string,
    driverName?: string
  ): Promise<{ success: boolean; message: string; entry?: QueueEntry }> {
    try {
      const res = await fetch(
        `/api/operator/stations/${encodeURIComponent(stationId)}/driver-checkin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorType, vehicleModel, driverName })
        }
      );
      const data = await res.json();
      if (res.ok) {
        notifyQueueUpdated(stationId);
      }
      return data;
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Driver check-in failed'
      };
    }
  },

  async testCorruptionRecovery(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/operator/storage/recover', {
        method: 'POST',
        headers: getOperatorHeaders()
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Recovery test failed'
      };
    }
  }
};
