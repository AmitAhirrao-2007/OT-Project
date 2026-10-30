import React, { useState, useMemo } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { chargingStations } from '../../data/stationCatalogue';
import { ChargingStation } from '../../types/station';
import {
  Search,
  Zap,
  Filter,
  PlusCircle,
  CheckCircle2,
  Ban,
  ThumbsUp,
  MapPin,
  Utensils,
  Coffee,
  ShoppingBag,
  Wifi,
  Sparkles
} from 'lucide-react';

interface ChargerFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
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
    setIsStationDetailsOpen
  } = usePlanner();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConnector, setSelectedConnector] = useState<string>('All');
  const [selectedMinPower, setSelectedMinPower] = useState<number>(0);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('All');
  const [selectedAmenity, setSelectedAmenity] = useState<string>('All');

  // Extract unique networks
  const allNetworks = useMemo(() => {
    const set = new Set<string>();
    chargingStations.forEach((s) => set.add(s.network));
    return Array.from(set);
  }, []);

  // Filtered station list
  const filteredStations = useMemo(() => {
    return chargingStations.filter((station) => {
      // 1. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = station.name.toLowerCase().includes(q);
        const matchNetwork = station.network.toLowerCase().includes(q);
        const matchAddr = station.address.toLowerCase().includes(q);
        if (!matchName && !matchNetwork && !matchAddr) return false;
      }

      // 2. Connector filter
      if (selectedConnector !== 'All') {
        const hasConnector = station.connectors.some(
          (c) => c.type === selectedConnector
        );
        if (!hasConnector) return false;
      }

      // 3. Min power filter
      if (selectedMinPower > 0 && station.ratedPowerKw < selectedMinPower) {
        return false;
      }

      // 4. Network filter
      if (selectedNetwork !== 'All' && station.network !== selectedNetwork) {
        return false;
      }

      // 5. Amenity filter
      if (selectedAmenity !== 'All') {
        if (!station.amenities.includes(selectedAmenity as any)) return false;
      }

      return true;
    });
  }, [
    searchQuery,
    selectedConnector,
    selectedMinPower,
    selectedNetwork,
    selectedAmenity
  ]);

  // Add station to current route waypoints
  const handleAddStopToRoute = (station: ChargingStation) => {
    const newWaypoint = {
      id: `custom-waypoint-${Date.now()}`,
      name: station.name,
      subTitle: `${station.network} · ${station.ratedPowerKw} kW`,
      coordinates: station.coordinates,
      batterySoc: 15,
      isCustom: true
    };

    setTrip((prev) => ({
      ...prev,
      waypoints: [...prev.waypoints, newWaypoint]
    }));

    showToast(`Added "${station.name}" as waypoint stop.`);
    onClose();
    setTimeout(() => {
      replanRoute();
    }, 150);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Charger Discovery & Hub Explorer"
      subtitle="Find, filter, prefer, or insert fast charging stations along the corridor"
      maxWidth="max-w-4xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-content-tertiary">
            Showing <strong className="text-content-primary">{filteredStations.length}</strong> verified stations
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-hover text-content-primary text-xs font-semibold border border-edge-default transition-colors shadow-sm"
          >
            Close Explorer
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search input and Quick Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by station name, expressway, city, or operator..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface-subtle border border-edge-default rounded-xl text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
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
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-subtle border border-edge-default rounded-xl text-xs text-content-primary focus:outline-none focus:border-brand-primary"
            >
              <option value="All">All Operator Networks</option>
              {allNetworks.map((net) => (
                <option key={net} value={net} className="bg-surface-panel text-content-primary">
                  {net}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-edge-subtle">
          <div className="flex items-center gap-1.5 text-xs text-content-secondary mr-2">
            <Filter className="w-3.5 h-3.5 text-brand-primary" />
            <span>Filters:</span>
          </div>

          {/* Connector pills */}
          {['All', 'CCS', 'Type 2'].map((plug) => (
            <button
              key={plug}
              type="button"
              onClick={() => setSelectedConnector(plug)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                selectedConnector === plug
                  ? 'bg-brand-subtle text-brand-primary border-brand-primary/40 font-semibold'
                  : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover'
              }`}
            >
              {plug === 'All' ? 'Any Plug' : plug}
            </button>
          ))}

          <span className="text-edge-default">|</span>

          {/* Min Power pills */}
          {[
            { label: 'Any Power', val: 0 },
            { label: '60+ kW', val: 60 },
            { label: '120+ kW', val: 120 },
            { label: '240 kW Ultra', val: 240 }
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              onClick={() => setSelectedMinPower(item.val)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                selectedMinPower === item.val
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover'
              }`}
            >
              {item.label}
            </button>
          ))}

          <span className="text-edge-default">|</span>

          {/* Amenities filter */}
          {[
            { label: 'Any Amenities', val: 'All' },
            { label: 'Dining', val: 'restaurant' },
            { label: 'Coffee', val: 'coffee' },
            { label: 'Restroom', val: 'restroom' }
          ].map((am) => (
            <button
              key={am.val}
              type="button"
              onClick={() => setSelectedAmenity(am.val)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                selectedAmenity === am.val
                  ? 'bg-status-successSubtle text-status-success border-status-success/40 font-semibold'
                  : 'bg-surface-subtle text-content-secondary border-edge-default hover:bg-surface-hover'
              }`}
            >
              {am.label}
            </button>
          ))}
        </div>

        {/* Stations List */}
        <div className="max-h-[500px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {filteredStations.length === 0 ? (
            <div className="py-12 text-center text-content-tertiary bg-surface-subtle rounded-xl border border-edge-subtle">
              <Zap className="w-8 h-8 text-content-tertiary mx-auto mb-2" />
              <p className="text-sm font-semibold text-content-primary">No charging stations match your criteria</p>
              <p className="text-xs text-content-tertiary mt-1">Try relaxing power filters or changing search keywords.</p>
            </div>
          ) : (
            filteredStations.map((station) => {
              const isPreferred = planOptions.preferredNetworks.includes(station.network);
              const isExcluded = chargingSettings.excludedChargers.includes(station.id);
              const isAlreadyInTrip = trip.waypoints.some((w) => w.name === station.name);

              return (
                <div
                  key={station.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isExcluded
                      ? 'bg-status-dangerSubtle/20 border-status-danger/40 opacity-70'
                      : isPreferred
                      ? 'bg-surface-card border-brand-primary/50 ring-1 ring-brand-primary/20 shadow-sm'
                      : 'bg-surface-card border-edge-subtle hover:border-edge-default hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-sm font-bold text-content-primary hover:text-brand-primary cursor-pointer transition-colors"
                          onClick={() => handleOpenDetails(station)}
                        >
                          {station.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-subtle text-content-secondary border border-edge-subtle">
                          {station.network}
                        </span>
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
                      </div>

                      <p className="text-xs text-content-secondary mt-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
                        <span>{station.address}</span>
                      </p>

                      {station.notes && (
                        <p className="text-[11px] text-content-secondary mt-1.5 italic">
                          "{station.notes}"
                        </p>
                      )}

                      {/* Connectors & Amenities */}
                      <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 border-t border-edge-subtle text-xs">
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>{station.ratedPowerKw} kW DC</span>
                        </div>
                        <span className="text-edge-default">·</span>
                        <div className="text-content-secondary">
                          {station.totalStalls} stalls {station.availableStalls !== undefined ? `(${station.availableStalls} available)` : ''}
                        </div>
                        <span className="text-edge-default">·</span>
                        <div className="text-status-success font-mono font-medium">
                          {station.pricePerKwh}
                        </div>
                        <span className="text-edge-default">·</span>
                        <div className="flex items-center gap-1 text-content-secondary">
                          {station.amenities.map((am) => (
                            <span
                              key={am}
                              title={am}
                              className="p-1 rounded bg-surface-subtle border border-edge-subtle text-content-secondary"
                            >
                              {am === 'restaurant' && <Utensils className="w-3 h-3" />}
                              {am === 'coffee' && <Coffee className="w-3 h-3" />}
                              {am === 'shopping' && <ShoppingBag className="w-3 h-3" />}
                              {am === 'wifi' && <Wifi className="w-3 h-3" />}
                              {am === 'restroom' && <span className="text-[10px] font-bold">WC</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex md:flex-col items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAddStopToRoute(station)}
                        disabled={isAlreadyInTrip}
                        className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          isAlreadyInTrip
                            ? 'bg-status-successSubtle text-status-success border border-status-success/40 cursor-default'
                            : 'bg-brand-primary hover:bg-brand-hover text-brand-inverse shadow-sm'
                        }`}
                      >
                        {isAlreadyInTrip ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>In Route</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Add Stop</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={() => handleTogglePreferNetwork(station.network)}
                          title={isPreferred ? 'Remove preferred network' : 'Prefer this network'}
                          className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition-colors ${
                            isPreferred
                              ? 'bg-brand-subtle text-brand-primary border-brand-primary/40'
                              : 'bg-surface-subtle text-content-secondary border-edge-default hover:text-content-primary'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>{isPreferred ? 'Preferred' : 'Prefer'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleExcludeCharger(station.id, station.name)}
                          title={isExcluded ? 'Unblock charger' : 'Exclude this charger'}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border flex items-center justify-center gap-1 transition-colors ${
                            isExcluded
                              ? 'bg-status-dangerSubtle text-status-danger border-status-danger/40'
                              : 'bg-surface-subtle text-content-secondary border-edge-default hover:text-status-danger'
                          }`}
                        >
                          <Ban className="w-3 h-3" />
                        </button>
                      </div>
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
