import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { ChargingStop, DemonstrationTrip, RouteOption } from '../types/route';
import { VehicleProfile } from '../types/vehicle';
import {
  ChargingSettings,
  DisplaySettings,
  PlanOptions,
  PrivacySettings,
  RoutingSettings
} from '../types/settings';
import { demoTrip } from '../data/demoRoute';
import { initialVehicleProfile } from '../data/demoVehicle';
import {
  initialChargingSettings,
  initialDisplaySettings,
  initialPlanOptions,
  initialPrivacySettings,
  initialRoutingSettings
} from '../data/demoSettings';

export type SettingsTab =
  | 'account'
  | 'vehicle'
  | 'charging'
  | 'routing'
  | 'display'
  | 'privacy'
  | 'history';

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

  // Modals
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

  // Actions
  replanRoute: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const PlannerContext = createContext<PlannerContextType | undefined>(undefined);

export const PlannerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trip, setTrip] = useState<DemonstrationTrip>(demoTrip);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(demoTrip.activeRouteId);
  const [selectedStop, setSelectedStop] = useState<ChargingStop | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);

  // Modals state
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('vehicle');
  const [isStationDetailsOpen, setIsStationDetailsOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Data & settings state
  const [planOptions, setPlanOptions] = useState<PlanOptions>(initialPlanOptions);
  const [vehicle, setVehicle] = useState<VehicleProfile>(initialVehicleProfile);
  const [chargingSettings, setChargingSettings] = useState<ChargingSettings>(initialChargingSettings);
  const [routingSettings, setRoutingSettings] = useState<RoutingSettings>(initialRoutingSettings);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(initialDisplaySettings);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(initialPrivacySettings);

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

  const replanRoute = () => {
    showToast('Calculating optimized demonstration route...');
    setTimeout(() => {
      // If plan options is 'Fewest', switch to fewest route, otherwise optimal
      if (planOptions.chargeStops === 'Fewest') {
        setSelectedRouteId('route-fewest');
      } else if (planOptions.chargeStops === 'Fewer') {
        setSelectedRouteId('route-fewer');
      } else {
        setSelectedRouteId('route-optimal');
      }
      showToast('Route updated with current constraints & vehicle model.');
    }, 600);
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
        replanRoute,
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
