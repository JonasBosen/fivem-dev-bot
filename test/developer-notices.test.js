const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {initDb,db}=require('../src/db'),notices=require('../src/modules/developer-notices'),state=require('../src/modules/durable-state');
test('reading a case deletes only its bot notices, keeps newer replies, and retries failed deletion',async()=>{
 await initDb();try{
  const messages=new Map(),deleted=[];let seq=0,fail=false;
  const channel={id:'channel',send:async()=>{const id=String(++seq);messages.set(id,{author:{id:'bot'},delete:async()=>{if(fail)throw Object.assign(Error(),{code:50013});deleted.push(id);}});return {id};},messages:{fetch:async id=>messages.get(id)}};
  const guild={id:'guild',client:{user:{id:'bot'}},channels:{fetch:async()=>channel}};
  await notices.send(guild,{id:1},'case',channel,{});await notices.send(guild,{id:2},'case',channel,{});
  fail=true;await notices.clear(guild,1,'case');assert.deepEqual(deleted,[]);
  fail=false;await notices.clear(guild,1,'case');assert.deepEqual(deleted,['1']);
  await notices.clear(guild,1,'case');assert.deepEqual(deleted,['1']);
  messages.set('old',{author:{id:'bot'},delete:async()=>deleted.push('old')});
  messages.set('new',{author:{id:'bot'},delete:async()=>deleted.push('new')});
  messages.set('human',{author:{id:'human'},delete:async()=>assert.fail('must not delete human message')});
  await state.write('developer-notices:guild:1',()=>({messages:[{channelId:'channel',messageId:'old',kind:'message',through:3},{channelId:'channel',messageId:'new',kind:'message',through:5},{channelId:'channel',messageId:'human',kind:'case'}]}));
  await notices.clear(guild,1,'message',3);assert.deepEqual(deleted,['1','old']);
  await notices.clear(guild,1,'case');assert.deepEqual(deleted,['1','old']);
  assert.equal((await state.read('developer-notices:guild:2')).messages.length,1);
 }finally{await db.close();}
});
