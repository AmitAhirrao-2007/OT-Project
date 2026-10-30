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
          className="px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary border border-edge-default text-xs font-semibold shadow-sm"
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
                  ? 'bg-surface-panel border-brand-primary shadow-sm ring-1 ring-brand-primary/30'
                  : 'bg-surface-subtle border-edge-subtle hover:bg-surface-hover hover:border-edge-default'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'bg-brand-subtle text-brand-primary border border-brand-primary/30'
                      : 'bg-surface-panel text-content-tertiary border border-edge-default shadow-sm'
                  }`}
                >
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-content-primary">{v.name}</span>
                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-subtle text-brand-primary font-semibold border border-brand-primary/20">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-content-secondary block mt-0.5">
                    {v.model}
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-content-secondary mt-1 font-mono">
                    <span className="flex items-center gap-1">
                      <BatteryCharging className="w-3 h-3 text-status-success" />
                      {v.usableBatteryKwh} kWh usable
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-amber-500" />
                      {v.referenceConsumptionWhPerMi} Wh/mi
                    </span>
                    <span>•</span>
                    <span>Max {v.maximumSpeedMph} mph</span>
                  </div>
                </div>
              </div>

              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-brand-primary text-brand-inverse flex items-center justify-center font-bold shrink-0">
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
