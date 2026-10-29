import { RouteOption, Waypoint } from './route';

export interface SavedPlan {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  origin: Waypoint;
  destination: Waypoint;
  waypoints: Waypoint[];
  vehicleId: string;
  vehicleName: string;
  routeId: string;
  totalDistanceMi: number;
  totalDuration: string;
  stopCount: number;
  totalEnergyKwh: number;
  routeOption: RouteOption;
}
