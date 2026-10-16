const { timingSafeEqual } = require('node:crypto');

class ImportError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function validateWarning(body) {
  const text = (value, max, required = false) => {
    if (value != null && typeof value !== 'string') throw new ImportError(400, 'Ugyldigt tekstfelt.');
    const result = (value || '').trim();
    if (result.length > max || (required && !result)) throw new ImportError(400, 'Manglende eller for langt felt.');
    return result;
  };
  const id = (value) => {
    const result = text(value, 20).replace(/^discord:/, '');
    if (result && !/^\d{17,20}$/.test(result)) throw new ImportError(400, 'Ugyldigt Discord-ID.');
    return result;
  };
  const b = body || {};
  const w = {
    serverId: text(b.serverId, 80, true), eventId: text(b.eventId, 80, true),
    discordId: id(b.discordId), license: text(b.license, 100).replace(/^license2?:/, '').toLowerCase(),
    playerName: text(b.playerName, 120, true), reason: text(b.reason, 4000, true),
    actorId: id(b.actorId), actorName: text(b.actorName, 120, true),
    createdAt: text(b.createdAt, 40, true),
  };
  if (w.license && !/^[a-f0-9]{40}$/.test(w.license)) throw new ImportError(400, 'Ugyldig FiveM-license.');
  if (!w.discordId && !w.license) throw new ImportError(400, 'Spillerens Discord-ID eller license kræves.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(w.createdAt) || !Number.isFinite(Date.parse(w.createdAt))) {
    throw new ImportError(400, 'Tidspunkt skal være UTC i ISO-format.');
  }
  w.createdAt = new Date(w.createdAt).toISOString();
  return w;
}

async function importWarning(db, w) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const receipt = await client.query(`INSERT INTO admin_warning_imports(server_id,event_id)
      VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id`, [w.serverId, w.eventId]);
    if (!receipt.rows.length) {
      const previous = await client.query('SELECT warning_id FROM admin_warning_imports WHERE server_id=$1 AND event_id=$2', [w.serverId, w.eventId]);
      await client.query('COMMIT');
      return { duplicate: true, id: previous.rows[0]?.warning_id };
    }
    // Serialize license matching across concurrent imports, without trusting display names.
    if (w.license) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`919admin:${w.license}`]);
    const matches = await client.query(`SELECT * FROM people WHERE
      ($1<>'' AND discord_id=$1) OR ($2<>'' AND lower(regexp_replace(license,'^license2?:',''))=$2)
      FOR UPDATE`, [w.discordId, w.license]);
    if (matches.rows.length > 1) throw new ImportError(409, 'Discord-ID og license matcher forskellige profiler.');
    let person = matches.rows[0];
    if (person && w.discordId && person.discord_id !== w.discordId) throw new ImportError(409, 'Profilens Discord-ID matcher ikke spilleren.');
    if (person && w.license && person.license && person.license.replace(/^license2?:/, '').toLowerCase() !== w.license) {
      throw new ImportError(409, 'Profilens license matcher ikke spilleren.');
    }
    if (!person) {
      if (!w.discordId) throw new ImportError(422, 'License findes ikke i panelet. Tilføj license på spillerens profil.');
      const result = await client.query(`INSERT INTO people(discord_id,discord_name,fivem_name,license,created_at,created_by)
        VALUES($1,$2,$2,$3,$4,'919Admin Pro') ON CONFLICT(discord_id) DO UPDATE SET discord_id=EXCLUDED.discord_id RETURNING *`,
      [w.discordId, w.playerName, w.license ? `license:${w.license}` : '', w.createdAt]);
      person = result.rows[0];
      if (w.license && person.license && person.license.replace(/^license2?:/, '').toLowerCase() !== w.license) {
        throw new ImportError(409, 'Profilens license matcher ikke spilleren.');
      }
    }
    await client.query(`UPDATE people SET license=CASE WHEN license='' THEN $1 ELSE license END,
      fivem_name=CASE WHEN fivem_name='' THEN $2 ELSE fivem_name END WHERE id=$3`,
    [w.license ? `license:${w.license}` : '', w.playerName, person.id]);
    const result = await client.query(`INSERT INTO warnings(person_id,reason,notes,by_discord_id,by_name,created_at)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [person.id, w.reason, `919Admin Pro · ${w.serverId} · advarsel ${w.eventId}`, w.actorId, w.actorName, w.createdAt]);
    const warningId = result.rows[0].id;
    await client.query(`INSERT INTO audit(action,person_id,actor_id,actor_name,details,created_at)
      VALUES('ADVARSEL',$1,$2,$3,$4,$5)`, [person.id, w.actorId, w.actorName, `[919Admin Pro] ${w.reason}`, w.createdAt]);
    await client.query('UPDATE admin_warning_imports SET warning_id=$1 WHERE server_id=$2 AND event_id=$3', [warningId, w.serverId, w.eventId]);
    await client.query('COMMIT');
    return { duplicate: false, id: warningId, personId: person.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function installAdminWarningApi(app, db, { token = process.env.ADMIN_SYNC_TOKEN } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS admin_warning_imports(
    server_id TEXT NOT NULL, event_id TEXT NOT NULL,
    warning_id INTEGER REFERENCES warnings(id) ON DELETE SET NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(server_id,event_id));
    ALTER TABLE admin_warning_imports ENABLE ROW LEVEL SECURITY;`);
  app.post('/api/integrations/919admin/warnings', async (req, res) => {
    if (!token || token.length < 32) return res.status(503).json({ error: '919Admin integration er ikke konfigureret.' });
    const supplied = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: 'Ugyldig integrationsnøgle.' });
    }
    try {
      const result = await importWarning(db, validateWarning(req.body));
      res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      if (!error.status) console.error('919Admin import fejlede:', error.code || 'databasefejl');
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Kunne ikke gemme advarslen. Prøv igen.' });
    }
  });
}
module.exports = { installAdminWarningApi, validateWarning, importWarning };
