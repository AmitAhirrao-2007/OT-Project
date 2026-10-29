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
                ? 'bg-slate-700/60 text-slate-200 border-slate-600 hover:bg-slate-700'
                : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
            }`}
          >
            <Slash className="w-3.5 h-3.5" />
            <span>{isExcluded ? 'Unblock Charger' : 'Exclude Charger'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreferStation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>Prefer Station</span>
            </button>
            <button
              type="button"
              onClick={() => setIsStationDetailsOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 font-bold text-xs shadow-md transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Address and Coordinates Banner */}
        <div className="p-3 bg-[#131b24] rounded-xl border border-[#222f3e] flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-[#00b0ff] shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="text-slate-200 font-medium">{selectedStop.address}</p>
            <p className="text-slate-500 mt-0.5">
              Coordinates: {selectedStop.coordinates[0].toFixed(4)}° N,{' '}
              {selectedStop.coordinates[1].toFixed(4)}° E
            </p>
          </div>
        </div>

        {/* Charger Specs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 bg-[#16202c] rounded-xl border border-[#243343] text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Max Power
            </span>
            <span className="text-base font-bold text-amber-400 flex items-center justify-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5 fill-amber-400" />
              {selectedStop.powerKw} kW
            </span>
          </div>

          <div className="p-2.5 bg-[#16202c] rounded-xl border border-[#243343] text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Stalls
            </span>
            <span className="text-base font-bold text-slate-100 mt-0.5 block">
              {selectedStop.stallsTotal} units
            </span>
            {selectedStop.stallsAvailable !== undefined && (
              <span className="text-[10px] text-emerald-400">
                {selectedStop.stallsAvailable} available
              </span>
            )}
          </div>

          <div className="p-2.5 bg-[#16202c] rounded-xl border border-[#243343] text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Timing
            </span>
            <span className="text-sm font-bold text-slate-100 mt-0.5 block font-mono">
              {selectedStop.arrivalTime}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Depart {selectedStop.departureTime}
            </span>
          </div>

          <div className="p-2.5 bg-[#16202c] rounded-xl border border-[#243343] text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Est. Tariff
            </span>
            <span className="text-base font-bold text-emerald-400 mt-0.5 block">
              {selectedStop.priceEstimate || '₹22.00 / kWh'}
            </span>
          </div>
        </div>

        {/* Battery State & Charge Curve Window */}
        <div className="p-3.5 bg-[#141c26] rounded-xl border border-[#243343]">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-300">
              Session Charge Window
            </span>
            <span className="font-bold text-[#00b0ff]">
              +{selectedStop.departureSoc - selectedStop.arrivalSoc}% gain (
              {selectedStop.chargeDurationMinutes} min)
            </span>
          </div>

          {/* Bar Visual */}
          <div className="w-full bg-[#10161f] h-3.5 rounded-full overflow-hidden flex border border-[#253241]">
            <div
              className="bg-rose-500 h-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ width: `${selectedStop.arrivalSoc}%` }}
              title={`Arrival: ${selectedStop.arrivalSoc}%`}
            >
              {selectedStop.arrivalSoc}%
            </div>
            <div
              className="bg-emerald-400 h-full flex items-center justify-center text-[9px] font-bold text-slate-950 animate-pulse"
              style={{
                width: `${selectedStop.departureSoc - selectedStop.arrivalSoc}%`
              }}
              title={`Added charge: +${selectedStop.departureSoc - selectedStop.arrivalSoc}%`}
            >
              +{selectedStop.departureSoc - selectedStop.arrivalSoc}%
            </div>
            <div
              className="bg-slate-800 h-full"
              style={{ width: `${100 - selectedStop.departureSoc}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 mt-2">
            <span>
              Arrival SoC:{' '}
              <strong className="text-rose-400 font-mono">{selectedStop.arrivalSoc}%</strong>
            </span>
            <span>
              Target SoC:{' '}
              <strong className="text-emerald-400 font-mono">
                {selectedStop.departureSoc}%
              </strong>
            </span>
          </div>
        </div>

        {/* Amenities List */}
        <div className="p-3.5 bg-[#141c26] rounded-xl border border-[#243343]">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
            Wayside Amenities
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            {selectedStop.amenities.map((amenity) => (
              <span
                key={amenity}
                className="px-2.5 py-1 rounded-md bg-[#1b2533] border border-[#293848] text-slate-200 capitalize flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{amenity}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Station Notes / Reference remarks */}
        {selectedStop.notes && (
          <p className="text-xs text-slate-400 italic bg-[#10161f] p-3 rounded-lg border border-[#222e3d]">
            "{selectedStop.notes}"
          </p>
        )}
      </div>
    </Modal>
  );
};
