import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface as createPromptInterface } from "node:readline/promises";
import { stdin as input, stdout, stderr } from "node:process";
import { getConfig } from "../services/config.js";
import { GoogleHealthClient } from "../services/google-health-client.js";

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

export function parseLocalRedirectUri(value: string): LocalRedirectPlan {
  const url = new URL(value);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname) || !url.port) {
    throw new Error(
      "Automatic auth requires a local redirect URI such as http://127.0.0.1:3000/callback.",
    );
  }
  return {
    host:
      url.hostname === "localhost"
        ? "127.0.0.1"
        : url.hostname.replace(/^\[(.*)\]$/, "$1"),
    port: Number(url.port),
    path: url.pathname || "/callback",
  };
}

export async function runAuthCommand(args: string[]): Promise<number> {
  const noOpen = args.includes("--no-open");
  const json = args.includes("--json");
  const manual = args.includes("--manual");
  const config = getConfig();
  const redirect = parseLocalRedirectUri(config.redirectUri);
  const state = randomBytes(4).toString("hex");
  const client = new GoogleHealthClient(config);
  const authUrl = client.authUrl(state);
  const timeoutMs = Number(
    process.env.GOOGLE_HEALTH_AUTH_TIMEOUT_MS ?? 300_000,
  );
  let result: { code: string };
  if (manual) {
    const promptOutput = json ? stderr : stdout;
    const callbackPrompt = createPromptInterface({
      input,
      output: promptOutput,
    });
    promptOutput.write("Manual authentication required.\n");
    promptOutput.write("Please visit the following URL to authenticate:\n");
    promptOutput.write(`  ${authUrl}\n`);
    try {
      const callbackUrlString = (
        await callbackPrompt.question("Callback URL: ")
      ).trim();
      const callbackUrl = new URL(callbackUrlString);

      // Validate origin matches expected redirect URI
      const expectedUrl = new URL(config.redirectUri);
      if (
        callbackUrl.origin !== expectedUrl.origin ||
        callbackUrl.pathname !== expectedUrl.pathname
      ) {
        throw new Error(
          `Callback URL must match redirect URI: ${config.redirectUri}`,
        );
      }

      // Check for authorization errors
      const error = callbackUrl.searchParams.get("error");
      if (error) {
        throw new Error(`Google Health authorization failed: ${error}`);
      }

      // Validate state parameter (CSRF protection)
      const receivedState = callbackUrl.searchParams.get("state");
      if (receivedState !== state) {
        throw new Error("Google Health callback state mismatch.");
      }

      // Extract and validate code
      const code = callbackUrl.searchParams.get("code");
      if (!code) {
        throw new Error("Google Health callback did not include a code.");
      }

      result = { code };
    } finally {
      callbackPrompt.close();
    }
  } else {
    result = await waitForOAuthCode(
      redirect,
      state,
      timeoutMs,
      async (url) => {
        if (!json) {
          console.log("Google Health MCP · Authorization");
          console.log("");
          if (noOpen) {
            console.log("Open this URL manually:");
            console.log(`  ${url}`);
          } else {
            console.log(
              "Opening Google Health authorization in your browser...",
            );
          }
          console.log("");
          console.log("Steps");
          console.log("  1. Approve access in the browser tab that opens.");
          console.log(
            "  2. Google Health will redirect to the local callback.",
          );
          console.log(
            "  3. Tokens are saved locally; this command never prints them.",
          );
          console.log("");
          console.log("Waiting for callback...");
        }
        if (!noOpen) openBrowser(url);
      },
      authUrl,
    );
  }

  const exchange = await client.exchangeCode(result.code);
  const output = {
    ok: true,
    token_path: exchange.token_path,
    expires_at: exchange.expires_at,
    scope: exchange.scope,
    next_step:
      "Run `google-health-mcp-server doctor`, then add the MCP server to your agent.",
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

function waitForOAuthCode(
  redirect: LocalRedirectPlan,
  expectedState: string,
  timeoutMs: number,
  onReady: (authUrl: string) => Promise<void> | void,
  authUrl: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for GOOGLE_HEALTH OAuth callback."));
    }, timeoutMs);

    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(
          req.url ?? "/",
          `http://${redirect.host}:${redirect.port}`,
        );
        if (requestUrl.pathname !== redirect.path) {
          res.writeHead(404).end("Not found");
          return;
        }
        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        if (error)
          throw new Error(`Google Health authorization failed: ${error}`);
        if (!code)
          throw new Error("GOOGLE_HEALTH callback did not include a code.");
        if (state !== expectedState)
          throw new Error("GOOGLE_HEALTH callback state mismatch.");
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(successHtml());
        clearTimeout(timeout);
        server.close();
        resolve({ code });
      } catch (error) {
        clearTimeout(timeout);
        res
          .writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
          .end((error as Error).message);
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
      } catch (error) {
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });
  });
}

export function buildBrowserOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-Command",
        "Start-Process -FilePath $env:GOOGLE_HEALTH_MCP_AUTH_URL",
      ],
      env: {
        ...process.env,
        GOOGLE_HEALTH_MCP_AUTH_URL: url.replace(/\+/g, "%20"),
      },
    };
  }

  return {
    command: platform === "darwin" ? "open" : "xdg-open",
    args: [url],
  };
}

function openBrowser(url: string): void {
  const browserOpen = buildBrowserOpenCommand(url);
  const child = spawn(browserOpen.command, browserOpen.args, {
    detached: true,
    stdio: "ignore",
    env: browserOpen.env,
  });
  child.unref();
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
