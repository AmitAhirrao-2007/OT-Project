import { ChargingStop, DemonstrationTrip, RouteOption } from '../types/route';

// High-resolution real road corridor coordinates between Patna and Delhi
// Route 1: Purvanchal Expressway & Lucknow-Agra/Bareilly link
const route1Coordinates: [number, number][] = [
  [25.5941, 85.1376], // Patna
  [25.6100, 85.0400], // Danapur
  [25.6700, 84.8800], // Maner
  [25.7500, 84.6600], // Koilwar Bridge
  [25.5600, 84.6600], // Ara
  [25.5700, 84.2800], // Jagdishpur
  [25.5600, 83.9800], // Buxar
  [25.5800, 83.6000], // Ghazipur / Purvanchal Expressway East Origin
  [25.8200, 83.4500], // Purvanchal Exp KM 40
  [26.0684, 83.1859], // Stop 1: Adani TGas - Azamgarh Wayside (Purvanchal Exp)
  [26.1800, 82.8800], // Purvanchal Exp KM 120
  [26.2600, 82.5000], // Sultanpur Bypass
  [26.4200, 82.0000], // Purvanchal Exp KM 220
  [26.5894, 81.4282], // Stop 2: Renovatio e-charge - NH-731 Haidergarh
  [26.7800, 81.1800], // Mohanlalganj
  [26.8500, 80.9500], // Lucknow Kisan Path Outer Ring Road
  [27.0500, 80.8000], // Itaunja
  [27.2500, 80.6000], // Ataria
  [27.4924, 80.3721], // Stop 3: Adani TGas - Navabad Grant (Sitapur link)
  [27.6500, 80.1200], // Maholi
  [27.8800, 79.9100], // Shahjahanpur Bypass
  [27.9152, 79.5284], // Stop 4: Adani TGas - Gularia (NH-30 Bareilly approach)
  [28.1800, 79.3500], // Bareilly Western Bypass
  [28.3245, 78.9612], // Stop 5: Adani TGas - Kalliya Kazampur (Chandausi)
  [28.5500, 78.6000], // Sambhal link
  [28.7516, 78.0965], // Stop 6: ChargeIn - Bikanerwala Garhmukteshwar (NH-9)
  [28.7400, 77.8200], // Simbhaoli
  [28.7300, 77.7800], // Hapur Bypass
  [28.6900, 77.5800], // Pilkhuwa
  [28.6700, 77.4400], // Ghaziabad Eastern Peripheral
  [28.6300, 77.2900], // Delhi Border / Akshardham
  [28.6139, 77.2090]  // Delhi (South West)
];

// Route 2: Fewer stops alternative (skips Stop 5, charges longer at Stop 4)
const route2Coordinates: [number, number][] = [
  ...route1Coordinates.slice(0, 21),
  [28.2500, 79.1500], // Direct Rampur link
  [28.8100, 79.0200], // Rampur bypass
  [28.8300, 78.7800], // Moradabad bypass
  [28.7516, 78.0965], // Stop 6: Garhmukteshwar
  ...route1Coordinates.slice(26)
];

// Route 3: Non-toll trunk highway (NH-31 / NH-24 corridor through Kanpur & Aligarh)
const route3Coordinates: [number, number][] = [
  [25.5941, 85.1376], // Patna
  [25.6800, 84.7500], // Bihta
  [25.7500, 84.1500], // Ballia
  [25.7600, 83.5800], // Rasra
  [26.0684, 83.1859], // Stop 1: Azamgarh
  [26.2200, 82.0800], // Sultanpur
  [26.5894, 81.4282], // Stop 2: Haidergarh
  [26.8467, 80.9462], // Stop 3: Tata Power Lucknow Outer Bypass
  [27.4924, 80.3721], // Stop 4: Navabad Grant
  [27.9152, 79.5284], // Stop 5: Gularia
  [28.3245, 78.9612], // Stop 6: Kalliya Kazampur
  [28.7516, 78.0965], // Stop 7: Garhmukteshwar
  [28.6139, 77.2090]  // Delhi
];

