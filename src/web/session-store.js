// Session-lager i databasen, så login overlever mellem serverless-kald (Vercel).
// Genbruger kun SQL-sætninger, der allerede er godkendt i supabase-allbot.sql (settings-tabellen),
// så der ikke kræves en ny migration.
const crypto = require('node:crypto');
const { Store } = require('express-session');

const PREFIX = 'session:';
const DEFAULT_TTL = 7 * 864e5;
const SELECT = 'SELECT data FROM settings WHERE guild_id = ?';
const UPSERT = 'INSERT INTO settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data';

// Sessions-ID'et hashes, så en databaseudlæsning ikke kan bruges til at overtage en session.
const keyFor = (sid) => PREFIX + crypto.createHash('sha256').update(String(sid)).digest('hex').slice(0, 40);

class DbSessionStore extends Store {
  constructor(db, { ttl = DEFAULT_TTL, now = Date.now } = {}) {
    super();
    this.db = db;
    this.ttl = ttl;
    this.now = now;
  }

  expiryOf(sess) {
    const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(expires) ? expires : this.now() + this.ttl;
  }

  get(sid, callback) {
    (async () => {
      const row = await this.db.prepare(SELECT).get(keyFor(sid));
      if (!row) return null;
      const stored = JSON.parse(row.data);
      if (!stored?.sess || !(stored.exp > this.now())) return null;
      return stored.sess;
    })().then((sess) => callback(null, sess), (error) => callback(error));
  }

  set(sid, sess, callback = () => {}) {
    const data = JSON.stringify({ sess, exp: this.expiryOf(sess) });
    this.db.prepare(UPSERT).run(keyFor(sid), data).then(() => callback(null), (error) => callback(error));
  }

  // Ingen DELETE-sætning er godkendt for settings, så sessionen markeres som udløbet.
  destroy(sid, callback = () => {}) {
    this.db.prepare(UPSERT).run(keyFor(sid), JSON.stringify({ exp: 0 })).then(() => callback(null), (error) => callback(error));
  }
}

module.exports = { DbSessionStore, keyFor };
