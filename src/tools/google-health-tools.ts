import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AgentManifestInputSchema,
  AgentManifestOutputSchema,
  AuthUrlInputSchema,
  AuthUrlOutputSchema,
  CacheStatusOutputSchema,
  CapabilitiesOutputSchema,
  ConnectionStatusInputSchema,
  ConnectionStatusOutputSchema,
  DailyRollupInputSchema,
  DailySummaryInputSchema,
  DataInventoryOutputSchema,
  DataPointsInputSchema,
  EndpointDataOutputSchema,
  ExchangeCodeInputSchema,
  ExchangeCodeOutputSchema,
  PrivacyAuditOutputSchema,
  ReconcileInputSchema,
  ResponseOnlyInputSchema,
  RevokeAccessOutputSchema,
  RollupInputSchema,
  SimpleReadInputSchema,
  SummaryOutputSchema,
  WeeklySummaryInputSchema,
  WellnessContextInputSchema,
  WellnessContextOutputSchema
} from "../schemas/common.js";
import { buildPrivacyAudit } from "../services/audit.js";
import { buildAgentManifest, formatAgentManifestMarkdown } from "../services/agent-manifest.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildConnectionStatus } from "../services/connection-status.js";
import { buildWellnessContext, formatWellnessContextMarkdown } from "../services/context.js";
import { getConfig } from "../services/config.js";
import { bulletList, makeError, makeResponse } from "../services/format.js";
import { buildDataInventory, formatInventoryMarkdown } from "../services/inventory.js";
import { applyPrivacy, resolvePrivacyMode } from "../services/privacy.js";
import {
  buildProfileSummary,
  getOnboardingFlow,
  getProfile,
  getProfilePath,
  missingCriticalFields,
  updateProfile,
  type WellnessProfileDocument
} from "../services/profile-store.js";
import { buildDailySummary, buildWeeklySummary, formatSummaryMarkdown } from "../services/summary.js";
import { GoogleHealthClient } from "../services/google-health-client.js";

function client(): GoogleHealthClient {
  return new GoogleHealthClient(getConfig());
}

function endpointOutput(endpoint: string, privacy_mode: "summary" | "structured" | "raw", data: unknown) {
  return { endpoint, privacy_mode, data };
}

