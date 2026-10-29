export type PlugType = 'CCS' | 'Level 2' | 'CHAdeMO' | 'NACS' | 'Type 2';

export interface VehicleProfile {
  id: string;
  name: string;
  model: string;
  year: number;
  batteryCapacityKwh: number;
  usableBatteryKwh: number;
  referenceConsumptionWhPerMi: number; // reference observed: 245 Wh/mi
  maximumSpeedMph: number; // reference observed: 83 mph
  relativeSpeedPercent: number; // reference observed: 101%
  batteryDegradationPercent: number; // reference observed: 5.1%
  supportedPlugTypes: PlugType[];
  selectedPlugTypes: PlugType[]; // reference: CCS selected, Level 2 unselected
  liveDataConnected: boolean;
  saveActivity: boolean;
}
