// Deterministic Mock Data Fixtures for Testing OCPI 2.2.1 / 2.3.0 Integration
// Clearly labeled as SIMULATED PROVIDER DATA. Never used as live operator data.

import { OcpiLocation, OcpiTariff } from '../ocpi/ocpiTypes';

/**
 * Standard simulated OCPI locations covering all connector and EVSE status scenarios.
 */
export const mockOcpiLocations: OcpiLocation[] = [
  // 1. Available EVSE on Purvanchal Expressway (matching sta-azamgarh-adani)
  {
    country_code: 'IN',
    party_id: 'ADN',
    id: 'purvanchal-km102',
    publish: true,
    name: 'SIMULATED — Adani Purvanchal Hub',
    address: 'Purvanchal Expressway KM 102',
    city: 'Azamgarh',
    country: 'IND',
    coordinates: {
      latitude: '26.0684',
      longitude: '83.1859'
    },
    operator: { name: 'Adani TotalEnergies' },
    last_updated: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Fresh (5m ago)
    evses: [
      {
        uid: 'IN-ADN-E001',
        evse_id: 'IN*ADN*E001',
        status: 'AVAILABLE',
        last_updated: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        connectors: [
          {
            id: 'C1',
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            power_type: 'DC',
            max_voltage: 1000,
            max_amperage: 240,
            max_electric_power: 240000, // 240 kW in Watts
            tariff_ids: ['TAR-ADN-EXP'],
            last_updated: new Date(Date.now() - 5 * 60 * 1000).toISOString()
          }
        ]
      },
      {
        uid: 'IN-ADN-E002',
        evse_id: 'IN*ADN*E002',
        status: 'CHARGING', // Second stall actively charging
        last_updated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        connectors: [
          {
            id: 'C1',
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            power_type: 'DC',
            max_voltage: 1000,
            max_amperage: 240,
            max_electric_power: 240000,
            last_updated: new Date(Date.now() - 10 * 60 * 1000).toISOString()
          }
        ]
      }
    ]
  },

  // 2. Blocked & Inoperative EVSEs at Kisan Path Lucknow (matching sta-lucknow-tata)
  {
    country_code: 'IN',
    party_id: 'TAT',
    id: 'kisan-path-bypass',
    publish: true,
    name: 'SIMULATED — Tata EZ Charge Kisan Path',
    address: 'Kisan Path Ring Road, Lucknow',
    city: 'Lucknow',
    country: 'IND',
    coordinates: {
      latitude: '26.8467',
      longitude: '80.9462'
    },
    operator: { name: 'Tata Power EZ Charge' },
    last_updated: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    evses: [
      {
        uid: 'IN-TAT-E101',
        status: 'BLOCKED', // Physically blocked stall (e.g. ICE vehicle parked)
        last_updated: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        connectors: [
          {
            id: 'C1',
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            power_type: 'DC',
            max_voltage: 800,
            max_amperage: 200,
            max_electric_power: 150000,
            last_updated: new Date(Date.now() - 2 * 60 * 1000).toISOString()
          }
        ]
      },
      {
        uid: 'IN-TAT-E102',
        status: 'INOPERATIVE', // Out of order hardware
        last_updated: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        connectors: [
          {
            id: 'C1',
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            power_type: 'DC',
            max_voltage: 800,
            max_amperage: 200,
            max_electric_power: 150000,
            last_updated: new Date(Date.now() - 4 * 60 * 1000).toISOString()
          }
        ]
      }
    ]
  },

  // 3. Stale Status (> 2 hours old) at Haidergarh (matching sta-haidergarh-renovatio)
  {
    country_code: 'IN',
    party_id: 'RNV',
    id: 'haidergarh-nh731',
    publish: true,
    name: 'SIMULATED — Renovatio Haidergarh',
    address: 'NH-731 Lucknow-Varanasi Highway',
    city: 'Haidergarh',
    country: 'IND',
    coordinates: {
      latitude: '26.5894',
      longitude: '81.4282'
    },
    operator: { name: 'Renovatio' },
    // 140 minutes old (Stale)
    last_updated: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    evses: [
      {
        uid: 'IN-RNV-E201',
        status: 'AVAILABLE',
        last_updated: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
        connectors: [
          {
            id: 'C1',
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            power_type: 'DC',
            max_voltage: 500,
            max_amperage: 250,
            max_electric_power: 120000,
            last_updated: new Date(Date.now() - 140 * 60 * 1000).toISOString()
          }
        ]
      }
    ]
  },

  // 4. Missing Timestamp / Unknown Status
  {
    country_code: 'IN',
    party_id: 'STQ',
    id: 'neemrana-nh48',
    publish: true,
    name: 'SIMULATED — Statiq Neemrana Zone',
    address: 'NH-48 Delhi-Jaipur Highway',
    city: 'Neemrana',
    country: 'IND',
    coordinates: {
      latitude: '27.9892',
      longitude: '76.3860'
    },
    operator: { name: 'Statiq' },
    last_updated: '', // Empty timestamp -> unknown freshness
    evses: [
      {
        uid: 'IN-STQ-E301',
        status: 'UNKNOWN',
        last_updated: '',
        connectors: [
          {
            id: 'C1',
            standard: 'IEC_62196_T2_COMBO',
            format: 'CABLE',
            power_type: 'DC',
            max_voltage: 500,
            max_amperage: 240,
            max_electric_power: 120000,
            last_updated: ''
          }
        ]
      }
    ]
  }
];

/**
 * Standard simulated OCPI tariffs covering flat session fees, per-kWh rates, and mixed tariffs.
 */
export const mockOcpiTariffs: OcpiTariff[] = [
  // Flat session fee (₹50) + per-kWh rate (₹22.50)
  {
    country_code: 'IN',
    party_id: 'ADN',
    id: 'TAR-ADN-EXP',
    currency: 'INR',
    last_updated: new Date(Date.now() - 3600 * 1000).toISOString(),
    elements: [
      {
        price_components: [
          { type: 'FLAT', price: 50.0, step_size: 1 },
          { type: 'ENERGY', price: 22.5, step_size: 1 }
        ]
      }
    ]
  },
  // Simple energy-only tariff
  {
    country_code: 'IN',
    party_id: 'TAT',
    id: 'TAR-TAT-ENERGY',
    currency: 'INR',
    last_updated: new Date(Date.now() - 3600 * 1000).toISOString(),
    elements: [
      {
        price_components: [
          { type: 'ENERGY', price: 21.5, step_size: 1 }
        ]
      }
    ]
  }
];

