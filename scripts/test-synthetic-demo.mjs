// Drives shipped CLI demo + synthetic-demo service (OAuth-free).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { buildSyntheticDemoPayload } from "../dist/services/synthetic-demo.js";

const payload = buildSyntheticDemoPayload("2026-07-30");
assert.equal(payload.is_demo, true);
assert.equal(payload.ok, true);
assert.equal(payload.sample.google_health_daily_summary.date, "2026-07-30");
assert.equal(payload.sample.google_health_daily_summary.activity.steps, 9180);
assert.ok(payload.notes.some((n) => /synthetic/i.test(n)));

const cli = spawnSync(process.execPath, ["dist/index.js", "demo"], {
  encoding: "utf8",
  env: process.env,
});
assert.equal(cli.status, 0, `demo CLI failed: ${cli.stderr}`);
const fromCli = JSON.parse(cli.stdout);
assert.equal(fromCli.is_demo, true);
assert.equal(fromCli.ok, true);
assert.ok(fromCli.sample?.google_health_daily_summary?.activity?.steps === 9180);

console.log(JSON.stringify({ ok: true, suite: "synthetic-demo", is_demo: true }, null, 2));
