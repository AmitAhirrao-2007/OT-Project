import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { chargingStations as localCuratedCatalogue } from '../../data/stationCatalogue';
import { ChargingStation } from '../../types/station';
import { Waypoint } from '../../types/route';
import { VehicleProfile } from '../../types/vehicle';
import { getMarkerQueueBadge, getBatchStationQueueData } from '../../services/queue/chargingQueueService';
import { StationQueueData } from '../../types/queue';
import {
  Search,
  Zap,
  Filter,
  PlusCircle,
  CheckCircle2,
  Ban,
  ThumbsUp,
  MapPin,
  Sparkles,
  Database,
  Layers,
  AlertTriangle,
  RefreshCw,
  Car
} from 'lucide-react';

interface ChargerFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INDIAN_STATES_LIST = [
  'All',
  'Andaman & Nicobar',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu & Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

const MAJOR_OPERATORS = [
  'All',
  'Tata Power EZ Charge',
  'Jio-bp pulse',
  'Statiq',
  'Zeon Charging',
  'Adani TotalEnergies',
  'ChargeZone',
  'Charge_IN by Mahindra',
  'IOCL',
  'BPCL',
  'HPCL',
  'Ather Energy',
  'Kazam EV',
  'GoEC',
  'Bolt.Earth',
  'Magenta ChargeGrid',
  'Glida',
  'EESL',
  'Fortum Charge & Drive',
  'UJOY',
  'Bescom'
];

const CATEGORY_TABS = [
  { id: 'all', label: 'All Chargers' },
  { id: 'fast', label: '⚡ Fast DC (≥30 kW)' },
  { id: 'ac', label: 'AC Chargers' },
  { id: 'slow', label: 'Slow Chargers (<30 kW)' },
  { id: 'lev', label: 'LEV Chargers (≤3.3 kW)' }
] as const;

const CONNECTOR_CHIPS = [
  { id: 'All', label: 'All Plugs' },
  { id: 'CCS2', label: 'CCS2' },
  { id: 'Type 2', label: 'Type 2' },
  { id: 'Bharat AC-001', label: 'Bharat AC-001' },
  { id: 'Bharat DC-001', label: 'Bharat DC-001' },
  { id: 'LEV', label: 'LEV (AC/DC)' },
  { id: 'CHAdeMO', label: 'CHAdeMO' },
  { id: 'Other', label: 'Other' },
  { id: 'Unknown', label: 'Unknown' }
];

const POWER_CHIPS = [
  { val: 0, label: 'Any Power' },
  { val: 15, label: '15+ kW' },
  { val: 30, label: '30+ kW' },
  { val: 60, label: '60+ kW' },
  { val: 120, label: '120+ kW' }
];

interface DetailedStatsResponse {
  status: 'ready' | 'loading' | 'uninitialized';
  total: number;
  rawRecordsCount: number;
  normalizedHubsCount: number;
  withCoordinates: number;
  validCoordinatesCount: number;
  invalidCoordinatesCount: number;
  statesCount: number;
  cposCount: number;
  fastChargerCount: number;
  acSlowCount: number;
  levCount: number;
  connectorDistribution?: Record<string, number>;
  topStates?: Record<string, number>;
  topCpos?: Record<string, number>;
}

function checkVehicleCompatibility(station: ChargingStation, vehicleProfile: VehicleProfile): {
  isCompatible: boolean;
  reason?: string;
  matchedPlugs: string[];
} {
  const userPlugs = (vehicleProfile.selectedPlugTypes || []).map((p) => p.toLowerCase());
  const stationPlugs = (station.connectors || []).map((c) => (c.canonicalType || c.type || '').trim());
  const matchedPlugs: string[] = [];

  for (const sPlug of stationPlugs) {
    const sLower = sPlug.toLowerCase();
    const matched = userPlugs.some((uPlug) => {
      if (uPlug === 'ccs2' || uPlug === 'ccs') return sLower.includes('ccs');
      if (uPlug === 'type 2' || uPlug === 'type2') return sLower.includes('type 2') || sLower.includes('type2');
      if (uPlug.includes('chademo')) return sLower.includes('chademo');
      if (uPlug.includes('bharat ac')) return sLower.includes('bharat ac');
      if (uPlug.includes('bharat dc')) return sLower.includes('bharat dc');
      return sLower.includes(uPlug) || uPlug.includes(sLower);
    });
    if (matched) {
      matchedPlugs.push(sPlug);
    }
  }

  if (matchedPlugs.length === 0) {
    return {
      isCompatible: false,
      reason: `Plug mismatch: Station offers [${stationPlugs.join(', ') || 'Unknown'}], vehicle requires [${vehicleProfile.selectedPlugTypes.join(', ')}]`,
      matchedPlugs: []
    };
  }

  return { isCompatible: true, matchedPlugs };
}

export const ChargerFinderModal: React.FC<ChargerFinderModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    trip,
    setTrip,
    chargingSettings,
    setChargingSettings,
    planOptions,
    setPlanOptions,
    showToast,
    replanRoute,
    setSelectedStop,
    setIsStationDetailsOpen,
    vehicle
  } = usePlanner();

  // Mode Selection: 'all' (Show All Indian Stations) vs 'compatible' (Compatible with My Vehicle)
  const [explorerMode, setExplorerMode] = useState<'all' | 'compatible'>('all');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('All');
  const [selectedConnector, setSelectedConnector] = useState<string>('All');
  const [selectedMinPower, setSelectedMinPower] = useState<number>(0);
  const [activeCategory, setActiveCategory] = useState<'all' | 'fast' | 'ac' | 'slow' | 'lev'>('all');

  // Pagination & Loading State
  const [stations, setStations] = useState<ChargingStation[]>([]);
  const [queueMap, setQueueMap] = useState<Record<string, StationQueueData>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [backendStats, setBackendStats] = useState<DetailedStatsResponse | null>(null);
  const [pageOffset, setPageOffset] = useState<number>(0);
  const [totalMatches, setTotalMatches] = useState<number>(28350);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const PAGE_LIMIT = 50;

  // 1. Fetch live backend dataset status on open
  const fetchBackendStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stations/stats');
      if (res.ok) {
        const data = await res.json();
        if (data?.stats) {
          setBackendStats(data.stats);
          setApiError(null);
          return;
        }
      }
      setApiError('Station API returned unexpected response.');
    } catch {
      setApiError('Backend Station API unreachable on /api/stations/stats. Is the server running?');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchBackendStats();
    }
  }, [isOpen, fetchBackendStats]);

  // Dynamic Operators list merging hardcoded list and backend CPOs
  const operatorOptions = useMemo(() => {
    const set = new Set<string>(MAJOR_OPERATORS);
    if (backendStats?.topCpos) {
      Object.keys(backendStats.topCpos).forEach((cpo) => {
        if (cpo && cpo !== 'Unknown') set.add(cpo);
      });
    }
    return Array.from(set);
  }, [backendStats]);

  // 2. Fetch stations from backend whenever filters or page change
  const fetchStationsFromBackend = useCallback(async (offset = 0, isAppend = false) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedState !== 'All') params.set('state', selectedState);
      if (selectedNetwork !== 'All') params.set('cpo', selectedNetwork);
      if (selectedConnector !== 'All') params.set('connector', selectedConnector);
      if (selectedMinPower > 0) params.set('minPower', selectedMinPower.toString());

      if (activeCategory !== 'all') {
        params.set('category', activeCategory);
      }

      // Mode handling: Vehicle compatibility filter
      if (explorerMode === 'compatible') {
        params.set('vehicleCompatible', 'true');
        if (vehicle?.selectedPlugTypes?.length) {
          params.set('vehiclePlugs', vehicle.selectedPlugTypes.join(','));
        }
      }

      params.set('limit', PAGE_LIMIT.toString());
      params.set('offset', offset.toString());

      const res = await fetch(`/api/stations/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`API HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const returnedList: ChargingStation[] = Array.isArray(data.stations) ? data.stations : [];
      const matchCount = typeof data.total === 'number' ? data.total : (backendStats?.total ?? 28350);
      setTotalMatches(matchCount);

      if (isAppend) {
        setStations((prev) => [...prev, ...returnedList]);
      } else {
        setStations(returnedList);
      }

      setHasMore(offset + returnedList.length < matchCount && returnedList.length >= PAGE_LIMIT);
      setApiError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query stations';
      setApiError(`Station query failed: ${msg}.`);
      if (!isAppend) {
        // Fallback to local curated catalogue only if API fails completely
        setStations(localCuratedCatalogue);
        setTotalMatches(localCuratedCatalogue.length);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedState, selectedNetwork, selectedConnector, selectedMinPower, activeCategory, explorerMode, vehicle, backendStats]);

  // Debounced search trigger
  useEffect(() => {
    if (!isOpen) return;
    setPageOffset(0);
    const timer = setTimeout(() => {
      fetchStationsFromBackend(0, false);
    }, 200);

    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, selectedState, selectedNetwork, selectedConnector, selectedMinPower, activeCategory, explorerMode, fetchStationsFromBackend]);

  // Fetch live queue badges for displayed stations
  useEffect(() => {
    if (stations.length > 0) {
      const ids = stations.map((s) => s.id);
      getBatchStationQueueData(ids).then((batch) => {
        setQueueMap((prev) => ({ ...prev, ...batch }));
      });
    }
  }, [stations]);

  // Load more stations (Pagination)
  const handleLoadMore = () => {
    const nextOffset = pageOffset + PAGE_LIMIT;
    setPageOffset(nextOffset);
    fetchStationsFromBackend(nextOffset, true);
  };

  // Add station to current route waypoints
  const handleAddStopToRoute = (station: ChargingStation) => {
    const lat = Number(station.coordinates[0]);
    const lon = Number(station.coordinates[1]);
    const validCoords: [number, number] = [lat, lon];

    const compat = checkVehicleCompatibility(station, vehicle);
    const newWaypoint: Waypoint = {
      id: `pinned-charger-${station.id}-${Date.now()}`,
      stationId: station.id,
      name: station.name,
      subTitle: `${station.canonicalNetwork || station.network || 'CPO'} · ${station.ratedPowerKw || 50} kW`,
      address: station.address,
      coordinates: validCoords,
      powerKw: station.ratedPowerKw || 50,
      batterySoc: 15,
      type: 'charging_pinned',
      category: 'charging_station',
      verificationState: 'verified_station',
      source: 'catalogue',
      targetChargeSoc: 80,
      isCustom: true
    };

    const nextWaypoints = [...trip.waypoints, newWaypoint];

    setTrip((prev) => ({
      ...prev,
      waypoints: nextWaypoints
    }));

    if (!compat.isCompatible) {
      showToast(`Added "${station.name}" (⚠️ Note: vehicle plug mismatch).`);
    } else {
      showToast(`Added "${station.name}" (${station.ratedPowerKw} kW) as pinned charging stop.`);
    }

    onClose();
    replanRoute({ waypoints: nextWaypoints });
  };

  // Toggle prefer network
  const handleTogglePreferNetwork = (network: string) => {
    const isPreferred = planOptions.preferredNetworks.includes(network);
    const updated = isPreferred
      ? planOptions.preferredNetworks.filter((n) => n !== network)
      : [...planOptions.preferredNetworks, network];

    setPlanOptions((prev) => ({ ...prev, preferredNetworks: updated }));
    setChargingSettings((prev) => ({ ...prev, preferredNetworks: updated }));

    showToast(
      isPreferred
        ? `Removed ${network} from preferred networks.`
        : `Marked ${network} as preferred charging network.`
    );
  };

  // Toggle exclude charger
  const handleToggleExcludeCharger = (stationId: string, name: string) => {
    const isExcluded = chargingSettings.excludedChargers.includes(stationId);
    const updated = isExcluded
      ? chargingSettings.excludedChargers.filter((id) => id !== stationId)
      : [...chargingSettings.excludedChargers, stationId];

    setChargingSettings((prev) => ({ ...prev, excludedChargers: updated }));
    showToast(
      isExcluded
        ? `Unblocked "${name}".`
        : `Excluded "${name}" from route optimization.`
    );
  };

  const handleOpenDetails = (station: ChargingStation) => {
    setSelectedStop({
      id: `finder-stop-${station.id}`,
      stationId: station.id,
      name: station.name,
      network: station.network,
      address: station.address,
      coordinates: station.coordinates,
      powerKw: station.ratedPowerKw,
      stallsTotal: station.totalStalls,
      stallsAvailable: station.availableStalls !== undefined ? station.availableStalls : undefined,
      arrivalTime: '12:00 PM',
      departureTime: '12:35 PM',
      arrivalSoc: 12,
      departureSoc: 75,
      chargeDurationMinutes: 35,
      energyAddedKwh: 26,
      legDriveDuration: '1 h 40 min',
      legDistanceMi: 75,
      amenities: station.amenities,
      priceEstimate: station.pricePerKwh,
      isFeasible: true,
      notes: station.notes
    });
    setIsStationDetailsOpen(true);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedState('All');
    setSelectedNetwork('All');
    setSelectedConnector('All');
    setSelectedMinPower(0);
    setActiveCategory('all');
    setExplorerMode('all');
  };

  const totalLoadedDisplay = backendStats?.total ? backendStats.total.toLocaleString() : '28,350';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Charger Discovery & Hub Explorer"
      subtitle={`National EV PCS Registry · ${totalLoadedDisplay} Indian Stations Indexed across 36 States/UTs`}
      maxWidth="max-w-4xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 text-xs text-content-tertiary">
            <Database className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            <span>
              Showing <strong className="text-content-primary">{stations.length}</strong> of{' '}
              <strong className="text-content-primary">{totalMatches.toLocaleString()}</strong> matching hubs{' '}
              <span className="text-content-muted">({totalLoadedDisplay} in national registry)</span>
            </span>
            {isLoading && (
              <span className="flex items-center gap-1 text-brand-primary animate-pulse ml-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Searching...</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-xs font-semibold border border-brand-primary/30 transition-colors"
              >
                Load More (+{PAGE_LIMIT})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-hover text-content-primary text-xs font-semibold border border-edge-default transition-colors shadow-sm"
            >
              Close Explorer
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* Backend Dataset Status Banner */}
        {apiError ? (
          <div className="p-3 rounded-xl bg-status-dangerSubtle border border-status-danger/40 text-xs text-status-danger flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              type="button"
              onClick={fetchBackendStats}
              className="px-2.5 py-1 rounded-lg bg-surface-panel border border-status-danger/40 hover:bg-surface-hover text-[11px] font-semibold text-status-danger"
            >
              Retry Connection
            </button>
          </div>
        ) : backendStats ? (
          <div className="p-2.5 rounded-xl bg-surface-subtle border border-edge-subtle text-xs text-content-secondary flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-content-primary">National EV PCS Registry Active:</span>
              <span>{backendStats.total.toLocaleString()} Station Hubs</span>
              <span>•</span>
              <span>{backendStats.fastChargerCount.toLocaleString()} Fast DC (≥30 kW)</span>
              <span>•</span>
              <span>{backendStats.levCount.toLocaleString()} LEV Chargers</span>
            </div>
            <span className="text-[11px] text-content-tertiary">
              {backendStats.statesCount} States/UTs • {backendStats.cposCount} CPOs
            </span>
          </div>
        ) : null}

        {/* Primary Mode Selector: All Indian Stations vs Compatible with My Vehicle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface-subtle border border-edge-subtle rounded-xl">
          <button
            type="button"
            onClick={() => setExplorerMode('all')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              explorerMode === 'all'
                ? 'bg-surface-panel text-content-primary shadow-sm border border-edge-default'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface-panel/40'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-500" />
            <div className="text-left">
              <div className="leading-tight">All Indian Charging Stations</div>
              <div className="text-[10px] text-content-tertiary font-normal">All 28,350 hubs: Fast DC, AC, Slow, LEV, all plugs</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setExplorerMode('compatible')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              explorerMode === 'compatible'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface-panel/40'
            }`}
          >
            <Car className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight">Compatible with My Vehicle</div>
              <div className={`text-[10px] font-normal ${explorerMode === 'compatible' ? 'text-white/80' : 'text-content-tertiary'}`}>
                {vehicle?.name || 'Selected Vehicle'} ({vehicle?.selectedPlugTypes?.join(', ') || 'CCS2'})
              </div>
            </div>
          </button>
        </div>

        {/* Search input, State selector, and Network selector */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by station name, city, locality, district, highway or landmark..."
              className="w-full pl-10 pr-12 py-2.5 bg-surface-subtle border border-edge-default rounded-xl text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-content-tertiary hover:text-content-primary"
              >
                Clear
              </button>
            )}
          </div>

          <div>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-subtle border border-edge-default rounded-xl text-xs text-content-primary focus:outline-none focus:border-brand-primary"
            >
              <option value="All">All States / UTs ({INDIAN_STATES_LIST.length - 1})</option>
              {INDIAN_STATES_LIST.filter((s) => s !== 'All').map((st) => (
                <option key={st} value={st} className="bg-surface-panel text-content-primary">
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-subtle border border-edge-default rounded-xl text-xs text-content-primary focus:outline-none focus:border-brand-primary"
            >
              <option value="All">All Operator Networks ({operatorOptions.length - 1})</option>
              {operatorOptions.filter((n) => n !== 'All').map((net) => (
                <option key={net} value={net} className="bg-surface-panel text-content-primary">
                  {net}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-edge-subtle">
          <div className="flex items-center gap-1 text-content-tertiary mr-1 text-[11px]">
            <Filter className="w-3 h-3 text-brand-primary" />
            <span>Category:</span>
          </div>

          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                activeCategory === cat.id
                  ? 'bg-brand-subtle text-brand-primary border-brand-primary/40 font-semibold shadow-sm'
                  : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover'
              }`}
            >
              {cat.label}
            </button>
          ))}

          <span className="text-edge-default">|</span>

          {/* Reset Filters */}
          <button
            type="button"
            onClick={resetAllFilters}
            className="px-2 py-1 text-[11px] text-content-tertiary hover:text-content-primary underline"
          >
            Reset Filters
          </button>
        </div>

        {/* Specific Connector & Power Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 text-content-tertiary mr-1 text-[11px]">
            <span>Connectors:</span>
          </div>

          {CONNECTOR_CHIPS.map((plug) => (
            <button
              key={plug.id}
              type="button"
              onClick={() => setSelectedConnector(plug.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                selectedConnector === plug.id
                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40 font-semibold'
                  : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover'
              }`}
            >
              {plug.label}
            </button>
          ))}

          <span className="text-edge-default">|</span>

          <div className="flex items-center gap-1 text-content-tertiary mr-1 text-[11px]">
            <span>Min Power:</span>
          </div>
          {POWER_CHIPS.map((item) => (
            <button
              key={item.val}
              type="button"
              onClick={() => setSelectedMinPower(item.val)}
              className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                selectedMinPower === item.val
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Stations List */}
        <div className="max-h-[460px] overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
          {stations.length === 0 && !isLoading ? (
            <div className="py-12 text-center text-content-tertiary bg-surface-subtle rounded-xl border border-edge-subtle space-y-2">
              <Zap className="w-8 h-8 text-content-tertiary mx-auto" />
              <p className="text-sm font-semibold text-content-primary">No charging stations match your criteria</p>
              <p className="text-xs text-content-tertiary max-w-md mx-auto">
                Try selecting "All Indian Charging Stations", clearing power filters, or changing the State/District filter.
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-2 px-3 py-1.5 rounded-lg bg-surface-panel border border-edge-default hover:bg-surface-hover text-xs font-semibold text-content-primary"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            stations.map((station) => {
              const isPreferred = planOptions.preferredNetworks.includes(station.network);
              const isExcluded = chargingSettings.excludedChargers.includes(station.id);
              const isAlreadyInTrip = trip.waypoints.some((w) => w.stationId === station.id || w.name === station.name);
              const isFast = station.ratedPowerKw >= 30;
              const isLev = station.ratedPowerKw <= 3.5;
              const isSlow = station.ratedPowerKw > 3.5 && station.ratedPowerKw < 30;
              const compat = checkVehicleCompatibility(station, vehicle);

              return (
                <div
                  key={station.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isExcluded
                      ? 'bg-status-dangerSubtle/20 border-status-danger/40 opacity-70'
                      : isPreferred
                      ? 'bg-surface-card border-brand-primary/50 ring-1 ring-brand-primary/20 shadow-sm'
                      : 'bg-surface-card border-edge-subtle hover:border-edge-default hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="text-sm font-bold text-content-primary hover:text-brand-primary cursor-pointer transition-colors truncate max-w-md"
                          onClick={() => handleOpenDetails(station)}
                          title={station.name}
                        >
                          {station.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-subtle text-content-secondary border border-edge-subtle">
                          {station.canonicalNetwork || station.network}
                        </span>

                        {isFast ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Zap className="w-3 h-3 fill-amber-500" />
                            {station.ratedPowerKw} kW DC Fast
                          </span>
                        ) : isLev ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
                            {station.ratedPowerKw} kW LEV
                          </span>
                        ) : isSlow ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                            {station.ratedPowerKw} kW Slow AC
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                            {station.ratedPowerKw} kW AC
                          </span>
                        )}

                        {isPreferred && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-subtle text-brand-primary border border-brand-primary/30 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Preferred
                          </span>
                        )}
                        {isExcluded && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-status-dangerSubtle text-status-danger border border-status-danger/40 flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            Excluded
                          </span>
                        )}

                        {/* Live Queue Badge */}
                        {(() => {
                          const qData = queueMap[station.id];
                          const qBadge = getMarkerQueueBadge(qData, vehicle);
                          if (qBadge.hasData && typeof qBadge.waitingCount === 'number' && qBadge.waitingCount > 0) {
                            return (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                                {qBadge.badgeText}
                              </span>
                            );
                          }
                          if (qBadge.hasData && qBadge.waitingCount === 0) {
                            return (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                                0 waiting
                              </span>
                            );
                          }
                          return (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
                              Queue unknown
                            </span>
                          );
                        })()}
                      </div>

                      <p className="text-xs text-content-secondary mt-1 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-content-tertiary shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{station.address}</span>
                      </p>

                      {/* Connectors info & Vehicle Compatibility Warning */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {station.connectors.map((c, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-surface-subtle text-[11px] font-mono text-content-primary border border-edge-subtle"
                          >
                            {c.count}× {c.canonicalType || c.type} ({c.maxPowerKw} kW)
                          </span>
                        ))}
                        <span className="text-[11px] text-content-tertiary ml-1">
                          • {station.totalStalls} {station.totalStalls === 1 ? 'stall' : 'stalls'} total
                        </span>

                        {!compat.isCompatible && (
                          <span
                            className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1"
                            title={compat.reason}
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>⚠️ Vehicle Plug Mismatch</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                      <button
                        type="button"
                        onClick={() => handleTogglePreferNetwork(station.network)}
                        title={isPreferred ? 'Remove preferred' : 'Prefer this operator'}
                        className={`p-1.5 rounded-lg border text-xs transition-colors ${
                          isPreferred
                            ? 'bg-brand-primary text-white border-brand-primary'
                            : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover hover:text-content-primary'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleExcludeCharger(station.id, station.name)}
                        title={isExcluded ? 'Unblock charger' : 'Exclude this charger'}
                        className={`p-1.5 rounded-lg border text-xs transition-colors ${
                          isExcluded
                            ? 'bg-status-danger text-white border-status-danger'
                            : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover hover:text-status-danger'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isAlreadyInTrip}
                        onClick={() => handleAddStopToRoute(station)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                          isAlreadyInTrip
                            ? 'bg-surface-subtle text-content-muted border border-edge-subtle cursor-not-allowed'
                            : !compat.isCompatible
                            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                            : 'bg-brand-primary hover:bg-brand-hover text-white shadow-sm'
                        }`}
                      >
                        {isAlreadyInTrip ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                            <span>In Trip</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>+ Add Charging Stop</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