export function registerGoogleHealthTools(server: McpServer): void {
  server.registerTool("google_health_data_inventory", {
    title: "Google Health Data Inventory",
    description: "Inventory supported Google Health data types, auth scopes, privacy modes and recommended first calls without calling Google APIs.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: DataInventoryOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const inventory = buildDataInventory();
    return makeResponse(inventory, response_format, formatInventoryMarkdown(inventory));
  });

  server.registerTool("google_health_agent_manifest", {
    title: "Google Health Agent Manifest",
    description: "Machine-readable install, runtime and client guidance for AI agents. Does not call Google Health or expose secrets.",
    inputSchema: AgentManifestInputSchema.shape,
    outputSchema: AgentManifestOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ client: targetClient, response_format }) => {
    const manifest = buildAgentManifest(targetClient);
    return makeResponse(manifest, response_format, formatAgentManifestMarkdown(manifest));
  });

  server.registerTool("google_health_capabilities", {
    title: "Google Health MCP Capabilities",
    description: "Explain supported Google Health data, privacy boundaries, beta status and recommended agent workflow.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: CapabilitiesOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const capabilities = buildCapabilities();
    return makeResponse(capabilities, response_format, bulletList("Google Health MCP Capabilities", {
      project: capabilities.project,
      status: capabilities.status,
      api_boundary: capabilities.api_boundary.source,
      recommended_first_tools: "google_health_connection_status, google_health_data_inventory, google_health_daily_summary",
      docs: capabilities.links.docs
    }));
  });

  server.registerTool("google_health_quickstart", {
    title: "Google Health Quickstart",
    description: "Personalized 3-step setup walkthrough for the human user. Adapts to current state (env vars set? token present? what's next?). Call this first when the user asks 'how do I connect Google Health?'",
    inputSchema: ResponseOnlyInputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const status = await buildConnectionStatus();
    const hasEnv = status.missing_env.length === 0;
    const hasToken = status.ready_for_google_health_api;
    const steps = [
      {
        step: 1,
        title: hasEnv ? "(done) Google Cloud OAuth client configured" : "Create a Google Cloud OAuth client and enable Google Health API v4",
        action: hasEnv
          ? "GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, GOOGLE_HEALTH_REDIRECT_URI are all set."
          : `Open https://console.cloud.google.com/apis/library/health.googleapis.com to enable the API, create an OAuth 2.0 client (type: Desktop), register a redirect URI (use ${status.redirect_uri ?? "http://127.0.0.1:3000/callback"}), then set: ${status.missing_env.join(", ")}.`,
        done: hasEnv,
      },
      {
        step: 2,
        title: hasToken ? "(done) Local token present — ready to read Google Health data" : "Run the OAuth dance",
        action: hasToken
          ? "Tokens stored under ~/.google-health-mcp/tokens.json. The connector will refresh automatically when needed."
          : "Run `google-health-mcp-server auth` (or call google_health_get_auth_url + google_health_exchange_code from the agent). Open the URL, grant access, paste the code.",
        done: hasToken,
      },
      {
        step: 3,
        title: "Verify with the agent",
        action: "Call google_health_connection_status, then google_health_daily_summary or google_health_wellness_context. Pair with wellness-nourish for sleep-aware meal coaching.",
        example: hasToken
          ? "google_health_wellness_context() → sleep + activity load handoff for nourish/cycle-coach."
          : "Until step 2 is done, the data tools will surface a clear 'auth required' message.",
        done: false,
      },
    ];
    const payload = {
      ok: true,
      ready: hasEnv && hasToken,
      steps,
      next: steps.find((s) => !s.done) ?? steps[steps.length - 1],
      migration_note: "Fitbit accounts are migrating to Google Health Connect. If you previously used fitbit-mcp-unofficial and now own a Pixel Watch (or installed Google Health Connect on Android), google-health-mcp-unofficial is the forward-looking connector — your tokens are different but the data domains overlap.",
      cross_connector_hints: [
        "Pair Google Health sleep + steps with wellness-nourish for sleep-aware meal coaching.",
        "Pair Google Health HRV with wellness-cycle-coach for late-luteal load adjustments.",
        "Pair Google Health resting heart rate with wellness-cgm-mcp glucose for metabolic-stress signals.",
      ],
    };
    const markdown = bulletList("Google Health Quickstart", {
      ready: payload.ready,
      next: payload.next.title,
      migration: "Fitbit -> Google Health Connect migration: this connector is the forward path for Pixel Watch + Android.",
    });
    return makeResponse(payload, response_format, markdown);
  });

  server.registerTool("google_health_demo", {
    title: "Google Health Demo",
    description: "Returns realistic Pixel-Watch-style example payloads of google_health_daily_summary, google_health_wellness_context, and google_health_daily_rollup so agents see the contract before calling real Google Health APIs.",
    inputSchema: ResponseOnlyInputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      ok: true,
      is_demo: true,
      sample: {
        google_health_daily_summary: {
          date: today,
          source: "Pixel Watch 3",
          activity: { steps: 9180, active_minutes: 44, calories_out: 2410, distance_km: 7.1, floors_climbed: 14 },
          sleep: { score: 81, duration_min: 458, efficiency: 93, stages: { rem_min: 94, deep_min: 71, light_min: 252, awake_min: 41 } },
          heart: { resting_heart_rate: 54, hrv_rmssd_ms: 46, max_heart_rate: 158 },
          body: { weight_kg: 76.2, body_fat_pct: 18.4 },
        },
        google_health_wellness_context: {
          window: "last_24h",
          sleep_score: 81,
          sleep_duration_min: 458,
          steps: 9180,
          resting_heart_rate: 54,
          hrv_ms: 46,
          activity_load: "moderate",
          recommendation: "Strong overnight recovery — sleep score 81 with HRV trending up from 7-day baseline. Green light for a moderate-to-hard session today. Front-load carbs around the workout window.",
        },
        google_health_daily_rollup: {
          date: today,
          data_source_family: "users/me/dataSourceFamilies/google-wearables",
          rollups: {
            "com.google.step_count.delta": { value: 9180, unit: "count" },
            "com.google.heart_rate.bpm": { resting: 54, max: 158, avg: 71 },
            "com.google.sleep.segment": { total_min: 458, efficiency_pct: 93 },
            "com.google.active_minutes": { value: 44, unit: "minutes" },
            "com.google.calories.expended": { value: 2410, unit: "kcal" },
          },
        },
      },
      notes: [
        "All sample data is synthetic; tagged with is_demo=true.",
        "Real calls return live data from Google Health API v4 after Google Cloud OAuth setup.",
        "Google Health API v4 is in beta; field names and shapes may shift before stable launch.",
      ],
    };
    const markdown = bulletList("Google Health Demo", {
      is_demo: true,
      steps: 9180,
      sleep_score: 81,
      resting_heart_rate: 54,
      hrv_ms: 46,
      recommendation: payload.sample.google_health_wellness_context.recommendation,
    });
    return makeResponse(payload, response_format, markdown);
  });

  server.registerTool("google_health_get_auth_url", {
    title: "Get Google Health OAuth URL",
    description: "Generate a Google OAuth authorization URL for Google Health API. Use this first when no local token exists.",
    inputSchema: AuthUrlInputSchema.shape,
    outputSchema: AuthUrlOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (params) => {
    try {
      const config = getConfig();
      const url = new GoogleHealthClient(config).authUrl(params.state, params.scopes);
      const output = {
        auth_url: url,
        redirect_uri: config.redirectUri,
        scopes: params.scopes?.length ? params.scopes : config.scopes,
        next_step: "Open auth_url, approve access, then pass the returned code or full redirect URL to google_health_exchange_code."
      };
      return makeResponse(output, params.response_format, bulletList("Google Health OAuth URL", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_exchange_code", {
    title: "Exchange Google Health OAuth Code",
    description: "Exchange a Google OAuth authorization code for local tokens. Tokens are stored locally with 0600 permissions and are never returned.",
    inputSchema: ExchangeCodeInputSchema.shape,
    outputSchema: ExchangeCodeOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, async (params) => {
    try {
      const result = await client().exchangeCode(params.code);
      const output = { ...result, note: "Token values were stored locally and intentionally omitted from this response." };
      return makeResponse(output, params.response_format, bulletList("Google Health OAuth Exchange", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_get_identity", {
    title: "Get Google Health Identity",
    description: "Get the Google Health identity mapping for the authenticated user. Useful for Fitbit-to-Google migrations.",
    inputSchema: SimpleReadInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ response_format, privacy_mode }) => {
    try {
      const config = getConfig();
      const endpoint = "/v4/users/me/identity";
      const mode = resolvePrivacyMode(config, privacy_mode);
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).getIdentity(), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), response_format, bulletList("Google Health Identity", data as Record<string, unknown>));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_get_profile", {
    title: "Get Google Health Profile",
    description: "Get authenticated user profile details from Google Health. Requires profile scope.",
    inputSchema: SimpleReadInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ response_format, privacy_mode }) => {
    try {
      const config = getConfig();
      const endpoint = "/v4/users/me/profile";
      const mode = resolvePrivacyMode(config, privacy_mode);
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).getProfile(), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), response_format, bulletList("Google Health Profile", data as Record<string, unknown>));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_get_settings", {
    title: "Get Google Health Settings",
    description: "Get authenticated user settings such as units and timezone. Requires settings scope.",
    inputSchema: SimpleReadInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ response_format, privacy_mode }) => {
    try {
      const config = getConfig();
      const endpoint = "/v4/users/me/settings";
      const mode = resolvePrivacyMode(config, privacy_mode);
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).getSettings(), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), response_format, bulletList("Google Health Settings", data as Record<string, unknown>));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_list_data_points", {
    title: "List Google Health Data Points",
    description: "Query detailed data points for a Google Health data type. Use kebab-case endpoint data types, e.g. steps, sleep, heart-rate.",
    inputSchema: DataPointsInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const config = getConfig();
      const mode = resolvePrivacyMode(config, params.privacy_mode);
      const endpoint = `/v4/users/me/dataTypes/${params.data_type}/dataPoints`;
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).listDataPoints({
        dataType: params.data_type,
        filter: params.filter,
        pageSize: params.page_size,
        pageToken: params.page_token
      }), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), params.response_format, bulletList("Google Health Data Points", { endpoint, data_type: params.data_type, data: JSON.stringify(data) }));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_reconcile_data_points", {
    title: "Reconcile Google Health Data Points",
    description: "Read a reconciled stream for one data type across sources. Supports all-sources, google-wearables and google-sources data source families.",
    inputSchema: ReconcileInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const config = getConfig();
      const mode = resolvePrivacyMode(config, params.privacy_mode);
      const endpoint = `/v4/users/me/dataTypes/${params.data_type}/dataPoints:reconcile`;
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).reconcileDataPoints({
        dataType: params.data_type,
        filter: params.filter,
        pageSize: params.page_size,
        pageToken: params.page_token,
        dataSourceFamily: params.data_source_family
      }), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), params.response_format, bulletList("Google Health Reconciled Data", { endpoint, data_type: params.data_type, data_source_family: params.data_source_family ?? "all", data: JSON.stringify(data) }));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_daily_rollup", {
    title: "Google Health Daily Rollup",
    description: "Aggregate a data type over civil days using Google Health dailyRollUp. Useful for steps, distance, calories, active minutes, weight and heart summaries.",
    inputSchema: DailyRollupInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const config = getConfig();
      const mode = resolvePrivacyMode(config, params.privacy_mode);
      const endpoint = `/v4/users/me/dataTypes/${params.data_type}/dataPoints:dailyRollUp`;
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).dailyRollup({
        dataType: params.data_type,
        startDate: params.start_date,
        endDate: params.end_date,
        windowSizeDays: params.window_size_days,
        pageSize: params.page_size,
        pageToken: params.page_token,
        dataSourceFamily: params.data_source_family
      }), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), params.response_format, bulletList("Google Health Daily Rollup", { endpoint, data_type: params.data_type, data: JSON.stringify(data) }));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_rollup", {
    title: "Google Health Physical-Time Rollup",
    description: "Aggregate a data type over physical time intervals using Google Health rollUp.",
    inputSchema: RollupInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const config = getConfig();
      const mode = resolvePrivacyMode(config, params.privacy_mode);
      const endpoint = `/v4/users/me/dataTypes/${params.data_type}/dataPoints:rollUp`;
      const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).rollup({
        dataType: params.data_type,
        startTime: params.start_time,
        endTime: params.end_time,
        windowSize: params.window_size,
        pageSize: params.page_size,
        pageToken: params.page_token,
        dataSourceFamily: params.data_source_family
      }), mode);
      return makeResponse(endpointOutput(endpoint, mode, data), params.response_format, bulletList("Google Health Rollup", { endpoint, data_type: params.data_type, data: JSON.stringify(data) }));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_connection_status", {
    title: "Google Health Connection Status",
    description: "Check local Google Health config, token file, Node version, privacy mode, cache readiness and optional MCP client readiness without calling Google APIs or exposing secrets.",
    inputSchema: ConnectionStatusInputSchema.shape,
    outputSchema: ConnectionStatusOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format, client: targetClient }) => {
    const status = await buildConnectionStatus({ client: targetClient });
    return makeResponse(status, response_format, bulletList("Google Health Connection Status", {
      ok: status.ok,
      ready_for_google_health_api: status.ready_for_google_health_api,
      missing_env: status.missing_env.join(", ") || "none",
      scope_status: status.oauth.scope_status,
      token_path: status.token.path,
      token_exists: status.token.exists,
      privacy_mode: status.privacy_mode,
      next_steps: status.next_steps.join(" | ")
    }));
  });

  server.registerTool("google_health_cache_status", {
    title: "Google Health Cache Status",
    description: "Show optional local SQLite cache status. Enable with GOOGLE_HEALTH_CACHE=sqlite or GOOGLE_HEALTH_CACHE=true.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: CacheStatusOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    try {
      const status = client().cacheStatus();
      return makeResponse(status, response_format, bulletList("Google Health Cache Status", status));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_privacy_audit", {
    title: "Google Health Privacy Audit",
    description: "Return local privacy, cache, token-path and env-presence posture without revealing secret values.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: PrivacyAuditOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const audit = buildPrivacyAudit();
    return makeResponse(audit, response_format, bulletList("Google Health Privacy Audit", audit));
  });

  server.registerTool("google_health_revoke_access", {
    title: "Revoke Google Health OAuth Access",
    description: "Revoke the current Google OAuth grant and delete the local token file. Use only when the user explicitly wants to disconnect Google Health.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: RevokeAccessOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }, async ({ response_format }) => {
    try {
      const result = await client().revokeAccess();
      const output = { ...result, note: "Google Health access was revoked and local tokens were removed. Re-authorize before future API calls." };
      return makeResponse(output, response_format, bulletList("Google Health Access Revoked", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_daily_summary", {
    title: "Google Health Daily Summary",
    description: "Build a practical daily summary from Google Health rollups and reconciled streams when available. Read-only, beta, non-medical.",
    inputSchema: DailySummaryInputSchema.shape,
    outputSchema: SummaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const summary = await buildDailySummary(client(), params);
      return makeResponse(summary, params.response_format, formatSummaryMarkdown(summary));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_weekly_summary", {
    title: "Google Health Weekly Review",
    description: "Build a weekly Google Health scorecard with activity, sleep, heart context and missing-data awareness. Read-only, beta, non-medical.",
    inputSchema: WeeklySummaryInputSchema.shape,
    outputSchema: SummaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const summary = await buildWeeklySummary(client(), params);
      return makeResponse(summary, params.response_format, formatSummaryMarkdown(summary));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("google_health_wellness_context", {
    title: "Google Health Wellness Context",
    description: "Normalize Google Health activity/sleep context into the shared wellness_context shape for recommendation engines.",
    inputSchema: WellnessContextInputSchema.shape,
    outputSchema: WellnessContextOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const context = await buildWellnessContext(client(), params);
      return makeResponse(context, params.response_format, formatWellnessContextMarkdown(context));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool(
    "google_health_profile_get",
    {
      title: "Get Delx Wellness Profile",
      description:
        "Read the shared Delx Wellness profile from ~/.delx-wellness/profile.json. Returns preferred name, goals, devices, training/nutrition/exercise/agent preferences and safety flags. NEVER contains OAuth tokens or API secrets. Read-only.",
      inputSchema: ResponseOnlyInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format }) => {
      try {
        const profile = await getProfile();
        const payload = {
          ok: true,
          profile,
          summary: buildProfileSummary(profile),
          missing_critical: missingCriticalFields(profile),
          storage_path: getProfilePath()
        };
        return makeResponse(payload, response_format, bulletList("Delx Wellness Profile", {
          summary: payload.summary,
          missing_critical: payload.missing_critical,
          storage_path: payload.storage_path
        }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "google_health_profile_update",
    {
      title: "Update Delx Wellness Profile",
      description:
        "Persist a partial patch to ~/.delx-wellness/profile.json. Requires explicit_user_intent=true (otherwise returns USER_ACTION_REQUIRED). Rejects secret-like fields (oauth, token, secret, password, cookie, refresh, api_key, session) at write time. Use to record preferred name, goals, devices, training context, nutrition context, exercise preferences, agent preferences, and safety flags.",
      inputSchema: {
        patch: z.record(z.string(), z.unknown()).describe("Partial WellnessProfileDocument patch. Top-level keys: profile, goals, devices, training, nutrition, preferences, safety, notes."),
        explicit_user_intent: z.boolean().optional().describe("Must be true to persist. Prevents accidental writes from agent inference."),
        response_format: z.enum(["markdown", "json"]).default("markdown")
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ patch, explicit_user_intent, response_format }) => {
      try {
        if (explicit_user_intent !== true) {
          return makeResponse(
            {
              ok: false,
              error: "USER_ACTION_REQUIRED",
              message: "Profile update requires explicit_user_intent=true. Confirm with the user before persisting."
            },
            response_format,
            bulletList("Delx Wellness Profile Update", {
              ok: false,
              error: "USER_ACTION_REQUIRED",
              hint: "Set explicit_user_intent=true once the user has confirmed."
            })
          );
        }
        const updated = await updateProfile(patch as Partial<WellnessProfileDocument>);
        const payload = {
          ok: true,
          profile: updated,
          summary: buildProfileSummary(updated),
          missing_critical: missingCriticalFields(updated),
          storage_path: getProfilePath()
        };
        return makeResponse(payload, response_format, bulletList("Delx Wellness Profile Updated", {
          summary: payload.summary,
          missing_critical: payload.missing_critical,
          storage_path: payload.storage_path
        }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "google_health_onboarding",
    {
      title: "Delx Wellness Onboarding Flow",
      description:
        "Return the 11-question onboarding flow plus the current profile state and missing fields. Read-only — does NOT persist anything. Pair with google_health_profile_update once the user answers. Cross-connector: the same profile is shared by every Delx Wellness MCP (whoop, garmin, oura, fitbit, strava, polar, withings, apple-health, samsung-health, google-health, nourish, cycle-coach, cgm, air).",
      inputSchema: {
        locale: z.enum(["en", "pt-BR"]).optional().describe("Onboarding locale. Defaults to en."),
        response_format: z.enum(["markdown", "json"]).default("markdown")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ locale, response_format }) => {
      try {
        const flow = getOnboardingFlow(locale ?? "en");
        const profile = await getProfile();
        const payload = {
          ok: true,
          flow,
          current_profile: profile,
          missing_critical: missingCriticalFields(profile),
          cross_connector_hint:
            "This profile is shared across all Delx Wellness connectors. Answering once populates context for whoop, garmin, oura, fitbit, strava, polar, withings, apple-health, samsung-health, google-health, nourish, cycle-coach, cgm, and air."
        };
        return makeResponse(payload, response_format, bulletList("Delx Wellness Onboarding", {
          locale: flow.locale,
          questions: `${flow.questions.length} questions`,
          storage_path: flow.storage_path,
          missing_critical: payload.missing_critical,
          privacy_note: flow.privacy_note
        }));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );

  // SEAM: the community log_nutrition WRITE tool registers here. It is intentionally NOT shipped
  // in this foundation PR. The rails it consumes already exist:
  //   - LogNutritionInputSchema (src/schemas/common.ts) — typed input contract
  //   - checkRemoteWriteGate / isLiveWriteAuthorized (src/services/remote-write-gate.ts)
  //   - estimateMeal / nutrientsForGrams (src/services/nutrition-normalize.ts)
  //   - buildNutritionDataPointBody (src/services/google-v4-nutrition-datapoint.ts)
  //   - client.createNutritionDataPoint(body) (src/services/google-health-client.ts)
  // It must:
  //   1) checkRemoteWriteGate({ explicit_user_intent, dry_run, granted_scopes }, { response_format, title: "Log Nutrition" })
  //   2) resolve nutrients via estimateMeal()/nutrientsForGrams() (nutrition-normalize.ts)
  //   3) buildNutritionDataPointBody() (google-v4-nutrition-datapoint.ts)
  //   4) if isLiveWriteAuthorized → client.createNutritionDataPoint(body), else return the dry-run body
  //   5) return makeResponse(...) / makeError(...) like google_health_profile_update.
  // Annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  //   (openWorldHint TRUE — it talks to Google, unlike profile_update's false; matches google_health_exchange_code).
  // BEFORE wiring the live POST, honor the TO-VERIFY flags in google-v4-nutrition-datapoint.ts
  // (v4 create verb/path, nutrition data-type slug, DataPoint envelope, validateOnly param) and
  // the write-scope string in constants.ts.
}
