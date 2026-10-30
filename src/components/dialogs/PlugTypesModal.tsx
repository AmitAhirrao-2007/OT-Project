import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { PlugType } from '../../types/vehicle';
import { Check, Zap } from 'lucide-react';

export const PlugTypesModal: React.FC = () => {
  const {
    isPlugTypesModalOpen,
    setIsPlugTypesModalOpen,
    vehicle,
    setVehicle,
    showToast
  } = usePlanner();

  const plugOptions: { type: PlugType; label: string; desc: string }[] = [
    {
      type: 'CCS',
      label: 'CCS (Combined Charging System)',
      desc: 'High-power DC fast charging up to 350 kW. Standard for Indian & European EVs.'
    },
    {
      type: 'Level 2',
      label: 'Level 2 (J1772 / Type 1 AC)',
      desc: 'AC wallbox and destination charging (3.3 kW to 7.4 kW).'
    },
    {
      type: 'Type 2',
      label: 'Type 2 (Mennekes AC)',
      desc: 'Three-phase AC standard used widely across Indian public AC chargers.'
    },
    {
      type: 'CHAdeMO',
      label: 'CHAdeMO',
      desc: 'Japanese DC fast-charging standard (older Nissan Leaf and commercial fleets).'
    },
    {
      type: 'NACS',
      label: 'NACS (North American Charging Standard / J3400)',
      desc: 'Tesla Supercharger native connector standard.'
    }
  ];

  const handleToggle = (type: PlugType) => {
    setVehicle((prev) => {
      const exists = prev.selectedPlugTypes.includes(type);
      return {
        ...prev,
        selectedPlugTypes: exists
          ? prev.selectedPlugTypes.filter((p) => p !== type)
          : [...prev.selectedPlugTypes, type]
      };
    });
  };

  const handleDone = () => {
    setIsPlugTypesModalOpen(false);
    showToast(`Saved connector compatibility: ${vehicle.selectedPlugTypes.join(', ')}`);
  };

  return (
    <Modal
      isOpen={isPlugTypesModalOpen}
      onClose={() => setIsPlugTypesModalOpen(false)}
      title="Compatible Plug Types"
      subtitle={`Connector types accepted by ${vehicle.name}`}
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-content-tertiary">
            {vehicle.selectedPlugTypes.length} connector(s) selected
          </span>
          <button
            type="button"
            onClick={handleDone}
            className="px-5 py-2 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm transition-colors"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {plugOptions.map((opt) => {
          const isSelected = vehicle.selectedPlugTypes.includes(opt.type);
          return (
            <div
              key={opt.type}
              onClick={() => handleToggle(opt.type)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                isSelected
                  ? 'bg-surface-panel border-brand-primary/60 ring-1 ring-brand-primary/20 shadow-sm'
                  : 'bg-surface-subtle border-edge-subtle hover:bg-surface-hover hover:border-edge-default'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                    isSelected
                      ? 'bg-brand-primary border-brand-primary text-brand-inverse font-bold'
                      : 'bg-surface-canvas border-edge-default text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-content-primary">
                      {opt.label}
                    </span>
                    {opt.type === 'CCS' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        DC Fast
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">
                    {opt.desc}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
