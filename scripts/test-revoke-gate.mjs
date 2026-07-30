import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const homeDir = mkdtempSync(join(tmpdir(), "gh-revoke-gate-"));
const client = new Client({ name: "revoke-gate-test", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, HOME: homeDir },
});
await client.connect(transport);
try {
  const omit = await client.callTool({
    name: "google_health_revoke_access",
    arguments: { response_format: "json" },
  });
  const omitText = JSON.stringify(omit) + (omit.content?.map((c) => c.text || "").join("") || "");
  assert.match(omitText, /USER_ACTION_REQUIRED|explicit_user_intent/i);
  console.log(JSON.stringify({ ok: true, suite: "revoke-gate" }, null, 2));
} finally {
  await client.close();
}
