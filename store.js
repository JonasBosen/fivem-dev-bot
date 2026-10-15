// Lagring: Supabase (hvis SUPABASE_URL + SUPABASE_SERVICE_KEY er sat), ellers lokal fil data/db.json.
// Hele databasen gemmes som ét JSON-dokument i tabellen bot_state (række id = 1).
const fs = require('fs');

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const enabled = !!(URL_ && KEY);
const FILE = './data/db.json';
const EMPTY = () => ({ counter: 0, tasks: {}, panels: [] });

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

async function load() {
  if (!enabled) {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return EMPTY(); }
  }
  const r = await fetch(`${URL_}/rest/v1/bot_state?id=eq.1&select=data`, { headers: headers() });
  if (!r.ok) throw new Error(`Supabase læsning fejlede (${r.status}): ${await r.text()}`);
  const rows = await r.json();
  return rows[0]?.data || EMPTY();
}

let timer = null;
let latest = null;
let writing = Promise.resolve();

async function write(snapshot) {
  if (!enabled) {
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(FILE + '.tmp', snapshot);
    fs.renameSync(FILE + '.tmp', FILE);
    return;
  }
  const r = await fetch(`${URL_}/rest/v1/bot_state?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 1, data: JSON.parse(snapshot), updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase skrivning fejlede (${r.status}): ${await r.text()}`);
}

function flushNow() {
  if (latest == null) return writing;
  const snapshot = latest;
  latest = null;
  writing = writing.then(() => write(snapshot)).catch((e) => console.error('Kunne ikke gemme:', e.message));
  return writing;
}

// Gem (samler hurtige ændringer til én skrivning)
function save(db) {
  latest = JSON.stringify(db);
  clearTimeout(timer);
  timer = setTimeout(flushNow, 400);
}

async function flush() {
  clearTimeout(timer);
  await flushNow();
  await writing;
}

module.exports = { load, save, flush, enabled };
