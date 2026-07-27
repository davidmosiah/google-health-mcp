import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { getConfig } from "../services/config.js";
import { GoogleHealthClient } from "../services/google-health-client.js";
import { detectHeadlessEnvironment, type HeadlessDetection } from "../services/headless.js";

export { detectHeadlessEnvironment, type HeadlessDetection };

export interface LocalRedirectPlan {
  host: string;
  port: number;
  path: string;
}

export interface BrowserOpenCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface AuthOptions {
  json: boolean;
  noOpen: boolean;
  manual: boolean;
  localCallback: boolean;
  printUrl: boolean;
  code?: string;
}

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

export async function runAuthCommand(args: string[]): Promise<number> {
  const options = parseAuthOptions(args);
  const config = getConfig();
  const client = new GoogleHealthClient(config);
  const state = randomBytes(4).toString("hex");
  const authUrl = client.authUrl(state);

  // Fully non-interactive: the operator already completed the consent screen.
  if (options.code) {
    return finishAuth(client, parsePastedRedirect(options.code), options.json);
  }

  if (options.printUrl) {
    console.log(authUrl);
    return 0;
  }

  const headless = detectHeadlessEnvironment();
  const manual = options.manual || (headless.headless && !options.localCallback);

  if (manual) {
    return runManualFlow(client, authUrl, state, options, config.redirectUri);
  }

  return runLocalCallbackFlow(client, authUrl, state, options, config.redirectUri, headless);
}

async function runManualFlow(
  client: GoogleHealthClient,
  authUrl: string,
  state: string,
  options: AuthOptions,
  redirectUri: string
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
  return finishAuth(client, parsePastedRedirect(answer, state), options.json);
}

async function runLocalCallbackFlow(
  client: GoogleHealthClient,
  authUrl: string,
  state: string,
  options: AuthOptions,
  redirectUri: string,
  headless: HeadlessDetection
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

  return finishAuth(client, result.code, options.json);
}

async function finishAuth(client: GoogleHealthClient, input: string, json: boolean): Promise<number> {
  const exchange = await client.exchangeCode(input);
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
