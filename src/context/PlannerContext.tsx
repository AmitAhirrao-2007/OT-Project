import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { ChargingStop, DemonstrationTrip, RouteOption } from '../types/route';
import { VehicleProfile } from '../types/vehicle';
import {
  ChargingSettings,
  DisplaySettings,
  DriveHistoryItem,
  PlanOptions,
  PrivacySettings,
  RoutingSettings
} from '../types/settings';
import { demoTrip } from '../data/demoRoute';
import { initialVehicleProfile } from '../data/demoVehicle';
import {
  initialChargingSettings,
  initialDisplaySettings,
  initialDriveHistory,
  initialPlanOptions,
  initialPrivacySettings,
  initialRoutingSettings
} from '../data/demoSettings';

export type SettingsTab =
  | 'vehicle'
  | 'charging'
  | 'routing'
  | 'display'
  | 'privacy'
  | 'history'
  | 'account';

interface PlannerContextType {
  trip: DemonstrationTrip;
  setTrip: React.Dispatch<React.SetStateAction<DemonstrationTrip>>;
  activeRoute: RouteOption;
  selectedRouteId: string;
  setSelectedRouteId: (id: string) => void;
  selectedStop: ChargingStop | null;
  setSelectedStop: (stop: ChargingStop | null) => void;
  hoveredStopId: string | null;
  setHoveredStopId: (id: string | null) => void;

  // Responsive panel state
  isPanelCollapsed: boolean;
  setIsPanelCollapsed: (collapsed: boolean) => void;
  togglePanelCollapse: () => void;

