import { VehicleProfile } from '../types/vehicle';

export const initialVehicleProfile: VehicleProfile = {
  id: 'tata-nexon-ev-demo',
  name: 'Tata Nexon EV Max',
  manufacturer: 'Tata Motors',
  model: 'Nexon EV Long Range (UI Test Reference)',
  variant: 'Max Empowered LR',
  year: 2024,
  batteryCapacityKwh: 40.5,
  usableBatteryKwh: 38.0,
  maxDcChargingKw: 50,
  maxAcChargingKw: 7.2,
  referenceConsumptionWhPerMi: 245, // Exact reference value
  maximumSpeedMph: 83,             // Exact reference value
  relativeSpeedPercent: 101,        // Exact reference value
  batteryDegradationPercent: 5.1,   // Exact reference value
  supportedPlugTypes: ['CCS', 'Level 2', 'Type 2'],
  selectedPlugTypes: ['CCS'],      // Reference: CCS selected, Level 2 unselected
  liveDataConnected: false,
  saveActivity: true,
  imageSvgType: 'suv'
};

export const availableVehicles: VehicleProfile[] = [
  initialVehicleProfile,
  {
    id: 'tata-punch-ev',
    name: 'Tata Punch EV LR',
    manufacturer: 'Tata Motors',
    model: 'Punch.ev Empowered Plus (35 kWh)',
    variant: 'Empowered Plus LR',
    year: 2024,
    batteryCapacityKwh: 35.0,
    usableBatteryKwh: 33.0,
    maxDcChargingKw: 50,
    maxAcChargingKw: 7.2,
    referenceConsumptionWhPerMi: 220,
    maximumSpeedMph: 80,
    relativeSpeedPercent: 100,
    batteryDegradationPercent: 1.8,
    supportedPlugTypes: ['CCS', 'Level 2', 'Type 2'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: true,
    imageSvgType: 'suv'
  },
  {
    id: 'mg-zs-ev',
    name: 'MG ZS EV Excite',
    manufacturer: 'MG Motor',
    model: 'ZS EV Long Range (50.3 kWh)',
    variant: 'Excite Pro',
    year: 2023,
    batteryCapacityKwh: 50.3,
    usableBatteryKwh: 48.0,
    maxDcChargingKw: 60,
    maxAcChargingKw: 7.4,
    referenceConsumptionWhPerMi: 270,
    maximumSpeedMph: 90,
    relativeSpeedPercent: 100,
    batteryDegradationPercent: 3.2,
    supportedPlugTypes: ['CCS', 'Level 2', 'Type 2'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: true,
    imageSvgType: 'suv'
  },
  {
    id: 'hyundai-ioniq-5',
    name: 'Hyundai Ioniq 5',
    manufacturer: 'Hyundai',
    model: 'Ioniq 5 RWD (72.6 kWh)',
    variant: 'Long Range RWD',
    year: 2024,
    batteryCapacityKwh: 72.6,
    usableBatteryKwh: 70.0,
    maxDcChargingKw: 240,
    maxAcChargingKw: 11,
    referenceConsumptionWhPerMi: 300,
    maximumSpeedMph: 115,
    relativeSpeedPercent: 105,
    batteryDegradationPercent: 1.2,
    supportedPlugTypes: ['CCS', 'Level 2', 'Type 2', 'NACS'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: true,
    imageSvgType: 'suv'
  }
];
