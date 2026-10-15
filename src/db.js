const path = require('path');
const fs = require('fs');
const { DEFAULTS } = require('./defaults');
const { SQLITE_SCHEMA, POSTGRES_SCHEMA } = require('./schema');

function postgresSql(sql) {
  let position = 0;
  return sql.replace(/\?/g, () => `$${++position}`)
    .replace(/\b(FROM|INTO|UPDATE|JOIN)\s+(panel_users|panel_invites|dev_registry|dev_presence|panel_media|settings|tickets|applications|levels|warnings|giveaways|stream_state|dev_gate|dev_gate_attempts|site_audit|stream_accounts|dev_tasks|dev_history|dev_images|dev_comments|dev_files|dev_audit|dev_deleted|dev_planning)\b/gi, '$1 allbot.$2')
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
let adapter;
async function initDb() {
  if (adapter) return;
  if (process.env.DATABASE_URL && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)) {
    const project = process.env.SUPABASE_PROJECT_REF || 'kdxxtdiydepuiecpdpha';
    const connectionUrl = new URL(process.env.DATABASE_URL);
    if (!(connectionUrl.hostname === 'db.' + project + '.supabase.co' || (connectionUrl.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(connectionUrl.username) === 'postgres.' + project))) throw new Error('DATABASE_URL skal pege på det fælles Supabase-projekt ' + project);
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
    if (process.env.RENDER || process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL mangler. Tilføj AllBots Supabase-forbindelse under Environment.');
    const { DatabaseSync } = require('node:sqlite');
    const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'bot.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const local = new DatabaseSync(file);
    local.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    local.exec(SQLITE_SCHEMA);
    adapter = local;
  }
}
const db = {
  prepare(sql) {
    if (!adapter) throw new Error('Databasen er ikke klar.');
    return adapter.prepare(sql);
  },
  async close() { await adapter?.close(); adapter = undefined; },
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
    const row = await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get(guildId);
    return merge(structuredClone(DEFAULTS), row ? JSON.parse(row.data) : {});
  },
  async set(guildId, data) {
    const full = merge(structuredClone(DEFAULTS), data);
    await db.prepare('INSERT INTO settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data').run(guildId, JSON.stringify(full));
    return full;
  },
  async setModule(guildId, module, value) {
    if (!Object.hasOwn(DEFAULTS, module)) throw new Error('Ukendt modul');
    const all = await settings.get(guildId);
    all[module] = merge(structuredClone(DEFAULTS[module]), value);
    return settings.set(guildId, all);
  },
};
module.exports = { db, settings, initDb, createPostgresAdapter, postgresSql };
