import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface as createCallbackInterface } from "node:readline";
import { createInterface as createPromptInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { NPM_PACKAGE_NAME, PINNED_NPM_PACKAGE } from "../constants.js";
import {
  hermesConfigSnippet,
  hermesSkillMarkdown,
  parseAgentClientName,
  type AgentClientName,
} from "../services/agent-manifest.js";
import {
  writeLocalConfig,
  type LocalGoogleHealthConfig,
} from "../services/local-config.js";
import { resolveScopes } from "../services/scope-presets.js";
import { runAuthCommand } from "./auth.js";

interface SetupOptions {
  client: AgentClientName;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  privacyMode: "summary" | "structured" | "raw";
  scopes: string[];
  cache?: string;
  tokenPath?: string;
  cachePath?: string;
  noAuth: boolean;
  json: boolean;
  manual: boolean;
  homeDir: string;
}

interface ClientConfigResult {
  path: string;
  hermes_skill_path?: string;
  hermes_config_backup_path?: string;
  warnings?: string[];
}

export async function runSetupCommand(args: string[]): Promise<number> {
  const options = await parseSetupOptions(args);
  const config: LocalGoogleHealthConfig = {
    GOOGLE_HEALTH_CLIENT_ID: options.clientId,
    GOOGLE_HEALTH_CLIENT_SECRET: options.clientSecret,
    GOOGLE_HEALTH_REDIRECT_URI: options.redirectUri,
    GOOGLE_HEALTH_SCOPES: options.scopes.join(" "),
    GOOGLE_HEALTH_PRIVACY_MODE: options.privacyMode,
  };
  if (options.cache) config.GOOGLE_HEALTH_CACHE = options.cache;
  if (options.tokenPath) config.GOOGLE_HEALTH_TOKEN_PATH = options.tokenPath;
  if (options.cachePath) config.GOOGLE_HEALTH_CACHE_PATH = options.cachePath;

  const configPath = writeLocalConfig(config, options.homeDir);
  const clientConfig = writeClientConfig(options.client, options.homeDir);
  const setupOutput = {
    ok: true,
    config_path: configPath,
    client: options.client,
    client_config_path: clientConfig.path,
    hermes_skill_path: clientConfig.hermes_skill_path,
    hermes_config_backup_path: clientConfig.hermes_config_backup_path,
    warnings: clientConfig.warnings,
    auth_started: !options.noAuth,
    next_step: setupNextStep(options.client, options.noAuth),
  };

  if (options.json) console.log(JSON.stringify(setupOutput, null, 2));
  else {
    console.log("Google Health MCP - Setup");
    console.log("");
    console.log(`  OK Local config       ${configPath}`);
    console.log(`  OK MCP client config  ${clientConfig.path}`);
    if (clientConfig.hermes_skill_path)
      console.log(`  OK Hermes skill       ${clientConfig.hermes_skill_path}`);
    console.log("");
    console.log(
      "Secrets were saved only in the local config file (chmod 600).",
    );
    console.log(`Next: ${setupOutput.next_step}`);
  }

  if (!options.noAuth) {
    const authArgs = [] as string[];
    if (options.json) authArgs.push("--json");
    if (options.manual) authArgs.push("--manual");
    return runAuthCommand(authArgs);
  }
  return 0;
}

async function parseSetupOptions(args: string[]): Promise<SetupOptions> {
  const flags = parseFlags(args);
  const json = flags.has("json");
  const manual = flags.has("manual");
  const homeDir = flags.get("home-dir") ?? homedir();
  const interactive =
    !json && !flags.has("non-interactive") && process.stdin.isTTY;

  const answers = interactive ? await promptForMissing(flags) : flags;
  const client = parseAgentClientName(answers.get("client") ?? "generic");
  const clientId = required(answers, "client-id", "Google Health Client ID");
  const clientSecret = required(
    answers,
    "client-secret",
    "Google Health Client Secret",
  );
  const redirectUri =
    answers.get("redirect-uri") ?? "http://127.0.0.1:3000/callback";
  const privacyMode = parsePrivacyMode(
    answers.get("privacy-mode") ?? "structured",
  );
  const scopes = resolveScopes(
    answers.get("scope-preset"),
    answers.get("scopes"),
  );
  const cache = answers.get("cache");

  return {
    client,
    clientId,
    clientSecret,
    redirectUri,
    privacyMode,
    scopes,
    cache,
    tokenPath: answers.get("token-path"),
    cachePath: answers.get("cache-path"),
    noAuth: flags.has("no-auth"),
    json,
    manual,
    homeDir,
  };
}

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(name, "true");
    } else {
      flags.set(name, next);
      index += 1;
    }
  }
  return flags;
}

