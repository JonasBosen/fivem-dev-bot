const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';process.env.HOST_BRIDGE_SECRET='test-only-bridge-key-longer-than-32-characters';process.env.BASE_URL='https://panel.example';
const {initDb,db}=require('../src/db'),bridge=require('../src/modules/hosting-bridge');
const input=()=>({method:'POST',path:'/api/guild/test/developer?board=bug',headers:{cookie:'private-cookie',origin:'https://panel.example'},body:Buffer.from('{"title":"Privat sag"}').toString('base64')});
test('hosting requests are encrypted, claimed once, isolated by ID and expire without retrying actions',async()=>{await initDb();try{
 const id=await bridge.enqueue(input()),raw=await db.prepare('SELECT * FROM host_requests WHERE id=?').get(id);
 assert.equal(raw.request.includes('private-cookie'),false);assert.equal(raw.request.includes('Privat sag'),false);assert.throws(()=>bridge.open('wrong-id',raw.request));
 const batches=await Promise.all([bridge.claim(),bridge.claim()]),jobs=batches.flat();assert.equal(jobs.length,1);assert.deepEqual(jobs[0].input,input());assert.equal((await bridge.claim()).length,0);
 assert.equal(await bridge.result(id),null);await bridge.complete(id,{status:200,headers:{'set-cookie':['session=private; Secure; HttpOnly']},body:Buffer.from('Færdig').toString('base64')});
 assert.equal(Buffer.from((await bridge.result(id)).body,'base64').toString(),'Færdig');assert.equal((await bridge.result(id)).headers['set-cookie'][0],'session=private; Secure; HttpOnly');
 await bridge.discard(id);assert.equal(await bridge.result(id),null);
 const expired=await bridge.enqueue(input());await db.prepare('UPDATE host_requests SET expires_at=? WHERE id=?').run(Date.now()-120000,expired);assert.equal((await bridge.claim()).length,0);await bridge.cleanup();assert.equal(await db.prepare('SELECT * FROM host_requests WHERE id=?').get(expired),undefined);
 assert.throws(()=>bridge.validRequest({...input(),path:'https://attacker.test/'}));assert.throws(()=>bridge.validRequest({...input(),path:'//attacker.test/'}));assert.throws(()=>bridge.validRequest({...input(),body:Buffer.alloc(bridge.MAX_BODY+1).toString('base64')}));
 }finally{await db.close();}});
test('shared session store survives recreation and stores no plaintext login data',async()=>{await initDb();try{
 const call=(store,method,...args)=>new Promise((resolve,reject)=>store[method](...args,(e,v)=>e?reject(e):resolve(v)));
 const first=bridge.sessionStore(),value={user:{id:'private-user'},cookie:{expires:new Date(Date.now()+60000).toISOString()}};
 await call(first,'set','test-session',value);const second=bridge.sessionStore();assert.deepEqual(await call(second,'get','test-session'),value);
 const raw=await db.prepare('SELECT payload,expires_at FROM host_sessions WHERE id=?').get('test-session');assert.equal(raw.payload.includes('private-user'),false);
 await call(second,'destroy','test-session');assert.equal(await call(first,'get','test-session'),null);
 }finally{await db.close();}});
test('HTTP bridge rejects foreign origins and forwards cookies, paths and binary responses through the daemon',async()=>{await initDb();const express=require('express'),app=express();app.use(require('../api/bridge'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;let timer;
 try{
 assert.equal((await fetch(url+'/api/bridge?__bridge_path=api/test',{method:'POST',headers:{origin:'https://other.example'}})).status,403);
 const running=new Set();timer=setInterval(async()=>{for(const job of await bridge.claim()){assert.equal(job.input.path,'/api/test?search=hej');assert.equal(job.input.headers.cookie,'session=kept');assert.equal(Buffer.from(job.input.body,'base64').toString(),'hello');const t=bridge.complete(job.id,{status:201,headers:{'content-type':'application/octet-stream','set-cookie':['session=updated; Secure; HttpOnly']},body:Buffer.from([0,1,255,32]).toString('base64')});running.add(t);await t;running.delete(t);}},30);
 const response=await fetch(url+'/api/bridge?__bridge_path=api/test&search=hej',{method:'POST',headers:{origin:process.env.BASE_URL,cookie:'session=kept','content-type':'text/plain'},body:'hello'});assert.equal(response.status,201);assert.equal(response.headers.get('set-cookie'),'session=updated; Secure; HttpOnly');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,1,255,32]);
 }finally{clearInterval(timer);await new Promise(r=>server.close(r));await db.close();}});
