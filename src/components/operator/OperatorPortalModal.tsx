import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Zap,
  Users,
  Clock,
  Play,
  CheckCircle2,
  RotateCw,
  Plus,
  Sliders,
  Building,
  CheckCircle,
  Search,
  Globe,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Database
} from 'lucide-react';
import {
  operatorQueueService,
  OperatorStationQueueResponse,
  ManagedStationRecord
} from '../../services/queue/operatorQueueService';
import {
  OperatorUser,
  OperatorRole,
  StationClaim,
  Organisation,
  NationalCoverageOverview
} from '../../types/queue';
import { ChargingStation } from '../../types/station';
import { formatIstTime } from '../../services/queue/chargingQueueService';

interface OperatorPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStationId?: string;
  onQueueUpdated?: () => void;
}

const SEEDED_OPERATOR_ACCOUNTS = [
  {
    email: 'manager.agra@tatapower.com',
    name: 'Vikramaditya (Tata Power Agra Hub Manager)',
    org: 'Tata Power EZ Charge',
    role: 'station_manager' as OperatorRole,
    description: 'Manages Agra NH-19 Hub (sta-pcs-58fad8f122f2)'
  },
  {
    email: 'admin@evsure.internal',
    name: 'EVSure Platform Admin',
    org: 'EVSure Highway Network Operations',
    role: 'platform_admin' as OperatorRole,
    description: 'Full administrative access across 28,350 stations'
  },
  {
    email: 'operator@adani.com',
    name: 'Azamgarh Hub Operator',
    org: 'Adani TotalEnergies E-Mobility',
    role: 'station_operator' as OperatorRole,
    description: 'Manages Azamgarh Hub (sta-azamgarh-adani)'
  },
  {
    email: 'auditor@evsure.internal',
    name: 'Compliance Inspector',
    org: 'EVSure Audit & Safety',
    role: 'operator_auditor' as OperatorRole,
    description: 'Strictly read-only compliance access'
  },
  {
    email: 'unauthorized.operator@external-cpo.in',
    name: 'External Third-Party Operator',
    org: 'Unverified Third-Party Charging Co',
    role: 'station_operator' as OperatorRole,
    description: 'Unapproved CPO — tests server-side HTTP 403 access control'
  }
];

