/**
 * OAuth entry point for the `auth` command.
 *
 * Three flows share one authorization URL and one token exchange:
 *
 * - **Local callback** — opens a browser and catches the redirect on a
 *   loopback listener. Requires a browser *on this host*.
 * - **Manual paste** — prints the URL, the operator approves elsewhere and
 *   pastes the redirect back. Binds nothing. Used on headless hosts, where
 *   the redirect would otherwise land on the browser's loopback, not ours.
 * - **Non-interactive** — `--code` exchanges an already-obtained code.
 *
 * Selection precedence: `--code` > `--print-url` > `--manual` > detection
 * (see {@link detectHeadlessEnvironment}, overridable with `--local-callback`).
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { getConfig } from "../services/config.js";
import { GoogleHealthClient } from "../services/google-health-client.js";
import { detectHeadlessEnvironment, type HeadlessDetection } from "../services/headless.js";

export { detectHeadlessEnvironment, type HeadlessDetection };

/** Loopback listener coordinates parsed out of the configured redirect URI. */
export interface LocalRedirectPlan {
  host: string;
  port: number;
  path: string;
}

/** Platform-specific command used to hand the authorization URL to a browser. */
export interface BrowserOpenCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

/** Parsed `auth` flags. See the module docstring for selection precedence. */
export interface AuthOptions {
  /** Emit machine-readable output; instructions and prompts move to stderr. */
  json: boolean;
  /** Keep the callback flow but do not launch a browser. */
  noOpen: boolean;
  /** Force the manual paste flow (`--manual`/`--headless`/`--no-browser`). */
  manual: boolean;
  /** Force the callback flow on a headless host, e.g. behind an SSH tunnel. */
  localCallback: boolean;
  /** Print only the authorization URL and exit. */
  printUrl: boolean;
  /** Redirect URL or bare code to exchange without prompting. */
  code?: string;
}

/**
 * Narrow the configured redirect URI to a loopback listener plan.
 *
 * @throws if the URI is not `http://` on a loopback host with an explicit port,
 * which the callback flow cannot bind.
 */
export function parseLocalRedirectUri(value: string): LocalRedirectPlan {
  const url = new URL(value);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname) || !url.port) {
    throw new Error("Automatic auth requires a local redirect URI such as http://127.0.0.1:3000/callback.");
  }
  return {
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname.replace(/^\[(.*)\]$/, "$1"),
    port: Number(url.port),
    path: url.pathname || "/callback"
  };
}

/**
 * Parse `auth` flags. Unknown flags are ignored, matching the other CLI
 * commands; only `--code` consumes a following value.
 *
 * @throws if `--code` is given without a value.
 */
export function parseAuthOptions(args: string[]): AuthOptions {
  let code: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--code") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --code.");
      code = value;
      index += 1;
    }
  }
  return {
    json: args.includes("--json"),
    noOpen: args.includes("--no-open"),
    manual: args.includes("--manual") || args.includes("--headless") || args.includes("--no-browser"),
    localCallback: args.includes("--local-callback"),
    printUrl: args.includes("--print-url"),
    code
  };
}

/**
 * Accepts either the full redirect URL copied from the browser address bar or a
 * bare authorization code. The full URL is preferred: it carries `scope`, which
 * lets doctor report granted scopes without another round trip.
 */
