import { StationAmenity } from './station';

export type Amenity = StationAmenity;

export interface ChargingStop {
  id: string;
  stationId: string;
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
  energyAddedKwh: number;
  legDriveDuration: string; // e.g., "3 h 38 min"
  legDistanceMi: number; // e.g., 170
  amenities: Amenity[];
  priceEstimate?: string;
  notes?: string;
  isExcluded?: boolean;
  isPreferred?: boolean;
  isFeasible: boolean;
}

export interface RouteOption {
  id: string;
  label: string; // e.g. "14 h 41 min"
  badge?: string; // e.g. "Faster" or "+2 h 27 min"
  description?: string;
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
  estimatedExpenseInr: number;
  tollNote?: string;
  stops: ChargingStop[];
  polylineCoordinates: [number, number][];
  isFeasible: boolean;
  calculationMethod: 'Energy-Constrained Path Simulation' | 'OSRM Road Router + Calibrated Model';
}

export interface Waypoint {
  id: string;
  name: string;
  subTitle?: string;
  coordinates: [number, number];
  batterySoc: number;
  departureTime?: string;
  arrivalTime?: string;
  isCustom?: boolean;
}

export interface DemonstrationTrip {
  origin: Waypoint;
  destination: Waypoint;
  waypoints: Waypoint[];
  routeOptions: RouteOption[];
  activeRouteId: string;
}
