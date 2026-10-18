// Vercel-indgang: kører kun web-panelet (ikke Discord-botten med kommandoer, musik og timere).
// Botten skal fortsat køre på en vedvarende vært (fx Render via `npm start`).
//
// Panelet bruger Discord-forbindelsen til at slå roller, kanaler og medlemmer op. Derfor logger
// denne funktion ind med samme bot-token, men uden nogen event-handlers, så den ikke svarer på
// kommandoer og ikke dublerer botten.
require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');

process.env.DISCORD_CLIENT_ID ||= process.env.CLIENT_ID;
process.env.DISCORD_CLIENT_SECRET ||= process.env.CLIENT_SECRET;
// En fast hemmelighed er nødvendig, så sessionscookies kan læses af alle funktionsinstanser.
if (!process.env.SESSION_SECRET && process.env.DISCORD_TOKEN) {
  process.env.SESSION_SECRET = crypto.createHash('sha256').update('allbot-session:' + process.env.DISCORD_TOKEN).digest('hex');
}

const READY_TIMEOUT_MS = 25000;
let booting;
let client;

function missingEnv() {
  const missing = [];
  if (!process.env.DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
  if (!process.env.DISCORD_CLIENT_ID) missing.push('DISCORD_CLIENT_ID');
  if (!process.env.DISCORD_CLIENT_SECRET) missing.push('DISCORD_CLIENT_SECRET');
  const database = process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  if (!database) missing.push('DATABASE_URL (eller SUPABASE_URL + SUPABASE_SERVICE_KEY)');
  return missing;
}

function waitFor(promise, ms, code) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function boot() {
  const missing = missingEnv();
  if (missing.length) throw Object.assign(new Error('Mangler miljøvariabler'), { code: 'ENV_MISSING', missing });

  // Pakkerne indlæses her, så en fejl i en af dem bliver til en læsbar fejlbesked i stedet for et nedbrud.
  const { Client, GatewayIntentBits, Events } = require('discord.js');
  const { initDb, db } = require('../src/db');
  const { startWeb } = require('../src/web/server');
  const { DbSessionStore } = require('../src/web/session-store');

  await initDb();

  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  client.on(Events.Error, (error) => console.warn('[discord]', error.code || error.name));
  client.on(Events.ShardError, (error) => console.warn('[discord-forbindelse]', error.code || error.name));
  const ready = new Promise((resolve) => client.once(Events.ClientReady, resolve));
  try {
    await client.login(process.env.DISCORD_TOKEN);
    await waitFor(ready, READY_TIMEOUT_MS, 'DISCORD_NOT_READY');
  } catch (error) {
    await client.destroy();
    client = undefined;
    throw error;
  }
  return startWeb(client, { listen: false, sessionStore: new DbSessionStore(db) });
}

function getApp() {
  booting ||= boot().catch((error) => { booting = undefined; throw error; });
  return booting;
}

function describe(error) {
  const out = { error: 'Panelet kunne ikke starte', code: error.code || error.name || 'UNKNOWN' };
  if (error.missing) out.missing = error.missing;
  if (['MODULE_NOT_FOUND', 'ERR_DLOPEN_FAILED'].includes(error.code)) out.detail = String(error.message).split('\n')[0].slice(0, 300);
  return out;
}

module.exports = async (req, res) => {
  try {
    const app = await getApp();
    // Vercel kan have en lazy `req.body`, som ville æde forespørgslens stream før express.json() når at læse den.
    try { Object.defineProperty(req, 'body', { value: undefined, writable: true, configurable: true, enumerable: true }); } catch { /* ingen lazy body */ }
    return app(req, res);
  } catch (error) {
    console.error('[vercel]', error.code || error.name, error.message);
    if (res.headersSent) return;
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(describe(error)));
  }
};