  // Modals & Navigation
  isOptionsModalOpen: boolean;
  setIsOptionsModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  openSettingsTab: (tab: SettingsTab) => void;
  isStationDetailsOpen: boolean;
  setIsStationDetailsOpen: (open: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  isLiveDataModalOpen: boolean;
  setIsLiveDataModalOpen: (open: boolean) => void;
  isPlugTypesModalOpen: boolean;
  setIsPlugTypesModalOpen: (open: boolean) => void;
  isReplaceVehicleModalOpen: boolean;
  setIsReplaceVehicleModalOpen: (open: boolean) => void;

  // Configurations
  planOptions: PlanOptions;
  setPlanOptions: React.Dispatch<React.SetStateAction<PlanOptions>>;
  vehicle: VehicleProfile;
  setVehicle: React.Dispatch<React.SetStateAction<VehicleProfile>>;
  chargingSettings: ChargingSettings;
  setChargingSettings: React.Dispatch<React.SetStateAction<ChargingSettings>>;
  routingSettings: RoutingSettings;
  setRoutingSettings: React.Dispatch<React.SetStateAction<RoutingSettings>>;
  displaySettings: DisplaySettings;
  setDisplaySettings: React.Dispatch<React.SetStateAction<DisplaySettings>>;
  privacySettings: PrivacySettings;
  setPrivacySettings: React.Dispatch<React.SetStateAction<PrivacySettings>>;
  driveHistory: DriveHistoryItem[];
  setDriveHistory: React.Dispatch<React.SetStateAction<DriveHistoryItem[]>>;

  // Actions
  replanRoute: () => void;
  replaceVehicleWith: (profile: VehicleProfile) => void;
  clearAllHistory: () => void;
  resetAllSettings: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const STORAGE_KEYS = {
  OPTIONS: 'ev_planner_options_v2',
  VEHICLE: 'ev_planner_vehicle_v2',
  CHARGING: 'ev_planner_charging_v2',
  ROUTING: 'ev_planner_routing_v2',
  DISPLAY: 'ev_planner_display_v2',
  PRIVACY: 'ev_planner_privacy_v2',
  HISTORY: 'ev_planner_history_v2'
};

const PlannerContext = createContext<PlannerContextType | undefined>(undefined);

export const PlannerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trip, setTrip] = useState<DemonstrationTrip>(demoTrip);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(demoTrip.activeRouteId);
  const [selectedStop, setSelectedStop] = useState<ChargingStop | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false);

  // Modals state
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('vehicle');
  const [isStationDetailsOpen, setIsStationDetailsOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isLiveDataModalOpen, setIsLiveDataModalOpen] = useState<boolean>(false);
  const [isPlugTypesModalOpen, setIsPlugTypesModalOpen] = useState<boolean>(false);
  const [isReplaceVehicleModalOpen, setIsReplaceVehicleModalOpen] = useState<boolean>(false);

  // Hydrate configurations with LocalStorage persistence
  const [planOptions, setPlanOptions] = useState<PlanOptions>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.OPTIONS);
      return saved ? JSON.parse(saved) : initialPlanOptions;
    } catch {
      return initialPlanOptions;
    }
  });

  const [vehicle, setVehicle] = useState<VehicleProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.VEHICLE);
      return saved ? JSON.parse(saved) : initialVehicleProfile;
    } catch {
      return initialVehicleProfile;
    }
  });

  const [chargingSettings, setChargingSettings] = useState<ChargingSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHARGING);
      return saved ? JSON.parse(saved) : initialChargingSettings;
    } catch {
      return initialChargingSettings;
    }
  });

  const [routingSettings, setRoutingSettings] = useState<RoutingSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ROUTING);
      return saved ? JSON.parse(saved) : initialRoutingSettings;
    } catch {
      return initialRoutingSettings;
    }
  });

  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DISPLAY);
      return saved ? JSON.parse(saved) : initialDisplaySettings;
    } catch {
      return initialDisplaySettings;
    }
  });

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRIVACY);
      return saved ? JSON.parse(saved) : initialPrivacySettings;
    } catch {
      return initialPrivacySettings;
    }
  });

  const [driveHistory, setDriveHistory] = useState<DriveHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return saved ? JSON.parse(saved) : initialDriveHistory;
    } catch {
      return initialDriveHistory;
    }
  });

  // Save to LocalStorage on state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.OPTIONS, JSON.stringify(planOptions));
    } catch {}
  }, [planOptions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.VEHICLE, JSON.stringify(vehicle));
    } catch {}
  }, [vehicle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHARGING, JSON.stringify(chargingSettings));
    } catch {}
  }, [chargingSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTING, JSON.stringify(routingSettings));
    } catch {}
  }, [routingSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DISPLAY, JSON.stringify(displaySettings));
    } catch {}
  }, [displaySettings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRIVACY, JSON.stringify(privacySettings));
    } catch {}
  }, [privacySettings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(driveHistory));
    } catch {}
  }, [driveHistory]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  };

  const activeRoute = useMemo(() => {
    return (
      trip.routeOptions.find((r) => r.id === selectedRouteId) ||
      trip.routeOptions[0]
    );
  }, [trip.routeOptions, selectedRouteId]);

  const openSettingsTab = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setIsSettingsModalOpen(true);
  };

  const togglePanelCollapse = () => {
    setIsPanelCollapsed((prev) => !prev);
  };

  const replanRoute = () => {
    showToast('Calculating optimized demonstration route...');
    setTimeout(() => {
      // Deterministic calculation based on preferences
      if (planOptions.avoidTolls || routingSettings.avoidTolls) {
        setSelectedRouteId('route-fewest'); // Route 3 is the No Toll route
        showToast('Toll avoidance active: routed via non-toll trunk highway (17 h 08 min).');
      } else if (
        planOptions.chargeStops === 'Fewest' ||
        routingSettings.chargeStops === 'Fewest'
      ) {
        setSelectedRouteId('route-fewest');
        showToast('Fewest stops strategy applied.');
      } else if (
        planOptions.chargeStops === 'Fewer' ||
        routingSettings.chargeStops === 'Fewer'
      ) {
        setSelectedRouteId('route-fewer');
        showToast('Fewer stops strategy applied (5 stops, 14 h 45 min).');
      } else {
        setSelectedRouteId('route-optimal');
        showToast('Optimal strategy applied (Fastest overall trip, 14 h 41 min).');
      }
    }, 500);
  };

  const replaceVehicleWith = (profile: VehicleProfile) => {
    setVehicle(profile);
    setIsReplaceVehicleModalOpen(false);
    showToast(`Vehicle replaced with ${profile.name}`);
    replanRoute();
  };

  const clearAllHistory = () => {
    setDriveHistory([]);
    showToast('Trip history has been deleted.');
  };

  const resetAllSettings = () => {
    setPlanOptions(initialPlanOptions);
    setVehicle(initialVehicleProfile);
    setChargingSettings(initialChargingSettings);
    setRoutingSettings(initialRoutingSettings);
    setDisplaySettings(initialDisplaySettings);
    setPrivacySettings(initialPrivacySettings);
    localStorage.clear();
    showToast('All settings reset to demonstration defaults.');
  };

  return (
    <PlannerContext.Provider
      value={{
        trip,
        setTrip,
        activeRoute,
        selectedRouteId,
        setSelectedRouteId,
        selectedStop,
        setSelectedStop,
        hoveredStopId,
        setHoveredStopId,
        isPanelCollapsed,
        setIsPanelCollapsed,
        togglePanelCollapse,
        isOptionsModalOpen,
        setIsOptionsModalOpen,
        isSettingsModalOpen,
        setIsSettingsModalOpen,
        settingsTab,
        setSettingsTab,
        openSettingsTab,
        isStationDetailsOpen,
        setIsStationDetailsOpen,
        isLoginModalOpen,
        setIsLoginModalOpen,
        isLiveDataModalOpen,
        setIsLiveDataModalOpen,
        isPlugTypesModalOpen,
        setIsPlugTypesModalOpen,
        isReplaceVehicleModalOpen,
        setIsReplaceVehicleModalOpen,
        planOptions,
        setPlanOptions,
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
        driveHistory,
        setDriveHistory,
        replanRoute,
        replaceVehicleWith,
        clearAllHistory,
        resetAllSettings,
        toastMessage,
        showToast
      }}
    >
      {children}
    </PlannerContext.Provider>
  );
};

export const usePlanner = () => {
  const context = useContext(PlannerContext);
  if (!context) {
    throw new Error('usePlanner must be used within a PlannerProvider');
  }
  return context;
};
