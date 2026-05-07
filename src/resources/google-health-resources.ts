import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { buildAgentManifest, formatAgentManifestMarkdown } from "../services/agent-manifest.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildDataInventory } from "../services/inventory.js";
import { getConfig } from "../services/config.js";
import { applyPrivacy, resolvePrivacyMode } from "../services/privacy.js";
import { buildDailySummary, buildWeeklySummary, formatSummaryMarkdown } from "../services/summary.js";
import { GoogleHealthClient } from "../services/google-health-client.js";

function textResource(uri: URL, text: string, mimeType = "text/markdown"): ReadResourceResult {
  return { contents: [{ uri: uri.toString(), mimeType, text }] };
}

async function profileResource(uri: URL) {
  const config = getConfig();
  const endpoint = "/v4/users/me/profile";
  const data = applyPrivacy(endpoint, await new GoogleHealthClient(config).getProfile(), resolvePrivacyMode(config));
  return textResource(uri, JSON.stringify({ endpoint, data }, null, 2), "application/json");
}

async function latestStepsResource(uri: URL) {
  const config = getConfig();
  const endpoint = "/v4/users/me/dataTypes/steps/dataPoints:reconcile";
  const result = await new GoogleHealthClient(config).reconcileDataPoints({ dataType: "steps", pageSize: 25 });
  const data = applyPrivacy(endpoint, result, resolvePrivacyMode(config));
  return textResource(uri, JSON.stringify(data, null, 2), "application/json");
}

async function dailySummaryResource(uri: URL) {
  const summary = await buildDailySummary(new GoogleHealthClient(getConfig()), { date: "today", timezone: "UTC" });
  return textResource(uri, formatSummaryMarkdown(summary));
}

async function weeklySummaryResource(uri: URL) {
  const summary = await buildWeeklySummary(new GoogleHealthClient(getConfig()), { days: 7, compare_days: 7, timezone: "UTC" });
  return textResource(uri, formatSummaryMarkdown(summary));
}

export function registerGoogleHealthResources(server: McpServer): void {
  server.registerResource("google_health_data_inventory", "google-health://inventory", { title: "Google Health Data Inventory", description: "Static inventory of supported Google Health data domains, privacy modes and recommended first calls.", mimeType: "application/json" }, async (uri) => textResource(uri, JSON.stringify(buildDataInventory(), null, 2), "application/json"));
  server.registerResource("google_health_capabilities", "google-health://capabilities", { title: "Google Health MCP Capabilities", description: "Static capabilities, API boundary, privacy modes and beta guidance.", mimeType: "application/json" }, async (uri) => textResource(uri, JSON.stringify(buildCapabilities(), null, 2), "application/json"));
  server.registerResource("google_health_agent_manifest", "google-health://agent-manifest", { title: "Google Health Agent Manifest", description: "Machine-readable install and operating instructions for AI agents.", mimeType: "text/markdown" }, async (uri) => textResource(uri, formatAgentManifestMarkdown(buildAgentManifest("generic"))));
  server.registerResource("google_health_profile", "google-health://profile", { title: "Google Health Profile", description: "Authenticated Google Health profile using the configured privacy mode.", mimeType: "application/json" }, profileResource);
  server.registerResource("google_health_latest_steps", "google-health://latest/steps", { title: "Latest Google Health Steps", description: "Recent reconciled Google Health steps in the configured privacy mode.", mimeType: "application/json" }, latestStepsResource);
  server.registerResource("google_health_daily_summary", "google-health://summary/daily", { title: "Google Health Daily Summary", description: "Daily Google Health summary built from API data.", mimeType: "text/markdown" }, dailySummaryResource);
  server.registerResource("google_health_weekly_summary", "google-health://summary/weekly", { title: "Google Health Weekly Summary", description: "Weekly Google Health review built from API data.", mimeType: "text/markdown" }, weeklySummaryResource);
}
