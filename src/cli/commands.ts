import { homedir } from "node:os";
import { buildConnectionStatus } from "../services/connection-status.js";
import { SERVER_VERSION } from "../constants.js";
import { parseAgentClientName } from "../services/agent-manifest.js";
import { fixLocalSetup } from "../services/local-fixes.js";
import { runLiveCheck, type LiveCheckResult } from "../services/live-check.js";
import { buildDataTypeCoveragePlan, buildLiveDataTypeCoverage, formatCoverageMarkdown } from "../services/coverage-report.js";
import { getConfig } from "../services/config.js";
import { GoogleHealthClient } from "../services/google-health-client.js";
import {
  buildProfileSummary,
  getOnboardingFlow,
  getProfile,
  missingCriticalFields
} from "../services/profile-store.js";
import {
  buildSetupFeedbackReport,
  buildSupportReport,
  formatSetupFeedbackReport
} from "../services/support-report.js";
import { runAuthCommand } from "./auth.js";
import { runSetupCommand } from "./setup.js";

const COMMANDS = ["setup", "doctor", "status", "support", "coverage", "auth", "onboarding", "version", "help"] as const;

export async function runCliCommand(args: string[]): Promise<number | undefined> {
  const [command, ...rest] = args;
  if (!command || command === "--http") return undefined;
  if (command === "setup") return runSetupCommand(rest);
  if (command === "doctor" || command === "status") return runDoctor(rest);
  if (command === "support") return runSupport(rest);
  if (command === "coverage") return runCoverage(rest);
  if (command === "auth") return runAuthCommand(rest);
  if (command === "onboarding") return runOnboarding(rest);
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(SERVER_VERSION);
    return 0;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (!command.startsWith("--")) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }
  return undefined;
}

async function runOnboarding(args: string[]): Promise<number> {
  const locale = args.includes("--pt-BR") || args.includes("--pt-br") ? "pt-BR" : "en";
  const flow = getOnboardingFlow(locale);
  const profile = await getProfile();
  const payload = {
    ok: true,
    flow,
    current_profile: profile,
    missing_critical: missingCriticalFields(profile),
    summary: buildProfileSummary(profile),
    cross_connector_hint:
      "This profile is shared across every Delx Wellness MCP connector (whoop, garmin, oura, fitbit, strava, polar, withings, apple-health, samsung-health, google-health, nourish, cycle-coach, cgm, air)."
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  if (process.stderr.isTTY) {
    process.stderr.write(`\n# Delx Wellness Onboarding (${flow.locale})\n`);
    process.stderr.write(`Storage: ${flow.storage_path}\n`);
    process.stderr.write(`Profile summary: ${payload.summary}\n`);
    process.stderr.write(`Missing critical: ${payload.missing_critical.join(", ") || "none"}\n`);
    process.stderr.write(`\n${flow.privacy_note}\n\nQuestions:\n`);
    for (const q of flow.questions) {
      process.stderr.write(`  - [${q.category}${q.required ? "*" : ""}] ${q.prompt}\n`);
    }
    process.stderr.write(`\n${payload.cross_connector_hint}\n`);
  }
  return 0;
}

export { COMMANDS };

async function runSupport(args: string[]): Promise<number> {
  const options = parseSupportOptions(args);
  if (options.feedback) {
    const report = await buildSetupFeedbackReport({ homeDir: options.homeDir, client: options.client });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatSetupFeedbackReport(report));
    return 0;
  }
  const report = await buildSupportReport({ homeDir: options.homeDir, client: options.client });
  const safeReport = safeSupportReport(report);
  if (options.json) console.log(JSON.stringify(safeReport, null, 2));
  else console.log(formatSafeSupportReport(safeReport));
  return 0;
}

