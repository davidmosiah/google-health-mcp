// Shared remote-write precondition gate for opt-in mutating tools (nutrition logging, etc.).
//
// SEAM: the community log_nutrition tool calls checkRemoteWriteGate() first, then
// isLiveWriteAuthorized() to decide dry-run vs POST. See the seam comment at the end of
// registerGoogleHealthTools() in src/tools/google-health-tools.ts.
//
// This module intentionally has ZERO new dependencies — it imports only format.ts + types.ts +
// the single-source-of-truth write-scope constant from constants.ts. No tool is registered here.

import { GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE } from "../constants.js";
import type { ResponseFormat } from "../types.js";
import { bulletList, makeResponse } from "./format.js";

// Re-export the single source of truth so callers/tests reference one symbol.
export { GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE };

export interface WriteGateInput {
  /** Must be true to persist a live write. Undefined/false → refusal. */
  explicit_user_intent?: boolean;
  /**
   * Defaults to TRUE at the schema layer (see LogNutritionInputSchema). The gate treats
   * dry_run === undefined as true (safe default) so direct callers cannot accidentally
   * opt into a live write.
   */
  dry_run?: boolean;
  /** Granted OAuth scopes, e.g. from connection-status oauth.granted_scopes. */
  granted_scopes?: string[];
  /** Defaults to GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE. */
  required_scope?: string;
}

export interface WriteGateContext {
  response_format: ResponseFormat;
  /** Markdown title, e.g. "Log Nutrition". */
  title: string;
}

/** The success-shaped refusal payload (mirrors google_health_profile_update). */
export interface WriteGateRefusal {
  ok: false;
  error: string;
  message: string;
}

/**
 * Enforce the remote-write preconditions. Returns a refusal ToolResponse if any precondition
 * fails, else null (caller proceeds). Refusals are SUCCESS-shaped (makeResponse, NOT makeError),
 * byte-identical in pattern to google_health_profile_update so agents get a structured
 * USER_ACTION_REQUIRED rather than an isError tool failure.
 *
 * Precedence:
 *   1. Missing write scope → WRITE_SCOPE_MISSING (hard capability gate, checked first).
 *   2. explicit_user_intent !== true → USER_ACTION_REQUIRED.
 *   3. All pass → null.
 *
 * dry_run is NOT a refusal here — it is a success path the caller branches on via
 * isLiveWriteAuthorized().
 */
export function checkRemoteWriteGate(
  input: WriteGateInput,
  ctx: WriteGateContext
): ReturnType<typeof makeResponse<WriteGateRefusal>> | null {
  const requiredScope = input.required_scope ?? GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE;
  const granted = new Set(input.granted_scopes ?? []);

  // 1. Hard capability gate: the write scope must be present (set membership; only the
  //    non-.readonly write scope is accepted).
  if (!granted.has(requiredScope)) {
    return makeResponse<WriteGateRefusal>(
      {
        ok: false,
        error: "WRITE_SCOPE_MISSING",
        message: `Remote write requires the ${requiredScope} OAuth scope. Re-authorize with the nutrition-write preset.`
      },
      ctx.response_format,
      bulletList(ctx.title, {
        ok: false,
        error: "WRITE_SCOPE_MISSING",
        hint: "Re-authorize with `google-health-mcp-server auth --scope-preset nutrition-write` to grant the write scope."
      })
    );
  }

  // 2. Explicit user intent.
  if (input.explicit_user_intent !== true) {
    return makeResponse<WriteGateRefusal>(
      {
        ok: false,
        error: "USER_ACTION_REQUIRED",
        message: "Nutrition write requires explicit_user_intent=true. Confirm with the user before persisting."
      },
      ctx.response_format,
      bulletList(ctx.title, {
        ok: false,
        error: "USER_ACTION_REQUIRED",
        hint: "Set explicit_user_intent=true once the user has confirmed."
      })
    );
  }

  return null;
}

/**
 * True only when a live mutation is authorized:
 *   dry_run !== true  AND  explicit_user_intent === true  AND  write scope present.
 *
 * dry_run === undefined is treated as TRUE (safe default), so an undefined dry_run never yields
 * a live write. Callers MUST still run checkRemoteWriteGate() first — this is the post-gate
 * branch used to decide whether to POST or return the dry-run body.
 */
export function isLiveWriteAuthorized(input: WriteGateInput): boolean {
  const requiredScope = input.required_scope ?? GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE;
  const scopePresent = (input.granted_scopes ?? []).includes(requiredScope);
  const dryRun = input.dry_run ?? true;
  return dryRun !== true && input.explicit_user_intent === true && scopePresent;
}
