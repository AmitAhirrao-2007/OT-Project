import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { SegmentedControl } from '../common/SegmentedControl';
import { Slider } from '../common/Slider';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { ChargeStopsPreference } from '../../types/settings';
import { availableNetworks, initialPlanOptions } from '../../data/demoSettings';
import { Check, Plus, Edit3 } from 'lucide-react';

export const PlanOptionsModal: React.FC = () => {
  const {
    isOptionsModalOpen,
    setIsOptionsModalOpen,
    planOptions,
    setPlanOptions,
    setChargingSettings,
    setRoutingSettings,
    openSettingsTab,
    replanRoute,
    showToast
  } = usePlanner();

  const handleChargeStopsChange = (val: ChargeStopsPreference) => {
    setPlanOptions((prev) => ({ ...prev, chargeStops: val }));
    setRoutingSettings((prev) => ({ ...prev, chargeStops: val }));
  };

  const handleDestinationSocChange = (val: number) => {
    setPlanOptions((prev) => ({ ...prev, destinationArrivalSoc: val }));
    setChargingSettings((prev) => ({ ...prev, preferredMinArrivalBatteryDestination: val }));
  };

  const toggleAvoid = (key: 'avoidTolls' | 'avoidHighways' | 'avoidFerriesAndTrains' | 'avoidBorders') => {
    setPlanOptions((prev) => {
      const nextVal = !prev[key];
      // Keep routingSettings in sync
      if (key === 'avoidTolls') setRoutingSettings((r) => ({ ...r, avoidTolls: nextVal }));
      if (key === 'avoidHighways') setRoutingSettings((r) => ({ ...r, avoidHighways: nextVal }));
      if (key === 'avoidFerriesAndTrains') setRoutingSettings((r) => ({ ...r, avoidFerries: nextVal }));
      if (key === 'avoidBorders') setRoutingSettings((r) => ({ ...r, avoidBorders: nextVal }));
      return { ...prev, [key]: nextVal };
    });
  };

  const togglePreferredNetwork = (network: string) => {
    setPlanOptions((prev) => {
      const exists = prev.preferredNetworks.includes(network);
      const updated = exists
        ? prev.preferredNetworks.filter((n) => n !== network)
        : [...prev.preferredNetworks, network];
      // Keep chargingSettings in sync
      setChargingSettings((c) => ({ ...c, preferredNetworks: updated }));
      return {
        ...prev,
        preferredNetworks: updated
      };
    });
  };

  const handleDone = () => {
    setIsOptionsModalOpen(false);
    showToast('Route planning options applied.');
    replanRoute();
  };

  return (
    <Modal
      isOpen={isOptionsModalOpen}
      onClose={() => setIsOptionsModalOpen(false)}
      title="Plan Options"
      subtitle="Configure charging stops and highway avoidances"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => {
              setPlanOptions(initialPlanOptions);
              setChargingSettings((c) => ({ ...c, preferredNetworks: initialPlanOptions.preferredNetworks }));
              showToast('Reset plan options to reference defaults.');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="px-5 py-2 rounded-lg bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-5 text-xs">
        {/* Charge Stops Strategy */}
        <div>
          <label className="block text-slate-300 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
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
            subLabel="Minimum buffer upon reaching final destination"
            min={5}
            max={50}
            step={1}
            value={planOptions.destinationArrivalSoc}
            onChange={handleDestinationSocChange}
          />
        </div>

        {/* Avoid on Route Toggles */}
        <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
          <div className="text-slate-300 font-semibold uppercase tracking-wider text-[11px] mb-2">
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
              Charging Networks
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOptionsModalOpen(false);
                openSettingsTab('charging');
              }}
              className="text-[#00b0ff] hover:underline flex items-center gap-1 font-semibold text-[11px]"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit in Settings</span>
            </button>
          </div>

          <p className="text-slate-400 text-[11px] mb-2.5">
            Select preferred networks to prioritize along the travel corridor.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {availableNetworks.map((network) => {
              const isPreferred = planOptions.preferredNetworks.includes(network);
              return (
                <button
                  key={network}
                  type="button"
                  onClick={() => togglePreferredNetwork(network)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                    isPreferred
                      ? 'bg-[#00b0ff]/20 text-[#00b0ff] border-[#00b0ff]/60 font-semibold'
                      : 'bg-[#182330] text-slate-400 border-[#2a3848] hover:text-slate-200'
                  }`}
                >
                  {isPreferred ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 opacity-60" />}
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
