import { getConfig } from "./config.js";
import type { ConnectionStatus } from "./connection-status.js";
import { GoogleHealthClient } from "./google-health-client.js";
import { redactErrorMessage } from "./redaction.js";

export interface LiveCheckResult {
  requested: true;
  api_reachable: boolean;
  skipped?: string;
  checks: {
    identity: LiveEndpointCheck;
    profile: LiveEndpointCheck;
    settings: LiveEndpointCheck;
  };
}

export interface LiveEndpointCheck {
  ok: boolean;
  error?: string;
}

export async function runLiveCheck(status: ConnectionStatus, homeDir?: string): Promise<LiveCheckResult> {
  const emptyChecks = {
    identity: { ok: false },
    profile: { ok: false },
    settings: { ok: false }
  };
  if (!status.ready_for_google_health_api) {
    return {
      requested: true,
      api_reachable: false,
      skipped: "Local setup is not ready. Run `google-health-mcp-server doctor --fix`, then `google-health-mcp-server auth`.",
      checks: emptyChecks
    };
  }

  const client = new GoogleHealthClient(getConfig({ homeDir }));
  const checks = {
    identity: await safeCheck(() => client.getIdentity()),
    profile: await safeCheck(() => client.getProfile()),
    settings: await safeCheck(() => client.getSettings())
  };
  return {
    requested: true,
    api_reachable: Object.values(checks).some((check) => check.ok),
    checks
  };
}

async function safeCheck(fn: () => Promise<unknown>): Promise<LiveEndpointCheck> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: redactErrorMessage((error as Error).message) };
  }
}
