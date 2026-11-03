import React, { useState } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { ChargingStopCard } from './ChargingStopCard';
import { ViaStopCard } from './ViaStopCard';
import { RouteInputs } from './RouteInputs';
import { PlaceSearchModal } from '../dialogs/PlaceSearchModal';
import { SmartChargingRecommendations } from '../queue/SmartChargingRecommendations';
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
  AlertTriangle,
  Info,
  CheckCircle2,
  TrafficCone,
  Plus
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
  const [isAddStopModalOpen, setIsAddStopModalOpen] = useState(false);

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
        className={`fixed top-4 left-4 z-40 p-2.5 rounded-lg bg-surface-panel border border-edge-default text-content-primary shadow-panel transition-all ${
          isPanelCollapsed ? 'flex opacity-100 scale-100 pointer-events-auto' : 'hidden md:flex opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight className="w-4 h-4 text-brand-primary" />
      </button>

      <aside
        aria-label="Route planning details"
        className={`fixed md:absolute top-4 left-4 bottom-4 w-full sm:w-[485px] md:w-[495px] max-w-[calc(100vw-2rem)] bg-surface-panel border border-edge-subtle rounded-xl flex flex-col z-20 shadow-panel overflow-hidden transition-transform duration-300 ease-in-out ${
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
          <div className="mt-3.5 flex gap-1.5 p-1 bg-surface-subtle border border-edge-subtle rounded-lg overflow-x-auto">
            {trip.routeOptions.map((opt) => {
              const isSelected = opt.id === selectedRouteId;
              const isRcsp = opt.calculationMethod === 'RCSP Optimizer';
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedRouteId(opt.id);
                    showToast(`Selected route alternative: ${opt.label} (${opt.description || opt.calculationMethod})`);
                  }}
                  className={`flex-1 min-w-[90px] flex flex-col items-center justify-center py-2 px-1 rounded-md text-xs transition-all ${
                    isSelected
                      ? 'bg-surface-panel text-content-primary font-bold shadow-card border border-edge-default'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                  }`}
                >
                  <span className="text-[13px]">{opt.label}</span>
                  {opt.badge ? (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-md mt-0.5 uppercase tracking-wider font-semibold ${
                        isRcsp
                          ? 'bg-brand-subtle text-brand-primary border border-brand-primary/30'
                          : isSelected
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

          {/* Algorithm Identification & Geometry Verification Bar */}
          {(() => {
            const isPatnaDelhi = trip.origin.name === 'Patna' && trip.destination.name === 'Delhi';
            let algoBadge = 'Greedy Heuristic';
            let algoColor = 'bg-surface-subtle text-content-secondary border-edge-subtle';

            if (isPatnaDelhi) {
              algoBadge = 'Demo Fixture (Calibrated)';
              algoColor = 'bg-brand-subtle text-brand-primary border-brand-primary/30';
            } else if (activeRoute.calculationMethod === 'RCSP Optimizer') {
              algoBadge = 'RCSP Optimizer';
              algoColor = 'bg-brand-subtle text-brand-primary border-brand-primary/40 font-semibold';
            } else if (activeRoute.calculationMethod === 'Greedy Fallback') {
              algoBadge = 'Greedy Fallback';
              algoColor = 'bg-status-warningSubtle text-status-warning border-status-warning/40 font-semibold';
            }

            const geometryStatus = activeRoute.geometryStatus || (
              activeRoute.geometrySource === 'tomtom' ? 'PROVIDER_ROAD_GEOMETRY' :
              activeRoute.geometrySource === 'osrm' ? 'OSRM_ROAD_GEOMETRY' :
              (activeRoute.polylineCoordinates && activeRoute.polylineCoordinates.length >= 2) ? 'APPROXIMATE_GEOMETRY' :
              'GEOMETRY_UNAVAILABLE'
            );

            let geoBadgeText = 'Approx. Geometry';
            let geoBadgeColor = 'text-status-warning';
            let GeoIcon = AlertTriangle;

            if (!activeRoute.isFeasible) {
              geoBadgeText = 'EV Journey Infeasible';
              geoBadgeColor = 'text-status-danger';
              GeoIcon = AlertTriangle;
            } else if (geometryStatus === 'PROVIDER_ROAD_GEOMETRY') {
              geoBadgeText = 'Road Verified (TomTom)';
              geoBadgeColor = 'text-status-success';
              GeoIcon = CheckCircle2;
            } else if (geometryStatus === 'OSRM_ROAD_GEOMETRY') {
              geoBadgeText = 'Road Verified (OSRM)';
              geoBadgeColor = 'text-status-success';
              GeoIcon = CheckCircle2;
            } else if (geometryStatus === 'ROUTE_INFEASIBLE') {
              geoBadgeText = 'Route Infeasible';
              geoBadgeColor = 'text-status-danger';
              GeoIcon = AlertTriangle;
            } else if (geometryStatus === 'GEOMETRY_UNAVAILABLE') {
              geoBadgeText = 'Geometry Unavailable';
              geoBadgeColor = 'text-content-secondary';
              GeoIcon = AlertTriangle;
            }

            return (
              <>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${algoColor}`}>
                      <Zap className="w-3 h-3" />
                      <span>{algoBadge}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border bg-surface-subtle border-edge-subtle">
                      <span className={`${geoBadgeColor} flex items-center gap-1`}>
                        <GeoIcon className="w-3 h-3" />
                        <span>{geoBadgeText}</span>
                      </span>
                    </span>
                    {activeRoute.isFeasible && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{activeRoute.stops.length > 0 ? `Complete EV Route (${activeRoute.stops.length} stops)` : 'Direct EV Route'}</span>
                      </span>
                    )}
                  </div>
                  {activeRoute.calculationMethod === 'RCSP Optimizer' && (
                    <span className="text-[10px] text-brand-primary font-mono font-medium">5% SoC step</span>
                  )}
                </div>

                {activeRoute.calculationMethod === 'RCSP Optimizer' && (
                  <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-brand-subtle/50 border border-brand-primary/20 text-[11px] text-content-secondary flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-brand-primary shrink-0 mt-0.5" />
                    <p className="leading-tight">
                      <strong className="text-content-primary font-semibold">RCSP Optimization: </strong>
                      Considers charging-stop sequences respecting battery constraints using 5% SoC increments. Optimality applies to the modeled graph and discretization.
                    </p>
                  </div>
                )}

                {activeRoute.calculationMethod === 'Greedy Fallback' && (
                  <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-status-warningSubtle border border-status-warning/30 text-[11px] text-status-warning flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <p className="leading-tight">
                      <strong className="font-semibold">RCSP Infeasible — Greedy Fallback Applied: </strong>
                      No battery-feasible sequence was found by the RCSP optimizer, so the verified greedy route is displayed.
                    </p>
                  </div>
                )}
              </>
            );
          })()}

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

          {/* Live Traffic Condition Bar */}
          {activeRoute.trafficSummary && (
            <div className={`mt-2.5 px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
              activeRoute.trafficSummary.status === 'live'
                ? 'bg-status-successSubtle border-status-success/30 text-status-success'
                : 'bg-surface-subtle border-edge-subtle text-content-secondary'
            }`}>
              <div className="flex items-center gap-1.5 truncate">
                <TrafficCone className="w-3.5 h-3.5 shrink-0 text-status-warning" />
                {activeRoute.trafficSummary.status === 'live' ? (
                  <span className="truncate">
                    <strong className="font-semibold">Live Traffic: </strong>
                    {activeRoute.trafficSummary.trafficDelayMinutes > 0
                      ? `+${activeRoute.trafficSummary.trafficDelayMinutes} min delay`
                      : 'Free-flow conditions'}
                    {' '}• {activeRoute.trafficSummary.provider}
                  </span>
                ) : activeRoute.trafficSummary.status === 'missing_credentials' ? (
                  <span className="truncate">
                    <strong className="font-semibold">Traffic Unconfigured: </strong>
                    Configure TOMTOM_API_KEY in server or .env
                  </span>
                ) : (
                  <span className="truncate">
                    <strong className="font-semibold">Traffic Unavailable: </strong>
                    Using free-flow road network speeds
                  </span>
                )}
              </div>
              {activeRoute.trafficSummary.status === 'live' && (
                <span className="flex items-center gap-1 text-[10px] text-status-success font-medium shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                  <span>Real-Time</span>
                </span>
              )}
            </div>
          )}

          {/* Feasibility Alert Banner */}
          {!activeRoute.isFeasible && (
            <div className="mt-2.5 p-3 bg-status-dangerSubtle border border-status-danger/40 rounded-xl text-status-danger text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-status-danger shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-bold text-xs block text-rose-700 dark:text-rose-300">
                    Road route available — complete EV journey not currently feasible.
                  </strong>
                  <p className="text-[11px] text-rose-900 dark:text-rose-200">
                    {activeRoute.infeasibilityDetails?.reason ||
                      (activeRoute.feasibilityNote && !activeRoute.feasibilityNote.includes('complete EV journey not currently feasible')
                        ? activeRoute.feasibilityNote
                        : `One or more legs exceed battery range or drop below required minimum reserve (${minDestReserve}%).`)}
                  </p>
                </div>
              </div>

              {activeRoute.infeasibilityDetails && (
                <div className="bg-surface-panel/90 p-2.5 rounded-lg border border-status-danger/30 text-[11px] text-content-primary space-y-1.5">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-content-muted">Last Reachable Station:</span>
                      <div className="font-semibold text-content-primary truncate">
                        {activeRoute.infeasibilityDetails.lastReachableStation?.name || 'Origin (No charger reachable)'}
                      </div>
                      {typeof activeRoute.infeasibilityDetails.lastReachableStation?.arrivalSoc === 'number' && (
                        <span className="text-status-warning text-[9px] font-mono">
                          Arrival SoC: {activeRoute.infeasibilityDetails.lastReachableStation.arrivalSoc}%
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-content-muted">Remaining Gap to Destination:</span>
                      <div className="font-semibold text-rose-600 dark:text-rose-400 font-mono">
                        {formatDistance(activeRoute.infeasibilityDetails.remainingDistanceMi, displaySettings.units)}
                      </div>
                      <span className="text-[9px] text-content-muted font-mono">
                        Requires ~{activeRoute.infeasibilityDetails.remainingEnergyKwh} kWh ({activeRoute.infeasibilityDetails.requiredSocPercent}% SoC)
                      </span>
                    </div>
                  </div>

                  {activeRoute.infeasibilityDetails.suggestedAction && (
                    <div className="pt-1.5 border-t border-edge-subtle text-[10px] flex items-start gap-1">
                      <span className="font-bold text-brand-primary shrink-0">Suggested remedy:</span>
                      <span className="text-content-secondary">{activeRoute.infeasibilityDetails.suggestedAction}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Alternative Road Route Comparison Cards */}
          {trip.routeOptions.length > 1 && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-content-secondary font-semibold uppercase tracking-wider">
                <span>Road Alternatives ({trip.routeOptions.length})</span>
                <span className="text-[10px] text-brand-primary lowercase font-normal">click card or map road</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {trip.routeOptions.map((opt, i) => {
                  const isSelected = opt.id === selectedRouteId;
                  const isFeasible = opt.isFeasible;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        setSelectedRouteId(opt.id);
                        showToast(`Selected route: ${opt.description || opt.routeName || opt.label}`);
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer text-xs ${
                        isSelected
                          ? 'bg-brand-subtle/15 border-brand-primary shadow-sm ring-1 ring-brand-primary/20'
                          : 'bg-surface-subtle hover:bg-surface-hover border-edge-subtle hover:border-edge-default'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSelected
                                ? 'bg-brand-primary ring-2 ring-brand-primary/30'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span className="font-bold text-content-primary truncate">
                            {opt.routeName || `Route ${i + 1}`}
                          </span>
                          {opt.isRecommended && (
                            <span className="px-1.5 py-0.2 rounded bg-status-successSubtle text-status-success border border-status-success/30 text-[9px] font-semibold">
                              Recommended EV
                            </span>
                          )}
                          {opt.badge && !opt.isRecommended && (
                            <span className="px-1.5 py-0.2 rounded bg-surface-panel text-content-secondary border border-edge-subtle text-[9px]">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <span className="font-extrabold text-content-primary font-mono text-xs">
                          {opt.totalDuration}
                        </span>
                      </div>

                      <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10px] text-content-secondary border-t border-edge-subtle/60 pt-1.5">
                        <div>
                          <span className="block text-content-muted text-[9px]">Distance</span>
                          <span className="font-semibold text-content-primary">{opt.totalDistanceMi} mi</span>
                        </div>
                        <div>
                          <span className="block text-content-muted text-[9px]">Driving Time</span>
                          <span className="font-medium text-content-primary">{opt.drivingDuration}</span>
                        </div>
                        <div>
                          <span className="block text-content-muted text-[9px]">Charging</span>
                          <span className="font-medium text-content-primary">
                            {opt.stopCount} {opt.stopCount === 1 ? 'stop' : 'stops'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-content-muted text-[9px]">Status</span>
                          <span className={`font-semibold ${isFeasible ? 'text-status-success' : 'text-status-danger'}`}>
                            {isFeasible ? 'EV Feasible' : 'EV Infeasible'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

          {/* User-Added Via Stops */}
          {trip.waypoints
            .filter((w) => w.type !== 'charging_pinned')
            .map((wp, index) => (
              <ViaStopCard
                key={wp.id}
                waypoint={wp}
                index={index}
                totalWaypoints={trip.waypoints.filter((w) => w.type !== 'charging_pinned').length}
              />
            ))}

          {/* Zero Charging Stops Notice when corridor has no chargers */}
          {activeRoute.stops.length === 0 && (
            <div className="py-2.5 px-3 rounded-lg border border-edge-subtle bg-surface-subtle/50 text-xs text-content-secondary flex items-center gap-2">
              <Zap className="w-4 h-4 text-content-muted shrink-0" />
              <span>Direct road path without charging stops ({formatDistance(activeRoute.totalDistanceMi, displaySettings.units)}).</span>
            </div>
          )}

          {/* Charging Stops for the Selected Route */}
          {activeRoute.stops.map((stop, index) => (
            <ChargingStopCard key={stop.id} stop={stop} index={index} />
          ))}

          {/* Phase 6G: Smart Charging Recommendations along Route */}
          <SmartChargingRecommendations />

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

        {/* 5. Bottom Action Bar: Add Stop, Options & Replan */}
        <div className="p-3 border-t border-edge-subtle bg-surface-panel grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setIsAddStopModalOpen(true)}
            className="w-full py-2 px-2.5 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary text-xs font-semibold border border-edge-default flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-brand-primary" />
            <span>Add Stop</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOptionsModalOpen(true)}
            className="w-full py-2 px-2.5 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary text-xs font-semibold border border-edge-default flex items-center justify-center gap-1.5 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-brand-primary" />
            <span>Options</span>
          </button>

          <button
            type="button"
            onClick={() => replanRoute()}
            className="w-full py-2 px-2.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-slate-950 text-xs font-bold shadow-card flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
          >
            <RotateCw className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Replan</span>
          </button>
        </div>
      </aside>

      {/* General Add Stop Modal */}
      <PlaceSearchModal
        isOpen={isAddStopModalOpen}
        onClose={() => setIsAddStopModalOpen(false)}
        targetMode="waypoint"
      />
    </>
  );
};
