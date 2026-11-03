// OCPI Location Module Adapter
// Handles fetching and synchronizing Locations, EVSEs, and Connectors from OCPI endpoints.

import { OcpiClient } from './ocpiClient';
import { OcpiLocation } from './ocpiTypes';
import { normalizeOcpiLocation } from './ocpiNormalizer';
import { LiveStationTelemetry, DataSourceType } from '../providerTypes';

export interface LocationAdapterOptions {
  providerId: string;
  providerName: string;
  sourceType?: DataSourceType;
}

export class OcpiLocationAdapter {
  private readonly client: OcpiClient;
  private readonly options: LocationAdapterOptions;

  constructor(client: OcpiClient, options: LocationAdapterOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Fetches paginated locations from an OCPI 2.2.1/2.3.0 /locations endpoint.
   */
  async fetchLocations(params?: {
    dateFrom?: string;
    dateTo?: string;
    offset?: number;
    limit?: number;
  }): Promise<{
    telemetry: LiveStationTelemetry[];
    rawLocations: OcpiLocation[];
    recordsReceived: number;
    recordsAccepted: number;
    recordsRejected: number;
  }> {
    const queryParams: Record<string, string | number | undefined> = {};
    if (params?.dateFrom) queryParams['date_from'] = params.dateFrom;
    if (params?.dateTo) queryParams['date_to'] = params.dateTo;
    if (params?.offset !== undefined) queryParams['offset'] = params.offset;
    if (params?.limit !== undefined) queryParams['limit'] = params.limit;

    const response = await this.client.get<OcpiLocation[]>('locations', queryParams);

    const locations = Array.isArray(response.data) ? response.data : [];
    const received = locations.length;
    let accepted = 0;
    let rejected = 0;

    const telemetry: LiveStationTelemetry[] = [];

    for (const loc of locations) {
      // Validate essential location identifiers
      if (!loc.id || !loc.country_code || !loc.party_id || !loc.coordinates) {
        rejected++;
        continue;
      }

      try {
        const item = normalizeOcpiLocation(loc, {
          providerId: this.options.providerId,
          providerName: this.options.providerName,
          sourceType: this.options.sourceType
        });
        telemetry.push(item);
        accepted++;
      } catch {
        rejected++;
      }
    }

    return {
      telemetry,
      rawLocations: locations,
      recordsReceived: received,
      recordsAccepted: accepted,
      recordsRejected: rejected
    };
  }

  /**
   * Fetches an individual location by its ID.
   */
  async fetchLocationById(locationId: string): Promise<LiveStationTelemetry | null> {
    try {
      const response = await this.client.get<OcpiLocation>(`locations/${encodeURIComponent(locationId)}`);
      if (!response.data) return null;

      return normalizeOcpiLocation(response.data, {
        providerId: this.options.providerId,
        providerName: this.options.providerName,
        sourceType: this.options.sourceType
      });
    } catch {
      return null;
    }
  }
}

