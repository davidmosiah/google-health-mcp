import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedTools = [
  'google_health_agent_manifest', 'google_health_cache_status', 'google_health_capabilities', 'google_health_connection_status',
  'google_health_data_type_coverage',
  'google_health_daily_rollup', 'google_health_daily_summary', 'google_health_data_inventory', 'google_health_demo',
  'google_health_exchange_code', 'google_health_get_auth_url', 'google_health_get_identity', 'google_health_get_profile',
  'google_health_get_settings', 'google_health_list_data_points', 'google_health_list_data_types', 'google_health_onboarding',
  'google_health_privacy_audit', 'google_health_profile_get', 'google_health_profile_update', 'google_health_quickstart',
  'google_health_reconcile_data_points', 'google_health_revoke_access', 'google_health_rollup',
  'google_health_weekly_summary', 'google_health_wellness_context'
];

const expectedResources = [
  'google-health://agent-manifest', 'google-health://capabilities', 'google-health://inventory', 'google-health://latest/steps',
  'google-health://profile', 'google-health://summary/daily', 'google-health://summary/weekly'
];
const expectedPrompts = ['google_health_daily_checkin', 'google_health_data_type_investigation', 'google_health_weekly_review'];

const client = new Client({ name: 'google-health-mcp-smoke-test', version: '0.0.0' });
const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
await client.connect(transport);
try {
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, expectedTools.sort());

  const resources = await client.listResources();
  const resourceUris = resources.resources.map((resource) => resource.uri).sort();
  assert.deepEqual(resourceUris, expectedResources.sort());

  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map((prompt) => prompt.name).sort();
  assert.deepEqual(promptNames, expectedPrompts.sort());

  const prompt = await client.getPrompt({ name: 'google_health_daily_checkin', arguments: { focus: 'sleep' } });
  assert.ok(prompt.messages[0]?.content?.type === 'text');

  const auditResult = await client.callTool({ name: 'google_health_privacy_audit', arguments: { response_format: 'json' } });
  assert.equal(auditResult.structuredContent?.unofficial, true);
  assert.ok(auditResult.structuredContent?.secret_env_vars?.includes('GOOGLE_HEALTH_CLIENT_SECRET'));

  const capabilitiesResult = await client.callTool({ name: 'google_health_capabilities', arguments: { response_format: 'json' } });
  assert.equal(capabilitiesResult.structuredContent?.unofficial, true);
  assert.ok(capabilitiesResult.structuredContent?.api_boundary?.does_not_include?.includes('raw accelerometer/device telemetry'));
  assert.ok(capabilitiesResult.structuredContent?.recommended_agent_flow?.some((step) => step.includes('google_health_connection_status')));

  const inventoryResult = await client.callTool({ name: 'google_health_data_inventory', arguments: { response_format: 'json' } });
  assert.equal(inventoryResult.structuredContent?.kind, 'data_inventory');
  assert.equal(typeof inventoryResult.structuredContent?.source, 'string');

  const coverageResult = await client.callTool({ name: 'google_health_data_type_coverage', arguments: { response_format: 'json' } });
  assert.equal(coverageResult.structuredContent?.kind, 'data_type_coverage');
  assert.equal(coverageResult.structuredContent?.mode, 'plan');
  assert.ok(coverageResult.structuredContent?.totals?.data_types >= 30);

  const manifestResult = await client.callTool({ name: 'google_health_agent_manifest', arguments: { client: 'hermes', response_format: 'json' } });
  assert.equal(manifestResult.structuredContent?.client, 'hermes');
  assert.ok(manifestResult.structuredContent?.hermes?.common_tool_names?.includes('mcp_google_health_google_health_connection_status'));
  assert.equal(manifestResult.structuredContent?.hermes?.no_gateway_restart_for_data_access, true);

  const statusResult = await client.callTool({ name: 'google_health_connection_status', arguments: { client: 'hermes', response_format: 'json' } });
  assert.equal(statusResult.structuredContent?.ok, false);
  assert.ok(statusResult.structuredContent?.missing_env?.includes('GOOGLE_HEALTH_CLIENT_ID'));
  assert.equal(statusResult.structuredContent?.client, 'hermes');

  console.log(JSON.stringify({ ok: true, tools: toolNames.length, resources: resourceUris.length, prompts: promptNames.length }, null, 2));
} finally {
  await client.close();
}
