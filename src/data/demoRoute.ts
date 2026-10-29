import { ChargingStop, DemonstrationTrip, RouteOption } from '../types/route';

// High-resolution polyline coordinates along the Patna -> Purvanchal -> Haidergarh -> Sitapur -> Bareilly -> Garhmukteshwar -> Delhi highway corridor
const primaryRouteCoords: [number, number][] = [
  [25.5941, 85.1376], // Patna
  [25.6833, 84.7500], // Bihta
  [25.7500, 84.4000], // Ara
  [25.6900, 83.9800], // Buxar
  [25.6500, 83.6000], // Ghazipur / Purvanchal Exp entrance
  [25.8200, 83.4500],
  [26.0684, 83.1859], // Stop 1: Adani TGas - Azamgarh
  [26.2200, 82.7500], // Sultanpur section
  [26.4000, 82.2000],
  [26.5894, 81.4282], // Stop 2: Renovatio e-charge - Haidergarh
  [26.8500, 80.9500], // Lucknow bypass
  [27.1500, 80.7000],
  [27.4924, 80.3721], // Stop 3: Adani TGas - Navabad Grant
  [27.7000, 79.9500], // Shahjahanpur
  [27.9152, 79.5284], // Stop 4: Adani TGas - Gularia
  [28.1500, 79.2500], // Bareilly bypass
  [28.3245, 78.9612], // Stop 5: Adani TGas - Kalliya Kazampur
  [28.5200, 78.5500], // Chandausi / Moradabad link
  [28.7516, 78.0965], // Stop 6: ChargeIn - Bikanerwala Garhmukteshwar
  [28.7200, 77.7500], // Hapur
  [28.6700, 77.4500], // Ghaziabad
  [28.6139, 77.2090]  // Delhi
];

export const demoStops: ChargingStop[] = [
  {
    id: 'stop-1',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Purvanchal Expressway, Azamgarh sub-district',
    coordinates: [26.0684, 83.1859],
    powerKw: 240,
    stallsTotal: 4,
    stallsAvailable: 3,
    arrivalTime: '4:09 AM',
    departureTime: '4:47 AM',
    arrivalSoc: 13,
    departureSoc: 79,
    chargeDurationMinutes: 38,
    legDriveDuration: '3 h 38 min',
    legDistanceMi: 170,
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    priceEstimate: '₹22.50 / kWh',
    notes: 'High-speed DC fast charger located inside expressway wayside amenities center.'
  },
  {
    id: 'stop-2',
    name: 'Renovatio e-charge',
    network: 'Renovatio',
    address: 'NH-731, Haidergarh',
    coordinates: [26.5894, 81.4282],
    powerKw: 120,
    stallsTotal: 2,
    stallsAvailable: 2,
    arrivalTime: '6:55 AM',
    departureTime: '7:22 AM',
    arrivalSoc: 17,
    departureSoc: 62,
    chargeDurationMinutes: 27,
    legDriveDuration: '2 h 3 min',
    legDistanceMi: 118,
    amenities: ['restaurant', 'restroom', 'coffee'],
    priceEstimate: '₹21.00 / kWh',
    notes: '24/7 highway diner and EV charging station with shaded parking canopy.'
  },
  {
    id: 'stop-3',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Navabad Grant- GGE',
    coordinates: [27.4924, 80.3721],
    powerKw: 240,
    stallsTotal: 6,
    stallsAvailable: 5,
    arrivalTime: '9:13 AM',
    departureTime: '9:39 AM',
    arrivalSoc: 10,
    departureSoc: 61,
    chargeDurationMinutes: 26,
    legDriveDuration: '1 h 46 min',
    legDistanceMi: 95,
    amenities: ['restaurant', 'restroom', 'coffee', 'wifi'],
    priceEstimate: '₹22.50 / kWh',
    notes: 'Fast charge hub with 6 CCS2 bays and clean lounge.'
  },
  {
    id: 'stop-4',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Gularia-GGE',
    coordinates: [27.9152, 79.5284],
    powerKw: 240,
    stallsTotal: 2,
    stallsAvailable: 1,
    arrivalTime: '10:46 AM',
    departureTime: '11:10 AM',
    arrivalSoc: 10,
    departureSoc: 58,
    chargeDurationMinutes: 24,
    legDriveDuration: '1 h 2 min',
    legDistanceMi: 77,
    amenities: ['restroom', 'coffee'],
    priceEstimate: '₹22.50 / kWh',
    notes: 'Convenient wayside location with quick coffee and snacks.'
  },
  {
    id: 'stop-5',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Kalliya Kazampur- GGE',
    coordinates: [28.3245, 78.9612],
    powerKw: 60,
    stallsTotal: 2,
    stallsAvailable: 2,
    arrivalTime: '11:56 AM',
    departureTime: '12:20 PM',
    arrivalSoc: 25,
    departureSoc: 65,
    chargeDurationMinutes: 24,
    legDriveDuration: '41 min',
    legDistanceMi: 49,
    amenities: ['restroom', 'shopping'],
    priceEstimate: '₹19.50 / kWh',
    notes: '60 kW dual-gun charger adjacent to supermarket.'
  },
  {
    id: 'stop-6',
    name: 'ChargeIn',
    network: 'Charge_IN by Mahindra',
    address: 'Bikanerwala Garhmukteshwar (Charge_IN by Mahindra)',
    coordinates: [28.7516, 78.0965],
    powerKw: 180,
    stallsTotal: 4,
    stallsAvailable: 4,
    arrivalTime: '1:41 PM',
    departureTime: '1:54 PM',
    arrivalSoc: 11,
    departureSoc: 38,
    chargeDurationMinutes: 13,
    legDriveDuration: '1 h 17 min',
    legDistanceMi: 85,
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    priceEstimate: '₹23.00 / kWh',
    notes: 'Popular food court stop at Bikanerwala. Quick top-up for final Delhi approach.'
  }
];

