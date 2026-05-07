import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function userPrompt(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerGoogleHealthPrompts(server: McpServer): void {
  server.registerPrompt("google_health_daily_checkin", {
    title: "Google Health Daily Check-in",
    description: "Ask an agent to create a practical daily health and training check-in from Google Health.",
    argsSchema: { focus: z.string().optional().describe("Optional focus, e.g. sleep, training, recovery, weight, nutrition.") }
  }, ({ focus }) => userPrompt(`Use Google Health MCP for a daily check-in${focus ? ` focused on ${focus}` : ""}.

Required flow:
1. Call google_health_connection_status.
2. If ready, call google_health_daily_summary with response_format=json.
3. Only drill into low-level tools if the summary shows a concrete question.

Return:
- main signal
- what changed or needs attention
- 3 practical actions for today
- confidence and missing data
- no medical diagnosis.`));

  server.registerPrompt("google_health_weekly_review", {
    title: "Google Health Weekly Review",
    description: "Ask an agent to review Google Health trends across activity, sleep and heart context.",
    argsSchema: { goal: z.string().optional().describe("Optional goal, e.g. fat loss, tennis conditioning, endurance base, sleep repair.") }
  }, ({ goal }) => userPrompt(`Use Google Health MCP for a weekly review${goal ? ` for this goal: ${goal}` : ""}.

Required flow:
1. Call google_health_connection_status.
2. Call google_health_weekly_summary with response_format=json.
3. Use google_health_reconcile_data_points or google_health_daily_rollup only to investigate specific bottlenecks.

Return:
- scorecard
- bottlenecks
- next-week actions
- risks/unknowns
- no medical diagnosis.`));

  server.registerPrompt("google_health_data_type_investigation", {
    title: "Google Health Data Type Investigation",
    description: "Investigate one Google Health data type using list, reconcile and rollup methods.",
    argsSchema: { data_type: z.string().describe("Google Health data type, e.g. steps, sleep, heart-rate"), date: z.string().describe("yyyy-MM-dd or today") }
  }, ({ data_type, date }) => userPrompt(`Investigate Google Health data_type=${data_type} for date=${date}.

Required flow:
1. Call google_health_data_inventory.
2. Use google_health_reconcile_data_points for detailed records when the data type supports reconcile.
3. Use google_health_daily_rollup when the data type supports daily aggregation.

Explain:
- what the data can and cannot prove
- notable periods or missing data
- whether follow-up should use identity/profile/settings or another data type
- no diagnosis or alarmism.`));
}
