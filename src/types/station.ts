export type StationAmenity =
  | 'restaurant'
  | 'coffee'
  | 'restroom'
  | 'shopping'
  | 'lodging'
  | 'wifi';

export interface ConnectorSpec {
  type: 'CCS' | 'Level 2' | 'Type 2' | 'CHAdeMO' | 'NACS';
  maxPowerKw: number;
  count: number;
  availableCount?: number;
}

export interface ChargingStation {
  id: string;
  name: string;
  network: string;
  address: string;
  coordinates: [number, number]; // [lat, lng]
  ratedPowerKw: number;
  totalStalls: number;
  availableStalls?: number;
  connectors: ConnectorSpec[];
  amenities: StationAmenity[];
  pricePerKwh: string;
  operationalStatus: 'operational' | 'limited' | 'unknown';
  statusTimestamp: string;
  openingHours: string;
  paymentMethods: string[];
  dataSource: 'Reference Simulation' | 'Open Charge Map' | 'Operator API';
  notes?: string;
  isExcluded?: boolean;
  isPreferred?: boolean;
}
