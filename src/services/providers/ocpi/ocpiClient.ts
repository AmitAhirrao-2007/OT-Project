// Secure OCPI HTTP Client with token redaction, bounded retries, and timeout controls
// Conforms to OCPI 2.2.1 and 2.3.0 transport specifications.

import { OcpiResponse } from './ocpiTypes';

export interface OcpiClientConfig {
  baseUrl: string;
  serverToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
  clientPartyId?: string;
  clientCountryCode?: string;
}

export class OcpiClientError extends Error {
  statusCode: number;
  isAuthenticationError: boolean;
  isRateLimitError: boolean;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    statusCode: number = 500,
    options: {
      isAuthenticationError?: boolean;
      isRateLimitError?: boolean;
      retryAfterSeconds?: number;
    } = {}
  ) {
    super(redactSensitiveTokens(message));
    this.name = 'OcpiClientError';
    this.statusCode = statusCode;
    this.isAuthenticationError = options.isAuthenticationError ?? (statusCode === 401 || statusCode === 403);
    this.isRateLimitError = options.isRateLimitError ?? (statusCode === 429);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * Redacts any bearer/token secrets from logs, strings, and error messages.
 */
export function redactSensitiveTokens(input: string): string {
  if (!input) return '';
  return input
    .replace(/(Bearer\s+|Token\s+)([A-Za-z0-9-_.]+)/gi, '$1[REDACTED]')
    .replace(/("?(token|api[_-]?key|secret|authorization)"?\s*[:=]\s*"?[A-Za-z0-9-_.]+)/gi, '$2=[REDACTED]');
}

export class OcpiClient {
  private readonly baseUrl: string;
  private readonly serverToken?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly clientPartyId: string;
  private readonly clientCountryCode: string;

  constructor(config: OcpiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.serverToken = config.serverToken;
    this.timeoutMs = config.timeoutMs ?? 6000;
    this.maxRetries = config.maxRetries ?? 2;
    this.clientPartyId = config.clientPartyId ?? 'EVR';
    this.clientCountryCode = config.clientCountryCode ?? 'IN';
  }

  /**
   * Executes a secure GET request to an OCPI endpoint with retry logic and token redaction.
   */
  async get<T>(
    endpointPath: string,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<OcpiResponse<T>> {
    let url = endpointPath.startsWith('http')
      ? endpointPath
      : `${this.baseUrl}/${endpointPath.replace(/^\/+/, '')}`;

    if (queryParams) {
      const sp = new URLSearchParams();
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null) sp.append(k, String(v));
      });
      const queryStr = sp.toString();
      if (queryStr) {
        url += (url.includes('?') ? '&' : '?') + queryStr;
      }
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'X-Correlation-ID': `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          'X-Request-ID': `ocpi-${Date.now()}`,
          'OCPI-from-country-code': this.clientCountryCode,
          'OCPI-from-party-id': this.clientPartyId
        };

        if (this.serverToken) {
          headers['Authorization'] = `Token ${this.serverToken}`;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle rate limiting (HTTP 429)
        if (response.status === 429) {
          const retryHeader = response.headers.get('Retry-After');
          const retryAfter = retryHeader ? parseInt(retryHeader, 10) : 10;
          throw new OcpiClientError('Rate limit exceeded (HTTP 429)', 429, {
            isRateLimitError: true,
            retryAfterSeconds: isNaN(retryAfter) ? 10 : retryAfter
          });
        }

        // Handle authorization errors (HTTP 401 / 403)
        if (response.status === 401 || response.status === 403) {
          throw new OcpiClientError(
            `Authorization failed for OCPI endpoint (HTTP ${response.status})`,
            response.status,
            { isAuthenticationError: true }
          );
        }

        if (!response.ok) {
          throw new OcpiClientError(
            `OCPI server responded with status HTTP ${response.status}`,
            response.status
          );
        }

        const json = (await response.json()) as OcpiResponse<T>;

        // Verify standard OCPI envelope status_code (1000 = Success)
        if (json.status_code && json.status_code >= 2000) {
          throw new OcpiClientError(
            `OCPI error payload: ${json.status_message || `Code ${json.status_code}`}`,
            502
          );
        }

        return json;
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const error = isAbort
          ? new OcpiClientError(`OCPI request timed out after ${this.timeoutMs}ms`, 504)
          : err instanceof OcpiClientError
          ? err
          : new OcpiClientError(err instanceof Error ? err.message : String(err), 500);

        lastError = error;

        // Do not retry on client auth errors or invalid input
        if (error.isAuthenticationError || error.statusCode === 400 || error.statusCode === 404) {
          throw error;
        }

        // If rate limited or transient network failure and retries remaining, wait with exponential backoff
        if (attempt <= this.maxRetries) {
          const backoffMs = error.isRateLimitError
            ? (error.retryAfterSeconds || 1) * 1000
            : Math.min(2000, 100 * Math.pow(2, attempt));
          await new Promise((res) => setTimeout(res, backoffMs));
        }
      }
    }

    throw lastError || new OcpiClientError('Request failed after max retries', 500);
  }
}