export const demoStopsRoute1: ChargingStop[] = [
  {
    id: 'stop-1',
    stationId: 'sta-azamgarh-adani',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Purvanchal Expressway, Azamgarh sub-district',
    coordinates: [26.0684, 83.1859],
    powerKw: 240,
    stallsTotal: 4,
    stallsAvailable: 3,
    arrivalTime: '4:09 AM',
    departureTime: '4:52 AM',
    arrivalSoc: 13,
    departureSoc: 79,
    chargeDurationMinutes: 38,
    energyAddedKwh: 24.5,
    legDriveDuration: '3 h 38 min',
    legDistanceMi: 170,
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    priceEstimate: '₹22.50 / kWh',
    notes: 'High-speed DC fast charger located inside expressway wayside amenities center.',
    isFeasible: true
  },
  {
    id: 'stop-2',
    stationId: 'sta-haidergarh-renovatio',
    name: 'Renovatio e-charge',
    network: 'Renovatio',
    address: 'NH-731, Haidergarh',
    coordinates: [26.5894, 81.4282],
    powerKw: 120,
    stallsTotal: 2,
    stallsAvailable: 2,
    arrivalTime: '6:55 AM',
    departureTime: '7:27 AM',
    arrivalSoc: 17,
    departureSoc: 62,
    chargeDurationMinutes: 27,
    energyAddedKwh: 16.8,
    legDriveDuration: '2 h 03 min',
    legDistanceMi: 118,
    amenities: ['restaurant', 'restroom', 'coffee'],
    priceEstimate: '₹21.00 / kWh',
    notes: '24/7 highway diner and EV charging station with shaded parking canopy.',
    isFeasible: true
  },
  {
    id: 'stop-3',
    stationId: 'sta-sitapur-adani',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Navabad Grant- GGE',
    coordinates: [27.4924, 80.3721],
    powerKw: 240,
    stallsTotal: 6,
    stallsAvailable: 5,
    arrivalTime: '9:13 AM',
    departureTime: '9:44 AM',
    arrivalSoc: 10,
    departureSoc: 61,
    chargeDurationMinutes: 26,
    energyAddedKwh: 19.2,
    legDriveDuration: '1 h 46 min',
    legDistanceMi: 95,
    amenities: ['restaurant', 'restroom', 'coffee', 'wifi'],
    priceEstimate: '₹22.50 / kWh',
    notes: 'Fast charge hub with 6 CCS2 bays and clean lounge.',
    isFeasible: true
  },
  {
    id: 'stop-4',
    stationId: 'sta-bareilly-adani',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Gularia-GGE',
    coordinates: [27.9152, 79.5284],
    powerKw: 240,
    stallsTotal: 2,
    stallsAvailable: 1,
    arrivalTime: '10:46 AM',
    departureTime: '11:15 AM',
    arrivalSoc: 10,
    departureSoc: 58,
    chargeDurationMinutes: 24,
    energyAddedKwh: 18.0,
    legDriveDuration: '1 h 02 min',
    legDistanceMi: 77,
    amenities: ['restroom', 'coffee'],
    priceEstimate: '₹22.50 / kWh',
    notes: 'Convenient wayside location with quick coffee and snacks.',
    isFeasible: true
  },
  {
    id: 'stop-5',
    stationId: 'sta-chandausi-adani',
    name: 'Adani TGas',
    network: 'Adani Total Energies',
    address: 'Kalliya Kazampur- GGE',
    coordinates: [28.3245, 78.9612],
    powerKw: 60,
    stallsTotal: 2,
    stallsAvailable: 2,
    arrivalTime: '11:56 AM',
    departureTime: '12:24 PM',
    arrivalSoc: 25,
    departureSoc: 65,
    chargeDurationMinutes: 24,
    energyAddedKwh: 15.0,
    legDriveDuration: '41 min',
    legDistanceMi: 49,
    amenities: ['restroom', 'shopping'],
    priceEstimate: '₹19.50 / kWh',
    notes: '60 kW dual-gun charger adjacent to supermarket.',
    isFeasible: true
  },
  {
    id: 'stop-6',
    stationId: 'sta-garhmukteshwar-chargein',
    name: 'ChargeIn',
    network: 'Charge_IN by Mahindra',
    address: 'Bikanerwala Garhmukteshwar (Charge_IN by Mahindra)',
    coordinates: [28.7516, 78.0965],
    powerKw: 180,
    stallsTotal: 4,
    stallsAvailable: 4,
    arrivalTime: '1:41 PM',
    departureTime: '1:59 PM',
    arrivalSoc: 11,
    departureSoc: 38,
    chargeDurationMinutes: 13,
    energyAddedKwh: 10.2,
    legDriveDuration: '1 h 17 min',
    legDistanceMi: 85,
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    priceEstimate: '₹23.00 / kWh',
    notes: 'Popular food court stop at Bikanerwala. Quick top-up for final Delhi approach.',
    isFeasible: true
  }
];

export const demoStopsRoute2: ChargingStop[] = [
  demoStopsRoute1[0],
  demoStopsRoute1[1],
  demoStopsRoute1[2],
  {
    ...demoStopsRoute1[3],
    departureSoc: 72,
    chargeDurationMinutes: 32,
    departureTime: '11:23 AM',
    energyAddedKwh: 23.2
  },
  demoStopsRoute1[5]
];

