import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getLocalConfigPath, readLocalConfig } from "./local-config.js";

export interface LocalFixResult {
  fixes_applied: string[];
  warnings: string[];
}

export function fixLocalSetup(homeDir: string): LocalFixResult {
  const result: LocalFixResult = { fixes_applied: [], warnings: [] };
  if (process.platform === "win32") {
    result.warnings.push("Permission auto-fix is skipped on Windows because ACLs are not represented as chmod 600.");
    return result;
  }

  const local = readLocalConfig(homeDir);
  const tokenPath = local.values.GOOGLE_HEALTH_TOKEN_PATH ?? join(homeDir, ".google-health-mcp", "tokens.json");
  for (const path of [
    getLocalConfigPath(homeDir),
    tokenPath
  ]) {
    if (!existsSync(path)) continue;
    chmodSync(path, 0o600);
    result.fixes_applied.push(`chmod 600 ${path}`);
  }

  return result;
}
