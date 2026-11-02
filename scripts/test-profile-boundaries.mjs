import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const vendor = 'google_health';
const home = await mkdtemp(join(tmpdir(),vendor+'-profile-boundaries-'));
const file = join(home,'.delx-wellness','profile.json');
const client = new Client({name:vendor+'-profile-boundary-tests',version:'1.0.0'});
const env = { PATH:process.env.PATH??'', HOME:home, USERPROFILE:home, ...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot??''}:{}) };
async function call(suffix,args={}) {return client.callTool({name:vendor+'_'+suffix,arguments:{response_format:'json',...args}});}
try {
 await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env}));
 const inventory=await client.listTools();
 for(const suffix of ['profile_get','profile_update']) { const tool=inventory.tools.find(t=>t.name===vendor+'_'+suffix); assert.ok(tool?.inputSchema?.properties?.response_format); }
 const updateTool=inventory.tools.find(t=>t.name===vendor+'_profile_update'); assert.equal(updateTool.inputSchema.properties.patch.type,'object');
 const denied = await call('profile_update',{patch:{notes:'synthetic'},explicit_user_intent:false});
 assert.equal(denied.structuredContent.ok,false); assert.equal(denied.structuredContent.error,'USER_ACTION_REQUIRED'); assert.match(JSON.stringify(denied),/USER_ACTION_REQUIRED/);await assert.rejects(access(file));
 const valid = await call('profile_update',{patch:{profile:{preferred_name:'Synthetic Fixture',language:'pt-BR',units:'metric'},goals:{primary:'synthetic',secondary:['recovery']},devices:{connected:['oura']},training:{sports:['walking'],preferred_duration_minutes:'30'},nutrition:{dietary_preferences:['synthetic'],protein_target_g:'100'},preferences:{language_priority:['pt-BR','en'],reply_style:'concise',ask_before_logging:true},safety:{conservative_flags:['synthetic']},notes:'synthetic'},explicit_user_intent:true});
 assert.notEqual(valid.isError,true); assert.match(JSON.stringify(valid),/Synthetic Fixture/);
 const before = await readFile(file,'utf8');
 if (process.env.PROFILE_TEST_CASE !== 'read') for (const patch of [{devices:{connected:'synthetic-sensitive-value'}},{devices:{connected:null}},{devices:{connected:[1]}},{profile:'synthetic-sensitive-value'},{notes:42},{preferences:{ask_before_logging:'false'}},{profile:{language:'xx'}},{unknown:'synthetic-sensitive-value'},{profile:{unknown:'synthetic-sensitive-value'}},JSON.parse('{"profile":{"__proto__":{"polluted":true}}}')]) {
  const response = await call('profile_update',{patch,explicit_user_intent:true});
  assert.equal(response.isError,true); const result = JSON.stringify(response);
  assert.match(result,/Invalid wellness profile patch/);assert.doesNotMatch(result,/synthetic-sensitive-value/);
  assert.equal(await readFile(file,'utf8'),before);
 }
 const stored=JSON.parse(before);assert.equal(stored.schema,'delx-wellness-profile/v1');assert.equal(stored.profile.preferred_name,'Synthetic Fixture');
 await writeFile(file,JSON.stringify({schema:'delx-wellness-profile/v1',devices:{connected:['whoop']}}));
 assert.match(JSON.stringify(await call('profile_get')),/whoop/);
 for (const bad of [JSON.stringify({schema:'delx-wellness-profile/v1',devices:{connected:null},notes:'synthetic-sensitive-value'}),JSON.stringify({schema:'unsupported',notes:'synthetic-sensitive-value'}),'{synthetic-sensitive-value']) {
  await writeFile(file,bad);
  for (const [suffix,args] of [['profile_get',{}],['profile_update',{patch:{notes:'safe'},explicit_user_intent:true}]]) {
   const response=await call(suffix,args); assert.equal(response.isError,true); const result=JSON.stringify(response);assert.match(result,/Stored wellness profile is invalid/);assert.doesNotMatch(result,/synthetic-sensitive-value/);
   assert.equal(await readFile(file,'utf8'),bad);
  }
 }
 console.log(JSON.stringify({ok:true,suite:'profile-boundaries',vendor,transport:'stdio',validLegacy:true,rejectedPatches:10,corruptFiles:3,realAccounts:0}));
} finally {await client.close().catch(()=>{});await rm(home,{recursive:true,force:true});}
