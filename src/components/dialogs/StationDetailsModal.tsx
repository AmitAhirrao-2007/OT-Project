import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import {
  Zap,
  MapPin,
  Star,
  Slash,
  CheckCircle2
} from 'lucide-react';

export const StationDetailsModal: React.FC = () => {
  const {
    isStationDetailsOpen,
    setIsStationDetailsOpen,
    selectedStop,
    showToast,
    setChargingSettings,
    chargingSettings,
    replanRoute
  } = usePlanner();

  if (!selectedStop) return null;

  const isExcluded = chargingSettings.excludedChargers.includes(selectedStop.id);

  const handleToggleExclude = () => {
    if (isExcluded) {
      setChargingSettings((prev) => ({
        ...prev,
        excludedChargers: prev.excludedChargers.filter((id) => id !== selectedStop.id)
      }));
      showToast(`Removed ${selectedStop.name} from excluded list.`);
    } else {
      setChargingSettings((prev) => ({
        ...prev,
        excludedChargers: [...prev.excludedChargers, selectedStop.id]
      }));
      showToast(`Added ${selectedStop.name} to excluded chargers.`);
    }
    setIsStationDetailsOpen(false);
    setTimeout(() => replanRoute(), 100);
  };

  const handlePreferStation = () => {
    setChargingSettings((prev) => {
      const alreadyPreferred = prev.preferredNetworks.includes(selectedStop.network);
      return alreadyPreferred
        ? prev
        : { ...prev, preferredNetworks: [...prev.preferredNetworks, selectedStop.network] };
    });
    showToast(`Prioritizing ${selectedStop.name} (${selectedStop.network}) for future routes.`);
    setIsStationDetailsOpen(false);
    setTimeout(() => replanRoute(), 100);
  };

  return (
    <Modal
      isOpen={isStationDetailsOpen}
      onClose={() => setIsStationDetailsOpen(false)}
      title={selectedStop.name}
      subtitle={selectedStop.network}
      maxWidth="max-w-xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleToggleExclude}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              isExcluded
                ? 'bg-surface-hover text-content-primary border-edge-default'
                : 'bg-status-dangerSubtle hover:opacity-90 text-status-danger border-status-danger/30'
            }`}
          >
            <Slash className="w-3.5 h-3.5" />
            <span>{isExcluded ? 'Unblock Charger' : 'Exclude Charger'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreferStation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold transition-colors"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Prefer Station</span>
            </button>
            <button
              type="button"
              onClick={() => setIsStationDetailsOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Address and Coordinates Banner */}
        <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-content-primary font-medium">{selectedStop.address}</p>
            <p className="text-content-tertiary mt-0.5">
              Coordinates: {selectedStop.coordinates[0].toFixed(4)}° N,{' '}
              {selectedStop.coordinates[1].toFixed(4)}° E
            </p>
          </div>
        </div>

        {/* Charger Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Max Power
            </span>
            <span className="text-base font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5 fill-current" />
              {selectedStop.powerKw} kW
            </span>
          </div>

          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Stalls
            </span>
            <span className="text-base font-bold text-content-primary mt-0.5 block">
              {selectedStop.stallsTotal} units
            </span>
            {selectedStop.stallsAvailable !== undefined && (
              <span className="text-[10px] text-status-success font-medium">
                {selectedStop.stallsAvailable} available
              </span>
            )}
          </div>

          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Timing
            </span>
            <span className="text-sm font-bold text-content-primary mt-0.5 block font-mono">
              {selectedStop.arrivalTime}
            </span>
            <span className="text-[10px] text-content-tertiary font-mono">
              Depart {selectedStop.departureTime}
            </span>
          </div>

          <div className="p-2.5 bg-surface-subtle rounded-xl border border-edge-subtle text-center">
            <span className="text-[10px] text-content-tertiary uppercase tracking-wider block">
              Est. Tariff
            </span>
            <span className="text-base font-bold text-status-success mt-0.5 block">
              {selectedStop.priceEstimate || '₹22.00 / kWh'}
            </span>
          </div>
        </div>

        {/* Battery State & Charge Curve Window */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-content-primary">
              Session Charge Window
            </span>
            <span className="font-bold text-brand-primary">
              +{selectedStop.departureSoc - selectedStop.arrivalSoc}% gain (
              {selectedStop.chargeDurationMinutes} min)
            </span>
          </div>

          {/* Bar Visual */}
          <div className="w-full bg-surface-canvas h-3.5 rounded-full overflow-hidden flex border border-edge-default">
            <div
              className="bg-status-danger h-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ width: `${selectedStop.arrivalSoc}%` }}
              title={`Arrival: ${selectedStop.arrivalSoc}%`}
            >
              {selectedStop.arrivalSoc}%
            </div>
            <div
              className="bg-status-success h-full flex items-center justify-center text-[9px] font-bold text-slate-950 animate-pulse"
              style={{
                width: `${selectedStop.departureSoc - selectedStop.arrivalSoc}%`
              }}
              title={`Added charge: +${selectedStop.departureSoc - selectedStop.arrivalSoc}%`}
            >
              +{selectedStop.departureSoc - selectedStop.arrivalSoc}%
            </div>
            <div
              className="bg-surface-subtle h-full"
              style={{ width: `${100 - selectedStop.departureSoc}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-content-secondary mt-2 font-mono">
            <span>
              Arrival SoC:{' '}
              <strong className="text-status-danger font-semibold">{selectedStop.arrivalSoc}%</strong>
            </span>
            <span>
              Target SoC:{' '}
              <strong className="text-status-success font-semibold">
                {selectedStop.departureSoc}%
              </strong>
            </span>
          </div>
        </div>

        {/* Amenities List */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <span className="text-xs font-semibold text-content-primary uppercase tracking-wider block mb-2">
            Wayside Amenities
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            {selectedStop.amenities.map((amenity) => (
              <span
                key={amenity}
                className="px-2.5 py-1 rounded-md bg-surface-panel border border-edge-default text-content-primary capitalize flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3 h-3 text-status-success" />
                <span>{amenity}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Station Notes / Reference remarks */}
        {selectedStop.notes && (
          <p className="text-xs text-content-secondary italic bg-surface-panel p-3 rounded-lg border border-edge-default">
            "{selectedStop.notes}"
          </p>
        )}
      </div>
    </Modal>
  );
};
