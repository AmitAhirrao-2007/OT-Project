import React from 'react';
import { usePlanner, SettingsTab } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { ToggleSwitch } from '../common/ToggleSwitch';
import { Slider } from '../common/Slider';
import { SegmentedControl } from '../common/SegmentedControl';
import { PlugType } from '../../types/vehicle';
import { ChargeStopsPreference, WeatherChoice } from '../../types/settings';
import { availableNetworks } from '../../data/demoSettings';
import {
  Car,
  Zap,
  Compass,
  Monitor,
  ShieldCheck,
  History,
  User,
  Share2,
  Check,
  X
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
    displaySettings,
    setDisplaySettings,
    privacySettings,
    setPrivacySettings,
    showToast,
    replanRoute
  } = usePlanner();

  const plugOptions: PlugType[] = ['CCS', 'Level 2', 'Type 2', 'CHAdeMO', 'NACS'];

  const togglePlugType = (type: PlugType) => {
    setVehicle((prev) => {
      const isSelected = prev.selectedPlugTypes.includes(type);
      return {
        ...prev,
        selectedPlugTypes: isSelected
          ? prev.selectedPlugTypes.filter((p) => p !== type)
          : [...prev.selectedPlugTypes, type]
      };
    });
  };

  const togglePreferredChargingNetwork = (network: string) => {
    setChargingSettings((prev) => {
      const exists = prev.preferredNetworks.includes(network);
      return {
        ...prev,
        preferredNetworks: exists
          ? prev.preferredNetworks.filter((n) => n !== network)
          : [...prev.preferredNetworks, network]
      };
    });
  };

  const toggleAvoidedChargingNetwork = (network: string) => {
    setChargingSettings((prev) => {
      const exists = prev.avoidedNetworks.includes(network);
      return {
        ...prev,
        avoidedNetworks: exists
          ? prev.avoidedNetworks.filter((n) => n !== network)
          : [...prev.avoidedNetworks, network]
      };
    });
  };

  const handleSaveAndClose = () => {
    setIsSettingsModalOpen(false);
    showToast('Settings saved successfully.');
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
    <Modal
      isOpen={isSettingsModalOpen}
      onClose={() => setIsSettingsModalOpen(false)}
      title="Application Settings"
      subtitle="Configure vehicle model, charging preferences, and routing parameters"
      maxWidth="max-w-4xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-400">
            Changes apply to local planner state
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#222f3e] hover:bg-[#2c3c4e] text-slate-200 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-5 py-2 rounded-lg bg-[#00b0ff] hover:bg-[#009be0] text-slate-950 text-sm font-bold shadow-lg shadow-cyan-500/20 transition-all"
            >
              Save & Apply
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col md:flex-row gap-6 min-h-[460px]">
        {/* Left Vertical Navigation */}
        <div className="w-full md:w-56 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-[#263444] pr-0 md:pr-4 shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSettingsTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#253446] text-white font-semibold border border-[#3b506b]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2533]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-[#00b0ff]' : 'text-slate-400'
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Tab Content View */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* 1. VEHICLE SETTINGS */}
          {settingsTab === 'vehicle' && (
            <div className="space-y-5">
              <div className="flex items-start justify-between border-b border-[#243343] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">{vehicle.name}</h3>
                  <p className="text-xs text-slate-400">{vehicle.model}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      showToast('Select vehicle model dialog');
                    }}
                    className="px-2.5 py-1 text-xs rounded bg-[#202b38] hover:bg-[#2c3c4e] text-slate-300 border border-[#2e3e52]"
                  >
                    Replace vehicle
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast('Vehicle configuration shared!')}
                    className="p-1 rounded bg-[#202b38] hover:bg-[#2c3c4e] text-slate-300 border border-[#2e3e52]"
                    title="Share vehicle"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Observed Specs: Reference consumption, Max speed, Rel speed, Degradation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full bg-[#1c2734] border border-[#2d3d50] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#00b0ff]"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      Wh/mi
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Observed reference: 245 Wh/mi
                  </span>
                </div>

                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full bg-[#1c2734] border border-[#2d3d50] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#00b0ff]"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      mph
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Observed reference: 83 mph
                  </span>
                </div>

                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full bg-[#1c2734] border border-[#2d3d50] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#00b0ff]"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">%</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Observed reference: 101%
                  </span>
                </div>

                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full bg-[#1c2734] border border-[#2d3d50] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#00b0ff]"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">%</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Observed reference: 5.1%
                  </span>
                </div>
              </div>

              {/* Plug Types Selection */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Plug Types (Reference: CCS selected, Level 2 unselected)
                </div>
                <div className="flex flex-wrap gap-2">
                  {plugOptions.map((type) => {
                    const isSelected = vehicle.selectedPlugTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => togglePlugType(type)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'bg-[#00b0ff]/20 text-[#00b0ff] border-[#00b0ff]/50 font-semibold'
                            : 'bg-[#182330] text-slate-400 border-[#2a3848] hover:text-slate-200'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>{type}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Data & Activity */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] divide-y divide-[#222e3d]">
                <ToggleSwitch
                  label="Connect Live Data (OBD-II / BLE)"
                  description="Transmit real-time telemetry such as SoC, voltage, and elevation"
                  checked={vehicle.liveDataConnected}
                  onChange={(val) =>
                    setVehicle((prev) => ({ ...prev, liveDataConnected: val }))
                  }
                />
                <ToggleSwitch
                  label="Save My Activity"
                  description="Record driven routes and charging curve metrics for precision calibration"
                  checked={vehicle.saveActivity}
                  onChange={(val) =>
                    setVehicle((prev) => ({ ...prev, saveActivity: val }))
                  }
                />
              </div>

              {/* Vehicle History & Delete actions */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <button
                  type="button"
                  onClick={() => setSettingsTab('history')}
                  className="hover:text-slate-200 underline"
                >
                  View Vehicle History
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete saved history for this vehicle?')) {
                      showToast('Vehicle history cleared.');
                    }
                  }}
                  className="text-rose-400 hover:text-rose-300"
                >
                  Delete History
                </button>
              </div>
            </div>
          )}

          {/* 2. CHARGING SETTINGS */}
          {settingsTab === 'charging' && (
            <div className="space-y-5">
              <h3 className="text-base font-bold text-white border-b border-[#243343] pb-2">
                Charging Preferences & Networks
              </h3>

              {/* Arrival SoC Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <Slider
                    label="Min Arrival Battery at Charger"
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

                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <Slider
                    label="Min Arrival Battery at Destination"
                    subLabel="Observed reference: 10%"
                    min={5}
                    max={50}
                    value={chargingSettings.preferredMinArrivalBatteryDestination}
                    onChange={(val) =>
                      setChargingSettings((prev) => ({
                        ...prev,
                        preferredMinArrivalBatteryDestination: val
                      }))
                    }
                  />
                </div>
              </div>

              {/* Minimum Charger Stalls & Maximum Charge Limit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <Slider
                    label="Minimum Charger Stalls"
                    subLabel="Observed reference: 1 stall"
                    min={1}
                    max={8}
                    unit=" stalls"
                    value={chargingSettings.minimumChargerStalls}
                    onChange={(val) =>
                      setChargingSettings((prev) => ({
                        ...prev,
                        minimumChargerStalls: val
                      }))
                    }
                  />
                </div>

                <div className="p-3 bg-[#141b24] rounded-xl border border-[#243343]">
                  <Slider
                    label="Maximum Charge Limit"
                    subLabel="Observed reference: 100%"
                    min={70}
                    max={100}
                    value={chargingSettings.maximumChargeLimit}
                    onChange={(val) =>
                      setChargingSettings((prev) => ({
                        ...prev,
                        maximumChargeLimit: val
                      }))
                    }
                  />
                </div>
              </div>

              {/* Amenity Requirements */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Charger Amenity Filters
                </div>
                <div className="divide-y divide-[#222e3d]">
                  <ToggleSwitch
                    label="Restroom Available"
                    description="Only recommend stops with clean on-site restrooms"
                    checked={chargingSettings.restroomAvailable}
                    onChange={(val) =>
                      setChargingSettings((prev) => ({
                        ...prev,
                        restroomAvailable: val
                      }))
                    }
                  />
                  <ToggleSwitch
                    label="Trailer-Friendly"
                    description="Pull-through stalls accommodating trailers or hitched loads"
                    checked={chargingSettings.trailerFriendly}
                    onChange={(val) =>
                      setChargingSettings((prev) => ({
                        ...prev,
                        trailerFriendly: val
                      }))
                    }
                  />
                  <ToggleSwitch
                    label="Dog-Friendly"
                    description="Pet relief zones or grassy areas around station"
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
                      setChargingSettings((prev) => ({
                        ...prev,
                        familyFriendly: val
                      }))
                    }
                  />
                </div>
              </div>

              {/* Preferred Networks List */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Preferred Charging Networks
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableNetworks.map((net) => {
                    const isPref = chargingSettings.preferredNetworks.includes(net);
                    return (
                      <button
                        key={net}
                        type="button"
                        onClick={() => togglePreferredChargingNetwork(net)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                          isPref
                            ? 'bg-[#00b0ff]/20 text-[#00b0ff] border-[#00b0ff]/50'
                            : 'bg-[#182330] text-slate-400 border-[#2a3848]'
                        }`}
                      >
                        {isPref && <Check className="w-3.5 h-3.5" />}
                        <span>{net}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avoided Networks List */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Avoided Charging Networks
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableNetworks.map((net) => {
                    const isAvoided = chargingSettings.avoidedNetworks.includes(net);
                    return (
                      <button
                        key={net}
                        type="button"
                        onClick={() => toggleAvoidedChargingNetwork(net)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                          isAvoided
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                            : 'bg-[#182330] text-slate-400 border-[#2a3848]'
                        }`}
                      >
                        {isAvoided && <X className="w-3.5 h-3.5" />}
                        <span>{net}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 3. ROUTING SETTINGS */}
          {settingsTab === 'routing' && (
            <div className="space-y-5">
              <h3 className="text-base font-bold text-white border-b border-[#243343] pb-2">
                Routing & Optimization Settings
              </h3>

              {/* Charge Stops Strategy */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Charge Stops Strategy
                </label>
                <SegmentedControl<ChargeStopsPreference>
                  className="w-full"
                  value={routingSettings.chargeStops}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, chargeStops: val }))
                  }
                  options={[
                    { value: 'Optimal', label: 'Optimal', subLabel: 'Balanced time' },
                    { value: 'Fewer', label: 'Fewer', subLabel: 'Fewer stops' },
                    { value: 'Fewest', label: 'Fewest', subLabel: 'Minimum stops' }
                  ]}
                />
              </div>

              {/* Road Avoidances */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] divide-y divide-[#222e3d]">
                <ToggleSwitch
                  label="Avoid Tolls"
                  checked={routingSettings.avoidTolls}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, avoidTolls: val }))
                  }
                />
                <ToggleSwitch
                  label="Avoid Borders"
                  checked={routingSettings.avoidBorders}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, avoidBorders: val }))
                  }
                />
                <ToggleSwitch
                  label="Avoid Highways"
                  checked={routingSettings.avoidHighways}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, avoidHighways: val }))
                  }
                />
                <ToggleSwitch
                  label="Avoid Ferries"
                  checked={routingSettings.avoidFerries}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, avoidFerries: val }))
                  }
                />
              </div>

              {/* Real-time Traffic & Adjust Speed */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] divide-y divide-[#222e3d]">
                <ToggleSwitch
                  label="Real-time Traffic"
                  description="Factor congestion delays and road slowdowns into battery consumption"
                  checked={routingSettings.realTimeTraffic}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, realTimeTraffic: val }))
                  }
                />
                <ToggleSwitch
                  label="Adjust Speed"
                  description="Optimize driving speed dynamically for maximum arrival SoC margin"
                  checked={routingSettings.adjustSpeed}
                  onChange={(val) =>
                    setRoutingSettings((prev) => ({ ...prev, adjustSpeed: val }))
                  }
                />
              </div>

              {/* Weather Choices: Real-time, Seasonal, Manual */}
              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343]">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Weather Modeling
                </label>
                <SegmentedControl<WeatherChoice>
                  className="w-full mb-3"
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
                <p className="text-xs text-slate-400 italic bg-[#10161f] p-2.5 rounded-lg border border-[#232f3e]">
                  "{routingSettings.seasonalWeatherDescription}"
                </p>
              </div>
            </div>
          )}

          {/* 4. DISPLAY & APPEARANCE */}
          {settingsTab === 'display' && (
            <div className="space-y-5">
              <h3 className="text-base font-bold text-white border-b border-[#243343] pb-2">
                Display & Unit Preferences
              </h3>

              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
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
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
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
              </div>
            </div>
          )}

          {/* 5. PRIVACY & DATA */}
          {settingsTab === 'privacy' && (
            <div className="space-y-5">
              <h3 className="text-base font-bold text-white border-b border-[#243343] pb-2">
                Privacy & Data Controls
              </h3>

              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] divide-y divide-[#222e3d]">
                <ToggleSwitch
                  label="Save My Activity"
                  description="Store driving history and charging curves locally in browser storage"
                  checked={privacySettings.saveActivity}
                  onChange={(val) =>
                    setPrivacySettings((prev) => ({ ...prev, saveActivity: val }))
                  }
                />
                <ToggleSwitch
                  label="Share Vehicle Model"
                  description="Allow anonymized efficiency model contributions to community benchmarks"
                  checked={privacySettings.shareVehicle}
                  onChange={(val) =>
                    setPrivacySettings((prev) => ({ ...prev, shareVehicle: val }))
                  }
                />
                <ToggleSwitch
                  label="Telemetry Logging"
                  description="Collect live battery voltage, thermal status, and altitude delta"
                  checked={privacySettings.telemetryEnabled}
                  onChange={(val) =>
                    setPrivacySettings((prev) => ({ ...prev, telemetryEnabled: val }))
                  }
                />
              </div>

              <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-200">
                    Local Storage Cache
                  </span>
                  <p className="text-xs text-slate-400">
                    Includes cached route polylines and station metadata
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Local cache cleared successfully.')}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          )}

          {/* 6. DRIVE & CHARGE HISTORY */}
          {settingsTab === 'history' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-[#243343] pb-2">
                <h3 className="text-base font-bold text-white">
                  Drive & Charge History
                </h3>
                <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800">
                  2 Logged Trips
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        Patna → Delhi Express Corridor
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-medium">
                        Current Reference
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      649 miles · 6 charging stops · 154 kWh consumed
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">Today</span>
                </div>

                <div className="p-3.5 bg-[#141b24] rounded-xl border border-[#243343] flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-white">
                      Bengaluru → Chennai Coastal Link
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      218 miles · 1 charging stop · 52 kWh consumed
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">Oct 24, 2026</span>
                </div>
              </div>
            </div>
          )}

          {/* 7. ACCOUNT MODAL */}
          {settingsTab === 'account' && (
            <div className="space-y-5">
              <h3 className="text-base font-bold text-white border-b border-[#243343] pb-2">
                Account & Authentication
              </h3>
              <div className="p-4 bg-[#141b24] rounded-xl border border-[#243343] text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#00b0ff]/20 text-[#00b0ff] flex items-center justify-center mx-auto text-xl font-bold">
                  <User className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-white">
                  Demonstration Session Active
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Signed in as guest demo user. Cloud sync and vehicle profile syncing
                  are simulated in local storage.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => showToast('Guest demo credentials refreshed')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#243344] hover:bg-[#2e4056] text-slate-200 border border-[#3b506b]"
                  >
                    Refresh Session
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
