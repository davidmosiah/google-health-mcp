import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const vendor = 'google_health';
const prefix = vendor.toUpperCase();
const home = mkdtempSync(join(tmpdir(), vendor + '-input-limits-'));
// No provider credentials or caller HOME/config are inherited.
const env = {
  PATH: process.env.PATH ?? '',
  ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot ?? '' } : {}),
  HOME: home, USERPROFILE: home,
  [prefix + '_TOKEN_PATH']: join(home, 'tokens.json'),
  [prefix + '_CACHE_PATH']: join(home, 'cache.sqlite')
};
const tool = vendor + '_data_inventory';
async function assertRejected(client, args) {
  let result;
  let callError;
  try {
    result = await client.callTool({ name: tool, arguments: args });
  } catch (error) {
    callError = error;
  }
  // Assertions must stay outside the catch: never mistake our own assertion
  // failure (which prints the expected regexp) for an SDK rejection.
  if (callError !== undefined) {
    assert.match(String(callError), /maximum of 10000 elements/);
  } else {
    assert.equal(result?.isError, true, 'oversized arguments must be rejected before tool input-schema processing');
    assert.match(JSON.stringify(result), /maximum of 10000 elements/);
  }
}
// Regression guard for the assertion helper itself: unrelated errors must fail.
await assert.rejects(() => assertRejected({ callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'invalid schema' }] }) }, {}));
await assert.rejects(() => assertRejected({ callTool: async () => { throw new Error('unrelated failure'); } }, {}));
await assert.rejects(() => assertRejected({ callTool: async () => ({ content: [] }) }, {}));
async function checkToolLimit(client) {
  const good = await client.callTool({ name: tool, arguments: { response_format: 'json' } });
  assert.notEqual(good.isError, true);
  // Object members + array elements: 2 + 9998 = 10000, exactly at the ceiling.
  const boundary = await client.callTool({
    name: tool, arguments: { response_format: 'json', padding: Array(9998).fill(0) }
  });
  assert.notEqual(boundary.isError, true, 'ordinary and boundary-size input remain supported');
  await assertRejected(client, { response_format: 'json', padding: Array(9999).fill(0) });
  const wide = Object.fromEntries(Array.from({ length: 10001 }, (_, i) => ['k' + i, 0]));
  await assertRejected(client, wide);
  await assertRejected(client, { padding: { nested: Array(10001).fill(0) } });
  const recovered = await client.callTool({ name: tool, arguments: { response_format: 'json' } });
  assert.notEqual(recovered.isError, true, 'server remains usable after rejection');
}
async function unusedPort() {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
let child;
let httpClient;
const stdioClient = new Client({ name: vendor + '-input-limit-test', version: '0.0.0' });
try {
  await stdioClient.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], env }));
  await checkToolLimit(stdioClient);
  await stdioClient.close();

  const port = await unusedPort();
  let stderr = '';
  child = spawn(process.execPath, ['dist/index.js', '--http'], {
    env: { ...env, [prefix + '_MCP_HOST']: '127.0.0.1', [prefix + '_MCP_PORT']: String(port) },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const origin = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'HTTP server must start: ' + stderr);
  httpClient = new Client({ name: vendor + '-http-limit-test', version: '0.0.0' });
  await httpClient.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp')));
  await checkToolLimit(httpClient);
  const post = (body, extra = {}) => fetch(origin + '/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extra },
    body, signal: AbortSignal.timeout(5000)
  });
  const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]]) {
    const compressed = compress(Buffer.from(request));
    for (const payload of [compressed, Buffer.concat([compressed, Buffer.from('trailing-bytes')])]) {
      const response = await post(payload, { 'Content-Encoding': encoding });
      assert.equal(response.status, 415, 'compressed requests are unsupported, including trailing bytes: ' + encoding);
      await response.text();
    }
  }
  const utf16 = await post(Buffer.from(request, 'utf16le'), {
    'Content-Type': 'application/json; charset=utf-16le',
    Accept: 'application/json, text/event-stream'
  });
  assert.equal(utf16.status, 200, 'uncompressed UTF-16 JSON remains supported');
  await utf16.text();
  const large = await post(JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }));
  assert.equal(large.status, 413, 'HTTP byte limit remains 1 MiB');
  await large.text();
  const invalid = await post('{');
  assert.equal(invalid.status, 400);
  await invalid.text();
  const health = await fetch(origin + '/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200, 'malformed/oversized bodies must not crash the process');
  const final = await httpClient.callTool({ name: tool, arguments: { response_format: 'json' } });
  assert.notEqual(final.isError, true);
  console.log(JSON.stringify({ ok: true, suite: 'input-limits', transports: ['stdio', 'http'], max_elements: 10000, max_http_bytes: 1048576, compression: 'rejected' }));
} finally {
  await stdioClient.close().catch(() => {});
  await httpClient?.close().catch(() => {});
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 2000).unref(); });
  }
  rmSync(home, { recursive: true, force: true });
}
