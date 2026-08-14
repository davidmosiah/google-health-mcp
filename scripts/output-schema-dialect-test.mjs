/**
 * Claude Desktop rejects tools/list when outputSchema.$schema is draft-07
 * (google-health-mcp#23). This suite proves the listed schemas are 2020-12
 * (or have no $schema) for every tool, including connection_status.
 */
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  isDraft07SchemaId,
  JSON_SCHEMA_2020_12,
  sanitizeClientJsonSchema
} from "../dist/services/client-safe-json-schema.js";

assert.equal(isDraft07SchemaId("http://json-schema.org/draft-07/schema#"), true);
assert.equal(isDraft07SchemaId(JSON_SCHEMA_2020_12), false);
assert.equal(
  sanitizeClientJsonSchema({ $schema: "http://json-schema.org/draft-07/schema#", type: "object" }).$schema,
  JSON_SCHEMA_2020_12
);
assert.equal(sanitizeClientJsonSchema({ type: "object" }).$schema, undefined);

const client = new Client({ name: "google-health-output-schema-dialect-test", version: "0.0.0" });
const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
await client.connect(transport);

try {
  const listed = await client.listTools();
  assert.ok(listed.tools.length > 0, "expected registered tools");

  const draft07 = [];
  for (const tool of listed.tools) {
    for (const field of ["inputSchema", "outputSchema"]) {
      const schema = tool[field];
      if (!schema || typeof schema !== "object") continue;
      const dialect = schema.$schema;
      if (isDraft07SchemaId(dialect)) {
        draft07.push(`${tool.name}.${field}=${dialect}`);
      }
      if (typeof dialect === "string" && dialect.length > 0) {
        assert.equal(
          dialect,
          JSON_SCHEMA_2020_12,
          `${tool.name}.${field} must advertise 2020-12, got ${dialect}`
        );
      }
    }
  }

  assert.equal(draft07.length, 0, `draft-07 leaked to tools/list:\n${draft07.join("\n")}`);

  const status = listed.tools.find((tool) => tool.name === "google_health_connection_status");
  assert.ok(status?.outputSchema, "connection_status must keep an outputSchema");
  assert.notEqual(status.outputSchema.$schema, "http://json-schema.org/draft-07/schema#");

  console.log(JSON.stringify({
    ok: true,
    suite: "output-schema-dialect",
    tools: listed.tools.length,
    output_schemas: listed.tools.filter((tool) => tool.outputSchema).length
  }));
} finally {
  await client.close();
}