export function parsePastedRedirect(input: string, expectedState?: string): string {
  const value = input.trim().replace(/^["']|["']$/g, "");
  if (!value) throw new Error("No authorization code provided.");

  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }

  if (!url) {
    if (/\s/.test(value)) {
      throw new Error("That does not look like an authorization code. Paste the full redirect URL, or just the value of its `code` parameter.");
    }
    return value;
  }

  const error = url.searchParams.get("error");
  if (error) throw new Error(`Google Health authorization failed: ${error}`);
  if (!url.searchParams.get("code")) {
    throw new Error("That URL has no `code` parameter. Copy the whole redirect URL from the browser address bar, including everything after `?`.");
  }
  const state = url.searchParams.get("state");
  if (expectedState && state && state !== expectedState) {
    throw new Error("GOOGLE_HEALTH callback state mismatch. Re-run `google-health-mcp-server auth` and use the newest URL.");
  }
  return value;
}

/**
 * Run the `auth` command: build the authorization URL, pick a flow, and
 * exchange the resulting code. Tokens are written by the client's token store
 * and are never printed or logged.
 *
 * @returns the process exit code (0 on success).
 */
export async function runAuthCommand(args: string[]): Promise<number> {
  const options = parseAuthOptions(args);
  const config = getConfig();
  const client = new GoogleHealthClient(config);
  const state = randomBytes(16).toString("hex");
  const { authUrl, codeVerifier } = await client.authUrl(state);

  // Fully non-interactive: the operator already completed the consent screen.
  if (options.code) {
    return finishAuth(client, parsePastedRedirect(options.code), options.json, codeVerifier);
  }

  if (options.printUrl) {
    console.log(authUrl);
    return 0;
  }

  const headless = detectHeadlessEnvironment();
  const manual = options.manual || (headless.headless && !options.localCallback);

  if (manual) {
    return runManualFlow(client, authUrl, state, options, config.redirectUri, codeVerifier);
  }

  return runLocalCallbackFlow(client, authUrl, state, options, config.redirectUri, headless, codeVerifier);
}

/**
 * Print the authorization URL, then read the redirect back from stdin. Under
 * `--json` the instructions and prompt go to stderr so stdout stays parseable.
 */
async function runManualFlow(
  client: GoogleHealthClient,
  authUrl: string,
  state: string,
  options: AuthOptions,
  redirectUri: string,
  codeVerifier: string
): Promise<number> {
  const out = options.json ? process.stderr : process.stdout;
  const write = (line = "") => out.write(`${line}\n`);

  write("Google Health MCP · Authorization (headless)");
  write();
  write("This machine has no browser, so authorize from any other device:");
  write();
  write("Steps");
  write("  1. Open this URL on a device that has a browser:");
  write();
  write(`     ${authUrl}`);
  write();
  write("  2. Approve access.");
  write(`  3. The browser redirects to ${redirectUri} and shows a connection error.`);
  write("     That is expected — this server is not listening on that device.");
  write("  4. Copy the FULL redirect URL out of the browser address bar.");
  write("  5. Paste it below. Tokens are saved locally; this command never prints them.");
  write();

  const answer = await promptForCode(out);
  return finishAuth(client, parsePastedRedirect(answer, state), options.json, codeVerifier);
}

/**
 * Bind the loopback callback listener and wait for Google to redirect to it.
 * On a host detected as headless this also prints the `ssh -L` tunnel the flow
 * depends on, since the operator opted into it explicitly.
 */
async function runLocalCallbackFlow(
  client: GoogleHealthClient,
  authUrl: string,
  state: string,
  options: AuthOptions,
  redirectUri: string,
  headless: HeadlessDetection,
  codeVerifier: string
): Promise<number> {
  const redirect = parseLocalRedirectUri(redirectUri);
  const timeoutMs = Number(process.env.GOOGLE_HEALTH_AUTH_TIMEOUT_MS ?? 300_000);

  const result = await waitForOAuthCode(redirect, state, timeoutMs, (url) => {
    if (options.json) return;
    console.log("Google Health MCP · Authorization");
    console.log("");
    if (options.noOpen) {
      console.log("Open this URL manually:");
    } else {
      console.log("Opening Google Health authorization in your browser...");
      console.log("If no browser opens, use this URL:");
    }
    console.log(`  ${url}`);
    console.log("");
    if (headless.headless) {
      console.log(`Note: this looks like a headless environment (${headless.reason}).`);
      console.log(`The callback only works if ${redirect.host}:${redirect.port} on this host is`);
      console.log("reachable from the browser, e.g. via:");
      console.log(`  ssh -L ${redirect.port}:${redirect.host}:${redirect.port} <this-host>`);
      console.log("Otherwise cancel and run `google-health-mcp-server auth --manual`.");
      console.log("");
    }
    console.log("Steps");
    console.log("  1. Approve access in the browser.");
    console.log("  2. Google Health will redirect to the local callback.");
    console.log("  3. Tokens are saved locally; this command never prints them.");
    console.log("");
    console.log("Waiting for callback...");
  }, authUrl, !options.noOpen);

  return finishAuth(client, result.code, options.json, codeVerifier);
}

/** Exchange the code for tokens and report where they were saved, never what they are. */
async function finishAuth(client: GoogleHealthClient, input: string, json: boolean, codeVerifier: string): Promise<number> {
  const exchange = await client.exchangeCode(input, codeVerifier);
  const output = {
    ok: true,
    token_path: exchange.token_path,
    expires_at: exchange.expires_at,
    scope: exchange.scope,
    next_step: "Run `google-health-mcp-server doctor`, then add the MCP server to your agent."
  };
  if (json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log("");
    console.log("✓ Google Health connected");
    console.log("");
    console.log(`  Token file:  ${output.token_path}`);
    if (output.scope) console.log(`  Scope:       ${output.scope}`);
    if (output.expires_at) console.log(`  Expires at:  ${output.expires_at}`);
    console.log("");
    console.log(`→ Next: ${output.next_step}`);
  }
  return 0;
}

/**
 * Read one line from stdin. Rejects rather than hanging when stdin closes
 * first, which is how a non-interactive host reaches this prompt.
 */
function promptForCode(output: NodeJS.WritableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
    let answered = false;
    rl.on("close", () => {
      if (!answered) {
        reject(new Error(
          "No authorization code was pasted. For a non-interactive host, re-run with: " +
          "google-health-mcp-server auth --code \"<redirect-url>\""
        ));
      }
    });
    rl.question("Paste the redirect URL (or code): ", (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Serve the callback path until Google redirects to it, then resolve with the
 * full callback URL so the caller can read `code` and `scope` from it.
 * Rejects on `error`, a missing code, a `state` mismatch, or timeout.
 */
function waitForOAuthCode(
  redirect: LocalRedirectPlan,
  expectedState: string,
  timeoutMs: number,
  onReady: (authUrl: string) => Promise<void> | void,
  authUrl: string,
  open: boolean
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for GOOGLE_HEALTH OAuth callback."));
    }, timeoutMs);

    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://${redirect.host}:${redirect.port}`);
        if (requestUrl.pathname !== redirect.path) {
          res.writeHead(404).end("Not found");
          return;
        }
        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        if (error) throw new Error(`Google Health authorization failed: ${error}`);
        if (!code) throw new Error("GOOGLE_HEALTH callback did not include a code.");
        if (state !== expectedState) throw new Error("GOOGLE_HEALTH callback state mismatch.");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(successHtml());
        clearTimeout(timeout);
        server.close();
        resolve({ code: requestUrl.toString() });
      } catch (error) {
        clearTimeout(timeout);
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end((error as Error).message);
        server.close();
        reject(error);
      }
    });

    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(redirect.port, redirect.host, async () => {
      try {
        await onReady(authUrl);
        if (open) openBrowser(authUrl);
      } catch (error) {
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });
  });
}

