export type ChargeStopsPreference = 'Optimal' | 'Fewer' | 'Fewest';
export type WeatherChoice = 'Real-time' | 'Seasonal' | 'Manual';
export type UnitSystem = 'imperial' | 'metric';
export type TempUnit = 'F' | 'C';

export interface PlanOptions {
  chargeStops: ChargeStopsPreference;
  destinationArrivalSoc: number; // slider, default 10%
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerriesAndTrains: boolean;
  avoidBorders: boolean;
  preferredNetworks: string[];
}

export interface ChargingSettings {
  chargeCards: string[];
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
}

export interface DisplaySettings {
  units: UnitSystem;
  temperature: TempUnit;
  theme: 'dark' | 'light';
}

export interface PrivacySettings {
  saveActivity: boolean;
  shareVehicle: boolean;
  telemetryEnabled: boolean;
}