export const demoRouteOptions: RouteOption[] = [
  {
    id: 'route-optimal',
    label: '14 h 41 min',
    badge: 'Faster',
    totalDuration: '14 h 41 min',
    drivingDuration: '11 h 40 min',
    chargingDuration: '2 h 31 min',
    totalDistanceMi: 649,
    stopCount: 6,
    totalEnergyKwh: 154,
    tollNote: 'Toll',
    stops: demoStops,
    polylineCoordinates: primaryRouteCoords
  },
  {
    id: 'route-fewer',
    label: '14 h 45 min',
    totalDuration: '14 h 45 min',
    drivingDuration: '11 h 48 min',
    chargingDuration: '2 h 57 min',
    totalDistanceMi: 654,
    stopCount: 5,
    totalEnergyKwh: 158,
    tollNote: 'Toll',
    stops: [
      demoStops[0],
      demoStops[1],
      demoStops[2],
      demoStops[3],
      demoStops[5]
    ],
    polylineCoordinates: primaryRouteCoords
  },
  {
    id: 'route-fewest',
    label: '17 h 8 min',
    badge: '+2 h 27 min',
    totalDuration: '17 h 8 min',
    drivingDuration: '13 h 52 min',
    chargingDuration: '3 h 16 min',
    totalDistanceMi: 682,
    stopCount: 7,
    totalEnergyKwh: 166,
    tollNote: 'No Toll',
    stops: [
      demoStops[0],
      demoStops[1],
      demoStops[2],
      demoStops[3],
      demoStops[4],
      demoStops[5]
    ],
    polylineCoordinates: primaryRouteCoords.map(([lat, lng]) => [lat + 0.05, lng - 0.03])
  }
];

export const demoTrip: DemonstrationTrip = {
  origin: {
    name: 'Patna',
    coordinates: [25.5941, 85.1376],
    batterySoc: 95,
    departureTime: '12:31 AM'
  },
  destination: {
    name: 'Delhi',
    subTitle: 'South West',
    coordinates: [28.6139, 77.2090],
    batterySoc: 11,
    arrivalTime: '3:12 PM'
  },
  routeOptions: demoRouteOptions,
  activeRouteId: 'route-optimal'
};
