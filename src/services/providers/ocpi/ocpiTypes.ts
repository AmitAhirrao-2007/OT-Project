// Official OCPI 2.2.1 & 2.3.0 Standard Schema Definitions
// Based on https://github.com/ocpi/ocpi and https://ocpi.github.io/openapi-specification/

export interface OcpiResponse<T> {
  status_code: number;
  status_message?: string;
  data?: T;
  timestamp: string; // ISO 8601
}

export interface OcpiVersionEndpoint {
  identifier: string;
  role?: 'SENDER' | 'RECEIVER';
  url: string;
}

export interface OcpiVersionDetails {
  version: string;
  endpoints: OcpiVersionEndpoint[];
}

export type OcpiEvseStatus =
  | 'AVAILABLE'
  | 'BLOCKED'
  | 'CHARGING'
  | 'INOPERATIVE'
  | 'OUTOFORDER'
  | 'PLANNED'
  | 'REMOVED'
  | 'RESERVED'
  | 'UNKNOWN';

export type OcpiPowerType =
  | 'AC_1_PHASE'
  | 'AC_3_PHASE'
  | 'DC';

export interface OcpiConnector {
  id: string;
  standard: string;
  format: 'SOCKET' | 'CABLE';
  power_type: OcpiPowerType;
  max_voltage: number;
  max_amperage: number;
  max_electric_power?: number; // In Watts according to official OCPI 2.2.1/2.3.0 specs
  tariff_ids?: string[];
  terms_and_conditions?: string;
  last_updated: string;
}

export interface OcpiGeoCoordinates {
  latitude: string;
  longitude: string;
}

export interface OcpiEvse {
  uid: string;
  evse_id?: string;
  status: OcpiEvseStatus;
  capabilities?: string[];
  connectors: OcpiConnector[];
  floor_level?: string;
  coordinates?: OcpiGeoCoordinates;
  physical_reference?: string;
  parking_restrictions?: string[];
  last_updated: string;
}

export interface OcpiBusinessDetails {
  name: string;
  website?: string;
  logo?: {
    url: string;
    category?: string;
    type?: string;
  };
}

export interface OcpiLocation {
  country_code: string;
  party_id: string;
  id: string;
  publish: boolean;
  name?: string;
  address: string;
  city: string;
  postal_code?: string;
  state?: string;
  country: string;
  coordinates: OcpiGeoCoordinates;
  parking_type?: string;
  evses?: OcpiEvse[];
  operator?: OcpiBusinessDetails;
  suboperator?: OcpiBusinessDetails;
  owner?: OcpiBusinessDetails;
  facilities?: string[];
  time_zone?: string;
  last_updated: string;
}

export type OcpiTariffDimensionType =
  | 'ENERGY'
  | 'FLAT'
  | 'PARKING_TIME'
  | 'TIME';

export interface OcpiPriceComponent {
  type: OcpiTariffDimensionType;
  price: number; // Excl. VAT or incl. VAT based on definition
  vat?: number;  // Percentage
  step_size: number;
}

export interface OcpiTariffElement {
  price_components: OcpiPriceComponent[];
  restrictions?: {
    start_time?: string;
    end_time?: string;
    start_date?: string;
    end_date?: string;
    min_kwh?: number;
    max_kwh?: number;
    min_current?: number;
    max_current?: number;
    min_power?: number;
    max_power?: number;
    min_duration?: number;
    max_duration?: number;
    day_of_week?: string[];
    reservation?: string;
  };
}

export interface OcpiTariff {
  country_code: string;
  party_id: string;
  id: string;
  currency: string;
  type?: string;
  elements: OcpiTariffElement[];
  start_date_time?: string;
  end_date_time?: string;
  last_updated: string;
}

