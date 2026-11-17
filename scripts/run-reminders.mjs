const endpoint=process.env.BERRY_REMINDERS_ENDPOINT,secret=process.env.BERRY_REMINDERS_CRON_SECRET;
if(!endpoint||!secret){console.log('Reminder scheduler is not configured; no mail requested.');process.exit(0);}
const url=new URL(endpoint);
if(url.protocol!=='https:'||url.pathname!=='/api/reminders/run'||url.username||url.password||url.search||url.hash||secret.length<32)throw Error('Invalid scheduler configuration');
const deadline=Date.now()+240000,total={accepted:0,rejected:0,unconfirmed:0};let drained=false,batches=0;
while(batches<20&&Date.now()<deadline){
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({action:'reminders.run'}),redirect:'error',signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});
 if(!response.ok)throw Error(`Reminder processing was not confirmed (HTTP ${response.status}). Review recorded attempts before retrying.`);
 const result=await response.json();if(result.ok!==true||!['accepted','rejected','unconfirmed'].every(k=>Number.isInteger(result[k])&&result[k]>=0))throw Error('Invalid worker response');
 batches++;for(const key of Object.keys(total))total[key]+=result[key];
 if(result.accepted+result.rejected+result.unconfirmed<10){drained=true;break;}
}
console.log(JSON.stringify({ok:true,...total,batches,drained}));
