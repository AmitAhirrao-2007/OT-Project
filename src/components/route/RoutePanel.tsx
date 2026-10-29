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
        className={`fixed top-4 left-4 z-40 p-2 rounded-xl bg-[#1a232f]/95 hover:bg-[#253242] border border-[#2c3a4a] text-slate-200 shadow-2xl backdrop-blur-md transition-all ${
          isPanelCollapsed ? 'opacity-100 scale-100' : 'hidden md:flex opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight className="w-4 h-4 text-[#00b0ff]" />
      </button>

      <aside
        aria-label="Route planning details"
        className={`fixed md:relative top-0 left-0 h-full w-full sm:w-[420px] md:w-[440px] bg-[#141b24] border-r border-[#222e3d] flex flex-col z-30 shadow-2xl shrink-0 transition-transform duration-300 ease-in-out ${
          isPanelCollapsed ? '-translate-x-full md:-translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* 1. Header & Destination area */}
        <div className="p-4 border-b border-[#202b38] bg-[#18212c]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePanelCollapse}
                title="Collapse Panel"
                aria-label="Collapse panel"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#253344] transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-tight">
                    {trip.destination.name}
                  </h1>
                  {trip.destination.subTitle && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#243344] text-slate-300 font-medium border border-[#374c63]">
                      {trip.destination.subTitle}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span>From</span>
                  <span className="text-slate-200 font-medium">{trip.origin.name}</span>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => openSettingsTab('vehicle')}
                    className="text-[#00b0ff] hover:underline font-medium"
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
                    ? 'bg-[#00b0ff]/20 text-[#00b0ff] border-[#00b0ff]/50'
                    : 'text-slate-400 hover:text-white hover:bg-[#253344] border-[#2b3a4a]'
                }`}
              >
                <MapPin className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsOptionsModalOpen(true)}
                title="Route Planning Options"
                aria-label="Open route options"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#253344] border border-[#2b3a4a] transition-colors"
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
          <div className="mt-3.5 grid grid-cols-3 gap-1.5 p-1 bg-[#10161f] border border-[#232f3e] rounded-xl">
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
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs transition-all ${
                    isSelected
                      ? 'bg-[#253446] text-white font-bold shadow-md border border-[#3b506b]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#18212b]'
                  }`}
                >
                  <span className="text-[13px]">{opt.label}</span>
                  {opt.badge ? (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full mt-0.5 uppercase tracking-wider font-semibold ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'text-slate-500'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-500 mt-0.5">Alternative</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 3. Single Source of Truth Trip Summary Statistics */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-300 bg-[#121922] p-2 rounded-lg border border-[#202b38]">
            <div className="flex items-center gap-1" title="Driving time on road">
              <Compass className="w-3.5 h-3.5 text-slate-400" />
              <span>{activeRoute.drivingDuration}</span>
            </div>
            <span>•</span>
            <div
              className="flex items-center gap-1 cursor-help"
              title={`Charging: ${activeRoute.chargingDuration} | Stop buffer allowance: ${activeRoute.stopBufferDuration} (5 min per stop)`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{activeRoute.chargingDuration}</span>
              <span className="text-[9px] text-slate-400 font-normal">
                (+{activeRoute.stopBufferMinutes}m)
              </span>
            </div>
            <span>•</span>
            <div title="Total highway distance">
              <span>{formatDistance(activeRoute.totalDistanceMi, displaySettings.units)}</span>
            </div>
            <span>•</span>
            <div title="Number of charging stops">
              <span>{activeRoute.stopCount} stops</span>
            </div>
            <span>•</span>
            <div title="Estimated battery energy consumed">
              <span>{activeRoute.totalEnergyKwh} kWh</span>
            </div>
            {activeRoute.tollNote && (
              <>
                <span>•</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] border font-medium ${
                    activeRoute.tollNote === 'No Toll'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {activeRoute.tollNote}
                </span>
              </>
            )}
          </div>

          {/* Feasibility Alert Banner */}
          {!activeRoute.isFeasible && (
            <div className="mt-2.5 p-2.5 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Route Infeasible Under Current Constraints</strong>
                <p className="text-[11px] text-rose-300 mt-0.5">
                  One or more legs exceed battery range or drop below required minimum reserve ({minDestReserve}%). Try relaxing minimum battery reserve or unblocking networks.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 4. Scrollable Stops & Route Details */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {/* Origin Card (Patna) */}
          <div className="relative rounded-xl border border-emerald-900/50 bg-[#14231f] p-3 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                  A
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-400 font-mono">
                      {trip.origin.departureTime}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {trip.origin.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Origin Departure Point</p>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  {trip.origin.batterySoc}%
                </span>
                <span className="text-[10px] text-slate-400">Departure SoC</span>
              </div>
            </div>
          </div>

          {/* Charging Stops for the Selected Route */}
          {activeRoute.stops.map((stop, index) => (
            <ChargingStopCard key={stop.id} stop={stop} index={index} />
          ))}

          {/* Final Leg to Destination */}
          <div className="flex items-center gap-2 pl-7 py-2 text-xs text-slate-400">
            <div className="w-px h-6 bg-[#2a3746] absolute left-3.5"></div>
            <span className="font-medium text-slate-300">{formatHoursMinutes(finalLegDriveMinutes)}</span>
            <span>·</span>
            <span>{formatDistance(finalLegDistanceMi, displaySettings.units)}</span>
          </div>

          {/* Destination Card */}
          <div className={`relative rounded-xl border p-3 shadow-sm transition-colors ${
            isDestReserveSatisfied
              ? 'border-cyan-900/60 bg-[#13222d]'
              : 'border-rose-900/60 bg-[#25151b]'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isDestReserveSatisfied
                    ? 'bg-[#00b0ff]/20 text-[#00b0ff] border border-[#00b0ff]/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  B
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#00b0ff] font-mono">
                      {destinationEta}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {trip.destination.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {trip.destination.subTitle || 'Final Destination'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className={`text-xs font-bold font-mono ${
                  isDestReserveSatisfied ? 'text-cyan-300' : 'text-rose-400 animate-pulse'
                }`}>
                  {destArrivalSoc}%
                </span>
                <span className="text-[10px] text-slate-400">
                  {isDestReserveSatisfied ? 'Arrival SoC' : 'Low Reserve!'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Bottom Action Bar: Options & Replan */}
        <div className="p-3.5 border-t border-[#202b38] bg-[#17202c] grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIsOptionsModalOpen(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-[#222f3e] hover:bg-[#2c3c4e] text-slate-200 text-xs font-semibold border border-[#33465b] flex items-center justify-center gap-2 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#00b0ff]" />
            <span>Options</span>
          </button>

          <button
            type="button"
            onClick={replanRoute}
            className="w-full py-2.5 px-4 rounded-xl bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <RotateCw className="w-4 h-4 stroke-[2.5]" />
            <span>Replan</span>
          </button>
        </div>
      </aside>
    </>
  );
};
