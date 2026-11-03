import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback, ReactNode } from 'react';
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
import { calculateTripRoutes } from '../services/routingService';
import { simulatedQueueService } from '../services/queue/simulatedQueueService';

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
  isChargerFinderOpen: boolean;
  setIsChargerFinderOpen: (open: boolean) => void;
  isSavedPlansOpen: boolean;
  setIsSavedPlansOpen: (open: boolean) => void;
  isOperatorPortalOpen: boolean;
  setIsOperatorPortalOpen: (open: boolean) => void;
  isDriverCheckInOpen: boolean;
  setIsDriverCheckInOpen: (open: boolean) => void;
  driverCheckInStation: { id: string; name: string } | null;
  setDriverCheckInStation: (st: { id: string; name: string } | null) => void;
  operatorStationId: string;
  setOperatorStationId: (id: string) => void;

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
  resolvedTheme: 'light' | 'dark';
  privacySettings: PrivacySettings;
  setPrivacySettings: React.Dispatch<React.SetStateAction<PrivacySettings>>;
  driveHistory: DriveHistoryItem[];
  setDriveHistory: React.Dispatch<React.SetStateAction<DriveHistoryItem[]>>;

  // Actions
  replanRoute: (overrideTrip?: Partial<DemonstrationTrip>) => void;
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
  const [isChargerFinderOpen, setIsChargerFinderOpen] = useState<boolean>(false);
  const [isSavedPlansOpen, setIsSavedPlansOpen] = useState<boolean>(false);
  const [isOperatorPortalOpen, setIsOperatorPortalOpen] = useState<boolean>(false);
  const [isDriverCheckInOpen, setIsDriverCheckInOpen] = useState<boolean>(false);
  const [driverCheckInStation, setDriverCheckInStation] = useState<{ id: string; name: string } | null>(null);
  const [operatorStationId, setOperatorStationId] = useState<string>('sta-test-evsure-hub');

  // Hydrate configurations with LocalStorage persistence
  const [planOptions, setPlanOptions] = useState<PlanOptions>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.OPTIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...initialPlanOptions,
          ...parsed,
          useRcspOptimizer: parsed.useRcspOptimizer === true
        };
      }
      return initialPlanOptions;
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

  // Active theme calculation & DOM synchronization (Light / Dark / System)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const applyTheme = () => {
      let isDark = false;
      if (displaySettings.theme === 'dark') {
        isDark = true;
      } else if (displaySettings.theme === 'light') {
        isDark = false;
      } else if (displaySettings.theme === 'system') {
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      setResolvedTheme(isDark ? 'dark' : 'light');
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (displaySettings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [displaySettings.theme]);

  // Save to LocalStorage on state changes & sync simulated queue settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.OPTIONS, JSON.stringify(planOptions));
      simulatedQueueService.setSimulationEnabled(planOptions.enableSimulatedQueues ?? true);
      if (planOptions.simulatedQueueSeed) {
        simulatedQueueService.setRouteSession(simulatedQueueService.getSessionKey(), planOptions.simulatedQueueSeed);
      }
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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  }, []);

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

  const tripRef = useRef(trip);
  tripRef.current = trip;
  const vehicleRef = useRef(vehicle);
  vehicleRef.current = vehicle;
  const planOptionsRef = useRef(planOptions);
  planOptionsRef.current = planOptions;
  const chargingSettingsRef = useRef(chargingSettings);
  chargingSettingsRef.current = chargingSettings;
  const routingSettingsRef = useRef(routingSettings);
  routingSettingsRef.current = routingSettings;

  const replanRoute = useCallback(async (overrideTrip?: Partial<DemonstrationTrip>) => {
    showToast('Calculating optimized demonstration route...');
    const hasValidOverride =
      overrideTrip &&
      typeof overrideTrip === 'object' &&
      !('nativeEvent' in (overrideTrip as unknown as Record<string, unknown>)) &&
      ('origin' in overrideTrip || 'destination' in overrideTrip || 'waypoints' in overrideTrip);

    const safeOverride = hasValidOverride ? overrideTrip : undefined;
    const currentTrip = safeOverride ? { ...tripRef.current, ...safeOverride } : tripRef.current;
    try {
      // Derive route session key for deterministic simulation along this specific journey
      const sessionKey = `${currentTrip.origin.name || 'origin'}_${currentTrip.destination.name || 'dest'}`;
      simulatedQueueService.setRouteSession(sessionKey, planOptionsRef.current.simulatedQueueSeed || 1);

      const result = await calculateTripRoutes({
        origin: currentTrip.origin,
        destination: currentTrip.destination,
        waypoints: currentTrip.waypoints,
        vehicle: vehicleRef.current,
        planOptions: planOptionsRef.current,
        chargingSettings: chargingSettingsRef.current,
        routingSettings: routingSettingsRef.current
      });

      // Register route stop stations with simulation service
      for (const opt of result.routeOptions) {
        for (const stop of opt.stops) {
          if (stop.stationId) {
            simulatedQueueService.registerStation({
              id: stop.stationId,
              name: stop.name,
              network: stop.network,
              address: stop.address,
              coordinates: stop.coordinates,
              ratedPowerKw: stop.powerKw,
              totalStalls: stop.stallsTotal,
              availableStalls: stop.stallsTotal,
              connectors: [
                {
                  type: 'CCS2',
                  maxPowerKw: stop.powerKw,
                  count: stop.stallsTotal,
                  canonicalType: 'CCS2'
                }
              ],
              amenities: stop.amenities || [],
              pricePerKwh: '₹21.00 / kWh',
              operationalStatus: 'operational',
              statusTimestamp: 'Verified',
              openingHours: '24/7',
              paymentMethods: ['App', 'RFID'],
              dataSource: 'Reference Simulation'
            });
          }
        }
      }

      setTrip((prev) => ({
        ...prev,
        ...safeOverride,
        routeOptions: result.routeOptions,
        activeRouteId: result.activeRouteId
      }));
      setSelectedRouteId(result.activeRouteId);

      const activeOpt =
        result.routeOptions.find((r) => r.id === result.activeRouteId) ||
        result.routeOptions[0];
      showToast(
        `Route optimized: ${activeOpt?.totalDuration || '14 h 41 min'} (${
          activeOpt?.stops.length || 0
        } stops).`
      );
    } catch {
      showToast('Standard highway corridor applied.');
    }
  }, [showToast]);

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
    Object.values(STORAGE_KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
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
        isChargerFinderOpen,
        setIsChargerFinderOpen,
        isSavedPlansOpen,
        setIsSavedPlansOpen,
        isOperatorPortalOpen,
        setIsOperatorPortalOpen,
        isDriverCheckInOpen,
        setIsDriverCheckInOpen,
        driverCheckInStation,
        setDriverCheckInStation,
        operatorStationId,
        setOperatorStationId,
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
        resolvedTheme,
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
