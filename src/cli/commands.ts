import { buildConnectionStatus } from "../services/connection-status.js";
import { SERVER_VERSION } from "../constants.js";
import { parseAgentClientName } from "../services/agent-manifest.js";
import { runAuthCommand } from "./auth.js";
import { runSetupCommand } from "./setup.js";

export async function runCliCommand(args: string[]): Promise<number | undefined> {
  const [command, ...rest] = args;
  if (!command || command === "--http") return undefined;
  if (command === "setup") return runSetupCommand(rest);
  if (command === "doctor" || command === "status") return runDoctor(rest);
  if (command === "auth") return runAuthCommand(rest);
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

async function runDoctor(args: string[]): Promise<number> {
  const options = parseDoctorOptions(args);
  const status = await buildConnectionStatus({ client: options.client });
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    printDoctor(status);
  }
  return options.strict && !status.ok ? 1 : 0;
}

function parseDoctorOptions(args: string[]) {
  let client: ReturnType<typeof parseAgentClientName> | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--client") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --client.");
      client = parseAgentClientName(value);
      index += 1;
    }
  }
  return {
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    client
  };
}

function printDoctor(status: Awaited<ReturnType<typeof buildConnectionStatus>>): void {
  const ok = "✓";
  const fail = "✗";
  const info = "·";
  const check = (passed: boolean) => (passed ? ok : fail);
  const line = (mark: string, label: string, detail?: string) => {
    const labelCol = label.padEnd(28);
    console.log(`  ${mark}  ${labelCol}${detail ? `  ${detail}` : ""}`);
  };

  console.log("Google Health MCP · Doctor");
  console.log(`Status: ${status.ok ? `READY ${ok}` : `NEEDS SETUP ${fail}`}`);
  if (status.client) console.log(`Client: ${status.client}`);
  console.log("");
  console.log("Checks");
  line(check(status.node.supported), "Node.js >=20", status.node.supported ? undefined : `version ${status.node.version}`);
  line(check(status.missing_env.length === 0), "Env vars", status.missing_env.length ? `missing: ${status.missing_env.join(", ")}` : undefined);
  line(check(status.config.exists), "Local config", status.config.exists ? `${status.config.source} at ${status.config.path}` : "missing");
  line(check(status.automatic_auth_supported), "Automatic auth redirect", status.automatic_auth_supported ? undefined : "not configured for local callback");
  line(check(status.token.exists), "Token file", status.token.exists ? status.token.path : "missing");
  if (status.token.exists) {
    line(status.token.secure_permissions === false ? fail : ok, "Token permissions", status.token.secure_permissions === false ? "insecure (chmod 600)" : undefined);
    line(check(Boolean(status.token.has_refresh_token)), "Refresh token", status.token.has_refresh_token ? undefined : "missing");
  }
  const scopesOk = status.oauth.scope_status === "ok" || status.oauth.missing_recommended_scopes.length === 0;
  line(scopesOk ? ok : fail, "OAuth scopes", status.oauth.scope_status);
  if (status.oauth.granted_scopes.length > 0) {
    console.log(`      granted:  ${status.oauth.granted_scopes.join(" ")}`);
  }
  if (status.oauth.missing_recommended_scopes.length > 0) {
    console.log(`      missing:  ${status.oauth.missing_recommended_scopes.join(" ")}`);
  }
  line(info, "Privacy mode", status.privacy_mode);
  line(status.cache.enabled ? ok : info, "Cache", status.cache.enabled ? `enabled at ${status.cache.path}` : "disabled");
  if (status.client_checks?.hermes) {
    const hermes = status.client_checks.hermes;
    console.log("");
    console.log("Hermes");
    line(info, "config path", hermes.config_path);
    line(check(hermes.google_health_server_configured), "configured");
    line(check(hermes.package_pinned), "pinned package");
    line(check(hermes.skill_installed), "skill", hermes.skill_installed ? hermes.skill_path : "missing");
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
  google-health-mcp-server doctor          Check setup and next steps
  google-health-mcp-server doctor --json   Print setup status as JSON
  google-health-mcp-server doctor --client hermes
  google-health-mcp-server auth            Authorize Google Health with local browser callback
  google-health-mcp-server auth --no-open  Print auth URL without opening browser

Required env:
  GOOGLE_HEALTH_CLIENT_ID
  GOOGLE_HEALTH_CLIENT_SECRET
  GOOGLE_HEALTH_REDIRECT_URI=http://127.0.0.1:3000/callback
`);
}