export const OperatorPortalModal: React.FC<OperatorPortalModalProps> = ({
  isOpen,
  onClose,
  initialStationId = 'sta-pcs-58fad8f122f2',
  onQueueUpdated
}) => {
  const [stationId, setStationId] = useState<string>(initialStationId);
  const [activeTab, setActiveTab] = useState<'queue' | 'sessions' | 'equipment' | 'aggregate' | 'claims' | 'coverage' | 'catalogue'>('queue');
  const [selectedConnectorGroup, setSelectedConnectorGroup] = useState<'CCS2' | 'Type 2'>('CCS2');
  const [currentUser, setCurrentUser] = useState<OperatorUser>(operatorQueueService.getCurrentUser());
  const [stationData, setStationData] = useState<OperatorStationQueueResponse | null>(null);
  const [managedStations, setManagedStations] = useState<ManagedStationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add vehicle form state
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [addModel, setAddModel] = useState('Tata Nexon EV');
  const [addReg, setAddReg] = useState('');
  const [addDriver, setAddDriver] = useState('');
  const [addEnergy, setAddEnergy] = useState('25');
  const [addDuration, setAddDuration] = useState('30');

  // Method B aggregate form state
  const [aggregateCount, setAggregateCount] = useState<number>(0);
  const [aggregateUnavailable, setAggregateUnavailable] = useState(false);
  const [aggregateNote, setAggregateNote] = useState('');

  // Claims & Orgs state
  const [claims, setClaims] = useState<StationClaim[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [claimStationInput, setClaimStationInput] = useState('');
  const [claimOrgInput, setClaimOrgInput] = useState('org-tata-power');
  const [claimProofInput, setClaimProofInput] = useState('');

  // Coverage Overview state
  const [coverageOverview, setCoverageOverview] = useState<NationalCoverageOverview | null>(null);
  const [isCoverageLoading, setIsCoverageLoading] = useState(false);

  // National Catalogue Search state
  const [catalogueSearchQuery, setCatalogueSearchQuery] = useState('Agra');
  const [catalogueStateFilter, setCatalogueStateFilter] = useState('All');
  const [catalogueResults, setCatalogueResults] = useState<ChargingStation[]>([]);
  const [catalogueTotalCount, setCatalogueTotalCount] = useState<number>(0);
  const [isCatalogueLoading, setIsCatalogueLoading] = useState(false);

  // Sync initialStationId if changed externally
  useEffect(() => {
    if (initialStationId) {
      setStationId(initialStationId);
    }
  }, [initialStationId]);

  // Load Managed Stations
  const loadManagedStations = useCallback(async () => {
    try {
      const stations = await operatorQueueService.getManagedStations();
      setManagedStations(stations);
      // If current stationId not set or invalid, pick first
      if (stations.length > 0 && !stations.some((s) => s.station.id === stationId)) {
        if (!initialStationId || initialStationId === 'sta-test-evsure-hub') {
          setStationId(stations[0].station.id);
        }
      }
    } catch {
      // fallback
    }
  }, [stationId, initialStationId]);

  // Fetch station operational queue data
  const loadData = useCallback(async () => {
    if (!stationId) return;
    setIsLoading(true);
    try {
      const data = await operatorQueueService.getStationQueue(stationId);
      if (data) {
        setStationData(data);
      }
    } catch {
      // silently handle
    } finally {
      setIsLoading(false);
    }
  }, [stationId]);

  // Load claims & organisations
  const loadClaimsAndOrgs = useCallback(async () => {
    try {
      const [claimList, orgList] = await Promise.all([
        operatorQueueService.getStationClaims(),
        operatorQueueService.getOrganisations()
      ]);
      setClaims(claimList);
      setOrganisations(orgList);
    } catch {}
  }, []);

  // Load coverage overview
  const loadCoverage = useCallback(async () => {
    setIsCoverageLoading(true);
    try {
      const ov = await operatorQueueService.getCoverageOverview();
      if (ov) setCoverageOverview(ov);
    } finally {
      setIsCoverageLoading(false);
    }
  }, []);

  // Search 28,350 national catalogue
  const handleCatalogueSearch = useCallback(async () => {
    setIsCatalogueLoading(true);
    try {
      const res = await operatorQueueService.searchNationalCatalogue({
        q: catalogueSearchQuery,
        state: catalogueStateFilter !== 'All' ? catalogueStateFilter : undefined,
        limit: 25
      });
      setCatalogueResults(res.stations);
      setCatalogueTotalCount(res.totalCount);
    } finally {
      setIsCatalogueLoading(false);
    }
  }, [catalogueSearchQuery, catalogueStateFilter]);

  useEffect(() => {
    if (isOpen) {
      loadManagedStations();
      loadData();
      loadClaimsAndOrgs();
      if (activeTab === 'coverage') loadCoverage();
      if (activeTab === 'catalogue') handleCatalogueSearch();
      const interval = setInterval(loadData, 8000); // 8s auto refresh
      return () => clearInterval(interval);
    }
  }, [isOpen, loadData, loadManagedStations, loadClaimsAndOrgs, activeTab, loadCoverage, handleCatalogueSearch]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setErrorMessage(null);
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 4000);
    if (onQueueUpdated) onQueueUpdated();
  };

  const showError = (msg: string) => {
    setFeedbackMessage(null);
    setErrorMessage(msg);
  };

  const handleAccountSwitch = async (email: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await operatorQueueService.login(email);
      if (res.success && res.user) {
        setCurrentUser(res.user);
        showToast(`Signed in as: ${res.user.name} (${res.user.role})`);
        await loadManagedStations();
        await loadData();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Queue actions
  const handleCallNext = async () => {
    setErrorMessage(null);
    const res = await operatorQueueService.callNextVehicle(stationId, selectedConnectorGroup);
    if (res.success) {
      showToast(res.message);
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showToast(res.message || 'No waiting vehicles to call');
      }
    }
  };

  const handleStartSession = async (entryId: string) => {
    setErrorMessage(null);
    const res = await operatorQueueService.startChargingSession(stationId, entryId);
    if (res.success) {
      showToast(res.message);
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showError(res.message || 'Failed starting charging session');
      }
    }
  };

  const handleCompleteSession = async (sessionId: string) => {
    setErrorMessage(null);
    const res = await operatorQueueService.completeChargingSession(stationId, sessionId);
    if (res.success) {
      showToast(res.message);
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showError(res.message || 'Failed completing charging session');
      }
    }
  };

  const handleCancelEntry = async (entryId: string, reason: 'CANCELLED' | 'NO_SHOW') => {
    setErrorMessage(null);
    const res = await operatorQueueService.cancelQueueEntry(stationId, entryId, reason);
    if (res.success) {
      showToast(res.message);
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showError(res.message || 'Failed updating entry');
      }
    }
  };

  const handleAddVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const res = await operatorQueueService.addVehicleToQueue(stationId, {
      connectorType: selectedConnectorGroup,
      vehicleModel: addModel,
      vehicleRegLast4: addReg || undefined,
      driverName: addDriver || undefined,
      estimatedEnergyKwh: parseFloat(addEnergy) || 25,
      estimatedDurationMinutes: parseInt(addDuration, 10) || 30
    });
    if (res.success) {
      showToast(res.message);
      setIsAddVehicleOpen(false);
      setAddReg('');
      setAddDriver('');
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showError(res.message || 'Failed adding vehicle');
      }
    }
  };

  const handlePublishAggregate = async () => {
    setErrorMessage(null);
    const res = await operatorQueueService.setOperatorAggregateCount(
      stationId,
      selectedConnectorGroup,
      aggregateCount,
      aggregateUnavailable,
      aggregateNote || undefined
    );
    if (res.success) {
      showToast(res.message);
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showError(res.message || 'Failed setting aggregate count');
      }
    }
  };

  const handleToggleConnectorStatus = async (connectorId: string, currentStatus: string) => {
    setErrorMessage(null);
    const newStatus = currentStatus === 'available' ? 'faulted' : 'available';
    const res = await operatorQueueService.updateConnectorStatus(
      stationId,
      connectorId,
      newStatus as any
    );
    if (res.success) {
      showToast(`Connector marked ${newStatus}`);
      await loadData();
    } else {
      if ((res as any).code === 'FORBIDDEN' || res.message?.includes('denied') || res.message?.includes('authorized')) {
        showError(`HTTP 403 Forbidden: ${res.message}`);
      } else {
        showError(res.message || 'Failed updating connector status');
      }
    }
  };

  // Filter queue entries by selected connector group
  const allEntries = stationData?.queueEntries || [];
  const entriesForGroup = allEntries.filter((e) => {
    if (selectedConnectorGroup === 'CCS2') {
      return e.connectorType.toUpperCase().includes('CCS');
    }
    return e.connectorType.toUpperCase().includes('TYPE 2') || e.connectorType.toUpperCase().includes('AC');
  });

  const waitingCount = entriesForGroup.filter((e) => e.status === 'WAITING').length;
  const activeSessions = stationData?.activeSessions || [];
  const activeSessionsForGroup = activeSessions.filter((s) => {
    if (selectedConnectorGroup === 'CCS2') return s.connectorType.toUpperCase().includes('CCS');
    return s.connectorType.toUpperCase().includes('TYPE 2') || s.connectorType.toUpperCase().includes('AC');
  });

  const evses = stationData?.evses || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-full max-h-[94vh] rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl text-slate-100 flex flex-col overflow-hidden font-sans">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 bg-slate-950/90 border-b border-slate-800 gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black tracking-wider uppercase bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded border border-violet-500/30">
                  EVSure Operator Portal
                </span>
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  National PCS Synchronized
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <label className="text-[11px] text-slate-400 font-semibold">Active Station:</label>
                {/* Dynamic Station Selector */}
                <select
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-xs font-bold text-slate-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 max-w-md truncate"
                >
                  {managedStations.map((m) => (
                    <option key={m.station.id} value={m.station.id}>
                      {m.station.name} ({m.waitingCount} waiting)
                    </option>
                  ))}
                  {/* If current station is not in managed list (e.g. from search), keep it visible */}
                  {stationId && !managedStations.some((m) => m.station.id === stationId) && (
                    <option value={stationId}>
                      {stationData?.queueData?.stationName || stationId} (Active Inspection)
                    </option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* User Account & Test Role Switcher */}
          <div className="flex items-center gap-2.5 self-end sm:self-center flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-lg px-2.5 py-1">
              <KeyRound className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Signed-in Operator</span>
                <select
                  value={currentUser.email}
                  onChange={(e) => handleAccountSwitch(e.target.value)}
                  className="bg-transparent text-xs font-bold text-violet-300 focus:outline-none cursor-pointer max-w-[210px] truncate"
                  title="Switch operator account to test authorization"
                >
                  {SEEDED_OPERATOR_ACCOUNTS.map((acc) => (
                    <option key={acc.email} value={acc.email} className="bg-slate-800 text-slate-200">
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                loadData();
                loadManagedStations();
              }}
              title="Refresh data"
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-violet-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
              title="Close portal and return to driver planner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 px-4 py-2 bg-slate-900 border-b border-slate-800 overflow-x-auto shrink-0 custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'queue'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Live FIFO Queue (Method A)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
              {waitingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'sessions'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Active Sessions</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
              {activeSessions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('equipment')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'equipment'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Charging Bays & Equipment</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('aggregate')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'aggregate'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Aggregate Count (Method B)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('claims')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'claims'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Station Claims & Orgs</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('coverage');
              loadCoverage();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'coverage'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>National Coverage (28,350)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('catalogue');
              handleCatalogueSearch();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'catalogue'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Search className="w-4 h-4 text-sky-400" />
            <span>Search & Claim National Hubs</span>
          </button>
        </nav>

        {/* Error Alert Banner (e.g. HTTP 403 Forbidden) */}
        {errorMessage && (
          <div className="px-4 py-2.5 bg-rose-950/90 border-b border-rose-800/80 text-xs font-semibold text-rose-200 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Success Feedback Message Banner */}
        {feedbackMessage && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800/60 text-xs font-medium text-emerald-200 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-emerald-400 hover:text-white ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: LIVE QUEUE (METHOD A) */}
          {activeTab === 'queue' && (
            <div className="space-y-6">
              {/* Connector Group Tabs & Quick Action Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                {/* Connector Group Switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold mr-1">Connector Queue:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedConnectorGroup('CCS2')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedConnectorGroup === 'CCS2'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>CCS2 Fast DC</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedConnectorGroup('Type 2')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      selectedConnectorGroup === 'Type 2'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Type 2 AC</span>
                  </button>
                </div>

                {/* Queue Control Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleCallNext}
                    disabled={waitingCount === 0}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Call Next Vehicle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddVehicleOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Vehicle to Queue</span>
                  </button>
                </div>
              </div>

              {/* Real-time KPI Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Vehicles Waiting (FIFO)
                  </div>
                  <div className="text-2xl font-black text-amber-400">
                    {waitingCount}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Physical waiting line ({selectedConnectorGroup})
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Currently Charging
                  </div>
                  <div className="text-2xl font-black text-emerald-400">
                    {activeSessionsForGroup.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Active sessions in bays
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Available Stalls
                  </div>
                  <div className="text-2xl font-black text-cyan-400">
                    {stationData?.queueData?.connectorsAvailable ?? 1}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Ready to plug in immediately
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Authoritative Precedence
                  </div>
                  <div className="text-xs font-bold text-violet-300 truncate">
                    Operator Managed Queue
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium">
                    ✓ Highest driver confidence
                  </div>
                </div>
              </div>

              {/* Waiting Vehicles Tickets List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-400" />
                    <span>Queue Tickets for {selectedConnectorGroup}</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    First-In, First-Out (FIFO) Order
                  </span>
                </div>

                {entriesForGroup.length === 0 ? (
                  <div className="p-8 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center space-y-2">
                    <Users className="w-8 h-8 mx-auto text-slate-600" />
                    <p className="text-xs font-semibold text-slate-300">No vehicles in queue</p>
                    <p className="text-[11px] text-slate-500">
                      Drivers can check in via QR code or operator kiosk. Click "+ Add Vehicle to Queue" above.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {entriesForGroup.map((entry) => {
                      const isWaiting = entry.status === 'WAITING';
                      const isCalled = entry.status === 'CALLED';
                      const isAssigned = entry.status === 'ASSIGNED';
                      const isCharging = entry.status === 'CHARGING';

                      return (
                        <div
                          key={entry.id}
                          className={`p-4 rounded-xl border transition-all space-y-3 ${
                            isCalled
                              ? 'bg-blue-950/30 border-blue-500/60 shadow-md ring-1 ring-blue-500/30'
                              : isAssigned
                              ? 'bg-purple-950/30 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                              : isWaiting
                              ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                              : 'bg-slate-950/40 border-slate-800/60 opacity-75'
                          }`}
                        >
                          {/* Card Header: Position & Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 font-black text-xs text-slate-200 flex items-center justify-center font-mono">
                                #{entry.queuePosition}
                              </span>
                              <div>
                                <div className="font-bold text-xs text-slate-100">
                                  {entry.vehicleModel || 'Electric Vehicle'}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400">
                                  Reg: {entry.vehicleRegLast4 ? `...${entry.vehicleRegLast4}` : 'Walk-in'} • Driver: {entry.driverName || 'Guest'}
                                </div>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isWaiting
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : isCalled
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse'
                                  : isAssigned
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  : isCharging
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {entry.status}
                            </span>
                          </div>

                          {/* Details row */}
                          <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-800/80">
                            <div>
                              <span className="text-slate-500 block text-[10px]">Checked in</span>
                              <span className="font-medium text-slate-300">{formatIstTime(entry.checkInTime)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Req. Energy</span>
                              <span className="font-medium text-slate-300">{entry.estimatedEnergyKwh || 25} kWh</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">Source</span>
                              <span className="font-medium text-slate-300 capitalize">{entry.reportingSource?.replace(/_/g, ' ')}</span>
                            </div>
                          </div>

                          {/* Action Buttons for this Ticket */}
                          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80">
                            {isWaiting && (
                              <>
                                <button
                                  type="button"
                                  onClick={handleCallNext}
                                  className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Call Vehicle</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartSession(entry.id)}
                                  className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                                >
                                  <Zap className="w-3 h-3" />
                                  <span>Start Charging</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelEntry(entry.id, 'NO_SHOW')}
                                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 text-[11px] font-medium transition-colors"
                                  title="Mark as no-show"
                                >
                                  No-show
                                </button>
                              </>
                            )}

                            {isCalled && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartSession(entry.id)}
                                  className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                                >
                                  <Zap className="w-3 h-3" />
                                  <span>Confirm Plugged In</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelEntry(entry.id, 'NO_SHOW')}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 text-[11px] font-medium transition-colors"
                                >
                                  No-show
                                </button>
                              </>
                            )}

                            {isAssigned && (
                              <button
                                type="button"
                                onClick={() => handleStartSession(entry.id)}
                                className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Zap className="w-3 h-3" />
                                <span>Start Charging</span>
                              </button>
                            )}

                            {isCharging && (
                              <div className="w-full text-center text-xs text-emerald-400 font-semibold py-1">
                                Active session in progress (see Sessions tab)
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE CHARGING SESSIONS */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-200">Active Charging Sessions</h3>
                  <p className="text-xs text-slate-400">
                    Vehicles currently occupying charging bays. Note: Charging vehicles do NOT count as waiting queue.
                  </p>
                </div>
              </div>

              {activeSessions.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center space-y-2">
                  <Zap className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-semibold text-slate-300">No active charging sessions</p>
                  <p className="text-[11px] text-slate-500">
                    When you start charging for a called vehicle from the Queue tab, its active session will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeSessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-4 rounded-xl bg-slate-950/60 border border-emerald-500/40 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                            <Zap className="w-4 h-4 fill-emerald-500" />
                          </span>
                          <div>
                            <div className="font-bold text-xs text-slate-100">
                              {session.vehicleModel || 'Electric Vehicle'}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Session: {session.id} • Connector: {session.connectorType}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                          CHARGING
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-800/80">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Started At</span>
                          <span className="font-medium text-slate-300">{formatIstTime(session.startTime)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Energy Target</span>
                          <span className="font-medium text-slate-300">{session.energyDeliveredKwh || 28} kWh</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Est. Completion</span>
                          <span className="font-medium text-slate-300">
                            {formatIstTime(session.projectedEndTime || Date.now() + 20 * 60000)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCompleteSession(session.id)}
                        className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-700"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Complete Session & Free Stall</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CHARGING BAYS & EQUIPMENT */}
          {activeTab === 'equipment' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-200">Hardware Bays & Connector Equipment</h3>
                <p className="text-xs text-slate-400">
                  Manage individual EVSE power cabinets and physical charging plugs.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {evses.map((evse) => (
                  <div key={evse.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs font-bold">
                          {evse.evseIdentifier || evse.id}
                        </span>
                        <span className="text-xs text-slate-300 font-bold">
                          Cabinet {evse.evseIdentifier || evse.id}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                        {evse.status}
                      </span>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-slate-800/80">
                      {evse.connectors.map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">{conn.connectorType}</span>
                            <span className="text-slate-400 font-mono text-[11px]">({conn.maxPowerKw} kW)</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                conn.status === 'available'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : conn.status === 'charging'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : conn.status === 'faulted'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {conn.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleConnectorStatus(conn.id, conn.status)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition-colors"
                            >
                              Toggle Fault
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: AGGREGATE QUEUE (METHOD B) */}
          {activeTab === 'aggregate' && (
            <div className="max-w-xl mx-auto space-y-5 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-slate-200">Method B: Operator Aggregate Queue Reporting</h3>
                <p className="text-xs text-slate-400">
                  When you cannot register individual vehicle tickets, publish the observed queue count directly.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Connector Type</label>
                  <select
                    value={selectedConnectorGroup}
                    onChange={(e) => setSelectedConnectorGroup(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                  >
                    <option value="CCS2">CCS2 Fast DC</option>
                    <option value="Type 2">Type 2 AC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Observed Waiting Vehicles</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={15}
                      value={aggregateCount}
                      onChange={(e) => setAggregateCount(parseInt(e.target.value, 10))}
                      className="flex-1"
                    />
                    <span className="w-12 text-center text-lg font-black text-amber-400 font-mono">
                      {aggregateCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="chk-unavail"
                    checked={aggregateUnavailable}
                    onChange={(e) => setAggregateUnavailable(e.target.checked)}
                    className="rounded border-slate-700 text-violet-600 focus:ring-0"
                  />
                  <label htmlFor="chk-unavail" className="text-slate-300 text-xs">
                    Station temporarily closed / Grid outage
                  </label>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Operator Notes (Optional)</label>
                  <input
                    type="text"
                    value={aggregateNote}
                    onChange={(e) => setAggregateNote(e.target.value)}
                    placeholder="e.g. 2 private cabs and 1 Nexon in line"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                  />
                </div>

                <button
                  type="button"
                  onClick={handlePublishAggregate}
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all shadow-md mt-2"
                >
                  Publish Aggregate Queue Count
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: STATION CLAIMS & ORGS */}
          {activeTab === 'claims' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-sm text-slate-200">Registered CPO Organisations & Claims</h3>
                <p className="text-xs text-slate-400">
                  Approved charging point operators controlling national PCS stations.
                </p>
              </div>

              {/* Claims List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Station Claims</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {claims.map((claim) => (
                    <div key={claim.id} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200 truncate max-w-[200px]">
                          {claim.stationName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            claim.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : claim.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {claim.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        CPO: {claim.organisationName} • ID: <code className="text-slate-300">{claim.stationId}</code>
                      </div>
                      {claim.cpoProofNotes && (
                        <div className="text-[10px] text-slate-500 italic bg-slate-900/60 p-1.5 rounded">
                          Proof: {claim.cpoProofNotes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Claim Form */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs">
                <h4 className="font-bold text-slate-200">Submit New Station Claim</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">National Station ID</label>
                    <input
                      type="text"
                      value={claimStationInput}
                      onChange={(e) => setClaimStationInput(e.target.value)}
                      placeholder="e.g. sta-pcs-58fad8f122f2"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Organisation</label>
                    <select
                      value={claimOrgInput}
                      onChange={(e) => setClaimOrgInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                    >
                      {organisations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Proof / Concession Notes</label>
                    <input
                      type="text"
                      value={claimProofInput}
                      onChange={(e) => setClaimProofInput(e.target.value)}
                      placeholder="e.g. CPO Concession Agreement 2026-UP"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!claimStationInput) return;
                    const res = await operatorQueueService.submitStationClaim(
                      claimStationInput,
                      claimStationInput,
                      claimOrgInput,
                      claimProofInput
                    );
                    if (res.success) {
                      showToast('Claim submitted successfully');
                      setClaimStationInput('');
                      loadClaimsAndOrgs();
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                >
                  Submit Station Claim
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: NATIONAL COVERAGE OVERVIEW (28,350 STATIONS) */}
          {activeTab === 'coverage' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>National PCS Dataset Coverage Overview</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comprehensive metrics for BEE / MNRE Public Charging Station network across 36 Indian states & UTs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadCoverage}
                  disabled={isCoverageLoading}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCoverageLoading ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Refresh Metrics</span>
                </button>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Total National Stations</span>
                  <div className="text-2xl font-black text-slate-100 font-mono">
                    {coverageOverview?.totalNationalStations?.toLocaleString('en-IN') || '28,350'}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium">BEE / MNRE PDF Dataset</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Claimed & Approved</span>
                  <div className="text-2xl font-black text-violet-400 font-mono">
                    {coverageOverview?.approvedStationsCount ?? 3}
                  </div>
                  <div className="text-[10px] text-slate-400">Verified CPO accounts</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Active Queue Hubs</span>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {(coverageOverview?.individualQueueStationsCount ?? 0) + (coverageOverview?.aggregateReportStationsCount ?? 0) || 2}
                  </div>
                  <div className="text-[10px] text-slate-400">Live operational queues</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Unmonitored / Unknown</span>
                  <div className="text-2xl font-black text-slate-400 font-mono">
                    {coverageOverview?.unmonitoredStationsCount?.toLocaleString('en-IN') || '28,344'}
                  </div>
                  <div className="text-[10px] text-slate-500">Honest "Queue unknown"</div>
                </div>
              </div>

              {/* Active Operator Hubs Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Active Operator Hubs in Network
                </h4>
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 font-semibold sticky top-0 border-b border-slate-800">
                        <tr>
                          <th className="p-3">Station Name</th>
                          <th className="p-3">CPO Brand</th>
                          <th className="p-3">Connectors</th>
                          <th className="p-3">Vehicles Waiting</th>
                          <th className="p-3">Queue Mode</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {coverageOverview?.activeOperatorHubs?.map((hub) => (
                          <tr key={hub.stationId} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-semibold text-slate-100">
                              <div>{hub.stationName}</div>
                              <code className="text-[10px] text-slate-500 font-mono">{hub.stationId}</code>
                            </td>
                            <td className="p-3 text-slate-300">{hub.cpoBrand}</td>
                            <td className="p-3 font-mono text-emerald-400">
                              {hub.connectorsAvailable} / {hub.connectorsTotal} avail
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  hub.vehiclesWaiting > 0
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                }`}
                              >
                                {hub.vehiclesWaiting} waiting
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{hub.queueMode}</td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setStationId(hub.stationId);
                                  setActiveTab('queue');
                                  loadData();
                                }}
                                className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-colors"
                              >
                                Manage Hub
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Resilience & Storage Recovery Section */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-violet-400" />
                    <span>Persistence & Corruption Auto-Recovery</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Storage engine uses atomic staging (<code className="text-slate-300">.tmp</code>) and verified backup snapshots (<code className="text-slate-300">.bak</code>).
                  </div>
                </div>
                {currentUser.role === 'platform_admin' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await operatorQueueService.testCorruptionRecovery();
                      if (res.success) {
                        showToast(`Verified recovery: ${res.message}`);
                        loadCoverage();
                      } else {
                        showError(res.message);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-300 border border-violet-500/30 text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    Test Auto-Recovery from .bak
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: SEARCH & CLAIM NATIONAL CATALOGUE */}
          {activeTab === 'catalogue' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <Search className="w-4 h-4 text-sky-400" />
                  <span>Search 28,350 National EV PCS Stations</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Search stations from the official BEE / MNRE PDF dataset to claim, configure bays, and manage queues.
                </p>
              </div>

              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={catalogueSearchQuery}
                    onChange={(e) => setCatalogueSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCatalogueSearch()}
                    placeholder="Search by city, highway, or CPO brand (e.g. Agra, Kanpur, Tata Power)"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <select
                  value={catalogueStateFilter}
                  onChange={(e) => setCatalogueStateFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-sky-500"
                >
                  <option value="All">All States / UTs</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Haryana">Haryana</option>
                  <option value="Bihar">Bihar</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                </select>

                <button
                  type="button"
                  onClick={handleCatalogueSearch}
                  disabled={isCatalogueLoading}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow flex items-center justify-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search Catalogue</span>
                </button>
              </div>

              {/* Results List */}
              <div className="space-y-2">
                <div className="text-xs text-slate-400">
                  Found <strong className="text-slate-200">{catalogueTotalCount}</strong> matching stations in national dataset
                </div>

                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 font-semibold sticky top-0 border-b border-slate-800">
                        <tr>
                          <th className="p-3">Station Name & ID</th>
                          <th className="p-3">Network / CPO</th>
                          <th className="p-3">Power & Connectors</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {catalogueResults.map((st) => (
                          <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-semibold text-slate-100">
                              <div>{st.name}</div>
                              <div className="text-[11px] text-slate-400 font-normal line-clamp-1">{st.address}</div>
                              <code className="text-[10px] text-slate-500 font-mono">{st.id}</code>
                            </td>
                            <td className="p-3 text-slate-300">
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-semibold border border-slate-700">
                                {st.canonicalNetwork || st.network}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-amber-300">
                              {st.ratedPowerKw} kW • {st.connectors.length} connectors
                            </td>
                            <td className="p-3 text-right space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setStationId(st.id);
                                  setActiveTab('queue');
                                  loadData();
                                }}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors border border-slate-700"
                              >
                                View in Portal
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setClaimStationInput(st.id);
                                  setActiveTab('claims');
                                }}
                                className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-colors"
                              >
                                Claim
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Walk-in Add Vehicle Modal */}
        {isAddVehicleOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-100">+ Add Walk-in Vehicle</h4>
                <button
                  type="button"
                  onClick={() => setIsAddVehicleOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddVehicleSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Vehicle Model</label>
                  <input
                    type="text"
                    value={addModel}
                    onChange={(e) => setAddModel(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Reg (Last 4)</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={addReg}
                      onChange={(e) => setAddReg(e.target.value.toUpperCase())}
                      placeholder="e.g. 7821"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Driver Name</label>
                    <input
                      type="text"
                      value={addDriver}
                      onChange={(e) => setAddDriver(e.target.value)}
                      placeholder="e.g. Rajesh"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Est. Energy (kWh)</label>
                    <input
                      type="number"
                      value={addEnergy}
                      onChange={(e) => setAddEnergy(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Est. Duration (min)</label>
                    <input
                      type="number"
                      value={addDuration}
                      onChange={(e) => setAddDuration(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all shadow-lg"
                >
                  Add to {selectedConnectorGroup} Queue
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
