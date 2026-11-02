import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const self=fileURLToPath(import.meta.url);
const mode=process.argv[2];
const clean=(home)=>({PATH:process.env.PATH??'',HOME:home,USERPROFILE:home,...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot??''}:{})});
function child(home,args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[self,...args],{env:clean(home),stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(out)));});}
if(mode){
 const { getProfile, updateProfile, getProfilePath, migrateFromLegacy }=await import('../dist/services/profile-store.js');
 const { withProfileLock, MAX_PROFILE_BYTES, readProfileText }=await import('../dist/services/profile-file.js');
 const path=getProfilePath();
 if(mode==='write') { const index=Number(process.argv[3]);const fields=['preferred_name','timezone','age_or_birth_year','height','weight','sex_or_gender_context'];await updateProfile({profile:{[fields[index]]:'synthetic-'+index}}); }
 else if(mode==='counter'){const wait=Number(process.argv[3])-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));await withProfileLock(path,async()=>{let n=0;try{n=Number(await fs.readFile(path+'.counter','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,80));await fs.writeFile(path+'.counter',String(n+1));});}
 else if(mode==='verify'){const p=await getProfile();for(const [i,k] of ['preferred_name','timezone','age_or_birth_year','height','weight','sex_or_gender_context'].entries())assert.equal(p.profile[k],'synthetic-'+i);}
 else if(mode==='boundaries'){
  await updateProfile({notes:'initial'});const before=await fs.readFile(path,'utf8');
  if(process.platform!=='win32') {assert.equal((await fs.stat(path)).mode & 0o777,0o600);await withProfileLock(path,async()=>assert.equal((await fs.stat(path+'.lock')).mode & 0o777,0o700));}
  await assert.rejects(updateProfile({notes:'a'.repeat(MAX_PROFILE_BYTES)}),/256 KiB/);assert.equal(await fs.readFile(path,'utf8'),before);
  assert.deepEqual((await fs.readdir(dirname(path))).filter(x=>x.includes('.tmp.')||x.endsWith('.lock')),[]);
  await fs.writeFile(path,'a'.repeat(MAX_PROFILE_BYTES+1));await assert.rejects(getProfile(),/Stored wellness profile is invalid/);await assert.rejects(updateProfile({notes:'replace'}),/Stored wellness profile is invalid/);assert.equal((await fs.stat(path)).size,MAX_PROFILE_BYTES+1);
  await fs.writeFile(path,before);await fs.mkdir(path+'.lock');const start=performance.now();await assert.rejects(updateProfile({notes:'blocked'}),/profile is busy/);assert.ok(performance.now()-start>=4500);assert.ok((await fs.stat(path+'.lock')).isDirectory());assert.equal(await fs.readFile(path,'utf8'),before);await fs.rmdir(path+'.lock');
  await assert.rejects(withProfileLock(path,async()=>{throw new Error('synthetic failure');}),/synthetic failure/);await assert.rejects(fs.access(path+'.lock'));
  await updateProfile({notes:'recovered'});assert.equal((await getProfile()).notes,'recovered');
 }
 else if(mode==='raw') {
  await fs.mkdir(dirname(path),{recursive:true});
  await fs.writeFile(path,Buffer.alloc(MAX_PROFILE_BYTES,0x61));assert.equal(Buffer.byteLength(await readProfileText(path)),MAX_PROFILE_BYTES);
  await fs.writeFile(path,Buffer.from([0xc3,0x28]));await assert.rejects(readProfileText(path));
  await fs.unlink(path);await fs.mkdir(path);await assert.rejects(readProfileText(path),/Invalid or oversized profile file/);await fs.rmdir(path);
  if(process.platform!=='win32'){await fs.writeFile(path+'.target','synthetic');await fs.symlink(path+'.target',path);await assert.rejects(readProfileText(path));await fs.unlink(path);}
  await fs.writeFile(path,Buffer.alloc(MAX_PROFILE_BYTES,0x61));const originalOpen=fs.open;
  try {fs.open=async(p,...args)=>{const handle=await originalOpen.call(fs,p,...args);if(p===path){const originalStat=handle.stat.bind(handle);handle.stat=async()=>{const stat=await originalStat();await fs.appendFile(path,'xx');return stat;};}return handle;};
   await assert.rejects(readProfileText(path),/256 KiB/);
  }finally{fs.open=originalOpen;}
 }
 else if(mode==='io') {
  await updateProfile({notes:'canonical synthetic'});const before=await fs.readFile(path,'utf8');
  const original=fs.access;
  try {for(const code of ['EACCES','EPERM','EIO']) {
   fs.access=async(p,...args)=>{if(p===path)throw Object.assign(new Error('synthetic-sensitive-path'),{code});return original.call(fs,p,...args);};
   for(const action of [()=>getProfile(),()=>updateProfile({notes:'must not write'}),()=>migrateFromLegacy()]) await assert.rejects(action(),error=>/Stored wellness profile is unavailable/.test(error.message)&&!error.message.includes('synthetic-sensitive-path'));
   assert.equal(await fs.readFile(path,'utf8'),before);
  }} finally {fs.access=original;}
  const originalOpen=fs.open;
  try {fs.open=async(p,...args)=>{if(p===path)throw Object.assign(new Error('synthetic-sensitive-path'),{code:'EACCES'});return originalOpen.call(fs,p,...args);};
   for(const action of [()=>getProfile(),()=>updateProfile({notes:'must not write'})]) await assert.rejects(action(),error=>/Stored wellness profile is invalid/.test(error.message)&&!error.message.includes('synthetic-sensitive-path'));
  } finally {fs.open=originalOpen;}
  try {fs.open=async(p,...args)=>{if(String(p).startsWith(path+'.tmp.'))throw Object.assign(new Error('synthetic-sensitive-path'),{code:'EACCES'});return originalOpen.call(fs,p,...args);};
   await assert.rejects(updateProfile({notes:'must not write'}),error=>/profile could not be saved/.test(error.message)&&!error.message.includes('synthetic-sensitive-path'));
  } finally {fs.open=originalOpen;}
  const originalMkdir=fs.mkdir;
  try {fs.mkdir=async(p,...args)=>{if(p===path+'.lock')throw Object.assign(new Error('synthetic-sensitive-path'),{code:'EACCES'});return originalMkdir.call(fs,p,...args);};
   await assert.rejects(updateProfile({notes:'must not write'}),error=>/profile lock is unavailable/.test(error.message)&&!error.message.includes('synthetic-sensitive-path'));
  } finally {fs.mkdir=originalMkdir;}
  assert.equal(await fs.readFile(path,'utf8'),before);
 }
 else if(mode==='migration') {await Promise.all([migrateFromLegacy(),updateProfile({notes:'concurrent migration update'})]);assert.equal((await getProfile()).notes,'concurrent migration update');assert.equal((await getProfile()).profile.preferred_name,'legacy synthetic');}
} else {
 const root=await fs.mkdtemp(join(tmpdir(),'profile-storage-test-'));
 try {
  const home=join(root,'shared');await fs.mkdir(home);
  await Promise.all(Array.from({length:6},(_,i)=>child(home,['write',String(i)])));await child(home,['verify']);
  const start=String(Date.now()+2000);await Promise.all(Array.from({length:8},()=>child(home,['counter',start])));assert.equal(await fs.readFile(join(home,'.delx-wellness/profile.json.counter'),'utf8'),'8');
  await child(join(root,'bounds'),['boundaries']);await child(join(root,'io'),['io']);await child(join(root,'raw'),['raw']);
  const legacyHome=join(root,'legacy'), legacyPath=join(legacyHome,'.hermes/profiles/delx-wellness/wellness-profile.json');await fs.mkdir(dirname(legacyPath),{recursive:true});await fs.writeFile(legacyPath,JSON.stringify({schema:'delx-wellness-profile/v1',profile:{preferred_name:'legacy synthetic'}}));await child(legacyHome,['migration']);
  console.log(JSON.stringify({ok:true,suite:'profile-storage',parallelWriters:6,serializedCriticalSections:8,quotaBytes:262144,abandonedLock:'not stolen',migration:'serialized',realData:false}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
