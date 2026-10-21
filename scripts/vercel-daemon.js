// Vercel Daemon: kører Discord-botten (gateway, knapper, kommandoer, timere) i Frankfurt.
// Webpanelet kører separat som Vercel Function (api/index.js); begge deler samme Supabase-database.
require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const { initDb } = require('../src/db');
const state = require('../src/modules/durable-state');
const owner = crypto.randomUUID(), leaseKey = 'hosting-bot-leader';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });

// Lederlås: forhindrer at to botprocesser (fx ved overlappende deployments) kører samtidig.
const lease = () => state.write(leaseKey, (value) => {
  if (value.owner && value.owner !== owner && value.until > Date.now()) throw Error('LEADER_BUSY');
  return { owner, until: Date.now() + 30000, service:process.env.RENDER_SERVICE_ID||'external', instance:process.env.RENDER_INSTANCE_ID||'', commit:process.env.RENDER_GIT_COMMIT||process.env.VERCEL_GIT_COMMIT_SHA||'' };
});

async function main() {
  if (!process.env.DISCORD_TOKEN) throw Error('DISCORD_TOKEN mangler');
  await initDb();
  while (!stopping) {
    try { await lease(); break; } catch (error) { if (error.message !== 'LEADER_BUSY') throw error; await wait(3000); }
  }
  if (stopping) throw Error('DAEMON_STOPPING');
  console.log('[daemon] Botlåsen er overtaget af',process.env.RENDER_INSTANCE_ID||process.env.RENDER_SERVICE_ID||'daemon');
  const renew = setInterval(() => lease().catch(() => process.kill(process.pid, 'SIGTERM')), 10000);
  renew.unref();
}
// Bind HTTP before waiting for the old instance's lease. Render must be able
// to start routing to this instance before it retires the old lease owner.
process.env.BOT_LEADER_LOCK = '1';
const leadership = main();
module.exports = { leadership };
leadership.catch((error) => { console.error('[daemon]', error.message); process.exit(1); });
require('../src/index');