/**
 * Build the platform's browser-launch command. On Windows the URL is passed
 * via the environment rather than the command line so that `&` in the query
 * string is not treated as a PowerShell statement separator.
 */
export function buildBrowserOpenCommand(url: string, platform: NodeJS.Platform = process.platform): BrowserOpenCommand {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-Command",
        "Start-Process -FilePath $env:GOOGLE_HEALTH_MCP_AUTH_URL"
      ],
      env: {
        ...process.env,
        GOOGLE_HEALTH_MCP_AUTH_URL: url.replace(/\+/g, "%20")
      }
    };
  }

  return {
    command: platform === "darwin" ? "open" : "xdg-open",
    args: [url]
  };
}

/** Best-effort browser launch. Never throws: the URL is always printed too. */
function openBrowser(url: string): void {
  try {
    const browserOpen = buildBrowserOpenCommand(url);
    const child = spawn(browserOpen.command, browserOpen.args, {
      detached: true,
      stdio: "ignore",
      env: browserOpen.env
    });
    // Missing xdg-open/open would otherwise surface as an uncaught ENOENT and
    // kill the command while the callback server is still waiting.
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is always printed, so a failed launch is recoverable by hand.
  }
}

/** Success page rendered in the operator's browser after the callback lands. */
function successHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Google Health connected · Delx Wellness</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 64px 24px; line-height: 1.55; color: #111; background: #fff; }
    @media (prefers-color-scheme: dark) {
      body { color: #e5e7eb; background: #0a0a0a; }
      .lede, .step-label, .footer { color: #9ca3af; }
      code { background: #1f2937; color: #f9fafb; }
    }
    .check { width: 56px; height: 56px; border-radius: 999px; background: #0ea5a3; color: #fff; display: grid; place-items: center; font-size: 28px; font-weight: 600; margin-bottom: 24px; }
    h1 { font-size: 28px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
    .lede { color: #6b7280; margin: 0 0 32px; }
    .step-label { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin: 32px 0 12px; }
    ol { padding-left: 20px; margin: 0 0 24px; }
    li { margin-bottom: 6px; }
    code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.9em; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    .footer { margin-top: 48px; font-size: 13px; color: #9ca3af; }
    .footer a { color: inherit; }
  </style>
</head>
<body>
  <div class="check" aria-hidden="true">&check;</div>
  <h1>Google Health connected</h1>
  <p class="lede">Tokens are saved locally with user-only permissions. Your MCP client never sees them.</p>
  <p class="step-label">What's next</p>
  <ol>
    <li>Switch back to your terminal.</li>
    <li>Run <code>google-health-mcp-server doctor</code> to verify the setup.</li>
    <li>Add the MCP server to your AI client (Claude Desktop, Cursor, Hermes…).</li>
  </ol>
  <p class="footer">You can close this tab.<br>Part of <a href="https://github.com/davidmosiah/delx-wellness">Delx Wellness</a> · local-first wellness MCP connectors.</p>
</body>
</html>`;
}
