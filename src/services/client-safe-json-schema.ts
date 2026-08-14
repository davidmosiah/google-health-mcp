import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

/**
 * Claude Desktop (and other 2020-12-only validators) reject tools/list when
 * outputSchema/$schema is JSON Schema draft-07.
 *
 * @modelcontextprotocol/sdk 1.29–1.30 still convert Zod via toJsonSchemaCompat
 * with no target, which defaults to draft-07. registerTool only accepts Zod,
 * so we cannot pre-emit 2020-12 at registration time. Rewrite the listed
 * schemas after the SDK conversion instead.
 *
 * Tracked: https://github.com/davidmosiah/google-health-mcp/issues/23
 */

export const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";

const DRAFT_07_MARKERS = [
  "json-schema.org/draft-07/schema",
  "json-schema.org/draft/07/schema"
];

type JsonSchemaObject = Record<string, unknown>;

export function isDraft07SchemaId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase();
  return DRAFT_07_MARKERS.some((marker) => normalized.includes(marker));
}

export function sanitizeClientJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }
  const next: JsonSchemaObject = { ...(schema as JsonSchemaObject) };
  if (isDraft07SchemaId(next.$schema)) {
    next.$schema = JSON_SCHEMA_2020_12;
  }
  return next;
}

function sanitizeListedTool(tool: Record<string, unknown>): Record<string, unknown> {
  const next = { ...tool };
  if ("inputSchema" in next) {
    next.inputSchema = sanitizeClientJsonSchema(next.inputSchema);
  }
  if ("outputSchema" in next) {
    next.outputSchema = sanitizeClientJsonSchema(next.outputSchema);
  }
  return next;
}

type ToolsListResult = { tools?: Array<Record<string, unknown>> };

/**
 * Wrap tools/list so Claude Desktop can invoke tools. Call once after
 * registerTool. Does not change runtime validation of tool results.
 */
export function installClientSafeToolSchemas(server: McpServer): void {
  const proto = server.server as unknown as {
    _requestHandlers: Map<string, (request: unknown, extra: unknown) => unknown>;
    setRequestHandler: (
      schema: typeof ListToolsRequestSchema,
      handler: (request: unknown, extra: unknown) => unknown
    ) => void;
  };

  const original = proto._requestHandlers.get("tools/list");
  if (!original) {
    throw new Error("tools/list handler missing; call installClientSafeToolSchemas after registerTool");
  }

  proto.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const result = (await original(request, extra)) as ToolsListResult;
    return {
      ...result,
      tools: (result.tools ?? []).map(sanitizeListedTool)
    };
  });
}
