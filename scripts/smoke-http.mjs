import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

const port = String(43000 + Math.floor(Math.random() * 1000));
const healthCheckAttempts = 100;
const healthCheckDelayMs = 200;
const child = spawn(process.execPath, ['dist/index.js', '--http'], {
  env: { ...process.env, GOOGLE_HEALTH_MCP_PORT: port, GOOGLE_HEALTH_MCP_HOST: '127.0.0.1' },
  stdio: ['ignore', 'ignore', 'pipe']
});

let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode, data: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('HTTP health check timed out')));
    request.on('error', reject);
  });
}

try {
  let ok = false;
  for (let i = 0; i < healthCheckAttempts; i += 1) {
    try {
      const { statusCode, data } = await getJson(`http://127.0.0.1:${port}/health`);
      assert.equal(statusCode, 200);
      assert.equal(data.ok, true);
      ok = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, healthCheckDelayMs));
    }
  }
  if (!ok) throw new Error(`HTTP server did not become healthy. stderr=${stderr}`);
  console.log(JSON.stringify({ ok: true, transport: 'http', port: Number(port) }, null, 2));
} finally {
  child.kill('SIGTERM');
}