async function runDoctor(args: string[]): Promise<number> {
  const options = parseDoctorOptions(args);
  const fixes = options.fix ? fixLocalSetup(options.homeDir) : undefined;
  const status = await buildConnectionStatus({ client: options.client, homeDir: options.homeDir });
  const live = options.live || options.liveWrite;
  const liveCheck = live ? await runLiveCheck(status, options.homeDir, options.liveWrite) : undefined;
  const safeOutput = { ...(safeDoctorStatus(status) as Record<string, unknown>), ...(fixes ?? {}), ...(liveCheck ? { live_check: liveCheck } : {}) };
  if (options.json) {
    console.log(JSON.stringify(safeOutput, null, 2));
  } else {
    printDoctor(status);
    if (fixes?.fixes_applied.length) {
      console.log("");
      console.log("Fixes applied");
      fixes.fixes_applied.forEach((fix, index) => console.log(`  ${index + 1}. ${fix}`));
    }
    if (fixes?.warnings.length) {
      console.log("");
      console.log("Fix warnings");
      fixes.warnings.forEach((warning, index) => console.log(`  ${index + 1}. ${warning}`));
    }
    if (liveCheck) {
      printLiveCheck(liveCheck);
    }
  }
  return options.strict && !status.ok ? 1 : 0;
}

async function runCoverage(args: string[]): Promise<number> {
  const options = parseCoverageOptions(args);
  const report = options.live
    ? await buildLiveDataTypeCoverage(new GoogleHealthClient(getConfig()), options)
    : buildDataTypeCoveragePlan(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatCoverageMarkdown(report));
  return 0;
}

function printLiveCheck(liveCheck: LiveCheckResult): void {
  const ok = "✓";
  const fail = "✗";
  const line = (mark: string, label: string, _detail?: string) => {
    const labelCol = label.padEnd(28);
    console.log(`  ${mark}  ${labelCol}`);
  };
  console.log("");
  console.log("Live Google Health API");
  line(liveCheck.api_reachable ? ok : fail, "API reachable", liveCheck.skipped);
  line(liveCheck.checks.identity.ok ? ok : fail, "Identity endpoint", liveCheck.checks.identity.error);
  line(liveCheck.checks.profile.ok ? ok : fail, "Profile endpoint", liveCheck.checks.profile.error);
  line(liveCheck.checks.settings.ok ? ok : fail, "Settings endpoint", liveCheck.checks.settings.error);
  line(liveCheck.checks.nutrition_write_scope.ok ? ok : fail, "Nutrition write scope", liveCheck.checks.nutrition_write_scope.error);
  line(liveCheck.checks.nutrition_write_dry_run.ok ? ok : fail, "Nutrition write dry-run", liveCheck.checks.nutrition_write_dry_run.error);
}

function parseDoctorOptions(args: string[]) {
  let client: ReturnType<typeof parseAgentClientName> | undefined;
  let homeDir: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--client") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --client.");
      client = parseAgentClientName(value);
      index += 1;
    } else if (args[index] === "--home-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --home-dir.");
      homeDir = value;
      index += 1;
    }
  }
  return {
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    fix: args.includes("--fix"),
    live: args.includes("--live"),
    liveWrite: args.includes("--live-write"),
    homeDir: homeDir ?? homedir(),
    client
  };
}

function parseSupportOptions(args: string[]) {
  let client: ReturnType<typeof parseAgentClientName> | undefined;
  let homeDir: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--client") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --client.");
      client = parseAgentClientName(value);
      index += 1;
    } else if (args[index] === "--home-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --home-dir.");
      homeDir = value;
      index += 1;
    }
  }
  return {
    json: args.includes("--json"),
    redacted: true,
    feedback: args.includes("--feedback"),
    homeDir: homeDir ?? homedir(),
    client
  };
}

