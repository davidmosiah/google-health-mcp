import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localHttpHost, formatLocalHttpOrigin } from '../dist/services/local-http-host.js';
const HOST_ENV = 'GOOGLE_HEALTH_MCP_HOST', PORT_ENV = 'GOOGLE_HEALTH_MCP_PORT';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const errorText = 'Unauthenticated HTTP transport requires loopback.';
const rejected = ['', '0.0.0.0', '::', 'example.invalid', '192.0.2.1', '127.1', '2130706433', '0177.0.0.1', '0x7f000001', '::ffff:127.0.0.1', '[::1]', '::1%lo', 'http://127.0.0.1', 'localhost.', ' localhost', 'localhost\n'];
for (const [input, output] of [[undefined,'127.0.0.1'],['127.0.0.1','127.0.0.1'],['::1','::1'],['localhost','127.0.0.1'],['LOCALHOST','127.0.0.1']]) assert.equal(localHttpHost(input), output);
for (const value of rejected) assert.throws(() => localHttpHost(value), {message: /Unauthenticated HTTP transport requires loopback/});
for (const host of ['127.0.0.1', '::1', 'localhost']) { const url = new URL(formatLocalHttpOrigin(host, 12345)); assert.equal(url.port, '12345'); assert.equal(url.hostname, host === '::1' ? '[::1]' : host); }
const root = await mkdtemp(join(tmpdir(), 'http-local-only-'));
const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, NO_PROXY: '*', NOURISH_FIXTURE_MODE: 'true' };
// This trap proves rejection precedes listen and keeps negative-control runs safe.
const trap = join(root, 'deny-listen.mjs');
await writeFile(trap, "import { Server } from 'node:net'; Server.prototype.listen = function(){ throw new Error('UNEXPECTED_LISTEN_REACHED'); };\n");
try {
 for (const value of rejected) {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(trap).href, 'dist/index.js', '--http'], {cwd, env:{...env,[HOST_ENV]:value,[PORT_ENV]:'0'}, encoding:'utf8', timeout:10000});
  assert.equal(result.error, undefined, `process failure for rejected host`);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(errorText), 'clear loopback-only error required');
  assert.ok(!result.stderr.includes('UNEXPECTED_LISTEN_REACHED'), 'must reject before listen');
  if (value === 'example.invalid') assert.ok(!result.stderr.includes(value), 'host is not echoed');
 }
 for (const [configured, explicitOrigin] of [['127.0.0.1', undefined], ['LOCALHOST', undefined], ['::1', undefined], ['::1', 'http://127.0.0.1:54321']]) {
  const host = localHttpHost(configured);
  const probe = createServer();
  await new Promise((resolve,reject) => {probe.once('error',reject);probe.listen(0,host,resolve);});
  const port = probe.address().port;
  await new Promise((resolve,reject) => probe.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, ['dist/index.js','--http'], {cwd,env:{...env,[HOST_ENV]:configured,[PORT_ENV]:String(port),...(explicitOrigin ? { [HOST_ENV.replace(/HOST$/, 'ALLOWED_ORIGIN')]: explicitOrigin } : {})},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});child.stdout.resume();
  const exited = new Promise(resolve=>child.once('exit',resolve));
  try {
   const url=`http://${host==='::1'?'[::1]':host}:${port}/health`;
   const expectedOrigin = explicitOrigin ?? formatLocalHttpOrigin(configured.toLowerCase() === "localhost" ? "localhost" : host, port);
   let response, lastError;
   for(let i=0;i<100;i++) {
    assert.equal(child.exitCode,null,`server exited: ${stderr}`);
    try {response=await fetch(url,{signal:AbortSignal.timeout(500),headers:{Origin:expectedOrigin}});break;} catch (error) {lastError=error;await new Promise(resolve=>setTimeout(resolve,50));}
   }
   assert.ok(response,`loopback server startup timed out (${configured}): ${lastError?.cause?.code ?? lastError}; ${stderr}`);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),expectedOrigin);assert.equal((await response.json()).ok,true);
  } finally {
   child.kill('SIGTERM');
   const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(timer);
  }
 }
 console.log('HTTP local-only PASS: allowlist, pre-listen fail-closed, IPv4/localhost/IPv6 health, default and explicit CORS origins; no provider/account calls.');
} finally {await rm(root,{recursive:true,force:true});}
