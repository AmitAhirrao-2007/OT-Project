import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { availableVehicles } from '../../data/demoVehicle';
import { Car, BatteryCharging, Gauge, Check } from 'lucide-react';

export const ReplaceVehicleModal: React.FC = () => {
  const {
    isReplaceVehicleModalOpen,
    setIsReplaceVehicleModalOpen,
    vehicle,
    replaceVehicleWith
  } = usePlanner();

  return (
    <Modal
      isOpen={isReplaceVehicleModalOpen}
      onClose={() => setIsReplaceVehicleModalOpen(false)}
      title="Replace Active Vehicle"
      subtitle="Select a pre-calibrated EV profile for route planning"
      maxWidth="max-w-xl"
      footer={
        <button
          type="button"
          onClick={() => setIsReplaceVehicleModalOpen(false)}
          className="px-4 py-2 rounded-lg bg-[#222f3e] hover:bg-[#2c3c4e] text-slate-200 text-xs font-semibold"
        >
          Cancel
        </button>
      }
    >
      <div className="space-y-3">
        {availableVehicles.map((v) => {
          const isSelected = v.id === vehicle.id;
          return (
            <div
              key={v.id}
              onClick={() => replaceVehicleWith(v)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-[#1b2633] border-[#00b0ff] shadow-md ring-1 ring-[#00b0ff]/30'
                  : 'bg-[#141b24] border-[#253342] hover:bg-[#18212c] hover:border-[#33465b]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'bg-[#00b0ff]/20 text-[#00b0ff] border border-[#00b0ff]/40'
                      : 'bg-[#1a232f] text-slate-400 border border-[#2b3a4a]'
                  }`}
                >
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{v.name}</span>
                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-[#00b0ff] font-semibold border border-[#00b0ff]/40">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 block mt-0.5">
                    {v.model}
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-1">
                    <span className="flex items-center gap-1">
                      <BatteryCharging className="w-3 h-3 text-emerald-400" />
                      {v.usableBatteryKwh} kWh usable
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-amber-400" />
                      {v.referenceConsumptionWhPerMi} Wh/mi
                    </span>
                    <span>•</span>
                    <span>Max {v.maximumSpeedMph} mph</span>
                  </div>
                </div>
              </div>

              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-[#00b0ff] text-slate-950 flex items-center justify-center font-bold shrink-0">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

