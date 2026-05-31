import { URL, URLSearchParams } from "node:url";
import {
  DEFAULT_LIMIT,
  GOOGLE_HEALTH_AUTH_URL,
  GOOGLE_HEALTH_REVOKE_URL,
  GOOGLE_HEALTH_TOKEN_URL,
  MAX_GOOGLE_HEALTH_LIMIT,
  SERVER_VERSION
} from "../constants.js";
import type { GoogleHealthConfig, GoogleHealthTokenSet } from "../types.js";
import { NUTRITION_DATA_TYPE } from "./google-v4-nutrition-datapoint.js";
import { disabledCacheStatus, GoogleHealthCache, type CacheStatus } from "./cache.js";
import { fetchWithCache, getCacheStats } from "./http-cache.js";
import { fetchWithRetry } from "./http-retry.js";
import { redactErrorMessage } from "./redaction.js";
import { TokenStore } from "./token-store.js";

export interface PageParams {
  pageSize?: number;
  pageToken?: string;
}

export interface DataPointQuery extends PageParams {
  dataType: string;
  filter?: string;
}

export interface ReconcileQuery extends DataPointQuery {
  dataSourceFamily?: string;
}

export interface DailyRollupQuery extends PageParams {
  dataType: string;
  startDate: string;
  endDate?: string;
  windowSizeDays?: number;
  dataSourceFamily?: string;
}

export interface RollupQuery extends PageParams {
  dataType: string;
  startTime: string;
  endTime: string;
  windowSize: string;
  dataSourceFamily?: string;
}

export class GoogleHealthClient {
  private readonly tokenStore: TokenStore;
  private cache?: GoogleHealthCache;

  constructor(private readonly config: GoogleHealthConfig) {
    this.tokenStore = new TokenStore(config.tokenPath);
  }

