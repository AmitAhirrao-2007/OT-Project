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
        <span className="text-[10px] font-bold px-1 bg-[#253241] rounded">
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
      <div className="flex items-center gap-2 pl-7 py-2 text-xs text-[#A8A8A8]">
        <div className="w-px h-6 bg-[#2c2c2c] absolute left-3.5 -top-2"></div>
        <span className="font-medium text-[#EEEEEE]">{stop.legDriveDuration}</span>
        <span>·</span>
        <span>{formatDistance(stop.legDistanceMi, displaySettings.units)}</span>
      </div>

      {/* Main Stop Card */}
      <div
        onClick={handleCardClick}
        className={`group relative rounded-xl border p-3.5 transition-all duration-150 cursor-pointer ${
          !stop.isFeasible
            ? 'bg-[#25151b] border-rose-600/70 shadow-md ring-1 ring-rose-500/30'
            : isSelected
            ? 'bg-[#282828] border-amber-400/90 shadow-md ring-1 ring-amber-400/40'
            : isHovered
            ? 'bg-[#2c2c2c] border-[#444444]'
            : 'bg-[#242424] border-[#363636] hover:bg-[#2a2a2a] hover:border-[#404040]'
        }`}
      >
        {/* Top Row: Time, Station Name, Power & Stalls */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {/* Stop sequence badge */}
            <div className={`w-6 h-6 rounded-full border text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
              !stop.isFeasible
                ? 'bg-rose-900/40 border-rose-700 text-rose-200'
                : 'bg-[#1c1c1c] border-[#383838] text-[#EEEEEE]'
            }`}>
              {index + 1}
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#A8A8A8]">
                  {stop.arrivalTime}
                </span>
                <span className="text-sm font-semibold text-[#EEEEEE] group-hover:text-[#00b0ff] transition-colors">
                  {stop.name}
                </span>
              </div>
              <p className="text-xs text-[#A8A8A8] line-clamp-1 mt-0.5" title={stop.address}>
                {stop.address}
              </p>
            </div>
          </div>

          {/* Power & Stalls Badge */}
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-0.5">
              <Zap className="w-3 h-3 fill-amber-400" />
              {stop.powerKw} kW
            </span>
            <span className="text-[11px] text-[#A8A8A8]">
              {stop.stallsAvailable !== undefined
                ? `${stop.stallsAvailable}/${stop.stallsTotal} stalls`
                : `${stop.stallsTotal} stalls`}
            </span>
          </div>
        </div>

        {/* If Infeasible Leg Alert */}
        {!stop.isFeasible && (
          <div className="mt-2.5 py-1 px-2 rounded-md bg-rose-950/70 border border-rose-800 text-[10px] text-rose-300 font-semibold flex items-center gap-1.5">
            <span>⚠️ Infeasible Stop:</span>
            <span>
              Arrival {stop.arrivalSoc}% is below reserve or charger is blocked
            </span>
          </div>
        )}

        {/* Middle Row: Battery Delta & Charging Duration */}
        <div className="mt-3 pt-2.5 border-t border-[#303030] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Battery state of charge range */}
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-rose-400">{stop.arrivalSoc}%</span>
              <span className="text-[#707070]">→</span>
              <span className="text-emerald-400">{stop.departureSoc}%</span>
            </div>
            <span className="text-[#555555]">·</span>
            <span className="text-xs text-[#EEEEEE] font-medium">
              {stop.chargeDurationMinutes} min charge
            </span>
          </div>

          {/* Amenities & Action Buttons */}
          <div className="flex items-center gap-1.5 text-[#A8A8A8]">
            {stop.amenities.slice(0, 4).map((a, i) => (
              <span
                key={i}
                title={a}
                className="p-1 rounded bg-[#1c1c1c] text-[#A8A8A8] hover:text-[#EEEEEE]"
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
              className="ml-1 p-1 rounded hover:bg-[#333333] text-[#A8A8A8] hover:text-[#EEEEEE]"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar showing SoC charge gain */}
        <div className="mt-2.5 w-full bg-[#161616] h-1.5 rounded-full overflow-hidden flex">
          <div
            className="bg-rose-500/80 h-full"
            style={{ width: `${stop.arrivalSoc}%` }}
          />
          <div
            className="bg-emerald-400 h-full animate-pulse"
            style={{ width: `${stop.departureSoc - stop.arrivalSoc}%` }}
          />
          <div
            className="bg-[#2c2c2c] h-full"
            style={{ width: `${100 - stop.departureSoc}%` }}
          />
        </div>
      </div>
    </div>
  );
};
