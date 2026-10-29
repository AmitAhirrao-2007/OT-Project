import { ChargingStation } from '../types/station';

export const chargingStations: ChargingStation[] = [
  {
    id: 'sta-azamgarh-adani',
    name: 'Adani TotalEnergies - Purvanchal Expressway',
    network: 'Adani Total Energies',
    address: 'Purvanchal Expressway KM 102, Azamgarh sub-district',
    coordinates: [26.0684, 83.1859],
    ratedPowerKw: 240,
    totalStalls: 4,
    availableStalls: 3,
    connectors: [
      { type: 'CCS', maxPowerKw: 240, count: 4, availableCount: 3 },
      { type: 'Type 2', maxPowerKw: 22, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    pricePerKwh: '₹22.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 15m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['RFID Card', 'Adani Gas App', 'UPI', 'Credit Card'],
    dataSource: 'Reference Simulation',
    notes: 'High-speed DC fast charger inside expressway wayside amenities center with clean dining.'
  },
  {
    id: 'sta-haidergarh-renovatio',
    name: 'Renovatio e-charge - Haidergarh',
    network: 'Renovatio',
    address: 'NH-731 Lucknow-Varanasi Highway, Haidergarh',
    coordinates: [26.5894, 81.4282],
    ratedPowerKw: 120,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 32m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Renovatio App', 'UPI', 'Debit/Credit Card'],
    dataSource: 'Reference Simulation',
    notes: 'Highway diner EV station with sheltered canopy and shaded parking bays.'
  },
  {
    id: 'sta-lucknow-tata',
    name: 'Tata Power EZ Charge - Kisan Path Bypass',
    network: 'Tata Power EZ Charge',
    address: 'Kisan Path Outer Ring Road, Lucknow',
    coordinates: [26.8467, 80.9462],
    ratedPowerKw: 150,
    totalStalls: 4,
    availableStalls: 4,
    connectors: [
      { type: 'CCS', maxPowerKw: 150, count: 4, availableCount: 4 },
      { type: 'Type 2', maxPowerKw: 22, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'wifi'],
    pricePerKwh: '₹21.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 10m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Tata Power EZ App', 'RFID Tag', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Flagship Tata EV plaza with air-conditioned lounge and refreshments.'
  },
  {
    id: 'sta-navabad-adani',
    name: 'Adani TotalEnergies - Navabad Grant',
    network: 'Adani Total Energies',
    address: 'Navabad Grant- GGE, Sitapur Link Road',
    coordinates: [27.4924, 80.3721],
    ratedPowerKw: 240,
    totalStalls: 6,
    availableStalls: 5,
    connectors: [
      { type: 'CCS', maxPowerKw: 240, count: 6, availableCount: 5 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee', 'wifi'],
    pricePerKwh: '₹22.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 20m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['RFID Card', 'Adani Gas App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: '6-gun ultra-fast charge hub with dedicated high-voltage substation.'
  },
  {
    id: 'sta-gularia-adani',
    name: 'Adani TotalEnergies - Gularia GGE',
    network: 'Adani Total Energies',
    address: 'Gularia-GGE, Bareilly Highway Approach',
    coordinates: [27.9152, 79.5284],
    ratedPowerKw: 240,
    totalStalls: 2,
    availableStalls: 1,
    connectors: [
      { type: 'CCS', maxPowerKw: 240, count: 2, availableCount: 1 }
    ],
    amenities: ['restroom', 'coffee'],
    pricePerKwh: '₹22.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 45m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['RFID Card', 'Adani Gas App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Wayside quick-stop fast charger with convenience store and coffee.'
  },
  {
    id: 'sta-kalliya-adani',
    name: 'Adani TotalEnergies - Kalliya Kazampur',
    network: 'Adani Total Energies',
    address: 'Kalliya Kazampur- GGE, Chandausi Link',
    coordinates: [28.3245, 78.9612],
    ratedPowerKw: 60,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [
      { type: 'CCS', maxPowerKw: 60, count: 2, availableCount: 2 }
    ],
    amenities: ['restroom', 'shopping'],
    pricePerKwh: '₹19.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 1h ago',
    openingHours: '6:00 AM - 11:00 PM',
    paymentMethods: ['Adani Gas App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: '60 kW dual-gun charger adjacent to highway supermarket and bakery.'
  },
  {
    id: 'sta-garhmukteshwar-chargein',
    name: 'Charge_IN by Mahindra - Bikanerwala Garhmukteshwar',
    network: 'Charge_IN by Mahindra',
    address: 'NH-9 Bikanerwala Complex, Garhmukteshwar',
    coordinates: [28.7516, 78.0965],
    ratedPowerKw: 180,
    totalStalls: 4,
    availableStalls: 4,
    connectors: [
      { type: 'CCS', maxPowerKw: 180, count: 4, availableCount: 4 },
      { type: 'Type 2', maxPowerKw: 22, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    pricePerKwh: '₹23.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 5m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Charge_IN App', 'RFID Tag', 'UPI', 'Credit Card'],
    dataSource: 'Reference Simulation',
    notes: 'Major food court charging hub at Bikanerwala. High-throughput station.'
  },
  {
    id: 'sta-delhi-aerocity-statiq',
    name: 'Statiq Fast Hub - Aerocity Delhi',
    network: 'Statiq',
    address: 'Asset 5B, Worldmark, Aerocity, New Delhi',
    coordinates: [28.5529, 77.1215],
    ratedPowerKw: 120,
    totalStalls: 6,
    availableStalls: 4,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 6, availableCount: 4 }
    ],
    amenities: ['restaurant', 'coffee', 'restroom', 'wifi', 'lodging'],
    pricePerKwh: '₹20.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 8m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Statiq App', 'RFID', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Premium airport corridor charging hub with multiple food options.'
  },
  {
    id: 'sta-kanpur-jiobp',
    name: 'Jio-bp pulse - Kanpur Highway Hub',
    network: 'Jio-bp pulse',
    address: 'NH-19 GT Road, Kanpur Outer Bypass',
    coordinates: [26.4499, 80.3319],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 3,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 4, availableCount: 3 }
    ],
    amenities: ['restroom', 'coffee', 'shopping'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 25m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Jio-bp pulse App', 'JioMoney', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Jio-bp mobility station with Wild Bean Cafe and air-conditioned lounge.'
  },
  {
    id: 'sta-agra-zeon',
    name: 'Zeon Charging - Yamuna Expressway Agra',
    network: 'Zeon Charging',
    address: 'Yamuna Expressway Toll Plaza KM 160, Agra',
    coordinates: [27.1767, 78.0081],
    ratedPowerKw: 240,
    totalStalls: 4,
    availableStalls: 4,
    connectors: [
      { type: 'CCS', maxPowerKw: 240, count: 4, availableCount: 4 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee'],
    pricePerKwh: '₹23.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 12m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Zeon App', 'RFID Tag', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Ultra-fast dual 240 kW guns on Agra-Lucknow / Yamuna expressway interchange.'
  },
  {
    id: 'sta-khalapur-jiobp',
    name: 'Jio-bp pulse - Khalapur Expressway Plaza',
    network: 'Jio-bp pulse',
    address: 'Mumbai-Pune Expressway KM 32, Khalapur',
    coordinates: [18.8285, 73.2847],
    ratedPowerKw: 120,
    totalStalls: 6,
    availableStalls: 4,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 6, availableCount: 4 },
      { type: 'Type 2', maxPowerKw: 22, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee', 'shopping'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 10m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Jio-bp pulse App', 'UPI', 'Credit Card'],
    dataSource: 'Reference Simulation',
    notes: 'Expressway food court charging hub with Wild Bean Cafe and ample canopy.'
  },
  {
    id: 'sta-lonavala-tata',
    name: 'Tata Power EZ Charge - Lonavala Plaza',
    network: 'Tata Power EZ Charge',
    address: 'Old Mumbai-Pune Highway, Lonavala',
    coordinates: [18.7557, 73.4091],
    ratedPowerKw: 60,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [
      { type: 'CCS', maxPowerKw: 60, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee'],
    pricePerKwh: '₹20.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 22m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Tata Power EZ App', 'RFID Tag', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Hill station wayside charger with dining amenities.'
  },
  {
    id: 'sta-neemrana-statiq',
    name: 'Statiq Fast Hub - Neemrana Highway Zone',
    network: 'Statiq',
    address: 'NH-48 Delhi-Jaipur Highway, Neemrana',
    coordinates: [27.9892, 76.3860],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 3,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 4, availableCount: 3 }
    ],
    amenities: ['restaurant', 'restroom', 'lodging'],
    pricePerKwh: '₹21.50 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 14m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Statiq App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Industrial highway transit corridor with clean motel and diner.'
  },
  {
    id: 'sta-behror-tata',
    name: 'Tata Power EZ Charge - Highway King Behror',
    network: 'Tata Power EZ Charge',
    address: 'NH-48 KM 132, Behror Bypass',
    coordinates: [27.8872, 76.2818],
    ratedPowerKw: 60,
    totalStalls: 2,
    availableStalls: 1,
    connectors: [
      { type: 'CCS', maxPowerKw: 60, count: 2, availableCount: 1 }
    ],
    amenities: ['restaurant', 'restroom', 'shopping'],
    pricePerKwh: '₹20.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 30m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Tata Power EZ App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Popular highway rest stop with expansive food court.'
  },
  {
    id: 'sta-krishnagiri-zeon',
    name: 'Zeon Charging - Saravana Bhavan Krishnagiri',
    network: 'Zeon Charging',
    address: 'NH-44 / NH-48 Bengaluru-Chennai Highway, Krishnagiri',
    coordinates: [12.5284, 78.2140],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 4,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 4, availableCount: 4 }
    ],
    amenities: ['restaurant', 'restroom', 'coffee'],
    pricePerKwh: '₹22.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 18m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Zeon App', 'UPI', 'Credit Card'],
    dataSource: 'Reference Simulation',
    notes: 'High-speed dual guns at Saravana Bhavan complex with fast vegetarian dining.'
  },
  {
    id: 'sta-vellore-tata',
    name: 'Tata Power EZ Charge - Vellore Bypass',
    network: 'Tata Power EZ Charge',
    address: 'NH-48 Chennai Outer Corridor, Vellore',
    coordinates: [12.9165, 79.1325],
    ratedPowerKw: 60,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [
      { type: 'CCS', maxPowerKw: 60, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 25m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Tata Power EZ App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Convenient wayside charger on Chennai-Bengaluru highway.'
  },
  {
    id: 'sta-prayagraj-jiobp',
    name: 'Jio-bp pulse - Prayagraj Bypass',
    network: 'Jio-bp pulse',
    address: 'NH-19 GT Road, Prayagraj Bypass',
    coordinates: [25.4520, 81.8340],
    ratedPowerKw: 120,
    totalStalls: 4,
    availableStalls: 3,
    connectors: [
      { type: 'CCS', maxPowerKw: 120, count: 4, availableCount: 3 }
    ],
    amenities: ['restroom', 'coffee'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 11m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Jio-bp pulse App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Strategic highway stop between Varanasi and Kanpur.'
  },
  {
    id: 'sta-varanasi-tata',
    name: 'Tata Power EZ Charge - Varanasi Ring Road',
    network: 'Tata Power EZ Charge',
    address: 'Varanasi Ring Road Phase 1, Harhua',
    coordinates: [25.3524, 82.9850],
    ratedPowerKw: 60,
    totalStalls: 2,
    availableStalls: 2,
    connectors: [
      { type: 'CCS', maxPowerKw: 60, count: 2, availableCount: 2 }
    ],
    amenities: ['restaurant', 'restroom', 'wifi'],
    pricePerKwh: '₹21.00 / kWh',
    operationalStatus: 'operational',
    statusTimestamp: 'Verified 8m ago',
    openingHours: '24/7 Always Open',
    paymentMethods: ['Tata Power EZ App', 'UPI'],
    dataSource: 'Reference Simulation',
    notes: 'Ring road plaza connecting NH-19 and Purvanchal link.'
  }
];

