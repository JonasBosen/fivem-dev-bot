const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';delete process.env.DATABASE_URL;
const {initDb,db,settings}=require('../src/db');
const cooldown=require('../src/modules/developer-panel-cooldown');

test('one per-citizen cooldown is shared across every panel button and releases its form once',async()=>{
 await initDb();try{
  await settings.setModule('guild-cooldown','developer',{reportCooldownMinutes:5});
  const now=Date.now(),first=await cooldown.reserve('guild-cooldown','citizen',now);
  assert.equal(first.allowed,true);assert.match(first.token,/^[a-f0-9]{16}$/);
  const nextButton=await cooldown.reserve('guild-cooldown','citizen',now+1000);
  assert.equal(nextButton.allowed,false);assert.ok(nextButton.retryAfterMs>0);
  assert.equal(await cooldown.consume('guild-cooldown','citizen',first.token),true);
  assert.equal(await cooldown.consume('guild-cooldown','citizen',first.token),false);
  assert.equal((await cooldown.reserve('guild-cooldown','other-citizen',now+1000)).allowed,true);
  assert.equal((await cooldown.reserve('other-guild','citizen',now+1000)).allowed,true);
 }finally{await db.close();}
});

test('zero minutes disables panel click cooldown',async()=>{
 await initDb();try{
  await settings.setModule('guild-zero','developer',{reportCooldownMinutes:0});
  assert.deepEqual(await cooldown.reserve('guild-zero','citizen',2000000),{allowed:true,token:null,retryAfterMs:0});
 }finally{await db.close();}
});
