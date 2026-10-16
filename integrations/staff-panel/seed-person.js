require("dotenv").config();
const { Pool } = require("pg");

const db = new Pool(require('./db-options').databaseOptions(2));

async function seed() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL mangler.");
  await db.query(`
    CREATE TABLE IF NOT EXISTS people (id SERIAL PRIMARY KEY, discord_id TEXT NOT NULL UNIQUE, discord_name TEXT NOT NULL, fivem_name TEXT DEFAULT '', license TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL, created_by TEXT NOT NULL);
    ALTER TABLE people ADD COLUMN IF NOT EXISTS discord_avatar TEXT DEFAULT '';
  `);

  await db.query(`
    INSERT INTO people (discord_id, discord_name, fivem_name, license, notes, discord_avatar, created_at, created_by)
    VALUES ($1, $2, '', '', '', '', $3, 'Manuel registreret')
    ON CONFLICT (discord_id) DO UPDATE SET discord_name = EXCLUDED.discord_name
  `, ["797198257192435743", "Mizut", new Date().toISOString()]);

  // Fjern kun de gamle Teamet-placeholder records fra people-tabellen.
  // Teamet ligger nu i sin egen team_members-tabel.
  await db.query(`DELETE FROM people WHERE discord_id = ANY($1::text[])`, [[
    "DN_TEAM_SLOT_1","DN_TEAM_SLOT_2","DN_TEAM_SLOT_3",
    "DN_TEAM_SLOT_4","DN_TEAM_SLOT_5","DN_TEAM_SLOT_6"
  ]]);

  console.log("Database klargjort. Spillere og Teamet holdes nu adskilt.");
}

seed()
  .catch(err => { console.error("Kunne ikke klargøre databasen:", err.message); process.exitCode = 1; })
  .finally(async () => { await db.end().catch(() => {}); });
