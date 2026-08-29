import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.ok(Array.isArray(pkg.files) && pkg.files.includes("skill"), "package.json files must include skill/");
assert.equal(existsSync(join(root, "skill/SKILL.md")), true);
const skill = readFileSync(join(root, "skill/SKILL.md"), "utf8");
assert.doesNotMatch(skill, /^[A-Z][A-Z0-9_]*_ALLOW_MUTATIONS\s*=\s*true$/m);
assert.match(skill, /call google_health_connection_status/);

for (const rel of ["README.md", "llms.txt", "examples/claude-desktop.json", "examples/hermes.md", "examples/grok-bot.md"]) {
  const path = join(root, rel);
  if (!existsSync(path)) continue;
  assert.doesNotMatch(readFileSync(path, "utf8"), /^[A-Z][A-Z0-9_]*_ALLOW_MUTATIONS\s*=\s*true$/m, rel);
}

const binCandidates = [join(root, "dist/index.js"), join(root, "src/index.js")];
const bin = binCandidates.find((p) => existsSync(p));
assert.ok(bin, "built or source entry missing");

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const result = await run(["call", "google_health_connection_status", "--json", "{}"]);
assert.equal(result.code === 0 || result.code === 1, true, result.stderr);
assert.ok(result.stdout.trim().startsWith("{") || result.stdout.trim().startsWith("["), result.stdout + result.stderr);
JSON.parse(result.stdout);

const unknown = await run(["call", "not_a_real_tool_name"]);
assert.equal(unknown.code, 1);

console.log(JSON.stringify({ ok: true, suite: "skill-surface", tool: "google_health_connection_status", files: pkg.files }, null, 2));
