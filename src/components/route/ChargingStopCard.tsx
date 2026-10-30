import React from 'react';
import { ChargingStop, Amenity } from '../../types/route';
import {
  Zap,
  Utensils,
  Coffee,
  ShoppingBag,
  Wifi,
  Info
} from 'lucide-react';
import { usePlanner } from '../../context/PlannerContext';
import { formatDistance } from '../../utils/units';

interface ChargingStopCardProps {
  stop: ChargingStop;
  index: number;
}

const renderAmenityIcon = (amenity: Amenity) => {
  switch (amenity) {
    case 'restaurant':
      return <Utensils className="w-3 h-3" />;
    case 'coffee':
      return <Coffee className="w-3 h-3" />;
    case 'shopping':
      return <ShoppingBag className="w-3 h-3" />;
    case 'wifi':
      return <Wifi className="w-3 h-3" />;
    case 'restroom':
    default:
      return (
        <span className="text-[10px] font-bold px-1 bg-surface-subtle border border-edge-subtle rounded">
          WC
        </span>
      );
  }
};

export const ChargingStopCard: React.FC<ChargingStopCardProps> = ({ stop, index }) => {
  const {
    selectedStop,
    setSelectedStop,
    setIsStationDetailsOpen,
    hoveredStopId,
    setHoveredStopId,
    displaySettings
  } = usePlanner();

  const isSelected = selectedStop?.id === stop.id;
  const isHovered = hoveredStopId === stop.id;

  const handleCardClick = () => {
    setSelectedStop(stop);
    setIsStationDetailsOpen(true);
  };

  return (
    <div
      onMouseEnter={() => setHoveredStopId(stop.id)}
      onMouseLeave={() => setHoveredStopId(null)}
      className="relative flex flex-col"
    >
      {/* Driving leg banner prior to this stop */}
      <div className="flex items-center gap-2 pl-7 py-2 text-xs text-content-tertiary">
        <div className="w-px h-6 bg-edge-subtle absolute left-3.5 -top-2"></div>
        <span className="font-semibold text-content-secondary">{stop.legDriveDuration}</span>
        <span>·</span>
        <span>{formatDistance(stop.legDistanceMi, displaySettings.units)}</span>
      </div>

      {/* Main Stop Card */}
      <div
        onClick={handleCardClick}
        className={`group relative rounded-xl border p-3.5 transition-all duration-150 cursor-pointer ${
          !stop.isFeasible
            ? 'bg-status-dangerSubtle/30 border-status-danger/70 shadow-sm ring-1 ring-status-danger/30'
            : isSelected
            ? 'bg-surface-card border-brand-primary shadow-sm ring-1 ring-brand-primary/40'
            : isHovered
            ? 'bg-surface-hover border-edge-default shadow-sm'
            : 'bg-surface-card border-edge-subtle hover:border-edge-default hover:bg-surface-hover'
        }`}
      >
        {/* Top Row: Time, Station Name, Power & Stalls */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {/* Stop sequence badge */}
            <div className={`w-6 h-6 rounded-full border text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
              !stop.isFeasible
                ? 'bg-status-dangerSubtle border-status-danger text-status-danger'
                : 'bg-surface-subtle border-edge-subtle text-content-primary'
            }`}>
              {index + 1}
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-content-secondary">
                  {stop.arrivalTime}
                </span>
                <span className="text-sm font-semibold text-content-primary group-hover:text-brand-primary transition-colors">
                  {stop.name}
                </span>
              </div>
              <p className="text-xs text-content-tertiary line-clamp-1 mt-0.5" title={stop.address}>
                {stop.address}
              </p>
            </div>
          </div>

          {/* Power & Stalls Badge */}
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
              <Zap className="w-3 h-3 fill-current" />
              {stop.powerKw} kW
            </span>
            <span className="text-[11px] text-content-tertiary">
              {stop.stallsAvailable !== undefined
                ? `${stop.stallsAvailable}/${stop.stallsTotal} stalls`
                : `${stop.stallsTotal} stalls`}
            </span>
          </div>
        </div>

        {/* If Infeasible Leg Alert */}
        {!stop.isFeasible && (
          <div className="mt-2.5 py-1 px-2 rounded-md bg-status-dangerSubtle border border-status-danger/40 text-[11px] text-status-danger font-medium flex items-center gap-1.5">
            <span>⚠️ Infeasible Stop:</span>
            <span>
              Arrival {stop.arrivalSoc}% is below reserve or charger is blocked
            </span>
          </div>
        )}

        {/* Middle Row: Battery Delta & Charging Duration */}
        <div className="mt-3 pt-2.5 border-t border-edge-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Battery state of charge range */}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-status-danger">{stop.arrivalSoc}%</span>
              <span className="text-content-tertiary">→</span>
              <span className="text-status-success">{stop.departureSoc}%</span>
            </div>
            <span className="text-content-tertiary">·</span>
            <span className="text-xs text-content-primary font-medium">
              {stop.chargeDurationMinutes} min charge
            </span>
          </div>

          {/* Amenities & Action Buttons */}
          <div className="flex items-center gap-1.5 text-content-secondary">
            {stop.amenities.slice(0, 4).map((a, i) => (
              <span
                key={i}
                title={a}
                className="p-1 rounded bg-surface-subtle border border-edge-subtle text-content-secondary hover:text-content-primary"
              >
                {renderAmenityIcon(a)}
              </span>
            ))}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStop(stop);
                setIsStationDetailsOpen(true);
              }}
              title="Station Details & Settings"
              aria-label="View station details"
              className="ml-1 p-1 rounded hover:bg-surface-hover text-content-tertiary hover:text-content-primary"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar showing SoC charge gain */}
        <div className="mt-2.5 w-full bg-surface-subtle border border-edge-subtle/50 h-1.5 rounded-full overflow-hidden flex">
          <div
            className="bg-status-danger h-full"
            style={{ width: `${stop.arrivalSoc}%` }}
          />
          <div
            className="bg-status-success h-full"
            style={{ width: `${stop.departureSoc - stop.arrivalSoc}%` }}
          />
          <div
            className="bg-surface-subtle h-full"
            style={{ width: `${100 - stop.departureSoc}%` }}
          />
        </div>
      </div>
    </div>
  );
};
