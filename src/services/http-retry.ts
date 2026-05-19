/**
 * HTTP retry middleware with exponential backoff + jitter.
 *
 * - Retries on HTTP 408, 429, 500, 502, 503, 504, and network/fetch errors.
 * - Max 3 attempts (initial + 2 retries).
 * - Backoff schedule: 500ms, 1000ms, 2000ms — each with +/-20% jitter.
 * - Respects `Retry-After` header (seconds or HTTP-date).
 * - Logs every retry to stderr as `[google-health-mcp] retry N/3 after Xms (status=Y or error=Z)`.
 * - Honors `GOOGLE_HEALTH_NO_RETRY=true` env var to disable (used in tests).
 */
export const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
export const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1000, 2000];
const JITTER_FACTOR = 0.2;
const LOG_PREFIX = "[google-health-mcp]";

export interface RetryOptions {
  /** Override env-based disable flag (for tests). */
  noRetry?: boolean;
  /** Override sleep implementation (for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Override fetch implementation (for tests). */
  fetchImpl?: typeof fetch;
  /** Override jitter source (for deterministic tests). Should return [0,1). */
  jitterRandom?: () => number;
  /** Override stderr logger (for tests). */
  logger?: (message: string) => void;
  /** Override Date.now() for HTTP-date Retry-After (for tests). */
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isNoRetryEnv(): boolean {
  const value = process.env.GOOGLE_HEALTH_NO_RETRY;
  return value === "true" || value === "1";
}

/**
 * Parse Retry-After (seconds or HTTP-date). Returns milliseconds to wait,
 * or undefined if the header is missing/invalid.
 */
export function parseRetryAfter(header: string | null, nowMs: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (trimmed === "") return undefined;
  // Numeric form: seconds.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.floor(seconds * 1000);
  }
  // HTTP-date form.
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  const delta = dateMs - nowMs;
  return delta > 0 ? delta : 0;
}

function computeBackoff(attempt: number, jitterRandom: () => number): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  // +/-20% jitter: random in [0.8, 1.2).
  const factor = 1 - JITTER_FACTOR + jitterRandom() * 2 * JITTER_FACTOR;
  return Math.max(0, Math.round(base * factor));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const sleep = options.sleep ?? defaultSleep;
  const fetchImpl = options.fetchImpl ?? fetch;
  const jitterRandom = options.jitterRandom ?? Math.random;
  const logger = options.logger ?? ((message: string) => process.stderr.write(`${message}\n`));
  const now = options.now ?? Date.now;
  const noRetry = options.noRetry ?? isNoRetryEnv();

  if (noRetry) {
    return fetchImpl(url, init);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, init);
      if (!RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      if (attempt === MAX_ATTEMPTS - 1) {
        // Out of retries — return the non-OK response as-is so callers can surface it.
        return response;
      }
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now());
      const delay = retryAfterMs ?? computeBackoff(attempt, jitterRandom);
      logger(`${LOG_PREFIX} retry ${attempt + 1}/${MAX_ATTEMPTS} after ${delay}ms (status=${response.status})`);
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      const delay = computeBackoff(attempt, jitterRandom);
      const message = error instanceof Error ? error.message : String(error);
      logger(`${LOG_PREFIX} retry ${attempt + 1}/${MAX_ATTEMPTS} after ${delay}ms (error=${message})`);
      await sleep(delay);
    }
  }

  // Should be unreachable — every branch above either returns or throws.
  throw lastError instanceof Error ? lastError : new Error("fetchWithRetry exhausted attempts");
}
