import {
  ChargingSettings,
  DisplaySettings,
  DriveHistoryItem,
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
  preferredNetworks: [] // Observed reference: No preferred charging networks configured by default
};

export const initialChargingSettings: ChargingSettings = {
  chargeCards: [], // Observed reference: No charge cards configured
  preferredNetworks: [], // Observed reference: No preferred charging networks configured
  avoidedNetworks: [],
  excludedChargers: [], // Observed reference: No excluded chargers
  minimumChargerStalls: 1, // Observed reference: 1 stall
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
  theme: 'light' // Default to Light mode per professional automotive design specification
};

export const initialPrivacySettings: PrivacySettings = {
  saveActivity: true,
  shareVehicle: false,
  telemetryEnabled: true
};

export const initialDriveHistory: DriveHistoryItem[] = [
  {
    id: 'hist-1',
    date: 'Oct 29, 2026',
    routeTitle: 'Patna → Delhi Corridor (Reference Simulation)',
    distanceMi: 649,
    duration: '14 h 41 min',
    stopsCount: 6,
    energyKwh: 154,
    isDemo: true
  },
  {
    id: 'hist-2',
    date: 'Oct 22, 2026',
    routeTitle: 'Bengaluru → Chennai Expressway (Calibration Run)',
    distanceMi: 218,
    duration: '4 h 15 min',
    stopsCount: 1,
    energyKwh: 52,
    isDemo: true
  }
];

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
