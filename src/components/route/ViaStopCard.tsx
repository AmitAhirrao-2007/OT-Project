import React from 'react';
import { Waypoint } from '../../types/route';
import { usePlanner } from '../../context/PlannerContext';
import {
  Utensils,
  Coffee,
  Hotel,
  Landmark,
  Building2,
  X,
  ArrowUp,
  ArrowDown,
  Navigation
} from 'lucide-react';

interface ViaStopCardProps {
  waypoint: Waypoint;
  index: number;
  totalWaypoints: number;
}

export const ViaStopCard: React.FC<ViaStopCardProps> = ({
  waypoint,
  index,
  totalWaypoints
}) => {
  const { setTrip, replanRoute, showToast } = usePlanner();

  const handleRemove = () => {
    setTrip((prev) => ({
      ...prev,
      waypoints: prev.waypoints.filter((w) => w.id !== waypoint.id)
    }));
    showToast(`Removed stop: ${waypoint.name}`);
    setTimeout(() => replanRoute(), 120);
  };

  const handleMoveUp = () => {
    if (index === 0) return;
    setTrip((prev) => {
      const nextWps = [...prev.waypoints];
      const temp = nextWps[index - 1];
      nextWps[index - 1] = nextWps[index];
      nextWps[index] = temp;
      return { ...prev, waypoints: nextWps };
    });
    setTimeout(() => replanRoute(), 120);
  };

  const handleMoveDown = () => {
    if (index >= totalWaypoints - 1) return;
    setTrip((prev) => {
      const nextWps = [...prev.waypoints];
      const temp = nextWps[index + 1];
      nextWps[index + 1] = nextWps[index];
      nextWps[index] = temp;
      return { ...prev, waypoints: nextWps };
    });
    setTimeout(() => replanRoute(), 120);
  };

  const renderIcon = (cat?: string) => {
    switch (cat) {
      case 'restaurant':
        return <Utensils className="w-3.5 h-3.5 text-orange-400" />;
      case 'cafe':
        return <Coffee className="w-3.5 h-3.5 text-amber-500" />;
      case 'hotel':
        return <Hotel className="w-3.5 h-3.5 text-indigo-400" />;
      case 'attraction':
        return <Landmark className="w-3.5 h-3.5 text-purple-400" />;
      case 'city':
      case 'town':
        return <Building2 className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Navigation className="w-3.5 h-3.5 text-brand-primary" />;
    }
  };

  return (
    <div className="relative rounded-lg border border-edge-default bg-surface-card p-3 shadow-card transition-colors hover:border-edge-hover">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-md bg-brand-subtle border border-brand-primary/30 text-brand-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-content-primary truncate">
                {waypoint.name}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-subtle text-brand-primary border border-brand-primary/20 flex items-center gap-1 font-medium">
                {renderIcon(waypoint.category)}
                <span className="capitalize">{waypoint.category || 'Via Stop'}</span>
              </span>
            </div>
            {waypoint.address && (
              <p className="text-[11px] text-content-secondary truncate mt-0.5">
                {waypoint.address}
              </p>
            )}
            <p className="text-[10px] text-content-tertiary mt-0.5 flex items-center gap-1">
              <span>Intermediate Destination • No Charging</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {index > 0 && (
            <button
              type="button"
              onClick={handleMoveUp}
              title="Move stop earlier in journey"
              className="p-1 rounded text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
          {index < totalWaypoints - 1 && (
            <button
              type="button"
              onClick={handleMoveDown}
              title="Move stop later in journey"
              className="p-1 rounded text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleRemove}
            title="Remove stop"
            className="p-1 rounded text-content-tertiary hover:text-status-danger hover:bg-status-dangerSubtle"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
