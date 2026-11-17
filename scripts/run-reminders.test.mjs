import {test} from 'node:test';
import assert from 'node:assert/strict';
test('scheduler drains bounded batches without retrying an ambiguous response or exposing credentials',async()=>{
 const originalFetch=global.fetch,originalLog=console.log,oldEndpoint=process.env.BERRY_REMINDERS_ENDPOINT,oldSecret=process.env.BERRY_REMINDERS_CRON_SECRET;
 const logs=[];let calls=0;
 process.env.BERRY_REMINDERS_ENDPOINT='https://worker.example/api/reminders/run';process.env.BERRY_REMINDERS_CRON_SECRET='fictitious-cron-private-key-32-characters';
 console.log=value=>logs.push(value);
 try{
  global.fetch=async(url,options)=>{assert.equal(url.href,process.env.BERRY_REMINDERS_ENDPOINT);assert.equal(options.redirect,'error');calls++;return Response.json({ok:true,accepted:calls<3?10:2,rejected:0,unconfirmed:0});};
  await import('./run-reminders.mjs?drain');assert.equal(calls,3);assert.deepEqual(JSON.parse(logs[0]),{ok:true,accepted:22,rejected:0,unconfirmed:0,batches:3,drained:true});
  calls=0;global.fetch=async()=>{calls++;throw Error('Uncertain connection');};
  await assert.rejects(()=>import('./run-reminders.mjs?uncertain'),/Uncertain connection/);assert.equal(calls,1);
 }finally{global.fetch=originalFetch;console.log=originalLog;if(oldEndpoint===undefined)delete process.env.BERRY_REMINDERS_ENDPOINT;else process.env.BERRY_REMINDERS_ENDPOINT=oldEndpoint;if(oldSecret===undefined)delete process.env.BERRY_REMINDERS_CRON_SECRET;else process.env.BERRY_REMINDERS_CRON_SECRET=oldSecret;}
});
