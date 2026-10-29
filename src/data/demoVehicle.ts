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
