import {
  ChargingSettings,
  DisplaySettings,
  PlanOptions,
  PrivacySettings,
  RoutingSettings
} from '../types/settings';

export const initialPlanOptions: PlanOptions = {
  chargeStops: 'Optimal',
  destinationArrivalSoc: 10,
  avoidTolls: false,
  avoidHighways: false,
  avoidFerriesAndTrains: true,
  avoidBorders: false,
  preferredNetworks: ['Adani Total Energies', 'Charge_IN by Mahindra', 'Renovatio', 'Tata Power EZ Charge']
};

export const initialChargingSettings: ChargingSettings = {
  chargeCards: ['PlugShare Key', 'RFID Card - Adani', 'Tata Power RFID'],
  preferredNetworks: ['Adani Total Energies', 'Charge_IN by Mahindra', 'Renovatio', 'Tata Power EZ Charge'],
  avoidedNetworks: ['Generic Unverified'],
  excludedChargers: [],
  minimumChargerStalls: 1, // Observed reference: 1
  maximumChargeLimit: 100, // Observed reference: 100%
  restroomAvailable: true,
  trailerFriendly: false,
  dogFriendly: false,
  familyFriendly: true,
  preferredMinArrivalBatteryCharger: 10, // Observed reference: 10%
  preferredMinArrivalBatteryDestination: 10 // Observed reference: 10%
};

export const initialRoutingSettings: RoutingSettings = {
  chargeStops: 'Optimal',
  avoidTolls: false,
  avoidBorders: false,
  avoidHighways: false,
  avoidFerries: true,
  realTimeTraffic: true,
  adjustSpeed: true,
  weatherChoice: 'Seasonal',
  seasonalWeatherDescription: 'Seasonal temperature and wind conditions based on historical data'
};

export const initialDisplaySettings: DisplaySettings = {
  units: 'imperial', // captured reference shows mi & mph
  temperature: 'F',
  theme: 'dark'
};

export const initialPrivacySettings: PrivacySettings = {
  saveActivity: true,
  shareVehicle: false,
  telemetryEnabled: true
};

export const availableNetworks = [
  'Adani Total Energies',
  'Charge_IN by Mahindra',
  'Renovatio',
  'Tata Power EZ Charge',
  'Statiq',
  'Jio-bp pulse',
  'Zeon Charging',
  'Electrify America',
  'Tesla Supercharger'
];
