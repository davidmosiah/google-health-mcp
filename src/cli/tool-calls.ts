import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "../constants.js";
import { registerGoogleHealthTools } from "../tools/google-health-tools.js";

type CallResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type?: string; text?: string }>;
};

type CallFn = (args: Record<string, unknown>) => Promise<CallResult>;

export function getToolCalls(): Record<string, CallFn> {
  const server = new McpServer({ name: `${SERVER_NAME}-cli`, version: SERVER_VERSION });
  registerGoogleHealthTools(server);
  const registered = (
    server as unknown as { _registeredTools: Record<string, { handler: CallFn }> }
  )._registeredTools;
  const map: Record<string, CallFn> = {};
  for (const [name, tool] of Object.entries(registered)) {
    map[name] = (args) => tool.handler(args);
  }
  return map;
}

export async function runToolCall(args: string[]): Promise<number> {
  const calls = getToolCalls();
  const name = args[0];
  if (!name || name.startsWith("-")) {
    console.error(`Usage: google-health-mcp-unofficial call <tool> [--json '{...}']`);
    console.error(`Tools: ${Object.keys(calls).join(", ")}`);
    return 1;
  }
  const fn = calls[name];
  if (!fn) {
    console.error(`Unknown tool: ${name}`);
    console.error(`Tools: ${Object.keys(calls).join(", ")}`);
    return 1;
  }
  const jsonIdx = args.indexOf("--json");
  let input: Record<string, unknown> = {};
  if (jsonIdx >= 0) {
    const raw = args[jsonIdx + 1];
    if (!raw) {
      console.error("--json requires an object string");
      return 1;
    }
    input = JSON.parse(raw) as Record<string, unknown>;
  }
  const result = await fn(input);
  const payload = result.structuredContent ?? result.content ?? result;
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return result.isError ? 1 : 0;
}
