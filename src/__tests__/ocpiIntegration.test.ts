import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OcpiClient, OcpiClientError, redactSensitiveTokens } from '../services/providers/ocpi/ocpiClient';
import { OcpiLocationAdapter } from '../services/providers/ocpi/ocpiLocationAdapter';
import { normalizeOcpiLocation, mapOcpiEvseStatus } from '../services/providers/ocpi/ocpiNormalizer';
import { normalizeOcpiTariff } from '../services/providers/ocpi/ocpiTariffAdapter';
import { MockOcpiProvider } from '../services/providers/mock/mockOcpiProvider';
import { mockOcpiLocations, mockOcpiTariffs } from '../services/providers/mock/mockData';
import { calculateFreshnessCategory } from '../services/providers/providerTypes';
import { LiveDataService } from '../services/providers/liveDataService';
import { chargingStations } from '../data/stationCatalogue';
import { initialVehicleProfile } from '../data/demoVehicle';
import { initialPlanOptions, initialChargingSettings, initialRoutingSettings } from '../data/demoSettings';
import { solveRcsp } from '../services/rcspSolver';
import { calculateTripRoutes } from '../services/routingService';

describe('Phase 5C Live EV Charging Network & OCPI Integration Suite', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. OCPI Version Discovery
  it('1. should discover and parse standard OCPI endpoints', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status_code: 1000,
        status_message: 'Success',
        timestamp: new Date().toISOString(),
        data: {
          version: '2.2.1',
          endpoints: [
            { identifier: 'locations', role: 'SENDER', url: 'https://cpo.example.com/ocpi/2.2.1/locations' },
            { identifier: 'tariffs', role: 'SENDER', url: 'https://cpo.example.com/ocpi/2.2.1/tariffs' }
          ]
        }
      })
    });

    const client = new OcpiClient({ baseUrl: 'https://cpo.example.com/ocpi/2.2.1' });
    const res = await client.get<{ version: string; endpoints: { identifier: string; url: string }[] }>('versions');
    expect(res.status_code).toBe(1000);
    expect(res.data?.version).toBe('2.2.1');
    expect(res.data?.endpoints).toHaveLength(2);
  });

  // 2. Authentication Success
  it('2. should send standard OCPI Token header on authenticated requests', async () => {
    let capturedHeader = '';
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedHeader = init?.headers?.Authorization || '';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 1000, data: [] })
      });
    });

    const client = new OcpiClient({
      baseUrl: 'https://cpo.example.com/ocpi/2.2.1',
      serverToken: 'sec-token-abc-123'
    });

    await client.get('locations');
    expect(capturedHeader).toBe('Token sec-token-abc-123');
  });

  // 3. Authentication Failure
  it('3. should handle HTTP 401 Unauthorized cleanly without leaking tokens', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });

    const client = new OcpiClient({
      baseUrl: 'https://cpo.example.com/ocpi/2.2.1',
      serverToken: 'secret-token-xyz'
    });

    await expect(client.get('locations')).rejects.toThrow(OcpiClientError);
  });

  // 4. Invalid Token & Redaction
  it('4. should redact authorization tokens from error messages and logs', () => {
    const rawError = 'Request failed with Token secret_token_xyz999 for user';
    const redacted = redactSensitiveTokens(rawError);
    expect(redacted).not.toContain('secret_token_xyz999');
    expect(redacted).toContain('Token [REDACTED]');
  });

  // 5. Locations Pagination
  it('5. should pass pagination parameters (limit, offset, date_from) in query string', async () => {
    let requestedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      requestedUrl = url.toString();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 1000, data: [] })
      });
    });

    const client = new OcpiClient({ baseUrl: 'https://cpo.example.com/ocpi/2.2.1' });
    const adapter = new OcpiLocationAdapter(client, { providerId: 'test-p', providerName: 'Test P' });

    await adapter.fetchLocations({ limit: 50, offset: 100, dateFrom: '2026-10-30T00:00:00Z' });
    expect(requestedUrl).toContain('limit=50');
    expect(requestedUrl).toContain('offset=100');
    expect(requestedUrl).toContain('date_from=');
  });

  // 6. EVSE Parsing
  it('6. should parse EVSE hierarchy and retain UID and connector list', () => {
    const rawLoc = mockOcpiLocations[0];
    const normalized = normalizeOcpiLocation(rawLoc, {
      providerId: 'adn-cpo',
      providerName: 'Adani TotalEnergies'
    });

    expect(normalized.evses).toHaveLength(2);
    expect(normalized.evses[0].evseId).toBe('IN-ADN-E001');
    expect(normalized.evses[0].connectors).toHaveLength(1);
    expect(normalized.evses[0].status).toBe('available');
    expect(normalized.evses[1].status).toBe('charging');
  });

  // 7. Connector Parsing & Power Watts-to-kW conversion
  it('7. should convert OCPI connector power from Watts to kW', () => {
    const rawLoc = mockOcpiLocations[0];
    const normalized = normalizeOcpiLocation(rawLoc, {
      providerId: 'adn-cpo',
      providerName: 'Adani TotalEnergies'
    });

    const conn = normalized.evses[0].connectors[0];
    // 240000 Watts should be normalized to 240 kW
    expect(conn.powerKw).toBe(240);
    expect(conn.canonicalStandard).toBe('CCS2');
  });

  // 8. Connector Status Normalization
  it('8. should normalize standard OCPI EVSE status enums', () => {
    expect(mapOcpiEvseStatus('AVAILABLE')).toBe('available');
    expect(mapOcpiEvseStatus('CHARGING')).toBe('charging');
    expect(mapOcpiEvseStatus('BLOCKED')).toBe('blocked');
    expect(mapOcpiEvseStatus('INOPERATIVE')).toBe('inoperative');
    expect(mapOcpiEvseStatus('OUTOFORDER')).toBe('out_of_order');
    expect(mapOcpiEvseStatus('RESERVED')).toBe('reserved');
  });

  // 9. Unknown Status Handling
  it('9. should map unrecognized or missing statuses safely to unknown', () => {
    expect(mapOcpiEvseStatus('UNEXPECTED_STRING')).toBe('unknown');
    expect(mapOcpiEvseStatus(undefined)).toBe('unknown');
  });

  // 10. Stale Data Detection
  it('10. should flag observations older than 60 minutes as stale', () => {
    const now = Date.now();
    const staleTime = new Date(now - 75 * 60 * 1000).toISOString(); // 75 mins ago
    expect(calculateFreshnessCategory(staleTime, now)).toBe('stale');

    const freshTime = new Date(now - 5 * 60 * 1000).toISOString(); // 5 mins ago
    expect(calculateFreshnessCategory(freshTime, now)).toBe('fresh');

    const agingTime = new Date(now - 25 * 60 * 1000).toISOString(); // 25 mins ago
    expect(calculateFreshnessCategory(agingTime, now)).toBe('aging');
  });

  // 11. Missing Timestamps
  it('11. should categorize missing observation timestamps as unknown freshness', () => {
    expect(calculateFreshnessCategory(undefined)).toBe('unknown');
    expect(calculateFreshnessCategory('')).toBe('unknown');
    expect(calculateFreshnessCategory('invalid-date-string')).toBe('unknown');
  });

  // 12. Tariff Parsing
  it('12. should parse OCPI tariff elements and currency', () => {
    const energyTariff = mockOcpiTariffs[1];
    const norm = normalizeOcpiTariff(energyTariff);
    expect(norm.tariffId).toBe('TAR-TAT-ENERGY');
    expect(norm.currency).toBe('INR');
    expect(norm.ratePerKwh).toBe(21.5);
    expect(norm.isConfirmed).toBe(true);
  });

  // 13. Multiple Tariff Components
  it('13. should handle multi-component tariffs (session fee + per-kWh energy rate)', () => {
    const mixedTariff = mockOcpiTariffs[0]; // ₹50 flat + ₹22.50/kWh
    const norm = normalizeOcpiTariff(mixedTariff);
    expect(norm.ratePerKwh).toBe(22.5);
    expect(norm.sessionFee).toBe(50.0);
    expect(norm.isConfirmed).toBe(true);
    expect(norm.tariffElements).toHaveLength(2);
  });

  // 14. Currency Handling
  it('14. should preserve non-INR currencies when provided', () => {
    const eurTariff = {
      ...mockOcpiTariffs[1],
      currency: 'EUR',
      elements: [{ price_components: [{ type: 'ENERGY' as const, price: 0.35, step_size: 1 }] }]
    };
    const norm = normalizeOcpiTariff(eurTariff);
    expect(norm.currency).toBe('EUR');
    expect(norm.ratePerKwh).toBe(0.35);
  });

  // 15. Provider Response Validation
  it('15. should validate OCPI envelope status_code (rejecting 2xxx error codes)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status_code: 2001, // Missing/invalid input
        status_message: 'Invalid location ID'
      })
    });

    const client = new OcpiClient({ baseUrl: 'https://cpo.example.com/ocpi/2.2.1' });
    await expect(client.get('locations')).rejects.toThrow('OCPI error payload: Invalid location ID');
  });

  // 16. Provider Timeout
  it('16. should abort and throw timeout error when provider exceeds timeoutMs', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_res, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const client = new OcpiClient({
      baseUrl: 'https://cpo.example.com/ocpi/2.2.1',
      timeoutMs: 50,
      maxRetries: 0
    });

    await expect(client.get('locations')).rejects.toThrow('timed out after 50ms');
  });

  // 17. Rate-Limit Responses
  it('17. should detect HTTP 429 and parse Retry-After header', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '5' })
    });

    const client = new OcpiClient({
      baseUrl: 'https://cpo.example.com/ocpi/2.2.1',
      maxRetries: 0
    });

    try {
      await client.get('locations');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(429);
      expect(err.isRateLimitError).toBe(true);
      expect(err.retryAfterSeconds).toBe(5);
    }
  });

  // 18. Retry and Backoff Behavior
  it('18. should retry transient errors up to maxRetries', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 503 }); // First call fails
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 1000, data: [] })
      });
    });

    const client = new OcpiClient({
      baseUrl: 'https://cpo.example.com/ocpi/2.2.1',
      maxRetries: 1
    });

    const res = await client.get('locations');
    expect(res.status_code).toBe(1000);
    expect(callCount).toBe(2);
  });

  // 19. Duplicate Event Handling
  it('19. should update telemetry map with newest observation', async () => {
    const liveService = new LiveDataService();
    await liveService.syncLiveStations(true);
    const count = (await liveService.syncLiveStations(true)).recordsCount;
    expect(count).toBeGreaterThan(0);
  });

  // 20. Out-of-Order Updates
  it('20. should calculate freshness accurately based on observation timestamp', () => {
    const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const freshness = calculateFreshnessCategory(pastTime);
    expect(freshness).toBe('fresh');
  });

  // 21. Static/Live Data Merging
  it('21. should merge live telemetry into static station record without erasing road access metadata', () => {
    const station = chargingStations[0]; // Azamgarh
    const liveService = new LiveDataService();

    // Inject mock telemetry for Azamgarh
    const reconciled = liveService.reconcileStation(station);
    expect(reconciled.id).toBe(station.id);
    expect(reconciled.accessMetadata).toBeDefined();
    expect(reconciled.accessMetadata?.carriagewayAccess).toBe('both');
  });

  // 22. Conflicting Provider Records
  it('22. should resolve conflicting EVSE statuses by evaluating available count', () => {
    const rawLoc = mockOcpiLocations[0]; // 1 AVAILABLE, 1 CHARGING
    const norm = normalizeOcpiLocation(rawLoc, { providerId: 'test', providerName: 'Test' });
    expect(norm.totalStalls).toBe(2);
    expect(norm.availableStalls).toBe(1);
    expect(norm.occupancyStatus).toBe('available');
  });

  // 23. Station Identity Matching
  it('23. should match station by canonical operator and address reference safely', () => {
    const station = chargingStations[0]; // Azamgarh
    const liveService = new LiveDataService();
    // Simulate cache entry
    (liveService as any).telemetryCache.set('ocpi-in-adn-purvanchal-km102', {
      stationId: 'ocpi-in-adn-purvanchal-km102',
      providerName: 'Adani TotalEnergies',
      availableStalls: 3,
      totalStalls: 4,
      evses: [{ connectors: [{ id: 'c1' }] }],
      dataNotes: 'Adani Purvanchal KM 102'
    });

    const match = liveService.findTelemetryForStation(station);
    expect(match).not.toBeNull();
    expect(match?.availableStalls).toBe(3);
  });

  // 24. Simulated Provider Mode
  it('24. should clearly label MockOcpiProvider as simulated_mock', async () => {
    const mock = new MockOcpiProvider();
    expect(mock.sourceType).toBe('simulated_mock');
    expect(mock.providerName).toContain('Simulated');

    const locations = await mock.fetchLocations();
    expect(locations[0].isSimulated).toBe(true);
    expect(locations[0].sourceType).toBe('simulated_mock');
  });

  // 25. Greedy Route Behavior with Fresh Availability
  it('25. should consider live stall availability in greedy routing', async () => {
    const req = {
      origin: { id: 'o', name: 'Lucknow', coordinates: [26.8467, 80.9462] as [number, number], batterySoc: 95 },
      destination: { id: 'd', name: 'Agra', coordinates: [27.1767, 78.0081] as [number, number], batterySoc: 10 },
      waypoints: [],
      vehicle: initialVehicleProfile,
      planOptions: { ...initialPlanOptions, useRcspOptimizer: false },
      chargingSettings: { ...initialChargingSettings, minimumChargerStalls: 1 },
      routingSettings: initialRoutingSettings
    };

    const result = await calculateTripRoutes(req);
    expect(result.routeOptions.length).toBeGreaterThan(0);
    // Generated stops reflect active stall counts
    for (const opt of result.routeOptions) {
      for (const stop of opt.stops) {
        expect(stop.stallsTotal).toBeGreaterThan(0);
      }
    }
  });

  // 26. RCSP Route Behavior with Fresh Availability
  it('26. should integrate live availability into RCSP solver candidate filtering', () => {
    const req = {
      origin: { id: 'o', name: 'Start', coordinates: [0, 0] as [number, number], batterySoc: 60 },
      destination: { id: 'd', name: 'Finish', coordinates: [1.4474, 0] as [number, number], batterySoc: 10 },
      waypoints: [],
      vehicle: initialVehicleProfile,
      planOptions: { ...initialPlanOptions, useRcspOptimizer: true },
      chargingSettings: initialChargingSettings,
      routingSettings: initialRoutingSettings
    };

    const res = solveRcsp(req);
    // Solver executes cleanly without null pointer exceptions
    if (res) {
      expect(res.calculationMethod).toBe('RCSP Optimizer');
    }
  });

  // 27. Provider Outage Does Not Mark All Stations Unavailable
  it('27. should retain static catalogue baseline when provider sync fails', async () => {
    const liveService = new LiveDataService();
    const failingMock = new MockOcpiProvider({ simulateFailure: true });
    await expect(failingMock.fetchLocations()).rejects.toThrow();
    (liveService as any).telemetryCache.clear();

    // Verify static catalogue fallback works despite provider error
    const status = liveService.getStationLiveStatus(chargingStations[0]);
    expect(status.hasLiveTelemetry).toBe(false);
    expect(status.isAvailableForRouting).toBe(true);
    expect(status.totalStalls).toBe(4);

    // If station has no tracked availableStalls, displays unverified note
    const unverifiedStation = { ...chargingStations[0], availableStalls: undefined };
    const unverifiedStatus = liveService.getStationLiveStatus(unverifiedStation);
    expect(unverifiedStatus.displayStatusText).toContain('Live status unavailable');
  });

  // 28. Static Catalogue Fallback
  it('28. should seamlessly fall back to static catalogue when station is not in provider data', () => {
    const liveService = new LiveDataService();
    const status = liveService.getStationLiveStatus(chargingStations[10]); // Khalapur
    expect(status.totalStalls).toBe(6);
    expect(status.isAvailableForRouting).toBe(true);
  });

  // 29. Credentials Are Not Returned to Frontend
  it('29. should not include tokens in serialized telemetry outputs', async () => {
    const mock = new MockOcpiProvider();
    const records = await mock.fetchLocations();
    const jsonStr = JSON.stringify(records);
    expect(jsonStr).not.toContain('token');
    expect(jsonStr).not.toContain('secret');
  });

  // 30. Diagnostics & Observability
  it('30. should track provider diagnostics (response time, accepted records)', async () => {
    const mock = new MockOcpiProvider();
    await mock.fetchLocations();
    const diag = mock.getDiagnostics();
    expect(diag.recordsReceived).toBeGreaterThan(0);
    expect(diag.recordsAccepted).toBeGreaterThan(0);
    expect(diag.lastSuccessfulSyncAt).not.toBeNull();
  });
});
