import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { SegmentedControl } from '../common/SegmentedControl';
import { Slider } from '../common/Slider';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { ChargeStopsPreference } from '../../types/settings';
import { availableNetworks } from '../../data/demoSettings';
import { Check } from 'lucide-react';

export const PlanOptionsModal: React.FC = () => {
  const {
    isOptionsModalOpen,
    setIsOptionsModalOpen,
    planOptions,
    setPlanOptions,
    replanRoute,
    showToast
  } = usePlanner();

  const handleChargeStopsChange = (val: ChargeStopsPreference) => {
    setPlanOptions((prev) => ({ ...prev, chargeStops: val }));
  };

  const toggleAvoid = (key: keyof typeof planOptions) => {
    setPlanOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePreferredNetwork = (network: string) => {
    setPlanOptions((prev) => {
      const exists = prev.preferredNetworks.includes(network);
      return {
        ...prev,
        preferredNetworks: exists
          ? prev.preferredNetworks.filter((n) => n !== network)
          : [...prev.preferredNetworks, network]
      };
    });
  };

  const handleDone = () => {
    setIsOptionsModalOpen(false);
    showToast('Route options applied.');
    replanRoute();
  };

  return (
    <Modal
      isOpen={isOptionsModalOpen}
      onClose={() => setIsOptionsModalOpen(false)}
      title="Plan Options"
      subtitle="Adjust optimization goals and road preferences"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => {
              setPlanOptions({
                chargeStops: 'Optimal',
                destinationArrivalSoc: 10,
                avoidTolls: false,
                avoidHighways: false,
                avoidFerriesAndTrains: true,
                avoidBorders: false,
                preferredNetworks: availableNetworks.slice(0, 4)
              });
              showToast('Reset to default route options');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="px-5 py-2 rounded-lg bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Charge Stops Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Charge Stops Strategy
          </label>
          <SegmentedControl<ChargeStopsPreference>
            className="w-full"
            value={planOptions.chargeStops}
            onChange={handleChargeStopsChange}
            options={[
              { value: 'Optimal', label: 'Optimal', subLabel: 'Fastest overall trip' },
              { value: 'Fewer', label: 'Fewer', subLabel: 'Longer charges' },
              { value: 'Fewest', label: 'Fewest', subLabel: 'Max range stretches' }
            ]}
          />
        </div>

        {/* Destination Arrival SoC Slider */}
        <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
          <Slider
            label="Destination Arrival Battery"
            subLabel="Minimum battery buffer upon reaching final destination"
            min={5}
            max={50}
            step={1}
            value={planOptions.destinationArrivalSoc}
            onChange={(val) =>
              setPlanOptions((prev) => ({ ...prev, destinationArrivalSoc: val }))
            }
          />
        </div>

        {/* Avoid on Route Toggles */}
        <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Avoid on Route
          </div>
          <div className="divide-y divide-[#222e3d]">
            <ToggleSwitch
              label="Avoid Tolls"
              description="Prefer toll-free national/state highways where available"
              checked={planOptions.avoidTolls}
              onChange={() => toggleAvoid('avoidTolls')}
            />
            <ToggleSwitch
              label="Avoid Highways"
              description="Stay off major high-speed expressways"
              checked={planOptions.avoidHighways}
              onChange={() => toggleAvoid('avoidHighways')}
            />
            <ToggleSwitch
              label="Avoid Ferries & Car Trains"
              description="Do not route onto water ferries or vehicle trains"
              checked={planOptions.avoidFerriesAndTrains}
              onChange={() => toggleAvoid('avoidFerriesAndTrains')}
            />
            <ToggleSwitch
              label="Avoid Borders"
              description="Avoid international borders or restrictive checkpoints"
              checked={planOptions.avoidBorders}
              onChange={() => toggleAvoid('avoidBorders')}
            />
          </div>
        </div>

        {/* Charging Network Preferences */}
        <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Charging Network Preferences
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Prioritize your verified or subscription charging networks along the corridor.
          </p>
          <div className="flex flex-wrap gap-2">
            {availableNetworks.map((network) => {
              const isPreferred = planOptions.preferredNetworks.includes(network);
              return (
                <button
                  key={network}
                  type="button"
                  onClick={() => togglePreferredNetwork(network)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                    isPreferred
                      ? 'bg-[#00b0ff]/15 text-[#00b0ff] border-[#00b0ff]/50 font-semibold'
                      : 'bg-[#182330] text-slate-400 border-[#2a3848] hover:text-slate-200'
                  }`}
                >
                  {isPreferred && <Check className="w-3.5 h-3.5" />}
                  <span>{network}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};
