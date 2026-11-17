import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
test('offline cache contains the application shell and public assets, excludes dynamic or private data and preserves explicit update activation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'berry-offline-worker-'));
 try{
  await mkdir(join(root,'assets'));await writeFile(join(root,'index.html'),'<script src="/berry/assets/index-hash.js"></script>');
  await writeFile(join(root,'assets','index-hash.js'),'public script');await writeFile(join(root,'assets','style.css'),'public style');await writeFile(join(root,'assets','private.json'),'must not be cached');
  await promisify(execFile)(process.execPath,[new URL('./build-offline-worker.mjs',import.meta.url).pathname,root,'/berry/']);
  const source=await readFile(join(root,'sw.js'),'utf8');
  assert.ok(source.includes('/berry/assets/index-hash.js'));assert.ok(source.includes('/berry/templates/inspection.xlsx'));assert.ok(!source.includes('private.json'));assert.ok(source.includes("url.pathname.includes('/api/')"));assert.ok(source.includes("event.request.method!=='GET'"));assert.ok(source.includes('ACTIVATE_UPDATE'));assert.ok(!source.includes('Authorization'));
  const listeners=new Map();
  runInNewContext(source,{URL,Request,Response,fetch:async()=>{throw Error('Offline');},self:{location:{origin:'https://berry.example'},addEventListener:(name,callback)=>listeners.set(name,callback)},caches:{open:async()=>({match:async request=>request==='/berry/'?new Response('current HTML'):request.url.endsWith('index-hash.js')?new Response('current JavaScript'):undefined}),match:async()=>new Response('previous JavaScript')}});
  let result;const fetchEvent=(url,mode='cors',method='GET')=>({request:{url,mode,method},respondWith:promise=>{result=promise;}});
  listeners.get('fetch')(fetchEvent('https://berry.example/berry/','navigate'));assert.equal(await(await result).text(),'current HTML');
  listeners.get('fetch')(fetchEvent('https://berry.example/berry/assets/index-hash.js'));assert.equal(await(await result).text(),'current JavaScript');
  listeners.get('fetch')(fetchEvent('https://berry.example/berry/assets/previous-hash.js'));assert.equal(await(await result).text(),'previous JavaScript');
  result=undefined;listeners.get('fetch')(fetchEvent('https://berry.example/berry/api/reports'));assert.equal(result,undefined);
  listeners.get('fetch')(fetchEvent('https://berry.example/berry/assets/index-hash.js','cors','POST'));assert.equal(result,undefined);
 }finally{await rm(root,{recursive:true,force:true});}
});
