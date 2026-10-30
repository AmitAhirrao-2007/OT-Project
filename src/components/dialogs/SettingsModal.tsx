import React, { useState } from 'react';
import { usePlanner, SettingsTab } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { Slider } from '../common/Slider';
import { SegmentedControl } from '../common/SegmentedControl';
import { ChargeStopsPreference, WeatherChoice, ThemeChoice } from '../../types/settings';
import { availableNetworks } from '../../data/demoSettings';
import { AddChargeCardModal } from './AddChargeCardModal';
import {
  Car,
  Zap,
  Compass,
  Monitor,
  ShieldCheck,
  History,
  User,
  Share2,
  Trash2,
  Plus,
  Radio,
  Plug,
  ChevronRight,
  X,
  CreditCard,
  Ban
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    settingsTab,
    setSettingsTab,
    vehicle,
    setVehicle,
    chargingSettings,
    setChargingSettings,
    routingSettings,
    setRoutingSettings,
    setPlanOptions,
    displaySettings,
    setDisplaySettings,
    privacySettings,
    setPrivacySettings,
    driveHistory,
    clearAllHistory,
    resetAllSettings,
    setIsLiveDataModalOpen,
    setIsPlugTypesModalOpen,
    setIsReplaceVehicleModalOpen,
    showToast,
    replanRoute
  } = usePlanner();

  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

  // Sync plan options avoidances when routing settings change
  const handleRoutingAvoidChange = (key: 'avoidTolls' | 'avoidBorders' | 'avoidHighways' | 'avoidFerries', val: boolean) => {
    setRoutingSettings((prev) => ({ ...prev, [key]: val }));
    if (key === 'avoidTolls') setPlanOptions((p) => ({ ...p, avoidTolls: val }));
    if (key === 'avoidHighways') setPlanOptions((p) => ({ ...p, avoidHighways: val }));
    if (key === 'avoidFerries') setPlanOptions((p) => ({ ...p, avoidFerriesAndTrains: val }));
    if (key === 'avoidBorders') setPlanOptions((p) => ({ ...p, avoidBorders: val }));
  };

  const handleChargeStopsChange = (val: ChargeStopsPreference) => {
    setRoutingSettings((prev) => ({ ...prev, chargeStops: val }));
    setPlanOptions((prev) => ({ ...prev, chargeStops: val }));
  };

  const handleAddPreferredNetwork = (net: string) => {
    setChargingSettings((prev) => {
      const updated = [...prev.preferredNetworks, net];
      setPlanOptions((p) => ({ ...p, preferredNetworks: updated }));
      return {
        ...prev,
        preferredNetworks: updated,
        avoidedNetworks: prev.avoidedNetworks.filter((a) => a !== net)
      };
    });
  };

  const handleRemovePreferredNetwork = (net: string) => {
    setChargingSettings((prev) => {
      const updated = prev.preferredNetworks.filter((n) => n !== net);
      setPlanOptions((p) => ({ ...p, preferredNetworks: updated }));
      return {
        ...prev,
        preferredNetworks: updated
      };
    });
  };

  const handleDestinationSocChange = (val: number) => {
    setChargingSettings((prev) => ({ ...prev, preferredMinArrivalBatteryDestination: val }));
    setPlanOptions((prev) => ({ ...prev, destinationArrivalSoc: val }));
  };

  const handleSaveAndApply = () => {
    setIsSettingsModalOpen(false);
    showToast('Settings saved and preferences applied.');
    replanRoute();
  };

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'vehicle', label: 'Vehicle', icon: Car },
    { id: 'charging', label: 'Charging', icon: Zap },
    { id: 'routing', label: 'Routing', icon: Compass },
    { id: 'display', label: 'Display & Appearance', icon: Monitor },
    { id: 'privacy', label: 'Privacy & Data', icon: ShieldCheck },
    { id: 'history', label: 'Drive & Charge History', icon: History },
    { id: 'account', label: 'Account', icon: User }
  ];

  return (
    <>
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Settings"
        subtitle="Manage vehicle profile, charging parameters, and routing goals"
        maxWidth="max-w-4xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => {
                if (confirm('Reset all planner settings and preferences to demonstration defaults?')) {
                  resetAllSettings();
                }
              }}
              className="text-xs text-status-danger hover:underline"
            >
              Reset to Defaults
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-hover text-content-primary border border-edge-default text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAndApply}
                className="px-5 py-2 rounded-lg bg-brand-primary hover:bg-brand-hover text-brand-inverse font-bold text-xs shadow-sm"
              >
                Save & Apply
              </button>
            </div>
          </div>
        }
      >
        {/* Top Account / Profile Overview Card */}
        <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-hover border border-edge-default flex items-center justify-center text-brand-primary shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-content-primary">Demonstration Account</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-subtle text-brand-primary font-semibold border border-brand-primary/20">
                  Standard Plan
                </span>
              </div>
              <p className="text-xs text-content-secondary">Sync preferences, vehicle profiles & saved trips</p>
            </div>
          </div>
          <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto">
            {/* 4-segment decoration bar matching ABRP tier progress */}
            <div className="flex items-center gap-1.5 w-full sm:w-36">
              <div className="h-1.5 flex-1 rounded-full bg-brand-primary" title="Standard Mode" />
              <div className="h-1.5 flex-1 rounded-full bg-surface-hover" title="Telemetry Sync" />
              <div className="h-1.5 flex-1 rounded-full bg-surface-hover" title="Weather Modeling" />
              <div className="h-1.5 flex-1 rounded-full bg-surface-hover" title="Fleet Management" />
            </div>
            <span className="text-[10px] text-content-tertiary font-mono">1/4 Features Active</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 min-h-[480px]">
          {/* Vertical Navigation Bar */}
          <div className="w-full md:w-56 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-edge-subtle pr-0 md:pr-4 shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = settingsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSettingsTab(tab.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-surface-hover text-content-primary font-bold border border-edge-default'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-brand-primary' : 'text-content-tertiary'}`} />
                    <span>{tab.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 hidden md:block ${isActive ? 'text-brand-primary' : 'text-content-tertiary'}`} />
                </button>
              );
            })}
          </div>

          {/* Tab Content Panes */}
          <div className="flex-1 overflow-y-auto pr-1 text-xs">
            {/* 1. VEHICLE SETTINGS */}
            {settingsTab === 'vehicle' && (
              <div className="space-y-4">
                {/* Vehicle Header & Neutral Illustration */}
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Permitted Vector Vehicle Silhouette (Neutral Electric SUV) */}
                    <div className="w-20 h-14 bg-surface-panel border border-edge-default rounded-xl flex items-center justify-center p-2 text-brand-primary shrink-0 shadow-sm">
                      <svg viewBox="0 0 64 36" className="w-full h-full fill-current">
                        <path d="M12 24 L10 20 L16 12 L44 12 L52 18 L58 20 L60 25 L58 28 L54 28 C53 25 50 23 46 23 C42 23 39 25 38 28 L24 28 C23 25 20 23 16 23 C12 23 9 25 8 28 L4 28 L4 25 Z" opacity="0.9" />
                        <circle cx="16" cy="28" r="4" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="46" cy="28" r="4" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M18 14 L28 14 L28 20 L13 20 Z" fill="currentColor" opacity="0.4" />
                        <path d="M31 14 L42 14 L48 20 L31 20 Z" fill="currentColor" opacity="0.4" />
                      </svg>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-content-primary">{vehicle.name}</h3>
                      <p className="text-xs text-content-secondary">{vehicle.model}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-content-secondary">
                        <span className="px-1.5 py-0.2 rounded bg-status-successSubtle text-status-success font-mono border border-status-success/30 font-semibold">
                          {vehicle.usableBatteryKwh} kWh
                        </span>
                        <span>•</span>
                        <span>Year {vehicle.year}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsReplaceVehicleModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover text-content-primary border border-edge-default text-xs font-semibold transition-colors shadow-sm"
                    >
                      Replace vehicle
                    </button>
                    <button
                      type="button"
                      onClick={() => showToast('Vehicle link copied to clipboard!')}
                      title="Share vehicle configuration"
                      className="p-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover text-content-primary border border-edge-default transition-colors shadow-sm"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Drive Profile Editable Specifications */}
                <div>
                  <h4 className="text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                    Drive Profile (Captured Reference Baseline)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                      <label className="block text-content-primary font-semibold mb-1">
                        Reference Consumption
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={vehicle.referenceConsumptionWhPerMi}
                          onChange={(e) =>
                            setVehicle((prev) => ({
                              ...prev,
                              referenceConsumptionWhPerMi: Number(e.target.value)
                            }))
                          }
                          className="w-full bg-surface-panel border border-edge-default rounded-lg px-3 py-1.5 text-content-primary font-mono focus:border-brand-primary outline-none"
                        />
                        <span className="text-content-secondary whitespace-nowrap">Wh/mi</span>
                      </div>
                      <span className="text-[10px] text-content-tertiary mt-1 block">
                        Observed reference: 245 Wh/mi
                      </span>
                    </div>

                    <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                      <label className="block text-content-primary font-semibold mb-1">
                        Maximum Speed
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={vehicle.maximumSpeedMph}
                          onChange={(e) =>
                            setVehicle((prev) => ({
                              ...prev,
                              maximumSpeedMph: Number(e.target.value)
                            }))
                          }
                          className="w-full bg-surface-panel border border-edge-default rounded-lg px-3 py-1.5 text-content-primary font-mono focus:border-brand-primary outline-none"
                        />
                        <span className="text-content-secondary whitespace-nowrap">mph</span>
                      </div>
                      <span className="text-[10px] text-content-tertiary mt-1 block">
                        Observed reference: 83 mph
                      </span>
                    </div>

                    <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                      <label className="block text-content-primary font-semibold mb-1">
                        Relative Speed
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={vehicle.relativeSpeedPercent}
                          onChange={(e) =>
                            setVehicle((prev) => ({
                              ...prev,
                              relativeSpeedPercent: Number(e.target.value)
                            }))
                          }
                          className="w-full bg-surface-panel border border-edge-default rounded-lg px-3 py-1.5 text-content-primary font-mono focus:border-brand-primary outline-none"
                        />
                        <span className="text-content-secondary whitespace-nowrap">%</span>
                      </div>
                      <span className="text-[10px] text-content-tertiary mt-1 block">
                        Observed reference: 101%
                      </span>
                    </div>

                    <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                      <label className="block text-content-primary font-semibold mb-1">
                        Battery Degradation
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={vehicle.batteryDegradationPercent}
                          onChange={(e) =>
                            setVehicle((prev) => ({
                              ...prev,
                              batteryDegradationPercent: Number(e.target.value)
                            }))
                          }
                          className="w-full bg-surface-panel border border-edge-default rounded-lg px-3 py-1.5 text-content-primary font-mono focus:border-brand-primary outline-none"
                        />
                        <span className="text-content-secondary whitespace-nowrap">%</span>
                      </div>
                      <span className="text-[10px] text-content-tertiary mt-1 block">
                        Observed reference: 5.1%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-Actions: Connect Live Data & Plug Types */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div
                    onClick={() => setIsLiveDataModalOpen(true)}
                    className="p-3.5 bg-surface-subtle hover:bg-surface-hover border border-edge-subtle hover:border-edge-default rounded-xl cursor-pointer flex items-center justify-between transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <Radio className="w-4 h-4 text-status-success" />
                      <div>
                        <span className="font-semibold text-content-primary block">Connect Live Data</span>
                        <span className="text-[11px] text-content-secondary">OBD-II BLE / Telemetry</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-content-tertiary" />
                  </div>

                  <div
                    onClick={() => setIsPlugTypesModalOpen(true)}
                    className="p-3.5 bg-surface-subtle hover:bg-surface-hover border border-edge-subtle hover:border-edge-default rounded-xl cursor-pointer flex items-center justify-between transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <Plug className="w-4 h-4 text-brand-primary" />
                      <div>
                        <span className="font-semibold text-content-primary block">Plug Types</span>
                        <span className="text-[11px] text-content-secondary">
                          {vehicle.selectedPlugTypes.join(', ') || 'None selected'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-content-tertiary" />
                  </div>
                </div>

                {/* Activity & History Actions */}
                <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle divide-y divide-edge-subtle">
                  <ToggleSwitch
                    label="Save My Activity"
                    description="Record driven routes and calibration points locally in browser storage"
                    checked={vehicle.saveActivity}
                    onChange={(val) => setVehicle((prev) => ({ ...prev, saveActivity: val }))}
                  />
                </div>

                <div className="flex items-center justify-between pt-1 text-content-secondary">
                  <button
                    type="button"
                    onClick={() => setSettingsTab('history')}
                    className="hover:text-content-primary underline"
                  >
                    View Vehicle History
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete local driving and calibration history for this vehicle?')) {
                        clearAllHistory();
                      }
                    }}
                    className="text-status-danger hover:underline"
                  >
                    Delete History
                  </button>
                </div>
              </div>
            )}

            {/* 2. CHARGING SETTINGS */}
            {settingsTab === 'charging' && (
              <div className="space-y-4">
                {/* 2a. Charge Cards Section */}
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle">
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <h4 className="font-bold text-content-primary">Charge Cards</h4>
                      <p className="text-content-secondary text-[11px]">
                        RFID cards or operator passes used for charger authentication
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddCardOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-panel hover:bg-surface-hover text-content-primary border border-edge-default font-semibold text-xs transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Add new card</span>
                    </button>
                  </div>

                  {chargingSettings.chargeCards.length === 0 ? (
                    <div className="py-4 text-center text-content-tertiary border border-dashed border-edge-default rounded-lg">
                      No charge cards configured
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chargingSettings.chargeCards.map((card) => (
                        <div
                          key={card.id}
                          className="flex items-center justify-between p-2.5 bg-surface-panel rounded-lg border border-edge-default shadow-sm"
                        >
                          <div className="flex items-center gap-2.5">
                            <CreditCard className="w-4 h-4 text-brand-primary" />
                            <div>
                              <span className="font-semibold text-content-primary">{card.name}</span>
                              <span className="text-[11px] text-content-secondary ml-2">
                                {card.network} ({card.accountNumberMasked})
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setChargingSettings((prev) => ({
                                ...prev,
                                chargeCards: prev.chargeCards.filter((c) => c.id !== card.id)
                              }))
                            }
                            className="text-content-tertiary hover:text-status-danger p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2b. Preferred & Avoided Charging Networks */}
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle space-y-4">
                  <div>
                    <h4 className="font-bold text-content-primary mb-0.5">Charging Networks</h4>
                    <p className="text-content-secondary text-[11px] mb-2.5">
                      Configure networks you prefer or wish to avoid during route optimization
                    </p>
                  </div>

                  {/* Preferred list */}
                  <div>
                    <div className="text-[11px] font-semibold text-status-success uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Preferred Networks</span>
                      <span className="text-content-tertiary font-normal">
                        {chargingSettings.preferredNetworks.length} selected
                      </span>
                    </div>

                    {chargingSettings.preferredNetworks.length === 0 ? (
                      <div className="p-3 text-center text-content-tertiary border border-dashed border-edge-default rounded-lg text-xs">
                        No preferred charging networks configured
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {chargingSettings.preferredNetworks.map((net) => (
                          <span
                            key={net}
                            className="px-2.5 py-1 rounded-md bg-status-successSubtle border border-status-success/40 text-status-success flex items-center gap-1.5 font-medium"
                          >
                            <span>{net}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePreferredNetwork(net)}
                              className="hover:opacity-75"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {availableNetworks
                        .filter((n) => !chargingSettings.preferredNetworks.includes(n))
                        .map((net) => (
                          <button
                            key={net}
                            type="button"
                            onClick={() => handleAddPreferredNetwork(net)}
                            className="px-2.5 py-1 rounded-md bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary text-[11px] flex items-center gap-1 transition-colors shadow-sm"
                          >
                            <Plus className="w-3 h-3 text-brand-primary" />
                            <span>{net}</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Avoided list */}
                  <div className="pt-2 border-t border-edge-subtle">
                    <div className="text-[11px] font-semibold text-status-danger uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Avoided Networks</span>
                      <span className="text-content-tertiary font-normal">
                        {chargingSettings.avoidedNetworks.length} selected
                      </span>
                    </div>

                    {chargingSettings.avoidedNetworks.length === 0 ? (
                      <div className="p-3 text-center text-content-tertiary border border-dashed border-edge-default rounded-lg text-xs">
                        No avoided charging networks configured
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {chargingSettings.avoidedNetworks.map((net) => (
                          <span
                            key={net}
                            className="px-2.5 py-1 rounded-md bg-status-dangerSubtle border border-status-danger/40 text-status-danger flex items-center gap-1.5 font-medium"
                          >
                            <span>{net}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setChargingSettings((prev) => ({
                                  ...prev,
                                  avoidedNetworks: prev.avoidedNetworks.filter((n) => n !== net)
                                }))
                              }
                              className="hover:opacity-75"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {availableNetworks
                        .filter((n) => !chargingSettings.avoidedNetworks.includes(n))
                        .map((net) => (
                          <button
                            key={net}
                            type="button"
                            onClick={() =>
                              setChargingSettings((prev) => ({
                                ...prev,
                                avoidedNetworks: [...prev.avoidedNetworks, net],
                                preferredNetworks: prev.preferredNetworks.filter((p) => p !== net)
                              }))
                            }
                            className="px-2.5 py-1 rounded-md bg-surface-panel hover:bg-surface-hover border border-edge-default text-content-primary text-[11px] flex items-center gap-1 transition-colors shadow-sm"
                          >
                            <Ban className="w-3 h-3 text-status-danger" />
                            <span>{net}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                {/* 2c. Excluded Chargers */}
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle">
                  <h4 className="font-bold text-content-primary mb-0.5">Excluded Chargers</h4>
                  <p className="text-content-secondary text-[11px] mb-2.5">
                    Individual stations blacklisted from future route calculations
                  </p>
                  {chargingSettings.excludedChargers.length === 0 ? (
                    <div className="py-3 text-center text-content-tertiary border border-dashed border-edge-default rounded-lg">
                      No excluded chargers. You can exclude specific chargers from their station
                      details dialog.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {chargingSettings.excludedChargers.map((id) => (
                        <div
                          key={id}
                          className="flex items-center justify-between p-2 bg-surface-panel rounded-lg border border-edge-default"
                        >
                          <span className="text-content-primary font-medium">Station ID: {id}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setChargingSettings((prev) => ({
                                ...prev,
                                excludedChargers: prev.excludedChargers.filter((x) => x !== id)
                              }))
                            }
                            className="text-brand-primary hover:underline text-xs"
                          >
                            Unblock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2d. Minimum Stalls, Max Charge & Arrival Buffers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                    <Slider
                      label="Minimum Charger Stalls"
                      subLabel="Observed reference: 1"
                      min={1}
                      max={8}
                      unit=" stall(s)"
                      value={chargingSettings.minimumChargerStalls}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({ ...prev, minimumChargerStalls: val }))
                      }
                    />
                  </div>

                  <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                    <Slider
                      label="Maximum Charge Limit"
                      subLabel="Observed reference: 100%"
                      min={70}
                      max={100}
                      value={chargingSettings.maximumChargeLimit}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({ ...prev, maximumChargeLimit: val }))
                      }
                    />
                  </div>

                  <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                    <Slider
                      label="Min Battery at Charger"
                      subLabel="Observed reference: 10%"
                      min={5}
                      max={30}
                      value={chargingSettings.preferredMinArrivalBatteryCharger}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({
                          ...prev,
                          preferredMinArrivalBatteryCharger: val
                        }))
                      }
                    />
                  </div>

                  <div className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle">
                    <Slider
                      label="Min Battery at Destination"
                      subLabel="Observed reference: 10%"
                      min={5}
                      max={50}
                      value={chargingSettings.preferredMinArrivalBatteryDestination}
                      onChange={handleDestinationSocChange}
                    />
                  </div>
                </div>

                {/* 2e. Amenities */}
                <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
                  <div className="text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                    Required Amenities
                  </div>
                  <div className="divide-y divide-edge-subtle">
                    <ToggleSwitch
                      label="Restroom Available"
                      description="Only plan stops with on-site restroom facilities"
                      checked={chargingSettings.restroomAvailable}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({ ...prev, restroomAvailable: val }))
                      }
                    />
                    <ToggleSwitch
                      label="Trailer-Friendly"
                      description="Pull-through stalls allowing vehicles with trailers"
                      checked={chargingSettings.trailerFriendly}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({ ...prev, trailerFriendly: val }))
                      }
                    />
                    <ToggleSwitch
                      label="Dog-Friendly"
                      description="Green spaces or relief areas for pets"
                      checked={chargingSettings.dogFriendly}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({ ...prev, dogFriendly: val }))
                      }
                    />
                    <ToggleSwitch
                      label="Family-Friendly"
                      description="Safe lighting, food court or dining options on premises"
                      checked={chargingSettings.familyFriendly}
                      onChange={(val) =>
                        setChargingSettings((prev) => ({ ...prev, familyFriendly: val }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. ROUTING SETTINGS */}
            {settingsTab === 'routing' && (
              <div className="space-y-4">
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle">
                  <label className="block text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                    Charge Stops Strategy
                  </label>
                  <SegmentedControl<ChargeStopsPreference>
                    className="w-full"
                    value={routingSettings.chargeStops}
                    onChange={handleChargeStopsChange}
                    options={[
                      { value: 'Optimal', label: 'Optimal', subLabel: 'Fastest overall trip' },
                      { value: 'Fewer', label: 'Fewer', subLabel: 'Fewer longer stops' },
                      { value: 'Fewest', label: 'Fewest', subLabel: 'Minimum stop count' }
                    ]}
                  />
                  <p className="text-[11px] text-content-secondary mt-2.5 bg-surface-panel p-2.5 rounded-lg border border-edge-default leading-relaxed">
                    {routingSettings.chargeStops === 'Optimal' &&
                      'Optimal balances driving speed with fast battery charging curves (10% to 65% SoC) for the shortest total travel time.'}
                    {routingSettings.chargeStops === 'Fewer' &&
                      'Fewer stops stretches leg distances, resulting in fewer stops but longer charges into slower taper zones.'}
                    {routingSettings.chargeStops === 'Fewest' &&
                      'Fewest minimizes the count of charging sessions by utilizing maximum vehicle range buffer.'}
                  </p>
                </div>

                <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
                  <div className="text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                    Avoid on Route
                  </div>
                  <div className="divide-y divide-edge-subtle">
                    <ToggleSwitch
                      label="Avoid Tolls"
                      description="Synchronized with route plan options"
                      checked={routingSettings.avoidTolls}
                      onChange={(val) => handleRoutingAvoidChange('avoidTolls', val)}
                    />
                    <ToggleSwitch
                      label="Avoid Borders"
                      checked={routingSettings.avoidBorders}
                      onChange={(val) => handleRoutingAvoidChange('avoidBorders', val)}
                    />
                    <ToggleSwitch
                      label="Avoid Highways"
                      checked={routingSettings.avoidHighways}
                      onChange={(val) => handleRoutingAvoidChange('avoidHighways', val)}
                    />
                    <ToggleSwitch
                      label="Avoid Ferries"
                      checked={routingSettings.avoidFerries}
                      onChange={(val) => handleRoutingAvoidChange('avoidFerries', val)}
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle divide-y divide-edge-subtle">
                  <ToggleSwitch
                    label="Real-time Traffic (Demo Preference)"
                    description="Factor historical and reported congestion delays into consumption models"
                    checked={routingSettings.realTimeTraffic}
                    onChange={(val) =>
                      setRoutingSettings((prev) => ({ ...prev, realTimeTraffic: val }))
                    }
                  />
                  <ToggleSwitch
                    label="Adjust Speed (Demo Preference)"
                    description="Dynamically suggest optimal cruising speeds for arrival margin"
                    checked={routingSettings.adjustSpeed}
                    onChange={(val) =>
                      setRoutingSettings((prev) => ({ ...prev, adjustSpeed: val }))
                    }
                  />
                </div>

                <div className="p-3.5 bg-surface-subtle rounded-xl border border-edge-subtle">
                  <label className="block text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                    Weather Modeling
                  </label>
                  <SegmentedControl<WeatherChoice>
                    className="w-full mb-2.5"
                    value={routingSettings.weatherChoice}
                    onChange={(val) =>
                      setRoutingSettings((prev) => ({ ...prev, weatherChoice: val }))
                    }
                    options={[
                      { value: 'Real-time', label: 'Real-time' },
                      { value: 'Seasonal', label: 'Seasonal' },
                      { value: 'Manual', label: 'Manual' }
                    ]}
                  />
                  <p className="text-[11px] text-content-secondary italic bg-surface-panel p-2.5 rounded-lg border border-edge-default">
                    "{routingSettings.seasonalWeatherDescription}"
                  </p>
                </div>
              </div>
            )}

            {/* 4. DISPLAY & APPEARANCE */}
            {settingsTab === 'display' && (
              <div className="space-y-4">
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                      Distance & Speed Units
                    </label>
                    <SegmentedControl
                      className="w-full"
                      value={displaySettings.units}
                      onChange={(val) =>
                        setDisplaySettings((prev) => ({
                          ...prev,
                          units: val as 'imperial' | 'metric'
                        }))
                      }
                      options={[
                        { value: 'imperial', label: 'Miles (mi, mph)' },
                        { value: 'metric', label: 'Kilometers (km, km/h)' }
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                      Temperature Units
                    </label>
                    <SegmentedControl
                      className="w-full"
                      value={displaySettings.temperature}
                      onChange={(val) =>
                        setDisplaySettings((prev) => ({
                          ...prev,
                          temperature: val as 'F' | 'C'
                        }))
                      }
                      options={[
                        { value: 'F', label: 'Fahrenheit (°F)' },
                        { value: 'C', label: 'Celsius (°C)' }
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-content-primary uppercase tracking-wider mb-2">
                      Appearance Theme
                    </label>
                    <SegmentedControl<ThemeChoice>
                      className="w-full"
                      value={displaySettings.theme}
                      onChange={(val) =>
                        setDisplaySettings((prev) => ({
                          ...prev,
                          theme: val
                        }))
                      }
                      options={[
                        { value: 'light', label: 'Light (Default)' },
                        { value: 'dark', label: 'Dark Charcoal' },
                        { value: 'system', label: 'System (Auto)' }
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 5. PRIVACY & DATA */}
            {settingsTab === 'privacy' && (
              <div className="space-y-4">
                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle divide-y divide-edge-subtle">
                  <ToggleSwitch
                    label="Save My Activity"
                    description="Store driving history and charging curves locally in browser storage"
                    checked={privacySettings.saveActivity}
                    onChange={(val) => setPrivacySettings((prev) => ({ ...prev, saveActivity: val }))}
                  />
                  <ToggleSwitch
                    label="Share Vehicle Model"
                    description="Allow anonymized efficiency model contributions to community benchmarks"
                    checked={privacySettings.shareVehicle}
                    onChange={(val) => setPrivacySettings((prev) => ({ ...prev, shareVehicle: val }))}
                  />
                  <ToggleSwitch
                    label="Telemetry Logging"
                    description="Simulated local logging for elevation and speed adjustments"
                    checked={privacySettings.telemetryEnabled}
                    onChange={(val) =>
                      setPrivacySettings((prev) => ({ ...prev, telemetryEnabled: val }))
                    }
                  />
                </div>

                <div className="p-4 bg-surface-subtle rounded-xl border border-edge-subtle flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-content-primary block">Clear Cached Data</span>
                    <p className="text-content-secondary text-[11px]">
                      Clears local route polylines and saved preferences
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Clear local preferences and reload defaults?')) {
                        resetAllSettings();
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-status-dangerSubtle text-status-danger border border-status-danger/40 text-xs font-semibold"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            )}

            {/* 6. DRIVE & CHARGE HISTORY */}
            {settingsTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-content-primary">Drive & Charge History</h4>
                    <p className="text-content-secondary text-[11px]">
                      Past logged journeys and charging logs
                    </p>
                  </div>
                  {driveHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Delete all demonstration trip history records?')) {
                          clearAllHistory();
                        }
                      }}
                      className="text-status-danger hover:underline text-xs"
                    >
                      Delete all history
                    </button>
                  )}
                </div>

                {driveHistory.length === 0 ? (
                  <div className="py-8 text-center text-content-tertiary border border-dashed border-edge-default rounded-xl">
                    No history records found
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {driveHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-surface-subtle rounded-xl border border-edge-subtle flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-content-primary">{item.routeTitle}</span>
                            {item.isDemo && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-brand-subtle text-brand-primary font-medium border border-brand-primary/20">
                                Simulated
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-content-secondary mt-0.5">
                            {item.distanceMi} mi · {item.stopsCount} stops · {item.energyKwh} kWh
                          </p>
                        </div>
                        <span className="text-content-tertiary text-[11px]">{item.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 7. ACCOUNT */}
            {settingsTab === 'account' && (
              <div className="space-y-4 text-center p-6 bg-surface-subtle rounded-xl border border-edge-subtle">
                <div className="w-12 h-12 rounded-full bg-brand-subtle text-brand-primary flex items-center justify-center mx-auto mb-2">
                  <User className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-content-primary">Demonstration User Session</h4>
                <p className="text-content-secondary text-xs max-w-sm mx-auto leading-relaxed">
                  Phase 1 uses an offline local demonstration profile. Authentication, fleet
                  sharing, and live cloud synchronization will be connected in subsequent phases.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => showToast('Demo session refreshed.')}
                    className="px-4 py-2 rounded-lg bg-surface-panel hover:bg-surface-hover text-content-primary border border-edge-default font-semibold text-xs shadow-sm"
                  >
                    Refresh Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Nested Add Card Modal */}
      <AddChargeCardModal isOpen={isAddCardOpen} onClose={() => setIsAddCardOpen(false)} />
    </>
  );
};