async function promptForMissing(
  flags: Map<string, string>,
): Promise<Map<string, string>> {
  const merged = new Map(flags);
  const firstPrompt = createPromptInterface({ input, output });
  try {
    if (!merged.has("client"))
      merged.set(
        "client",
        (
          await firstPrompt.question(
            "MCP client (generic/claude/cursor/windsurf/hermes/openclaw) [generic]: ",
          )
        ).trim() || "generic",
      );
    if (!merged.has("client-id"))
      merged.set(
        "client-id",
        (await firstPrompt.question("Google Health Client ID: ")).trim(),
      );
  } finally {
    firstPrompt.close();
  }
  if (!merged.has("client-secret"))
    merged.set(
      "client-secret",
      await promptHidden("Google Health Client Secret: "),
    );

  const secondPrompt = createPromptInterface({ input, output });
  try {
    if (!merged.has("redirect-uri"))
      merged.set(
        "redirect-uri",
        (
          await secondPrompt.question(
            "Google Health Redirect URI [http://127.0.0.1:3000/callback]: ",
          )
        ).trim() || "http://127.0.0.1:3000/callback",
      );
    if (!merged.has("scope-preset") && !merged.has("scopes"))
      merged.set(
        "scope-preset",
        (
          await secondPrompt.question(
            "Scope preset (basic/activity/sleep/full) [full]: ",
          )
        ).trim() || "full",
      );
    if (!merged.has("privacy-mode"))
      merged.set(
        "privacy-mode",
        (
          await secondPrompt.question(
            "Privacy mode (summary/structured/raw) [structured]: ",
          )
        ).trim() || "structured",
      );
  } finally {
    secondPrompt.close();
  }
  return merged;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createCallbackInterface({
      input,
      output,
      terminal: true,
    }) as ReturnType<typeof createCallbackInterface> & {
      stdoutMuted?: boolean;
      _writeToOutput?: (text: string) => void;
    };
    const originalWrite = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (text: string) => {
      if (rl.stdoutMuted && text !== "\n" && text !== "\r\n") output.write("*");
      else if (originalWrite) originalWrite(text);
      else output.write(text);
    };
    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      rl.close();
      output.write("\n");
      resolve(answer.trim());
    });
  });
}

function required(
  flags: Map<string, string>,
  key: string,
  label: string,
): string {
  const value = flags.get(key);
  if (!value || value === "true")
    throw new Error(
      `${label} is required. Pass --${key} or run setup interactively.`,
    );
  return value;
}

function parsePrivacyMode(value: string): "summary" | "structured" | "raw" {
  if (value === "summary" || value === "structured" || value === "raw")
    return value;
  throw new Error("Privacy mode must be summary, structured or raw.");
}

function writeClientConfig(
  client: AgentClientName,
  homeDir: string,
): ClientConfigResult {
  if (client === "claude") return { path: mergeClaudeConfig(homeDir) };
  if (client === "hermes") return writeHermesClientConfig(homeDir);
  const path = join(
    homeDir,
    ".google-health-mcp",
    "mcp-configs",
    `${client}.json`,
  );
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(mcpConfigSnippet(), null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return { path };
}

function mergeClaudeConfig(homeDir: string): string {
  const path =
    process.platform === "darwin"
      ? join(
          homeDir,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        )
      : join(
          homeDir,
          ".google-health-mcp",
          "mcp-configs",
          "claude-desktop.json",
        );
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    existing = {};
  }
  const mcpServers =
    typeof existing.mcpServers === "object" && existing.mcpServers
      ? (existing.mcpServers as Record<string, unknown>)
      : {};
  const next = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      google_health: mcpConfigSnippet().mcpServers["google_health"],
    },
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function mcpConfigSnippet() {
  return {
    mcpServers: {
      google_health: {
        command: "npx",
        args: ["-y", NPM_PACKAGE_NAME],
      },
    },
  };
}

