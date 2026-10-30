import React, { useState, useEffect } from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { SavedPlan } from '../../types/plan';
import { formatDistance } from '../../utils/units';
import {
  Bookmark,
  BookmarkCheck,
  FolderOpen,
  Share2,
  Trash2,
  Download,
  Calendar,
  Car,
  Compass,
  Zap,
  Check
} from 'lucide-react';

interface SavedPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'ev_planner_saved_plans_v2';

export const SavedPlansModal: React.FC<SavedPlansModalProps> = ({ isOpen, onClose }) => {
  const {
    trip,
    setTrip,
    activeRoute,
    vehicle,
    displaySettings,
    setSelectedRouteId,
    showToast
  } = usePlanner();

  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    // Default pre-saved plan for immediate demonstration
    return [
      {
        id: 'plan-patna-delhi-reference',
        title: 'Patna to Delhi · Purvanchal & Bareilly Corridor',
        createdAt: '2026-10-28T14:30:00Z',
        updatedAt: '2026-10-28T14:30:00Z',
        origin: trip.origin,
        destination: trip.destination,
        waypoints: [],
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        routeId: activeRoute.id,
        totalDistanceMi: activeRoute.totalDistanceMi,
        totalDuration: activeRoute.totalDuration,
        stopCount: activeRoute.stopCount,
        totalEnergyKwh: activeRoute.totalEnergyKwh,
        routeOption: activeRoute
      }
    ];
  });

  const [planTitle, setPlanTitle] = useState('');
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);

  // Sync planTitle when modal opens
  useEffect(() => {
    if (isOpen) {
      setPlanTitle(
        `${trip.origin.name} to ${trip.destination.name} (${activeRoute.totalDuration})`
      );
    }
  }, [isOpen, trip.origin.name, trip.destination.name, activeRoute.totalDuration]);

  // Save to localStorage
  const persistPlans = (plans: SavedPlan[]) => {
    setSavedPlans(plans);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    } catch {}
  };

  // Save active plan
  const handleSaveActivePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTitle.trim()) return;

    const newPlan: SavedPlan = {
      id: `plan-${Date.now()}`,
      title: planTitle.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      origin: trip.origin,
      destination: trip.destination,
      waypoints: trip.waypoints,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      routeId: activeRoute.id,
      totalDistanceMi: activeRoute.totalDistanceMi,
      totalDuration: activeRoute.totalDuration,
      stopCount: activeRoute.stopCount,
      totalEnergyKwh: activeRoute.totalEnergyKwh,
      routeOption: activeRoute
    };

    const updated = [newPlan, ...savedPlans];
    persistPlans(updated);
    showToast(`Saved plan "${newPlan.title}"`);
  };

  // Load plan into planner
  const handleLoadPlan = (plan: SavedPlan) => {
    setTrip((prev) => ({
      ...prev,
      origin: plan.origin,
      destination: plan.destination,
      waypoints: plan.waypoints || [],
      routeOptions: prev.routeOptions.some((r) => r.id === plan.routeOption.id)
        ? prev.routeOptions
        : [plan.routeOption, ...prev.routeOptions],
      activeRouteId: plan.routeOption.id
    }));

    setSelectedRouteId(plan.routeOption.id);
    showToast(`Loaded trip plan: "${plan.title}"`);
    onClose();
  };

  // Delete plan
  const handleDeletePlan = (id: string, title: string) => {
    if (confirm(`Delete saved plan "${title}"?`)) {
      const updated = savedPlans.filter((p) => p.id !== id);
      persistPlans(updated);
      showToast(`Deleted plan "${title}"`);
    }
  };

  // Share text summary
  const handleShareSummary = async (plan: SavedPlan) => {
    const textSummary = `⚡ EV Route Plan: ${plan.title}
🚘 Vehicle: ${plan.vehicleName}
📍 Route: ${plan.origin.name} → ${plan.destination.name}
⏱ Total Duration: ${plan.totalDuration}
📏 Distance: ${formatDistance(plan.totalDistanceMi, displaySettings.units)}
🔋 Energy Consumed: ${plan.totalEnergyKwh} kWh
🛑 Charging Stops (${plan.stopCount}):
${plan.routeOption.stops
  .map(
    (s, idx) =>
      `  ${idx + 1}. ${s.name} (${s.powerKw} kW) · ${s.arrivalSoc}% → ${s.departureSoc}% (${s.chargeDurationMinutes} min)`
  )
  .join('\n')}
Generated with EV Route Planner`;

    try {
      await navigator.clipboard.writeText(textSummary);
      setCopiedPlanId(plan.id);
      showToast('Trip itinerary copied to clipboard!');
      setTimeout(() => setCopiedPlanId(null), 2500);
    } catch {
      showToast('Failed to copy. Please allow clipboard permissions.');
    }
  };

  // Download JSON export
  const handleDownloadJson = (plan: SavedPlan) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(plan, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${plan.title.replace(/[^a-z0-9]/gi, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Plan exported to JSON file.');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Saved Route Plans & Hub"
      subtitle="Save your itineraries, recall previous trips, or export shareable route summaries"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-content-tertiary">
            {savedPlans.length} {savedPlans.length === 1 ? 'plan' : 'plans'} saved locally
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-hover text-content-primary text-xs font-semibold border border-edge-default transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 1. Save Active Plan Form */}
        <div className="p-4 rounded-xl bg-surface-subtle border border-edge-subtle">
          <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-brand-primary" />
            <span>Save Current Active Plan</span>
          </h3>

          <form onSubmit={handleSaveActivePlan} className="flex flex-col sm:flex-row items-center gap-2.5 mt-2">
            <input
              type="text"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder="e.g. Patna to Delhi Route"
              className="flex-1 w-full px-3.5 py-2.5 bg-surface-panel border border-edge-default rounded-xl text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand-primary"
            />
            <button
              type="submit"
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-hover text-brand-inverse text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all shrink-0"
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>Save Plan</span>
            </button>
          </form>

          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-content-secondary">
            <span>Vehicle: <strong className="text-content-primary">{vehicle.name}</strong></span>
            <span>•</span>
            <span>Duration: <strong className="text-content-primary">{activeRoute.totalDuration}</strong></span>
            <span>•</span>
            <span>Distance: <strong className="text-content-primary">{formatDistance(activeRoute.totalDistanceMi, displaySettings.units)}</strong></span>
            <span>•</span>
            <span>{activeRoute.stopCount} stops</span>
          </div>
        </div>

        {/* 2. Saved Plans List */}
        <div>
          <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-status-success" />
            <span>Saved Itineraries</span>
          </h3>

          {savedPlans.length === 0 ? (
            <div className="py-8 text-center text-content-tertiary bg-surface-subtle rounded-xl border border-edge-subtle">
              <p className="text-xs">No saved plans found in local storage.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {savedPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-3.5 rounded-xl bg-surface-subtle border border-edge-subtle hover:border-edge-default transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-content-primary">{plan.title}</h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs text-content-secondary">
                      <span className="flex items-center gap-1">
                        <Car className="w-3.5 h-3.5 text-content-tertiary" />
                        <span>{plan.vehicleName}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-content-primary font-medium">
                        <Compass className="w-3.5 h-3.5 text-content-tertiary" />
                        <span>{plan.totalDuration}</span>
                      </span>
                      <span>•</span>
                      <span>{formatDistance(plan.totalDistanceMi, displaySettings.units)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>{plan.stopCount} charging stops</span>
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-[11px] text-content-tertiary">
                      <Calendar className="w-3 h-3" />
                      <span>Saved {new Date(plan.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleLoadPlan(plan)}
                      className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse text-xs font-bold transition-all shadow-sm"
                    >
                      Load
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareSummary(plan)}
                      title="Copy formatted trip plan to clipboard"
                      className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary transition-colors shadow-sm"
                    >
                      {copiedPlanId === plan.id ? (
                        <Check className="w-4 h-4 text-status-success" />
                      ) : (
                        <Share2 className="w-4 h-4 text-brand-primary" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadJson(plan)}
                      title="Download JSON file"
                      className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-secondary hover:text-content-primary transition-colors shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePlan(plan.id, plan.title)}
                      title="Delete saved plan"
                      className="p-1.5 rounded-lg bg-surface-panel hover:bg-status-dangerSubtle border border-edge-default text-content-secondary hover:text-status-danger transition-colors shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
