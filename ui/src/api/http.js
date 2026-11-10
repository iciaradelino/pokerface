// Small fetch wrapper used by every API module: JSON in/out, a timeout, and one error type.
import { config } from '../config.js';

export class ApiError extends Error {
  /**
   * @param {string} message  safe to show to the player
   * @param {object} details  { status, code, service }
   *   status: HTTP status, or 0 when the service could not be reached
   *   code:   error code from the service body, "UNAVAILABLE" or "TIMEOUT"
   */
  constructor(message, { status = 0, code = 'UNKNOWN', service } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.service = service;
  }

  /** True when the service is down or unreachable, so the UI shows the "unavailable" state. */
  get isUnavailable() {
    return this.status === 0 || this.status >= 500;
  }
}

const SERVICE_NAMES = { players: 'Player service', game: 'Tables' };

export async function request(
  service,
  baseUrl,
  path,
  { method = 'GET', body, timeoutMs = config.requestTimeoutMs } = {},
) {
  const label = SERVICE_NAMES[service] ?? 'Service';
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError';
    throw new ApiError(`${label} unavailable`, {
      code: timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
      service,
    });
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message ??
      (response.status >= 500 ? `${label} unavailable` : `Request failed (${response.status})`);
    throw new ApiError(message, {
      status: response.status,
      code: data?.code ?? (response.status >= 500 ? 'UNAVAILABLE' : 'UNKNOWN'),
      service,
    });
  }

  return data;
}
