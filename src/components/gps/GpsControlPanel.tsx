import React from 'react';
import { useGps } from '../../context/GpsContext';
import {
  Navigation,
  Crosshair,
  Square,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2
} from 'lucide-react';

export const GpsControlPanel: React.FC = () => {
  const {
    gpsState,
    locateMe,
    startTracking,
    stopTracking,
    toggleFollowMe
  } = useGps();

  const {
    status,
    currentPosition,
    isTracking,
    isFollowMe,
    routeProgress
  } = gpsState;

  const isLocating = status === 'locating';

  return (
    <div className="flex flex-col items-end gap-2 pointer-events-auto">
      {/* Route Progress HUD Card (Visible when tracking and route progress is calculated) */}
      {isTracking && routeProgress && routeProgress.isMatching && (
        <div className="bg-surface-panel border border-edge-default rounded-xl shadow-dropdown p-3 text-xs w-64 space-y-2 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-content-primary">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Route Progress</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                routeProgress.isOffRoute
                  ? 'bg-amber-500/20 text-amber-600 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
              }`}
            >
              {routeProgress.isOffRoute ? 'Off Route' : 'On Route'}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="w-full bg-surface-subtle rounded-full h-2 overflow-hidden border border-edge-subtle">
              <div
                className={`h-full transition-all duration-500 ${
                  routeProgress.isOffRoute ? 'bg-amber-500' : 'bg-brand-primary'
                }`}
                style={{ width: `${routeProgress.progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-content-muted font-mono">
              <span>{routeProgress.progressPercentage}% Complete</span>
              <span>{routeProgress.distanceTravelledMi} / {routeProgress.totalDistanceMi} mi</span>
            </div>
          </div>

          {/* Detailed Remaining & Deviation Stats */}
          <div className="grid grid-cols-2 gap-1 text-[11px] pt-1 border-t border-edge-subtle">
            <div>
              <span className="text-[10px] text-content-muted">Remaining:</span>
              <div className="font-bold text-content-primary">{routeProgress.remainingDistanceMi} mi</div>
            </div>
            <div>
              <span className="text-[10px] text-content-muted">Deviation:</span>
              <div className={`font-bold ${routeProgress.isOffRoute ? 'text-amber-500' : 'text-emerald-500'}`}>
                {routeProgress.deviationDistanceMeters}m
              </div>
            </div>
          </div>

          {/* Follow Me Pill & Speed Info */}
          <div className="flex items-center justify-between pt-1 border-t border-edge-subtle">
            <button
              type="button"
              onClick={toggleFollowMe}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                isFollowMe
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-subtle text-content-muted hover:text-content-primary'
              }`}
            >
              {isFollowMe ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>{isFollowMe ? 'Follow Me ON' : 'Follow Me OFF'}</span>
            </button>

            {currentPosition?.speed !== null && currentPosition?.speed !== undefined && (
              <span className="text-[10px] font-mono text-content-muted">
                {Math.round(currentPosition.speed * 2.23694)} mph
              </span>
            )}
          </div>
        </div>
      )}

      {/* GPS Off-Corridor Alert (When tracking but far from selected route) */}
      {isTracking && routeProgress && !routeProgress.isMatching && (
        <div className="bg-amber-950 border border-amber-600/60 text-amber-200 rounded-xl shadow-dropdown p-2.5 text-xs w-60 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Off Route Corridor</span>
          </div>
          <p className="text-[10px] text-amber-300">
            {routeProgress.statusText}
          </p>
        </div>
      )}

      {/* Primary GPS Map Buttons (Clean Solid Styling) */}
      <div className="flex flex-col gap-1.5">
        {/* Continuous Tracking Toggle */}
        <button
          type="button"
          onClick={() => {
            if (isTracking) {
              stopTracking();
            } else {
              startTracking();
            }
          }}
          title={isTracking ? 'Stop Live GPS Tracking' : 'Start Live GPS Tracking'}
          aria-label={isTracking ? 'Stop Live GPS' : 'Start Live GPS'}
          className={`p-2.5 rounded-xl border shadow-dropdown transition-colors flex items-center justify-center ${
            isTracking
              ? 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-500/40 animate-pulse'
              : 'bg-surface-panel border-edge-default text-content-primary hover:bg-surface-hover hover:text-brand-primary'
          }`}
        >
          {isTracking ? <Square className="w-4 h-4 fill-current" /> : <Navigation className="w-4 h-4" />}
        </button>

        {/* Locate Me One-Time Trigger */}
        <button
          type="button"
          onClick={locateMe}
          disabled={isLocating}
          title="Locate Me (Current GPS Coordinates)"
          aria-label="Locate Me"
          className={`p-2.5 rounded-xl border shadow-dropdown transition-colors flex items-center justify-center ${
            isLocating
              ? 'bg-surface-subtle text-brand-primary border-brand-primary/40'
              : 'bg-surface-panel border-edge-default text-content-primary hover:bg-surface-hover hover:text-brand-primary'
          }`}
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
          ) : (
            <Crosshair className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
