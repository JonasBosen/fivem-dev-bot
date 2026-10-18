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
  return { owner, until: Date.now() + 30000 };
});

async function main() {
  if (!process.env.DISCORD_TOKEN) throw Error('DISCORD_TOKEN mangler');
  await initDb();
  while (!stopping) {
    try { await lease(); break; } catch (error) { if (error.message !== 'LEADER_BUSY') throw error; await wait(3000); }
  }
  if (stopping) return;
  process.env.PORT ||= '3000';
  require('../src/index');
  const renew = setInterval(() => lease().catch(() => process.kill(process.pid, 'SIGTERM')), 10000);
  renew.unref();
}
main().catch((error) => { console.error('[daemon]', error.message); process.exit(1); });