function writeHermesClientConfig(homeDir: string): ClientConfigResult {
  const configPath = join(homeDir, ".hermes", "config.yaml");
  const skillPath = join(
    homeDir,
    ".hermes",
    "skills",
    "google-health-mcp",
    "SKILL.md",
  );
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(skillPath), { recursive: true, mode: 0o700 });

  const backupPath = mergeHermesConfig(configPath);
  writeFileSync(skillPath, `${hermesSkillMarkdown()}\n`, { mode: 0o600 });
  chmodSync(skillPath, 0o600);

  return {
    path: configPath,
    hermes_skill_path: skillPath,
    hermes_config_backup_path: backupPath,
    warnings: [
      "After editing Hermes MCP config, use `/reload-mcp` or `hermes mcp test google_health`; do not restart the Hermes gateway for normal Google Health data access.",
      `Hermes config pins ${PINNED_NPM_PACKAGE} to avoid stale npx cache behavior.`,
    ],
  };
}

function mergeHermesConfig(configPath: string): string | undefined {
  const snippet = hermesConfigSnippet();
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${snippet}\n`, { mode: 0o600 });
    chmodSync(configPath, 0o600);
    return undefined;
  }

  const existing = readFileSync(configPath, "utf8");
  if (
    /google-health-mcp-unofficial|google-health-mcp-server|google-health-mcp/.test(
      existing,
    ) &&
    /^\s*google[-_]health\s*:/m.test(existing)
  ) {
    if (existing.includes(PINNED_NPM_PACKAGE)) return undefined;
    const backupPath = backupConfig(configPath);
    const updated = existing.replace(
      /google-health-mcp-unofficial(?:@\d+\.\d+\.\d+)?/g,
      PINNED_NPM_PACKAGE,
    );
    writeFileSync(configPath, ensureReloadHint(updated), { mode: 0o600 });
    chmodSync(configPath, 0o600);
    return backupPath;
  }

  const backupPath = backupConfig(configPath);
  const next = existing.trimEnd().length
    ? addHermesGoogleHealthBlock(existing)
    : snippet;
  writeFileSync(configPath, ensureReloadHint(next), { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return backupPath;
}

function addHermesGoogleHealthBlock(existing: string): string {
  const serverBlock = [
    "  google_health:",
    "    command: npx",
    "    args:",
    "      - -y",
    `      - ${PINNED_NPM_PACKAGE}`,
  ].join("\n");
  const trimmed = existing.trimEnd();
  if (/^mcp_servers:\s*$/m.test(trimmed)) {
    return `${trimmed.replace(/^mcp_servers:\s*$/m, `mcp_servers:\n${serverBlock}`)}\n`;
  }
  return `${trimmed}\n\n# Added by ${NPM_PACKAGE_NAME} setup.\nmcp_servers:\n${serverBlock}\n`;
}

function backupConfig(path: string): string {
  const backupPath = `${path}.bak-google-health-mcp-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}`;
  renameSync(path, backupPath);
  chmodSync(backupPath, 0o600);
  writeFileSync(path, readFileSync(backupPath, "utf8"), { mode: 0o600 });
  chmodSync(path, 0o600);
  return backupPath;
}

function ensureReloadHint(text: string): string {
  if (/mcp_reload_confirm\s*:\s*false/.test(text))
    return text.endsWith("\n") ? text : `${text}\n`;
  if (/^approvals:\s*$/m.test(text)) {
    return `${text.trimEnd()}\n  mcp_reload_confirm: false\n`;
  }
  return `${text.trimEnd()}\n\napprovals:\n  mcp_reload_confirm: false\n`;
}

function setupNextStep(client: AgentClientName, noAuth: boolean): string {
  const auth = noAuth ? "Run `google-health-mcp-server auth`, then " : "";
  if (client === "hermes") {
    return `${auth}run \`google-health-mcp-server doctor --client hermes\`, then use \`/reload-mcp\` or \`hermes mcp test google_health\`.`;
  }
  return `${auth}run \`google-health-mcp-server doctor\`.`;
}