  authUrl(state?: string, scopes?: string[]): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: (scopes?.length ? scopes : this.config.scopes).join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent"
    });
    if (state) params.set("state", state);
    return `${GOOGLE_HEALTH_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(input: string): Promise<{ ok: true; token_path: string; scope?: string; expires_at?: number }> {
    const code = this.extractCode(input);
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri
    });
    const tokens = await this.requestTokens(body);
    const redirectScope = this.extractScope(input);
    await this.tokenStore.withLock(async () => this.tokenStore.write({ ...tokens, scope: tokens.scope ?? redirectScope }));
    return { ok: true, token_path: this.config.tokenPath, scope: tokens.scope ?? redirectScope, expires_at: tokens.expires_at };
  }

  async get(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request("GET", path, undefined, params);
  }

  async post(path: string, body?: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async getIdentity(): Promise<unknown> {
    return this.get("/v4/users/me/identity");
  }

  async getProfile(): Promise<unknown> {
    return this.get("/v4/users/me/profile");
  }

  async getSettings(): Promise<unknown> {
    return this.get("/v4/users/me/settings");
  }

  async listDataPoints(query: DataPointQuery): Promise<unknown> {
    return this.get(`/v4/users/me/dataTypes/${encodeDataType(query.dataType)}/dataPoints`, {
      pageSize: normalizePageSize(query.pageSize),
      pageToken: query.pageToken,
      filter: query.filter
    });
  }

  async reconcileDataPoints(query: ReconcileQuery): Promise<unknown> {
    return this.get(`/v4/users/me/dataTypes/${encodeDataType(query.dataType)}/dataPoints:reconcile`, {
      pageSize: normalizePageSize(query.pageSize),
      pageToken: query.pageToken,
      filter: query.filter,
      dataSourceFamily: query.dataSourceFamily
    });
  }

  async dailyRollup(query: DailyRollupQuery): Promise<unknown> {
    return this.post(`/v4/users/me/dataTypes/${encodeDataType(query.dataType)}/dataPoints:dailyRollUp`, {
      range: civilDateRange(query.startDate, query.endDate ?? nextDate(query.startDate)),
      windowSizeDays: query.windowSizeDays ?? 1,
      pageSize: normalizePageSize(query.pageSize),
      pageToken: query.pageToken,
      dataSourceFamily: query.dataSourceFamily
    });
  }

  async rollup(query: RollupQuery): Promise<unknown> {
    return this.post(`/v4/users/me/dataTypes/${encodeDataType(query.dataType)}/dataPoints:rollUp`, {
      range: { startTime: query.startTime, endTime: query.endTime },
      windowSize: query.windowSize,
      pageSize: normalizePageSize(query.pageSize),
      pageToken: query.pageToken,
      dataSourceFamily: query.dataSourceFamily
    });
  }

  // SEAM (FOUNDATION ONLY): mutating create for nutrition DataPoints. Reuses the existing
  // post → request plumbing (auth refresh, retry, cleanObject, redaction; POST is never cached).
  // It is only invoked by the future log_nutrition tool when isLiveWriteAuthorized() is true —
  // NEVER by doctor --live (only by --live-write, which stops before POST unless validateOnly
  // is confirmed). The exact verb/path + data-type slug are TO-VERIFY — see the header of
  // google-v4-nutrition-datapoint.ts before wiring this to a real Google endpoint.
  async createNutritionDataPoint(body: Record<string, unknown>): Promise<unknown> {
    return this.post(`/v4/users/me/dataTypes/${encodeDataType(NUTRITION_DATA_TYPE)}/dataPoints`, body);
  }

  async revokeAccess(): Promise<{ ok: true; token_path: string; local_tokens_cleared: boolean }> {
    const token = await this.getValidToken();
    const response = await this.fetchWithRetry(GOOGLE_HEALTH_REVOKE_URL, {
      method: "POST",
      headers: this.formHeaders(),
      body: new URLSearchParams({ token: token.refresh_token ?? token.access_token }).toString()
    });
    await this.parseResponse(response);
    await this.tokenStore.withLock(async () => this.tokenStore.clear());
    return { ok: true, token_path: this.config.tokenPath, local_tokens_cleared: true };
  }

  cacheStatus(): CacheStatus {
    const httpStats = getCacheStats();
    const http_cache = {
      size: httpStats.size,
      hit_count: httpStats.hit_count,
      miss_count: httpStats.miss_count,
      hit_rate: httpStats.hit_rate,
      default_ttl_seconds: 60,
      bypass_env_var: "GOOGLE_HEALTH_NO_CACHE"
    };
    if (!this.config.cacheEnabled) return { ...disabledCacheStatus(this.config.cachePath), http_cache };
    return { ...this.getCache().status(), http_cache };
  }

  private extractCode(input: string): string {
    try {
      const url = new URL(input);
      const code = url.searchParams.get("code");
      if (code) return code;
    } catch {
      // Raw code.
    }
    return input;
  }

  private extractScope(input: string): string | undefined {
    try {
      const url = new URL(input);
      return url.searchParams.get("scope") ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async request(method: "GET" | "POST", path: string, body?: Record<string, unknown>, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    const token = await this.getValidToken();
    const url = this.buildUrl(path, params);
    const response = await this.fetchWithRetry(url, {
      method,
      headers: this.jsonHeaders(token.access_token),
      body: body ? JSON.stringify(cleanObject(body)) : undefined
    });

    if (response.status === 401) {
      const refreshed = await this.refreshToken(true);
      const retry = await this.fetchWithRetry(url, {
        method,
        headers: this.jsonHeaders(refreshed.access_token),
        body: body ? JSON.stringify(cleanObject(body)) : undefined
      });
      return this.parseAndCache(method, url, retry);
    }

    return this.parseAndCache(method, url, response);
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.config.apiBaseUrl}${cleanPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async getValidToken(): Promise<GoogleHealthTokenSet> {
    const tokens = await this.tokenStore.read();
    if (!tokens?.access_token) {
      throw new Error("Google Health token not found. Run google-health-mcp-server auth, or use google_health_get_auth_url then google_health_exchange_code.");
    }
    const expiresAt = tokens.expires_at ?? 0;
    const shouldRefresh = Boolean(tokens.refresh_token && expiresAt && expiresAt - Math.floor(Date.now() / 1000) < 300);
    return shouldRefresh ? this.refreshToken(false) : tokens;
  }

  private async refreshToken(force: boolean): Promise<GoogleHealthTokenSet> {
    return this.tokenStore.withLock(async () => {
      const current = await this.tokenStore.read();
      if (!current?.refresh_token) {
        throw new Error("Google Health refresh token not found. Re-authorize with google-health-mcp-server auth.");
      }
      if (!force && current.expires_at && current.expires_at - Math.floor(Date.now() / 1000) >= 300) return current;

      const body = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: current.refresh_token
      });
      const refreshed = await this.requestTokens(body);
      await this.tokenStore.write({ ...current, ...refreshed, refresh_token: refreshed.refresh_token ?? current.refresh_token });
      return { ...current, ...refreshed, refresh_token: refreshed.refresh_token ?? current.refresh_token };
    });
  }

  private async requestTokens(body: URLSearchParams): Promise<GoogleHealthTokenSet> {
    const response = await this.fetchWithRetry(GOOGLE_HEALTH_TOKEN_URL, {
      method: "POST",
      headers: this.formHeaders(),
      body: body.toString()
    });
    const data = await this.parseResponse(response) as Record<string, unknown>;
    const expiresAt = typeof data.expires_at === "number"
      ? data.expires_at
      : typeof data.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : undefined;
    return {
      access_token: String(data.access_token ?? ""),
      refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      token_type: typeof data.token_type === "string" ? data.token_type : undefined,
      scope: typeof data.scope === "string" ? data.scope : undefined,
      expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
      expires_at: expiresAt
    };
  }

  private jsonHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": `google-health-mcp-server/${SERVER_VERSION}`
    };
  }

  private formHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": `google-health-mcp-server/${SERVER_VERSION}`
    };
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const details = payload && typeof payload === "object" ? JSON.stringify(payload) : text;
      throw new Error(`Google Health API HTTP ${response.status}: ${redactErrorMessage(details || response.statusText)}`);
    }
    return payload ?? {};
  }

  private async parseAndCache(method: "GET" | "POST", url: string, response: Response): Promise<unknown> {
    try {
      const payload = await this.parseResponse(response);
      if (this.config.cacheEnabled && method === "GET") this.getCache().set(method, url, payload);
      return payload;
    } catch (error) {
      if (this.config.cacheEnabled && method === "GET") {
        const cached = this.getCache().get(method, url);
        if (cached !== undefined) return cached;
      }
      throw error;
    }
  }

  private getCache(): GoogleHealthCache {
    this.cache ??= new GoogleHealthCache(this.config.cachePath);
    return this.cache;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    return fetchWithCache(url, init, {
      defaultTtlSeconds: 60,
      envVarBypass: "GOOGLE_HEALTH_NO_CACHE",
      innerFetch: (u, i) => fetchWithRetry(u, i ?? {})
    });
  }
}

function encodeDataType(dataType: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(dataType)) throw new Error(`Invalid Google Health data type: ${dataType}`);
  return encodeURIComponent(dataType);
}

function normalizePageSize(value?: number): number | undefined {
  if (value === undefined) return undefined;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_GOOGLE_HEALTH_LIMIT);
}

function civilDateRange(startDate: string, endDate: string) {
  return {
    start: civilDateTime(startDate, 0, 0, 0),
    end: civilDateTime(endDate, 0, 0, 0)
  };
}

function civilDateTime(date: string, hours: number, minutes: number, seconds: number) {
  const [year, month, day] = normalizeDate(date).split("-").map((part) => Number(part));
  return {
    date: { year, month, day },
    time: { hours, minutes, seconds, nanos: 0 }
  };
}

function normalizeDate(value: string): string {
  if (value === "today") return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Expected date as YYYY-MM-DD, received ${value}`);
  return value;
}

function nextDate(value: string): string {
  const date = new Date(`${normalizeDate(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function cleanObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
