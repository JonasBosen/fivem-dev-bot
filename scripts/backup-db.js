require('dotenv').config({ quiet: true });
const { backup, DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

async function main() {
  if (process.env.DATABASE_URL) throw new Error('Online PostgreSQL-backup: brug pg_dump med Supabase-forbindelsen. Denne kommando er til lokal SQLite.');
  const source = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'bot.db');
  if (!fs.existsSync(source)) throw new Error('Ingen lokal database at tage backup af.');
  const db = new DatabaseSync(source, { readOnly: true });
  const directory = path.join(__dirname, '..', 'data', 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `allbot-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  try {
    await backup(db, file);
    console.log(`Backup gemt: ${file}`);
  } finally {
    db.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