export const demoStopsRoute3: ChargingStop[] = [
  { ...demoStopsRoute1[0], arrivalTime: '4:28 AM', departureTime: '5:11 AM' },
  { ...demoStopsRoute1[1], arrivalTime: '7:35 AM', departureTime: '8:09 AM' },
  {
    id: 'stop-3-alt',
    stationId: 'sta-lucknow-tata',
    name: 'Tata Power EZ Charge',
    network: 'Tata Power EZ Charge',
    address: 'Kisan Path Bypass, Lucknow',
    coordinates: [26.8467, 80.9462],
    powerKw: 150,
    stallsTotal: 4,
    stallsAvailable: 3,
    arrivalTime: '9:42 AM',
    departureTime: '10:13 AM',
    arrivalSoc: 18,
    departureSoc: 64,
    chargeDurationMinutes: 26,
    energyAddedKwh: 17.5,
    legDriveDuration: '1 h 33 min',
    legDistanceMi: 68,
    amenities: ['restaurant', 'restroom', 'wifi'],
    priceEstimate: '₹21.50 / kWh',
    notes: 'Dedicated Tata Power EV plaza with AC lounge.',
    isFeasible: true
  },
  { ...demoStopsRoute1[2], arrivalTime: '11:45 AM', departureTime: '12:17 PM' },
  { ...demoStopsRoute1[3], arrivalTime: '1:18 PM', departureTime: '1:48 PM' },
  { ...demoStopsRoute1[4], arrivalTime: '2:38 PM', departureTime: '3:08 PM' },
  { ...demoStopsRoute1[5], arrivalTime: '4:32 PM', departureTime: '4:52 PM' }
];

export const demoRouteOptions: RouteOption[] = [
  {
    id: 'route-optimal',
    label: '14 h 41 min',
    badge: 'Faster',
    totalDuration: '14 h 41 min',
    totalDurationMinutes: 881, // 700 drive + 151 charge + 30 buffer = 881m = 14h 41m
    drivingDuration: '11 h 40 min',
    drivingDurationMinutes: 700,
    chargingDuration: '2 h 31 min',
    chargingDurationMinutes: 151,
    stopBufferDuration: '30 min',
    stopBufferMinutes: 30, // 6 stops * 5 min
    totalDistanceMi: 649,
    stopCount: 6,
    totalEnergyKwh: 154,
    estimatedExpenseInr: 2280,
    tollNote: 'Toll',
    stops: demoStopsRoute1,
    polylineCoordinates: route1Coordinates,
    isFeasible: true,
    calculationMethod: 'Energy-Constrained Path Simulation'
  },
  {
    id: 'route-fewer',
    label: '14 h 45 min',
    totalDuration: '14 h 45 min',
    totalDurationMinutes: 885, // 708 drive + 152 charge + 25 buffer = 885m = 14h 45m
    drivingDuration: '11 h 48 min',
    drivingDurationMinutes: 708,
    chargingDuration: '2 h 32 min',
    chargingDurationMinutes: 152,
    stopBufferDuration: '25 min',
    stopBufferMinutes: 25, // 5 stops * 5 min
    totalDistanceMi: 654,
    stopCount: 5,
    totalEnergyKwh: 158,
    estimatedExpenseInr: 2310,
    tollNote: 'Toll',
    stops: demoStopsRoute2,
    polylineCoordinates: route2Coordinates,
    isFeasible: true,
    calculationMethod: 'Energy-Constrained Path Simulation'
  },
  {
    id: 'route-fewest',
    label: '17 h 08 min',
    badge: '+2 h 27 min',
    totalDuration: '17 h 08 min',
    totalDurationMinutes: 1028, // 797 drive + 196 charge + 35 buffer = 1028m = 17h 08m
    drivingDuration: '13 h 17 min',
    drivingDurationMinutes: 797,
    chargingDuration: '3 h 16 min',
    chargingDurationMinutes: 196,
    stopBufferDuration: '35 min',
    stopBufferMinutes: 35, // 7 stops * 5 min
    totalDistanceMi: 682,
    stopCount: 7,
    totalEnergyKwh: 166,
    estimatedExpenseInr: 2490,
    tollNote: 'No Toll',
    stops: demoStopsRoute3,
    polylineCoordinates: route3Coordinates,
    isFeasible: true,
    calculationMethod: 'Energy-Constrained Path Simulation'
  }
];

export const demoTrip: DemonstrationTrip = {
  origin: {
    id: 'origin-patna',
    name: 'Patna',
    coordinates: [25.5941, 85.1376],
    batterySoc: 95,
    departureTime: '12:31 AM'
  },
  destination: {
    id: 'destination-delhi',
    name: 'Delhi',
    subTitle: 'South West',
    coordinates: [28.6139, 77.2090],
    batterySoc: 11,
    arrivalTime: '3:12 PM'
  },
  waypoints: [],
  routeOptions: demoRouteOptions,
  activeRouteId: 'route-optimal'
};
