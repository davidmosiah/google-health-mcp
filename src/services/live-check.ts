import { getConfig } from "./config.js";
import type { ConnectionStatus } from "./connection-status.js";
import { GoogleHealthClient } from "./google-health-client.js";
import { buildNutritionDataPointBody } from "./google-v4-nutrition-datapoint.js";
import { redactErrorMessage } from "./redaction.js";

export interface LiveCheckResult {
  requested: true;
  api_reachable: boolean;
  skipped?: string;
  checks: {
    identity: LiveEndpointCheck;
    profile: LiveEndpointCheck;
    settings: LiveEndpointCheck;
    // Synthetic write-path checks (never flip api_reachable, which is read-only-derived).
    nutrition_write_scope: LiveEndpointCheck;
    nutrition_write_dry_run: LiveEndpointCheck;
  };
}

export interface LiveEndpointCheck {
  ok: boolean;
  error?: string;
}

export async function runLiveCheck(status: ConnectionStatus, homeDir?: string, liveWrite = false): Promise<LiveCheckResult> {
  const emptyChecks = {
    identity: { ok: false },
    profile: { ok: false },
    settings: { ok: false },
    nutrition_write_scope: { ok: false },
    nutrition_write_dry_run: { ok: false }
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
  const readChecks = {
    identity: await safeCheck(() => client.getIdentity()),
    profile: await safeCheck(() => client.getProfile()),
    settings: await safeCheck(() => client.getSettings())
  };

  const scopeGranted = status.oauth.nutrition_write_ready === true;
  const checks = {
    ...readChecks,
    // Pure, no network: is the opt-in nutrition write scope granted?
    nutrition_write_scope: scopeGranted ? { ok: true } : { ok: false, error: "nutrition write scope not granted" },
    nutrition_write_dry_run: buildNutritionDryRunCheck(scopeGranted, liveWrite)
  };
  return {
    requested: true,
    // Computed from the READ checks only — synthetic write checks must not flip reachability.
    api_reachable: Object.values(readChecks).some((check) => check.ok),
    checks
  };
}

// Dry-run write check. NEVER POSTs.
//   - liveWrite === false: a plain `doctor --live` does not exercise the write path. We report
//     ok:true if the scope is present (the write rail is ready), else a skip-style message.
//   - liveWrite === true: build the canonical v4 body from a fixed deterministic sample
//     (100g banana) and validate its shape, then STOP before POST. (TO-VERIFY: a real POST is
//     only safe once Google exposes a validateOnly param — see google-v4-nutrition-datapoint.ts.)
function buildNutritionDryRunCheck(scopeGranted: boolean, liveWrite: boolean): LiveEndpointCheck {
  if (!liveWrite) {
    return scopeGranted ? { ok: true } : { ok: false, error: "dry-run not requested (use --live-write)" };
  }
  if (!scopeGranted) {
    return { ok: false, error: "nutrition write scope not granted" };
  }
  try {
    // Deterministic sample: 100g banana per-100g values (matches nutrition-normalize defaults).
    const body = buildNutritionDataPointBody({
      nutrients: { calories_kcal: 89, protein_g: 1.09, carbohydrates_g: 22.84, fat_g: 0.33, fiber_g: 2.6, sugar_g: 12.23 },
      food_name: "banana",
      meal_type: "snack"
    });
    const valid = body && typeof body === "object" && typeof (body as Record<string, unknown>).dataPoint === "object";
    // STOP before POST. The body is validated, never sent.
    return valid ? { ok: true, error: "dry-run only — validated v4 body, no POST (envelope TO-VERIFY)" } : { ok: false, error: "v4 body validation failed" };
  } catch (error) {
    return { ok: false, error: redactErrorMessage((error as Error).message) };
  }
}

async function safeCheck(fn: () => Promise<unknown>): Promise<LiveEndpointCheck> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: redactErrorMessage((error as Error).message) };
  }
}
