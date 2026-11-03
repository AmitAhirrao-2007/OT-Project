import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { SegmentedControl } from '../common/SegmentedControl';
import { Slider } from '../common/Slider';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { ChargeStopsPreference } from '../../types/settings';
import { availableNetworks, initialPlanOptions } from '../../data/demoSettings';
import { Check, Plus, Edit3, RefreshCw } from 'lucide-react';
import { simulatedQueueService } from '../../services/queue/simulatedQueueService';

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
      headerAction={
        <button
          type="button"
          onClick={handleDone}
          className="px-3.5 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm transition-all mr-1"
        >
          Done
        </button>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => {
              setPlanOptions(initialPlanOptions);
              setChargingSettings((c) => ({ ...c, preferredNetworks: initialPlanOptions.preferredNetworks }));
              showToast('Reset plan options to reference defaults.');
            }}
            className="text-xs text-content-secondary hover:text-content-primary underline"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="px-5 py-2 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm transition-all"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Road Routing Preference */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <label className="block text-content-primary font-semibold uppercase tracking-wider text-[11px] mb-2">
            Road Route Preference
          </label>
          <SegmentedControl<'fastest' | 'shortest'>
            className="w-full"
            value={planOptions.routePreference || 'fastest'}
            onChange={(val) => {
              setPlanOptions((prev) => ({ ...prev, routePreference: val }));
              setRoutingSettings((prev) => ({ ...prev, routePreference: val }));
            }}
            options={[
              { value: 'fastest', label: 'Fastest', subLabel: 'Min driving duration' },
              { value: 'shortest', label: 'Shortest', subLabel: 'Min road distance' }
            ]}
          />
        </div>

        {/* Charge Stops Strategy */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <label className="block text-content-primary font-semibold uppercase tracking-wider text-[11px] mb-2">
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
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
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
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <div className="text-content-primary font-semibold uppercase tracking-wider text-[11px] mb-2">
            Avoid on Route
          </div>
          <div className="divide-y divide-edge-subtle">
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

        {/* Optimization Engine (RCSP) */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <div className="text-content-primary font-semibold uppercase tracking-wider text-[11px] mb-2">
            Optimization Engine
          </div>
          <ToggleSwitch
            id="toggle-rcsp-optimizer"
            label="Use RCSP Optimizer"
            description="Use battery-constrained RCSP optimization to select charging-stop sequences for supported custom routes. (The Patna–Delhi corridor uses its dedicated demonstration route.)"
            checked={Boolean(planOptions.useRcspOptimizer)}
            onChange={(checked) => {
              setPlanOptions((prev) => ({ ...prev, useRcspOptimizer: checked }));
            }}
          />
        </div>

        {/* Phase 6J: Simulated Queue Data Settings */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-content-primary font-semibold uppercase tracking-wider text-[11px]">
              Simulated Queue Data
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-700 text-white shadow-sm border border-violet-500">
              SIMULATED
            </span>
          </div>
          <ToggleSwitch
            id="toggle-simulated-queues"
            label="Enable Simulated Queues"
            description="Automatically generate realistic simulated queue counts and wait predictions for corridor charging stations displaying Queue unknown."
            checked={planOptions.enableSimulatedQueues ?? true}
            onChange={(checked) => {
              setPlanOptions((prev) => ({ ...prev, enableSimulatedQueues: checked }));
              simulatedQueueService.setSimulationEnabled(checked);
              showToast(checked ? 'Simulated queue data enabled.' : 'Simulated queue data disabled.');
              window.dispatchEvent(new CustomEvent('evsure:queue-updated', { detail: { simulationChanged: true } }));
            }}
          />
          {(planOptions.enableSimulatedQueues ?? true) && (
            <div className="pt-2 border-t border-edge-subtle flex items-center justify-between">
              <span className="text-[11px] text-content-secondary">
                Generate new queue distribution along corridor:
              </span>
              <button
                type="button"
                onClick={() => {
                  const newSeed = simulatedQueueService.refreshSimulatedQueues();
                  setPlanOptions((prev) => ({ ...prev, simulatedQueueSeed: newSeed }));
                  showToast('Simulated queue distribution refreshed.');
                  // Dispatch update event so map re-renders badges
                  window.dispatchEvent(new CustomEvent('evsure:queue-updated', { detail: { refreshed: true } }));
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-700 hover:bg-violet-600 text-white border border-violet-500 shadow-sm transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Queues</span>
              </button>
            </div>
          )}
        </div>

        {/* Charging Network Preferences */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="text-content-primary font-semibold uppercase tracking-wider text-[11px]">
              Charging Networks
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOptionsModalOpen(false);
                openSettingsTab('charging');
              }}
              className="text-brand-primary hover:underline flex items-center gap-1 font-semibold text-[11px]"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit in Settings</span>
            </button>
          </div>

          <p className="text-content-secondary text-[11px] mb-2.5">
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
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                    isPreferred
                      ? 'bg-brand-subtle text-brand-primary border-brand-primary/40 font-semibold'
                      : 'bg-surface-panel text-content-secondary border-edge-default hover:text-content-primary hover:bg-surface-hover shadow-sm'
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
