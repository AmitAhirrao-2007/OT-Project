import React, { useState } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { ChargingStopCard } from './ChargingStopCard';
import { RouteInputs } from './RouteInputs';
import { formatDistance } from '../../utils/units';
import { formatHoursMinutes, addMinutesToTimeString } from '../../services/routingService';
import { calculateLegEnergy } from '../../services/energyModel';
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  RotateCw,
  Zap,
  Compass,
  MapPin,
  AlertTriangle
} from 'lucide-react';

export const RoutePanel: React.FC = () => {
  const {
    trip,
    activeRoute,
    selectedRouteId,
    setSelectedRouteId,
    setIsOptionsModalOpen,
    replanRoute,
    vehicle,
    displaySettings,
    planOptions,
    chargingSettings,
    openSettingsTab,
    isPanelCollapsed,
    togglePanelCollapse,
    showToast
  } = usePlanner();

  const [isEndpointsExpanded, setIsEndpointsExpanded] = useState(false);

  // Remaining leg distance to final destination
  const stopsDistanceSum = activeRoute.stops.reduce((sum, s) => sum + s.legDistanceMi, 0);
  const finalLegDistanceMi = Math.max(15, activeRoute.totalDistanceMi - stopsDistanceSum);
  const finalLegDriveMinutes = Math.round(finalLegDistanceMi * 1.33);

  let destinationEta = trip.destination.arrivalTime || '3:12 PM';
  let destArrivalSoc = trip.destination.batterySoc;

  if (activeRoute.stops.length > 0) {
    const lastStop = activeRoute.stops[activeRoute.stops.length - 1];
    destinationEta = addMinutesToTimeString(lastStop.departureTime, finalLegDriveMinutes);
    const finalLegEnergy = calculateLegEnergy({ distanceMi: finalLegDistanceMi, vehicle });
    destArrivalSoc = Math.round(lastStop.departureSoc - finalLegEnergy.socPercent);
  } else {
    destinationEta = addMinutesToTimeString(
      trip.origin.departureTime || '12:31 AM',
      activeRoute.drivingDurationMinutes
    );
    const directEnergy = calculateLegEnergy({ distanceMi: activeRoute.totalDistanceMi, vehicle });
    destArrivalSoc = Math.round(trip.origin.batterySoc - directEnergy.socPercent);
  }

  const minDestReserve =
    planOptions.destinationArrivalSoc ||
    chargingSettings.preferredMinArrivalBatteryDestination ||
    10;
  const isDestReserveSatisfied = destArrivalSoc >= minDestReserve;

  return (
    <>
      {/* Floating Toggle Button for Mobile / Small Screens & Desktop collapse */}
      <button
        type="button"
        onClick={togglePanelCollapse}
        aria-label={isPanelCollapsed ? 'Expand Route Panel' : 'Collapse Route Panel'}
        className={`fixed top-4 left-4 z-40 p-2.5 rounded-lg bg-surface-panel border border-edge-default text-content-primary shadow-panel backdrop-blur-md transition-all ${
          isPanelCollapsed ? 'flex opacity-100 scale-100 pointer-events-auto' : 'hidden md:flex opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight className="w-4 h-4 text-brand-primary" />
      </button>

      <aside
        aria-label="Route planning details"
        className={`fixed md:absolute top-4 left-4 bottom-4 w-full sm:w-[485px] md:w-[495px] max-w-[calc(100vw-2rem)] bg-surface-panel border border-edge-subtle rounded-xl flex flex-col z-20 shadow-panel overflow-hidden backdrop-blur-sm transition-transform duration-300 ease-in-out ${
          isPanelCollapsed ? '-translate-x-[calc(100%+2rem)]' : 'translate-x-0'
        }`}
      >
        {/* 1. Header & Destination area */}
        <div className="p-4 border-b border-edge-subtle bg-surface-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePanelCollapse}
                title="Collapse Panel"
                aria-label="Collapse panel"
                className="p-1.5 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-content-primary tracking-tight">
                    {trip.destination.name}
                  </h1>
                  {trip.destination.subTitle && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-subtle text-content-secondary font-medium border border-edge-subtle">
                      {trip.destination.subTitle}
                    </span>
                  )}
                </div>
                <p className="text-xs text-content-secondary flex items-center gap-1.5 mt-0.5">
                  <span>From</span>
                  <span className="text-content-primary font-medium">{trip.origin.name}</span>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => openSettingsTab('vehicle')}
                    className="text-brand-primary hover:underline font-medium"
                    title="Edit vehicle model"
                  >
                    {vehicle.name}
                  </button>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsEndpointsExpanded(!isEndpointsExpanded)}
                title="Edit origin, destination & stops"
                aria-label="Edit route endpoints"
                className={`p-2 rounded-lg border transition-colors ${
                  isEndpointsExpanded
                    ? 'bg-brand-subtle text-brand-primary border-brand-primary/40'
                    : 'text-content-muted hover:text-content-primary hover:bg-surface-hover border-edge-default'
                }`}
              >
                <MapPin className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsOptionsModalOpen(true)}
                title="Route Planning Options"
                aria-label="Open route options"
                className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-hover border border-edge-default transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible Route Endpoints & Waypoints Editor */}
          {isEndpointsExpanded && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-150">
              <RouteInputs />
            </div>
          )}

          {/* 2. Route Duration Segmented Buttons */}
          <div className="mt-3.5 grid grid-cols-3 gap-1.5 p-1 bg-surface-subtle border border-edge-subtle rounded-lg">
            {trip.routeOptions.map((opt) => {
              const isSelected = opt.id === selectedRouteId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedRouteId(opt.id);
                    showToast(`Selected route alternative: ${opt.label}`);
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-xs transition-all ${
                    isSelected
                      ? 'bg-surface-panel text-content-primary font-bold shadow-card border border-edge-default'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                  }`}
                >
                  <span className="text-[13px]">{opt.label}</span>
                  {opt.badge ? (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-md mt-0.5 uppercase tracking-wider font-semibold ${
                        isSelected
                          ? 'bg-status-successSubtle text-status-success border border-status-success/30'
                          : 'text-content-muted'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  ) : (
                    <span className="text-[9px] mt-0.5 text-content-muted">
                      Alternative
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 3. Single Source of Truth Trip Summary Statistics */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-content-secondary bg-surface-subtle p-2.5 rounded-lg border border-edge-subtle">
            <div className="flex items-center gap-1" title="Driving time on road">
              <Compass className="w-3.5 h-3.5 text-content-muted" />
              <span className="text-content-primary font-medium">{activeRoute.drivingDuration}</span>
            </div>
            <span>•</span>
            <div
              className="flex items-center gap-1 cursor-help"
              title={`Charging: ${activeRoute.chargingDuration} | Stop buffer allowance: ${activeRoute.stopBufferDuration} (5 min per stop)`}
            >
              <Zap className="w-3.5 h-3.5 text-status-warning" />
              <span className="text-content-primary font-medium">{activeRoute.chargingDuration}</span>
              <span className="text-[9px] text-content-muted font-normal">
                (+{activeRoute.stopBufferMinutes}m)
              </span>
            </div>
            <span>•</span>
            <div title="Total highway distance">
              <span className="text-content-primary font-medium">{formatDistance(activeRoute.totalDistanceMi, displaySettings.units)}</span>
            </div>
            <span>•</span>
            <div title="Number of charging stops">
              <span className="text-content-primary font-medium">{activeRoute.stopCount} stops</span>
            </div>
            <span>•</span>
            <div title="Estimated battery energy consumed">
              <span className="text-content-primary font-medium">{activeRoute.totalEnergyKwh} kWh</span>
            </div>
            {activeRoute.tollNote && (
              <>
                <span>•</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] border font-medium ${
                    activeRoute.tollNote === 'No Toll'
                      ? 'bg-status-successSubtle text-status-success border-status-success/30'
                      : 'bg-surface-panel text-content-secondary border-edge-subtle'
                  }`}
                >
                  {activeRoute.tollNote}
                </span>
              </>
            )}
          </div>

          {/* Feasibility Alert Banner */}
          {!activeRoute.isFeasible && (
            <div className="mt-2.5 p-2.5 bg-status-dangerSubtle border border-status-danger/40 rounded-lg text-status-danger text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-status-danger shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Route Infeasible Under Current Constraints</strong>
                <p className="text-[11px] opacity-90 mt-0.5">
                  One or more legs exceed battery range or drop below required minimum reserve ({minDestReserve}%). Try relaxing minimum battery reserve or unblocking networks.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 4. Scrollable Stops & Route Details */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar bg-surface-canvas">
          {/* Origin Card (Patna) */}
          <div className="relative rounded-lg border border-status-success/30 bg-status-successSubtle/40 p-3.5 shadow-card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-status-success text-white flex items-center justify-center text-xs font-bold shrink-0">
                  A
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-status-success font-mono">
                      {trip.origin.departureTime}
                    </span>
                    <span className="text-sm font-semibold text-content-primary">
                      {trip.origin.name}
                    </span>
                  </div>
                  <p className="text-xs text-content-secondary">Origin Departure Point</p>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-status-success font-mono">
                  {trip.origin.batterySoc}%
                </span>
                <span className="text-[10px] text-content-muted">Departure SoC</span>
              </div>
            </div>
          </div>

          {/* Charging Stops for the Selected Route */}
          {activeRoute.stops.map((stop, index) => (
            <ChargingStopCard key={stop.id} stop={stop} index={index} />
          ))}

          {/* Final Leg to Destination */}
          <div className="flex items-center gap-2 pl-7 py-2 text-xs text-content-secondary">
            <div className="w-px h-6 bg-edge-default absolute left-3.5"></div>
            <span className="font-medium text-content-primary">{formatHoursMinutes(finalLegDriveMinutes)}</span>
            <span>·</span>
            <span>{formatDistance(finalLegDistanceMi, displaySettings.units)}</span>
          </div>

          {/* Destination Card */}
          <div className={`relative rounded-lg border p-3.5 shadow-card transition-colors ${
            isDestReserveSatisfied
              ? 'border-edge-default bg-surface-card'
              : 'border-status-danger/40 bg-status-dangerSubtle/40'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                  isDestReserveSatisfied
                    ? 'bg-brand-primary text-white'
                    : 'bg-status-danger text-white'
                }`}>
                  B
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-brand-primary font-mono">
                      {destinationEta}
                    </span>
                    <span className="text-sm font-semibold text-content-primary">
                      {trip.destination.name}
                    </span>
                  </div>
                  <p className="text-xs text-content-secondary">
                    {trip.destination.subTitle || 'Final Destination'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className={`text-xs font-bold font-mono ${
                  isDestReserveSatisfied ? 'text-brand-primary' : 'text-status-danger'
                }`}>
                  {destArrivalSoc}%
                </span>
                <span className="text-[10px] text-content-muted">
                  {isDestReserveSatisfied ? 'Arrival SoC' : 'Low Reserve!'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Bottom Action Bar: Options & Replan */}
        <div className="p-3.5 border-t border-edge-subtle bg-surface-panel grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIsOptionsModalOpen(true)}
            className="w-full py-2.5 px-4 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary text-xs font-semibold border border-edge-default flex items-center justify-center gap-2 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-brand-primary" />
            <span>Options</span>
          </button>

          <button
            type="button"
            onClick={replanRoute}
            className="w-full py-2.5 px-4 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-contrast text-xs font-bold shadow-card flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <RotateCw className="w-4 h-4 stroke-[2.5]" />
            <span>Replan</span>
          </button>
        </div>
      </aside>
    </>
  );
};
