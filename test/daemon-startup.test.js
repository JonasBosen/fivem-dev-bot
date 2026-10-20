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
