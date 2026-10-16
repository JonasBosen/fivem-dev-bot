const PEOPLE_OVERVIEW_SQL = `SELECT p.*,
  COALESCE(w.total,0)::int AS warnings_count, COALESCE(b.total,0)::int AS active_bans
  FROM people p
  LEFT JOIN (SELECT person_id,COUNT(*) AS total FROM warnings GROUP BY person_id) w ON w.person_id=p.id
  LEFT JOIN (SELECT person_id,COUNT(*) AS total FROM bans
    WHERE revoked=0 AND (until='' OR until::timestamptz>=NOW()) GROUP BY person_id) b ON b.person_id=p.id
  ORDER BY p.created_at DESC`;

async function installPlayerReadIndexes(db) {
  await db.query(`CREATE INDEX IF NOT EXISTS warnings_person_created_idx ON warnings(person_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS bans_person_created_idx ON bans(person_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_created_idx ON audit(created_at DESC);`);
}

function installPlayerReadApi(app, db, requireLogin) {
  // Register before /api/people/:id so "details" is not interpreted as a person ID.
  app.get('/api/people/details', requireLogin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [people, warnings, bans] = await Promise.all([
        db.query('SELECT id,discord_name FROM people ORDER BY created_at DESC'),
        db.query('SELECT * FROM warnings ORDER BY created_at DESC'),
        db.query('SELECT * FROM bans ORDER BY created_at DESC'),
      ]);
      const byId = new Map(people.rows.map(p => [p.id, { ...p, warnings: [], bans: [] }]));
      for (const w of warnings.rows) byId.get(w.person_id)?.warnings.push(w);
      for (const b of bans.rows) byId.get(b.person_id)?.bans.push(b);
      res.json([...byId.values()]);
    } catch (error) {
      console.error('Kunne ikke hente advarsler og bans:', error.message);
      res.status(500).json({ error: 'Kunne ikke hente advarsler og bans.' });
    }
  });
}
module.exports = { PEOPLE_OVERVIEW_SQL, installPlayerReadIndexes, installPlayerReadApi };
