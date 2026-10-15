const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRuntime}=require('../src/service-runtime');
const {createSupabaseAdapter}=require('../src/supabase-adapter');
test('runtime recovers from database and Discord failures without closing the web process; stop prevents retries',async()=>{
 let databaseFails=true,discordFails=true,connected=false,probes=0,logins=0,next,delay;
 const runtime=createRuntime({initDb:async()=>{if(databaseFails)throw Object.assign(new Error('temporary'),{code:'DB_OFFLINE'});},probe:async()=>{probes++;},connect:async()=>{logins++;if(discordFails)throw new Error('network');connected=true;},isReady:()=>connected,log:()=>{},setTimer:(fn,ms)=>{next=fn;delay=ms;return 1;},clearTimer:()=>{next=null;}});
 await runtime.start();assert.equal(runtime.databaseReady,false);assert.equal(logins,0);assert.equal(delay,10000);
 databaseFails=false;await next();assert.equal(runtime.databaseReady,true);assert.equal(logins,1);assert.equal(delay,5000);
 discordFails=false;await next();assert.equal(connected,true);assert.equal(delay,30000);
 databaseFails=true;await next();assert.equal(runtime.databaseReady,false);
 databaseFails=false;await next();assert.equal(runtime.databaseReady,true);assert.equal(runtime.databaseError,'');assert.equal(logins,2);assert.ok(probes>=3);
 runtime.stop();assert.equal(next,null);await runtime.start();assert.equal(next,null);
});
test('simultaneous identical Supabase reads share one request, stay isolated and never cache completed reads or writes',async()=>{
 const original=global.fetch;let calls=0,fail=false;
 global.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return fail?new Response('',{status:503}):Response.json({rows:[{value:calls}],rowCount:1});};
 try{const adapter=createSupabaseAdapter('https://kdxxtdiydepuiecpdpha.supabase.co','test'),select=adapter.prepare('SELECT data FROM settings WHERE guild_id = ?');
 const results=await Promise.all(Array.from({length:8},()=>select.get('a')));assert.equal(calls,1);results[0].value=99;assert.notEqual(results[1].value,99);
 await select.get('a');assert.equal(calls,2);await Promise.all([select.get('a'),select.get('b')]);assert.equal(calls,4);
 await Promise.all([adapter.prepare('UPDATE settings SET data=? WHERE guild_id=?').run('{}','a'),adapter.prepare('UPDATE settings SET data=? WHERE guild_id=?').run('{}','a')]);assert.equal(calls,6);
 fail=true;await assert.rejects(select.get('a'));fail=false;await select.get('a');assert.equal(calls,8);
 }finally{global.fetch=original;}
});
