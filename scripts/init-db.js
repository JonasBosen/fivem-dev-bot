require('dotenv').config({ quiet: true });
const { db, initDb } = require('../src/db');
async function main() {
  try { await initDb(); console.log('AllBot-database klar med alle syv tabeller.'); }
  finally { await db.close(); }
}
main().catch(() => { console.error('Databaseforbindelsen fejlede. Tjek DATABASE_URL.'); process.exitCode = 1; });