function parseCoverageOptions(args: string[]) {
  const dataTypes: string[] = [];
  let date: string | undefined;
  let dataSourceFamily: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--date") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --date.");
      date = value;
      index += 1;
    } else if (arg === "--data-source-family") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --data-source-family.");
      dataSourceFamily = value;
      index += 1;
    } else if (arg === "--data-type") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --data-type.");
      dataTypes.push(value);
      index += 1;
    } else if (arg === "--data-types") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --data-types.");
      dataTypes.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
      index += 1;
    }
  }
  return {
    live: args.includes("--live"),
    json: args.includes("--json"),
    date,
    dataSourceFamily,
    dataTypes: dataTypes.length ? dataTypes : undefined
  };
}


function safeDoctorStatus(status: Awaited<ReturnType<typeof buildConnectionStatus>>): unknown {
  const raw = status as Record<string, any>;
  const hermes = raw.client_checks?.hermes;
  const safeHermes = hermes ? Object.fromEntries(
    Object.entries(hermes).filter(([key]) => key !== "config_path" && key !== "skill_path")
  ) : undefined;
  return {
    ok: Boolean(raw.ok),
    client: raw.client,
    node: raw.node,
    required_env: raw.required_env,
    missing_env: raw.missing_env,
    automatic_auth_supported: Boolean(raw.automatic_auth_supported),
    privacy_mode: raw.privacy_mode,
    config: raw.config ? {
      exists: Boolean(raw.config.exists),
      source: raw.config.source
    } : undefined,
    token: raw.token ? {
      exists: Boolean(raw.token.exists),
      readable: Boolean(raw.token.readable),
      secure_permissions: raw.token.secure_permissions,
      expired: raw.token.expired,
      has_refresh_token: raw.token.has_refresh_token,
      has_di_token: raw.token.has_di_token
    } : undefined,
    cache: raw.cache ? {
      enabled: Boolean(raw.cache.enabled)
    } : undefined,
    client_checks: safeHermes ? { hermes: safeHermes } : undefined,
    next_steps: raw.next_steps
  };
}

function safeSupportReport(report: Awaited<ReturnType<typeof buildSupportReport>>): Record<string, unknown> {
  const safeReport = {
    redacted: true,
    package: report.package,
    runtime: report.runtime,
    config: {
      source: report.config.source,
      required_env: report.config.required_env,
      missing_env: report.config.missing_env,
      automatic_auth_supported: report.config.automatic_auth_supported,
      privacy_mode: report.config.privacy_mode,
      cache_enabled: report.config.cache_enabled
    },
    token: {
      exists: report.token.exists,
      readable: report.token.readable,
      secure_permissions: report.token.secure_permissions,
      expired: report.token.expired,
      has_refresh_token: report.token.has_refresh_token
    },
    next_steps: report.next_steps.map((step) => step
      .replace(/chmod 600\s+\S+/g, "chmod 600 [local-token-path]")
      .replace(/at\s+\/\S+/g, "at [local-path]")
      .replace(/~\/\.google-health-mcp\/tokens\.json/g, "[local-token-path]"))
  };
  return {
    ...safeReport,
    issue_body: formatSafeSupportReport(safeReport)
  };
}

