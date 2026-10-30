import React, { useState } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { POPULAR_LOCATIONS, LocationPoint } from '../../data/knownLocations';
import { Waypoint } from '../../types/route';
import {
  ArrowUpDown,
  Plus,
  X,
  MapPin,
  ChevronDown,
  BatteryCharging,
  ArrowUp,
  ArrowDown
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

  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  // Handle swapping origin and destination
  const handleSwapEndpoints = () => {
    setTrip((prev) => ({
      ...prev,
      origin: {
        ...prev.destination,
        batterySoc: prev.origin.batterySoc,
        departureTime: prev.origin.departureTime
      },
      destination: {
        ...prev.origin,
        batterySoc: prev.destination.batterySoc,
        arrivalTime: prev.destination.arrivalTime
      },
      waypoints: [...prev.waypoints].reverse()
    }));
    showToast('Swapped Origin and Destination. Recalculating route...');
    setTimeout(() => {
      replanRoute();
    }, 150);
  };

  // Select location for Origin
  const handleSelectOrigin = (loc: LocationPoint) => {
    setTrip((prev) => ({
      ...prev,
      origin: {
        ...prev.origin,
        name: loc.name,
        subTitle: loc.subTitle,
        coordinates: loc.coordinates
      }
    }));
    setIsEditingOrigin(false);
    showToast(`Origin set to ${loc.name}`);
    setTimeout(() => replanRoute(), 150);
  };

  // Select location for Destination
  const handleSelectDestination = (loc: LocationPoint) => {
    setTrip((prev) => ({
      ...prev,
      destination: {
        ...prev.destination,
        name: loc.name,
        subTitle: loc.subTitle,
        coordinates: loc.coordinates
      }
    }));
    setIsEditingDestination(false);
    showToast(`Destination set to ${loc.name}`);
    setTimeout(() => replanRoute(), 150);
  };

  // Add waypoint
  const handleAddWaypoint = (loc: LocationPoint) => {
    const newWaypoint: Waypoint = {
      id: `waypoint-${Date.now()}`,
      name: loc.name,
      subTitle: loc.subTitle,
      coordinates: loc.coordinates,
      batterySoc: 25,
      isCustom: true
    };

    setTrip((prev) => ({
      ...prev,
      waypoints: [...prev.waypoints, newWaypoint]
    }));
    setIsAddingWaypoint(false);
    showToast(`Added intermediate stop: ${loc.name}`);
    setTimeout(() => replanRoute(), 150);
  };

  // Remove waypoint
  const handleRemoveWaypoint = (id: string, name: string) => {
    setTrip((prev) => ({
      ...prev,
      waypoints: prev.waypoints.filter((w) => w.id !== id)
    }));
    showToast(`Removed stop ${name}`);
    setTimeout(() => replanRoute(), 150);
  };

  // Move waypoint up
  const handleMoveWaypointUp = (index: number) => {
    if (index === 0) return;
    setTrip((prev) => {
      const nextWaypoints = [...prev.waypoints];
      const temp = nextWaypoints[index - 1];
      nextWaypoints[index - 1] = nextWaypoints[index];
      nextWaypoints[index] = temp;
      return { ...prev, waypoints: nextWaypoints };
    });
    setTimeout(() => replanRoute(), 150);
  };

  // Move waypoint down
  const handleMoveWaypointDown = (index: number) => {
    if (index >= trip.waypoints.length - 1) return;
    setTrip((prev) => {
      const nextWaypoints = [...prev.waypoints];
      const temp = nextWaypoints[index + 1];
      nextWaypoints[index + 1] = nextWaypoints[index];
      nextWaypoints[index] = temp;
      return { ...prev, waypoints: nextWaypoints };
    });
    setTimeout(() => replanRoute(), 150);
  };

  // Handle departure SoC change
  const handleDepartureSocChange = (soc: number) => {
    setTrip((prev) => ({
      ...prev,
      origin: { ...prev.origin, batterySoc: soc }
    }));
    setTimeout(() => replanRoute(), 100);
  };

  const filteredLocations = POPULAR_LOCATIONS.filter(
    (l) =>
      l.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      l.state.toLowerCase().includes(filterQuery.toLowerCase()) ||
      l.subTitle.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-2.5 bg-surface-subtle p-3 rounded-xl border border-edge-subtle">
      {/* Route Endpoints Box */}
      <div className="relative space-y-2">
        {/* Origin field */}
        <div className="relative pr-9">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-success shrink-0 ring-2 ring-status-success/20" />
            <button
              type="button"
              onClick={() => {
                setIsEditingOrigin(!isEditingOrigin);
                setIsEditingDestination(false);
                setIsAddingWaypoint(false);
                setFilterQuery('');
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
              <ChevronDown className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
            </button>
          </div>

          {/* Origin Dropdown Picker */}
          {isEditingOrigin && (
            <div className="absolute top-9 left-4 right-0 z-50 bg-surface-panel border border-edge-default rounded-xl shadow-panel p-2 animate-in fade-in zoom-in-95 duration-150">
              <input
                type="text"
                autoFocus
                placeholder="Search origin city..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full px-2.5 py-1.5 mb-1.5 bg-surface-subtle border border-edge-default rounded-lg text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
              />
              <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                {filteredLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => handleSelectOrigin(loc)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-content-primary hover:bg-surface-hover flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold">{loc.name}</div>
                      <div className="text-[10px] text-content-tertiary">{loc.subTitle}</div>
                    </div>
                    <MapPin className="w-3 h-3 text-content-tertiary" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Intermediate Waypoints */}
        {trip.waypoints.map((wp, index) => (
          <div key={wp.id} className="relative flex items-center gap-2 pl-4 pr-9">
            <span className="w-2 h-2 rounded-full bg-status-warning shrink-0" />
            <div className="flex-1 px-3 py-1.5 rounded-lg bg-surface-panel border border-edge-default text-xs text-content-primary flex items-center justify-between shadow-sm">
              <span className="font-medium truncate">{wp.name}</span>
              <div className="flex items-center gap-1">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMoveWaypointUp(index)}
                    title="Move stop earlier"
                    className="p-0.5 rounded text-content-tertiary hover:text-content-primary"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                )}
                {index < trip.waypoints.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleMoveWaypointDown(index)}
                    title="Move stop later"
                    className="p-0.5 rounded text-content-tertiary hover:text-content-primary"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveWaypoint(wp.id, wp.name)}
                  title="Remove stop"
                  className="p-0.5 rounded text-content-tertiary hover:text-status-danger"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

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
            <button
              type="button"
              onClick={() => {
                setIsEditingDestination(!isEditingDestination);
                setIsEditingOrigin(false);
                setIsAddingWaypoint(false);
                setFilterQuery('');
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
              <ChevronDown className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
            </button>
          </div>

          {/* Destination Dropdown Picker */}
          {isEditingDestination && (
            <div className="absolute top-9 left-4 right-0 z-50 bg-surface-panel border border-edge-default rounded-xl shadow-panel p-2 animate-in fade-in zoom-in-95 duration-150">
              <input
                type="text"
                autoFocus
                placeholder="Search destination city..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full px-2.5 py-1.5 mb-1.5 bg-surface-subtle border border-edge-default rounded-lg text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
              />
              <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                {filteredLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => handleSelectDestination(loc)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-content-primary hover:bg-surface-hover flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold">{loc.name}</div>
                      <div className="text-[10px] text-content-tertiary">{loc.subTitle}</div>
                    </div>
                    <MapPin className="w-3 h-3 text-content-tertiary" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Waypoint Trigger */}
      <div className="relative pt-1 border-t border-edge-subtle flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setIsAddingWaypoint(!isAddingWaypoint);
            setIsEditingOrigin(false);
            setIsEditingDestination(false);
            setFilterQuery('');
          }}
          className="text-xs text-brand-primary hover:underline font-semibold flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Stop / Waypoint</span>
        </button>

        {isAddingWaypoint && (
          <div className="absolute top-8 left-0 right-0 z-50 bg-surface-panel border border-edge-default rounded-xl shadow-panel p-2 animate-in fade-in zoom-in-95 duration-150">
            <input
              type="text"
              autoFocus
              placeholder="Search city or highway junction..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 mb-1.5 bg-surface-subtle border border-edge-default rounded-lg text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
            />
            <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
              {filteredLocations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleAddWaypoint(loc)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-content-primary hover:bg-surface-hover flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="font-semibold">{loc.name}</div>
                    <div className="text-[10px] text-content-tertiary">{loc.subTitle}</div>
                  </div>
                  <Plus className="w-3 h-3 text-brand-primary" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Origin Departure Battery SoC Slider */}
      <div className="pt-2 border-t border-edge-subtle flex items-center justify-between text-xs">
        <span className="text-content-secondary flex items-center gap-1.5">
          <BatteryCharging className="w-3.5 h-3.5 text-status-success" />
          <span>Departure Battery:</span>
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={trip.origin.batterySoc}
            onChange={(e) => handleDepartureSocChange(Number(e.target.value))}
            className="w-24 accent-emerald-500 h-1 bg-surface-hover rounded cursor-pointer"
          />
          <span className="font-mono font-bold text-status-success w-9 text-right">
            {trip.origin.batterySoc}%
          </span>
        </div>
      </div>
    </div>
  );
};
