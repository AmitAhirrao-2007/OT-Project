export type ChargeStopsPreference = 'Optimal' | 'Fewer' | 'Fewest';
export type WeatherChoice = 'Real-time' | 'Seasonal' | 'Manual';
export type UnitSystem = 'imperial' | 'metric';
export type TempUnit = 'F' | 'C';

export interface ChargeCard {
  id: string;
  name: string;
  network: string;
  accountNumberMasked: string;
}

export interface PlanOptions {
  chargeStops: ChargeStopsPreference;
  destinationArrivalSoc: number; // slider, default 10%
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerriesAndTrains: boolean;
  avoidBorders: boolean;
  preferredNetworks: string[];
  useRcspOptimizer?: boolean;
  socDiscretizationStepPercent?: number; // default: 5% (supported: 1, 2, 5)
  routePreference?: 'fastest' | 'shortest'; // road preference, default 'fastest'
  enableSimulatedQueues?: boolean; // default true for demo
  simulatedQueueSeed?: number; // seed for simulation generation
}

export interface ChargingSettings {
  chargeCards: ChargeCard[];
  preferredNetworks: string[];
  avoidedNetworks: string[];
  excludedChargers: string[];
  minimumChargerStalls: number; // default: 1
  maximumChargeLimit: number; // default: 100%
  restroomAvailable: boolean;
  trailerFriendly: boolean;
  dogFriendly: boolean;
  familyFriendly: boolean;
  preferredMinArrivalBatteryCharger: number; // default: 10%
  preferredMinArrivalBatteryDestination: number; // default: 10%
}

export interface RoutingSettings {
  chargeStops: ChargeStopsPreference;
  avoidTolls: boolean;
  avoidBorders: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  realTimeTraffic: boolean;
  adjustSpeed: boolean;
  weatherChoice: WeatherChoice;
  seasonalWeatherDescription: string;
  routePreference?: 'fastest' | 'shortest';
}

export type ThemeChoice = 'light' | 'dark' | 'system';

export interface DisplaySettings {
  units: UnitSystem;
  temperature: TempUnit;
  theme: ThemeChoice;
}

export interface PrivacySettings {
  saveActivity: boolean;
  shareVehicle: boolean;
  telemetryEnabled: boolean;
}

export interface DriveHistoryItem {
  id: string;
  date: string;
  routeTitle: string;
  distanceMi: number;
  duration: string;
  stopsCount: number;
  energyKwh: number;
  isDemo: boolean;
}
