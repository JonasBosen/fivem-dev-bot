const path = require('path');
const fs = require('fs');
const { DEFAULTS } = require('./defaults');
const { SQLITE_SCHEMA, POSTGRES_SCHEMA } = require('./schema');

function postgresSql(sql) {
  let position = 0;
  return sql.replace(/\?/g, () => `$${++position}`)
    .replace(/\b(FROM|INTO|UPDATE|JOIN)\s+(wheel_spins|member_events|panel_users|panel_invites|dev_registry|dev_presence|panel_media|settings|tickets|applications|levels|warnings|giveaways|host_requests|host_sessions|query_templates|stream_state|dev_gate|dev_gate_attempts|site_audit|stream_accounts|dev_tasks|dev_history|dev_images|dev_comments|dev_files|dev_audit|dev_deleted|dev_planning)\b/gi, '$1 allbot.$2')
    .replace(/SET xp = xp \+/g, 'SET xp = levels.xp +');
}
function createPostgresAdapter(connection) {
  return {
    async init() {
      for (const statement of POSTGRES_SCHEMA.split(';').filter((sql) => sql.trim())) await connection.query(statement);
    },
    prepare(sql) {
      const converted = postgresSql(sql);
      return {
        async get(...values) { return (await connection.query(converted, values)).rows[0]; },
        async all(...values) { return (await connection.query(converted, values)).rows; },
        async run(...values) {
          const withId = /^INSERT INTO allbot\.(tickets|applications|warnings|giveaways|dev_tasks|dev_history|dev_comments|dev_files)\b/i.test(converted);
          const result = await connection.query(converted + (withId ? ' RETURNING id' : ''), values);
          return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
        },
      };
    },
    async close() { await connection.end?.(); },
  };
}
let adapter;const settingsReads=new Map();
async function initDb() {
  if (adapter) return;
  if (process.env.DATABASE_URL) {
    const { Pool, types } = require('pg');
    types.setTypeParser(20, (value) => Number(value));
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
      max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000,
    });
    pool.on('error', () => console.error('[database] Forbindelsen blev afbrudt.'));
    const candidate = createPostgresAdapter(pool);
    try { await candidate.init(); adapter = candidate; }
    catch (error) { await candidate.close(); throw error; }
  } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createSupabaseAdapter } = require('./supabase-adapter');
    const candidate = createSupabaseAdapter(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);
    await candidate.init(); adapter = candidate;
  } else {
    if (process.env.RENDER || process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL mangler. Tilføj PostgreSQL-forbindelsen under Environment.');
    const { DatabaseSync } = require('node:sqlite');
    const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'bot.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const local = new DatabaseSync(file);
    local.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    local.exec(SQLITE_SCHEMA);
    if(!local.prepare('PRAGMA table_info(panel_media)').all().some(c=>c.name==='scope'))local.exec("ALTER TABLE panel_media ADD COLUMN scope TEXT NOT NULL DEFAULT 'shared'");
    adapter = local;
  }
}
const db = {
  prepare(sql) {
    if (!adapter) throw new Error('Databasen er ikke klar.');
    return adapter.prepare(sql);
  },
  async close() { settingsReads.clear();await adapter?.close(); adapter = undefined; },
};
function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
    out[k] = Object.hasOwn(base, k) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}
const settings = {
  async get(guildId) {
    const cached=settingsReads.get(guildId);if(cached&&cached.until>Date.now())return structuredClone(await cached.promise);
    const entry={until:Date.now()+1000,promise:null};entry.promise=(async()=>{const row=await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get(guildId);return merge(structuredClone(DEFAULTS),row?JSON.parse(row.data):{});})();settingsReads.set(guildId,entry);
    try{return structuredClone(await entry.promise);}catch(e){if(settingsReads.get(guildId)===entry)settingsReads.delete(guildId);throw e;}
  },
  async set(guildId, data) {
    settingsReads.delete(guildId);
    const full = merge(structuredClone(DEFAULTS), data);
    await db.prepare('INSERT INTO settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data').run(guildId, JSON.stringify(full));
    settingsReads.delete(guildId);return full;
  },
  async setModule(guildId, module, value) {
    settingsReads.delete(guildId);
    if (!Object.hasOwn(DEFAULTS, module)) throw new Error('Ukendt modul');
    for(let attempt=0;attempt<10;attempt++){
      const row=await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get(guildId);
      const all=merge(structuredClone(DEFAULTS),row?JSON.parse(row.data):{});
      all[module]=merge(structuredClone(DEFAULTS[module]),value);
      const data=JSON.stringify(all);
      const result=row?await db.prepare('UPDATE settings SET data=? WHERE guild_id=? AND data=?').run(data,guildId,row.data):await db.prepare('INSERT INTO settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO NOTHING').run(guildId,data);
      if(result.changes){settingsReads.delete(guildId);return all;}
    }
    throw new Error('Indstillingerne blev ændret samtidig. Prøv at gemme igen.');
  },
};
module.exports = { db, settings, initDb, createPostgresAdapter, postgresSql };