function formatSafeSupportReport(report: Record<string, unknown>): string {
  return [
    "## Google Health MCP support bundle",
    "",
    "This bundle is redacted. It should not contain OAuth tokens, client secrets, or health measurements.",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```"
  ].join("\n");
}

function printDoctor(status: Awaited<ReturnType<typeof buildConnectionStatus>>): void {
  const ok = "✓";
  const fail = "✗";
  const info = "·";
  const check = (passed: boolean) => (passed ? ok : fail);
  const line = (mark: string, label: string, _detail?: string) => {
    const labelCol = label.padEnd(28);
    console.log(`  ${mark}  ${labelCol}`);
  };

  console.log("Google Health MCP · Doctor");
  console.log(`Status: ${status.ok ? `READY ${ok}` : `NEEDS SETUP ${fail}`}`);
  if (status.client) console.log(`Client: ${status.client}`);
  console.log("");
  console.log("Checks");
  line(check(status.node.supported), "Node.js >=20", status.node.supported ? undefined : `version ${status.node.version}`);
  line(check(status.missing_env.length === 0), "Env vars", status.missing_env.length ? `missing: ${status.missing_env.join(", ")}` : undefined);
  line(check(status.config.exists), "Local config", status.config.exists ? status.config.source : "missing");
  line(check(status.automatic_auth_supported), "Automatic auth redirect", status.automatic_auth_supported ? undefined : "not configured for local callback");
  line(check(status.token.exists), "Token file", status.token.exists ? "present" : "missing");
  if (status.token.exists) {
    line(status.token.secure_permissions === false ? fail : ok, "Token permissions", status.token.secure_permissions === false ? "insecure (chmod 600)" : undefined);
    line(check(Boolean(status.token.has_refresh_token)), "Refresh token", status.token.has_refresh_token ? undefined : "missing");
  }
  const scopesOk = status.oauth.scope_status === "ok" || status.oauth.missing_recommended_scopes.length === 0;
  line(scopesOk ? ok : fail, "OAuth scopes");
  line(info, "Privacy mode", status.privacy_mode);
  line(status.cache.enabled ? ok : info, "Cache", status.cache.enabled ? "enabled" : "disabled");
  if (status.client_checks?.hermes) {
    const hermes = status.client_checks.hermes;
    console.log("");
    console.log("Hermes");
    line(info, "config path", hermes.config_path ? "configured" : "missing");
    line(check(hermes.google_health_server_configured), "configured");
    line(check(hermes.package_pinned), "pinned package");
    line(check(hermes.skill_installed), "skill", hermes.skill_installed ? "installed" : "missing");
    line(info, "direct tool prefix", hermes.direct_tool_prefix);
  }
  console.log("");
  console.log("Next steps");
  status.next_steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  if (status.client_checks?.hermes?.recommendations.length) {
    console.log("");
    console.log("Hermes recommendations");
    status.client_checks.hermes.recommendations.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  }
}

function printHelp(): void {
  console.log(`Google Health MCP Server

Usage:
  google-health-mcp-server                 Start MCP stdio server
  google-health-mcp-server --http          Start local HTTP MCP server
  google-health-mcp-server setup           Guided setup, local config, and MCP client config
  google-health-mcp-server setup --scope-preset sleep
  google-health-mcp-server doctor          Check setup and next steps
  google-health-mcp-server doctor --json   Print setup status as JSON
  google-health-mcp-server doctor --client hermes
  google-health-mcp-server doctor --fix    Fix local config/token permissions, then check setup
  google-health-mcp-server doctor --live   Call safe Google Health endpoints to prove API reachability
  google-health-mcp-server doctor --live-write  Also dry-run the nutrition write path (validates the v4 body; never POSTs)
  google-health-mcp-server support         Print a redacted support bundle for GitHub issues
  google-health-mcp-server support --json  Print redacted support bundle as JSON
  google-health-mcp-server support --feedback --json
                                   Print anonymous setup feedback for beta issue #4
  google-health-mcp-server coverage --json
                                   Print static read-only data-type coverage plan for issue #3
  google-health-mcp-server coverage --live --json
                                   Run read-only live coverage checks after OAuth setup
  google-health-mcp-server auth            Authorize Google Health with local browser callback
  google-health-mcp-server auth --no-open  Print auth URL without opening browser
  google-health-mcp-server onboarding      Print the shared Delx Wellness onboarding flow as JSON (+ TTY summary on stderr)
  google-health-mcp-server onboarding --pt-BR  Onboarding flow in Brazilian Portuguese

Required env:
  GOOGLE_HEALTH_CLIENT_ID
  GOOGLE_HEALTH_CLIENT_SECRET
  GOOGLE_HEALTH_REDIRECT_URI=http://127.0.0.1:3000/callback
`);
}
