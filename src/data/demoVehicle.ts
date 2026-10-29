import { VehicleProfile } from '../types/vehicle';

export const initialVehicleProfile: VehicleProfile = {
  id: 'tata-nexon-ev-demo',
  name: 'Tata Nexon EV Max',
  model: 'Nexon EV Long Range (UI Test Reference)',
  year: 2024,
  batteryCapacityKwh: 40.5,
  usableBatteryKwh: 38.0,
  referenceConsumptionWhPerMi: 245, // Exact reference value
  maximumSpeedMph: 83,             // Exact reference value
  relativeSpeedPercent: 101,        // Exact reference value
  batteryDegradationPercent: 5.1,   // Exact reference value
  supportedPlugTypes: ['CCS', 'Level 2', 'Type 2'],
  selectedPlugTypes: ['CCS'],      // Reference: CCS selected, Level 2 unselected
  liveDataConnected: false,
  saveActivity: true
};

export const availableVehicles: VehicleProfile[] = [
  initialVehicleProfile,
  {
    id: 'tata-punch-ev',
    name: 'Tata Punch EV LR',
    model: 'Punch.ev Empowered Plus (35 kWh)',
    year: 2024,
    batteryCapacityKwh: 35.0,
    usableBatteryKwh: 33.0,
    referenceConsumptionWhPerMi: 220,
    maximumSpeedMph: 80,
    relativeSpeedPercent: 100,
    batteryDegradationPercent: 1.8,
    supportedPlugTypes: ['CCS', 'Level 2', 'Type 2'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: true
  },
  {
    id: 'mg-zs-ev',
    name: 'MG ZS EV Excite',
    model: 'ZS EV Long Range (50.3 kWh)',
    year: 2023,
    batteryCapacityKwh: 50.3,
    usableBatteryKwh: 48.0,
    referenceConsumptionWhPerMi: 270,
    maximumSpeedMph: 90,
    relativeSpeedPercent: 100,
    batteryDegradationPercent: 3.2,
    supportedPlugTypes: ['CCS', 'Level 2', 'Type 2'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: true
  },
  {
    id: 'hyundai-ioniq-5',
    name: 'Hyundai Ioniq 5',
    model: 'Ioniq 5 RWD (72.6 kWh)',
    year: 2024,
    batteryCapacityKwh: 72.6,
    usableBatteryKwh: 70.0,
    referenceConsumptionWhPerMi: 300,
    maximumSpeedMph: 115,
    relativeSpeedPercent: 105,
    batteryDegradationPercent: 1.2,
    supportedPlugTypes: ['CCS', 'Level 2', 'Type 2', 'NACS'],
    selectedPlugTypes: ['CCS'],
    liveDataConnected: false,
    saveActivity: true
  }
];
