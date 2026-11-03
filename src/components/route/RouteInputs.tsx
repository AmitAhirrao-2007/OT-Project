import React, { useState } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Waypoint } from '../../types/route';
import { PlaceSearchModal } from '../dialogs/PlaceSearchModal';
import { UniversalLocationSearch } from '../location/UniversalLocationSearch';
import { SearchResultPlace } from '../../types/search';
import { useGps } from '../../context/GpsContext';
import {
  ArrowUpDown,
  Plus,
  X,
  ChevronDown,
  BatteryCharging,
  ArrowUp,
  ArrowDown,
  Search,
  Zap,
  Crosshair
} from 'lucide-react';

interface RouteInputsProps {
  onReplanNeeded?: () => void;
}

export const RouteInputs: React.FC<RouteInputsProps> = () => {
  const {
    trip,
    setTrip,
    replanRoute,
    showToast
  } = usePlanner();

  const { useCurrentLocationAsOrigin } = useGps();

  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [isPlaceSearchOpen, setIsPlaceSearchOpen] = useState(false);
  const [placeSearchMode, setPlaceSearchMode] = useState<'waypoint' | 'origin' | 'destination'>('waypoint');

  // Handle swapping origin and destination
  const handleSwapEndpoints = () => {
    const nextOrigin = {
      ...trip.destination,
      batterySoc: trip.origin.batterySoc,
      departureTime: trip.origin.departureTime
    };
    const nextDest = {
      ...trip.origin,
      batterySoc: trip.destination.batterySoc,
      arrivalTime: trip.destination.arrivalTime
    };
    const nextWaypoints = [...trip.waypoints].reverse();

    setTrip((prev) => ({
      ...prev,
      origin: nextOrigin,
      destination: nextDest,
      waypoints: nextWaypoints
    }));
    showToast('Swapped Origin and Destination. Recalculating route...');
    replanRoute({
      origin: nextOrigin,
      destination: nextDest,
      waypoints: nextWaypoints
    });
  };

  // Select location for Origin
  const handleSelectOrigin = (place: SearchResultPlace) => {
    const nextOrigin = {
      ...trip.origin,
      name: place.name,
      subTitle: place.subTitle || place.address,
      address: place.address,
      coordinates: place.coordinates
    };
    setTrip((prev) => ({
      ...prev,
      origin: nextOrigin
    }));
    setIsEditingOrigin(false);
    showToast(`Origin set to "${place.name}"`);
    replanRoute({ origin: nextOrigin });
  };

  // Select location for Destination
  const handleSelectDestination = (place: SearchResultPlace) => {
    const nextDest = {
      ...trip.destination,
      name: place.name,
      subTitle: place.subTitle || place.address,
      address: place.address,
      coordinates: place.coordinates
    };
    setTrip((prev) => ({
      ...prev,
      destination: nextDest
    }));
    setIsEditingDestination(false);
    showToast(`Destination set to "${place.name}"`);
    replanRoute({ destination: nextDest });
  };

  // Add waypoint from universal search
  const handleAddWaypoint = (
    place: SearchResultPlace,
    actionType?: 'via' | 'charging' | 'origin' | 'destination'
  ) => {
    const isCharging = actionType === 'charging' || place.isChargingStation;
    const newWaypoint: Waypoint = {
      id: `${isCharging ? 'charging' : 'via'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: place.name,
      subTitle: place.stationData
        ? `${place.stationData.network} • ${place.stationData.ratedPowerKw} kW DC`
        : place.subTitle || (isCharging ? 'Charging Station' : place.address),
      address: place.address,
      coordinates: place.coordinates,
      batterySoc: isCharging ? 15 : 25,
      type: isCharging ? 'charging_pinned' : 'via',
      category: place.category,
      source: place.source,
      stationId: place.stationData?.id,
      verificationState: place.verificationState,
      targetChargeSoc: isCharging ? 80 : undefined,
      isCustom: true
    };

    const nextWaypoints = [...trip.waypoints, newWaypoint];
    setTrip((prev) => ({
      ...prev,
      waypoints: nextWaypoints
    }));
    setIsAddingWaypoint(false);
    showToast(`Added ${isCharging ? 'charger' : 'stop'}: "${place.name}"`);
    replanRoute({ waypoints: nextWaypoints });
  };

  // Remove waypoint
  const handleRemoveWaypoint = (id: string, name: string) => {
    const nextWaypoints = trip.waypoints.filter((w) => w.id !== id);
    setTrip((prev) => ({
      ...prev,
      waypoints: nextWaypoints
    }));
    showToast(`Removed stop "${name}"`);
    replanRoute({ waypoints: nextWaypoints });
  };

  // Move waypoint up
  const handleMoveWaypointUp = (index: number) => {
    if (index === 0) return;
    const nextWaypoints = [...trip.waypoints];
    const temp = nextWaypoints[index - 1];
    nextWaypoints[index - 1] = nextWaypoints[index];
    nextWaypoints[index] = temp;
    setTrip((prev) => ({ ...prev, waypoints: nextWaypoints }));
    replanRoute({ waypoints: nextWaypoints });
  };

  // Move waypoint down
  const handleMoveWaypointDown = (index: number) => {
    if (index >= trip.waypoints.length - 1) return;
    const nextWaypoints = [...trip.waypoints];
    const temp = nextWaypoints[index + 1];
    nextWaypoints[index + 1] = nextWaypoints[index];
    nextWaypoints[index] = temp;
    setTrip((prev) => ({ ...prev, waypoints: nextWaypoints }));
    replanRoute({ waypoints: nextWaypoints });
  };

  // Handle departure SoC change
  const handleDepartureSocChange = (soc: number) => {
    setTrip((prev) => ({
      ...prev,
      origin: { ...prev.origin, batterySoc: soc }
    }));
    setTimeout(() => replanRoute(), 100);
  };

  return (
    <div className="space-y-2.5 bg-surface-subtle p-3 rounded-xl border border-edge-subtle">
      {/* Route Endpoints Box */}
      <div className="relative space-y-2">
        {/* Origin field */}
        <div className="relative pr-9">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-success shrink-0 ring-2 ring-status-success/20" />
            {isEditingOrigin ? (
              <div className="flex-1">
                <UniversalLocationSearch
                  autoFocus
                  placeholder="Search origin city, address, landmark..."
                  targetMode="origin"
                  center={trip.origin.coordinates}
                  onSelectPlace={(place) => handleSelectOrigin(place)}
                  onClose={() => setIsEditingOrigin(false)}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingOrigin(true);
                    setIsEditingDestination(false);
                    setIsAddingWaypoint(false);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-edge-default text-left text-xs font-semibold text-content-primary flex items-center justify-between transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{trip.origin.name}</span>
                    {trip.origin.subTitle && (
                      <span className="text-[10px] text-content-tertiary truncate">
                        ({trip.origin.subTitle})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-content-tertiary">
                    <Search className="w-3 h-3 hover:text-brand-primary" />
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={useCurrentLocationAsOrigin}
                  title="Use My Current GPS Location as Origin"
                  aria-label="Use My GPS Location"
                  className="px-2 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0 shadow-sm"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">My Location</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Intermediate Waypoints */}
        {trip.waypoints.map((wp, index) => {
          const isCharging = wp.type === 'charging_pinned' || wp.category === 'charging_station';
          return (
            <div key={wp.id} className="relative flex items-center gap-2 pl-4 pr-9">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isCharging ? 'bg-status-warning ring-2 ring-status-warning/20' : 'bg-brand-primary ring-2 ring-brand-primary/20'
                }`}
              />
              <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface-panel border border-edge-default text-xs text-content-primary flex items-center justify-between shadow-sm gap-2">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-semibold truncate">{wp.name}</span>
                  {isCharging ? (
                    <span className="px-1.5 py-0.2 rounded bg-status-warningSubtle text-status-warning border border-status-warning/30 text-[9px] font-mono shrink-0 flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5" />
                      <span>Charger</span>
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-brand-subtle text-brand-primary border border-brand-primary/30 text-[9px] shrink-0">
                      Via Stop
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMoveWaypointUp(index)}
                      title="Move stop earlier"
                      className="p-1 rounded text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                  )}
                  {index < trip.waypoints.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleMoveWaypointDown(index)}
                      title="Move stop later"
                      className="p-1 rounded text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveWaypoint(wp.id, wp.name)}
                    title="Remove stop"
                    className="p-1 rounded text-content-tertiary hover:text-status-danger hover:bg-status-dangerSubtle"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Swap Endpoints Button */}
        <button
          type="button"
          onClick={handleSwapEndpoints}
          title="Swap Origin and Destination"
          aria-label="Swap endpoints"
          className="absolute right-2 top-[34px] -translate-y-1/2 p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary transition-colors shadow-sm z-10"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>

        {/* Destination field */}
        <div className="relative pr-9">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-primary shrink-0 ring-2 ring-brand-primary/20" />
            {isEditingDestination ? (
              <div className="flex-1">
                <UniversalLocationSearch
                  autoFocus
                  placeholder="Search destination city, address, landmark..."
                  targetMode="destination"
                  center={trip.origin.coordinates}
                  onSelectPlace={(place) => handleSelectDestination(place)}
                  onClose={() => setIsEditingDestination(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsEditingDestination(true);
                  setIsEditingOrigin(false);
                  setIsAddingWaypoint(false);
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-edge-default text-left text-xs font-semibold text-content-primary flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="truncate">{trip.destination.name}</span>
                  {trip.destination.subTitle && (
                    <span className="text-[10px] text-content-tertiary truncate">
                      ({trip.destination.subTitle})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-content-tertiary">
                  <Search className="w-3 h-3 hover:text-brand-primary" />
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline Universal Waypoint Search when isAddingWaypoint is true */}
      {isAddingWaypoint && (
        <div className="pt-2 border-t border-edge-subtle space-y-1.5 animate-in fade-in zoom-in-95 duration-120">
          <div className="flex items-center justify-between text-[11px] font-semibold text-content-primary">
            <span>Add Intermediate Stop</span>
            <button
              type="button"
              onClick={() => setIsAddingWaypoint(false)}
              className="text-content-tertiary hover:text-content-primary p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <UniversalLocationSearch
            autoFocus
            placeholder="Type place name, restaurant, hotel, charger..."
            targetMode="waypoint"
            center={trip.origin.coordinates}
            onSelectPlace={(place, actionType) => handleAddWaypoint(place, actionType)}
            onClose={() => setIsAddingWaypoint(false)}
          />
        </div>
      )}

      {/* Add Waypoint Trigger Bar */}
      <div className="relative pt-1 border-t border-edge-subtle flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setPlaceSearchMode('waypoint');
            setIsPlaceSearchOpen(true);
            setIsEditingOrigin(false);
            setIsEditingDestination(false);
            setIsAddingWaypoint(false);
          }}
          className="text-xs text-brand-primary hover:underline font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Add Stop (Search Any Place)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsAddingWaypoint(!isAddingWaypoint);
            setIsEditingOrigin(false);
            setIsEditingDestination(false);
          }}
          className="text-[11px] text-content-secondary hover:text-content-primary flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>Inline Search</span>
        </button>
      </div>

      {/* Initial Battery SoC Slider */}
      <div className="pt-2 border-t border-edge-subtle flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-content-secondary font-medium">
          <BatteryCharging className="w-3.5 h-3.5 text-brand-primary" />
          <span>Departure Battery SoC</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={trip.origin.batterySoc ?? 95}
            onChange={(e) => handleDepartureSocChange(Number(e.target.value))}
            className="w-24 accent-brand-primary h-1.5 rounded-lg cursor-pointer"
          />
          <span className="font-bold text-xs text-content-primary w-9 text-right font-mono">
            {trip.origin.batterySoc ?? 95}%
          </span>
        </div>
      </div>

      {/* Universal Place Search Modal */}
      <PlaceSearchModal
        isOpen={isPlaceSearchOpen}
        onClose={() => setIsPlaceSearchOpen(false)}
        targetMode={placeSearchMode}
      />
    </div>
  );
};
