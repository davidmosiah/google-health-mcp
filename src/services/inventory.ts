import { GOOGLE_HEALTH_DATA_TYPES, GOOGLE_HEALTH_DATA_TYPES_SOURCE } from "../constants.js";
import { buildCapabilities } from "./capabilities.js";

type SupportedDataCategory = {
  name: string;
  examples?: string[];
  tools?: string[];
};

type PrivacyModeDescription = {
  mode?: string;
  use_when?: string;
};

type CapabilityInventory = {
  project: string;
  mcp_name: string;
  unofficial?: boolean;
  api_boundary?: {
    source?: string;
    raw_definition?: string;
    does_not_include?: string[];
  };
  auth_model?: {
    type?: string;
    token_storage?: string;
    recommended_redirect_uri?: string;
    default_scopes?: string[];
  };
  auth?: {
    provider?: string;
    mode?: string;
    token_storage?: string;
    secret_storage?: string;
    caveat?: string;
  };
  privacy_modes?: PrivacyModeDescription[];
  supported_data?: SupportedDataCategory[];
  recommended_agent_flow?: string[];
  links?: Record<string, string>;
};

export function buildDataInventory() {
  const capabilities = buildCapabilities() as CapabilityInventory;
  const categories = (capabilities.supported_data ?? []).map((category) => ({
    name: category.name,
    examples: category.examples ?? [],
    tools: category.tools ?? []
  }));
  const tools = [...new Set(categories.flatMap((category) => category.tools))].sort();
  const scopes = capabilities.auth_model?.default_scopes ?? [];

  return {
    kind: "data_inventory",
    source: capabilities.project,
    mcp_name: capabilities.mcp_name,
    generated_at: new Date().toISOString(),
    unofficial: Boolean(capabilities.unofficial),
    data_access_model: capabilities.auth_model ? "oauth_api" : "local_or_unofficial_api",
    auth: capabilities.auth_model ?? capabilities.auth,
    scopes,
    api_boundary: capabilities.api_boundary,
    privacy_modes: capabilities.privacy_modes ?? [],
    categories,
    totals: {
      categories: categories.length,
      listed_tools: tools.length,
      scopes: scopes.length
    },
    first_tools: [
      ...new Set([
        tools.find((tool) => tool.endsWith("connection_status")),
        tools.find((tool) => tool.endsWith("daily_summary")),
        tools.find((tool) => tool.endsWith("weekly_summary")),
        ...tools.filter((tool) => tool.includes("context")).slice(0, 1)
      ].filter((tool): tool is string => Boolean(tool)))
    ],
    recommended_agent_flow: capabilities.recommended_agent_flow ?? [],
    links: capabilities.links ?? {},
    notes: [
      "This inventory is static MCP metadata and does not call Google Health APIs.",
      "Endpoint data types use kebab case, such as steps, sleep, heart-rate, body-fat and daily-resting-heart-rate.",
      "Filter fields use snake case, such as heart_rate.sample_time.physical_time or sleep.interval.civil_start_time.",
      "Call the connection status tool before live data tools to verify credentials and local token readiness.",
      "Use raw privacy mode only when the user explicitly requests upstream payloads.",
      "Google Health API v4 is still evolving; check official release notes before production launch decisions because scopes and data types can change."
    ]
  };
}

export function formatInventoryMarkdown(inventory: ReturnType<typeof buildDataInventory>): string {
  const categoryLines = inventory.categories.map((category) => "- **" + category.name + "**: " + (category.tools.join(", ") || "no direct tool listed"));
  return [
    "# Google Health Data Inventory",
    "",
    "- **source**: " + inventory.source,
    "- **categories**: " + inventory.totals.categories,
    "- **listed_tools**: " + inventory.totals.listed_tools,
    "- **scopes**: " + (inventory.scopes.length ? inventory.scopes.join(", ") : "n/a"),
    "",
    "## Categories",
    ...categoryLines
  ].join("\n");
}

export function buildDataTypeCatalog() {
  const data_types = GOOGLE_HEALTH_DATA_TYPES.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    kind: entry.kind,
    supports: [...entry.supports],
    official_operations: [...entry.official_operations],
    unit: entry.unit,
    scope: entry.scope
  }));
  return {
    kind: "data_type_catalog" as const,
    source: "google-health-mcp-unofficial",
    official_source: GOOGLE_HEALTH_DATA_TYPES_SOURCE,
    generated_at: new Date().toISOString(),
    note: "kebab-case slugs accepted by the data_type parameter. official_operations mirrors the Google Health API data-type table; supports is the connector-safe read-only subset this MCP can validate with list, reconcile and rollup.",
    count: data_types.length,
    data_types
  };
}

export function formatDataTypeCatalogMarkdown(catalog: ReturnType<typeof buildDataTypeCatalog>): string {
  const rows = catalog.data_types.map(
    (entry) => `- \`${entry.slug}\` — ${entry.name}; kind: ${entry.kind}; unit: ${entry.unit}; supports: ${entry.supports.join(", ") || "none"}; scope: ${entry.scope}`
  );
  return [
    "# Google Health Data Types",
    "",
    "- **count**: " + catalog.count,
    "- **official_source**: " + catalog.official_source.url + " (last updated " + catalog.official_source.page_last_updated + ")",
    "- **supports legend**: list (listDataPoints), reconcile (reconcileDataPoints), rollup (dailyRollUp / rollUp)",
    "",
    "## Supported slugs",
    ...rows,
    "",
    "> " + catalog.note
  ].join("\n");
}
