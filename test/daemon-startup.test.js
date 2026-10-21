const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('daemon binds the web app while a previous instance still owns the bot lease', async () => {
  let releaseLease, webStarted = false, renewStarted = false;
  const lease = new Promise(resolve => { releaseLease = resolve; });
  const context = {
    module: { exports: {} }, console,
    process: { env: { DISCORD_TOKEN: 'test' }, once() {}, exit() { throw Error('unexpected exit'); } },
    setTimeout,
    setInterval() { renewStarted = true; return { unref() {} }; },
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'node:crypto') return { randomUUID: () => 'test-owner' };
      if (name === '../src/db') return { initDb: async () => {} };
      if (name === '../src/modules/durable-state') return { write: () => lease };
      if (name === '../src/index') { webStarted = true; return {}; }
      throw Error(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/vercel-daemon'), 'utf8'), context);
  assert.equal(webStarted, true);
  assert.equal(context.process.env.BOT_LEADER_LOCK, '1');
  assert.equal(renewStarted, false);
  releaseLease();
  await context.module.exports.leadership;
  assert.equal(renewStarted, true);
});

test('a fenced handoff waits for shutdown and admits only the designated Render service', async () => {
  let transform,release,now=1000;
  const pending=new Promise(resolve=>{release=resolve;});
  const context={module:{exports:{}},console,Date:{now:()=>now},process:{env:{DISCORD_TOKEN:'test',RENDER_SERVICE_ID:'render-service'},once(){},exit(){throw Error('unexpected exit');}},setTimeout,setInterval:()=>({unref(){}}),require(name){
    if(name==='dotenv')return {config(){}};
    if(name==='node:crypto')return {randomUUID:()=> 'new-owner'};
    if(name==='../src/db')return {initDb:async()=>{}};
    if(name==='../src/modules/durable-state')return {write:(_key,fn)=>{transform=fn;return pending;}};
    if(name==='../src/index')return {};
    throw Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/vercel-daemon'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const handoff={owner:'handoff',preferredService:'render-service',handoffAt:2000,until:100000};
  assert.throws(()=>transform(handoff),/LEADER_BUSY/);
  now=2001;
  assert.throws(()=>transform({...handoff,preferredService:'another-service'}),/LEADER_BUSY/);
  const acquired=transform(handoff);assert.equal(acquired.owner,'new-owner');assert.equal(acquired.service,'render-service');assert.equal(acquired.preferredService,'render-service');
  assert.throws(()=>transform({owner:'other-owner',until:99999,preferredService:'render-service'}),/LEADER_BUSY/);
  release();await context.module.exports.leadership;
});
