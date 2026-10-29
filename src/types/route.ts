export type Amenity = 'restaurant' | 'coffee' | 'restroom' | 'shopping' | 'lodging' | 'wifi';

export interface ChargingStop {
  id: string;
  name: string;
  network: string;
  address: string;
  coordinates: [number, number]; // [lat, lng]
  powerKw: number;
  stallsTotal: number;
  stallsAvailable?: number;
  arrivalTime: string;
  departureTime: string;
  arrivalSoc: number; // percentage
  departureSoc: number; // percentage
  chargeDurationMinutes: number;
  legDriveDuration: string; // e.g., "3 h 38 min"
  legDistanceMi: number; // e.g., 170
  amenities: Amenity[];
  priceEstimate?: string;
  notes?: string;
  isExcluded?: boolean;
  isPreferred?: boolean;
}

export interface RouteOption {
  id: string;
  label: string; // e.g. "14 h 41 min"
  badge?: string; // e.g. "Faster" or "+2 h 27 min"
  totalDuration: string;
  totalDurationMinutes: number;
  drivingDuration: string;
  drivingDurationMinutes: number;
  chargingDuration: string;
  chargingDurationMinutes: number;
  stopBufferDuration: string;
  stopBufferMinutes: number;
  totalDistanceMi: number;
  stopCount: number;
  totalEnergyKwh: number;
  tollNote?: string;
  stops: ChargingStop[];
  polylineCoordinates: [number, number][];
}

export interface Waypoint {
  name: string;
  subTitle?: string;
  coordinates: [number, number];
  batterySoc: number;
  departureTime?: string;
  arrivalTime?: string;
}

export interface DemonstrationTrip {
  origin: Waypoint;
  destination: Waypoint;
  routeOptions: RouteOption[];
  activeRouteId: string;
}
