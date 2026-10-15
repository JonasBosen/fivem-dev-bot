const BASE_SCHEMA = "\nCREATE TABLE IF NOT EXISTS settings (guild_id TEXT PRIMARY KEY, data TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS tickets (\n  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, channel_id TEXT, user_id TEXT, type TEXT,\n  status TEXT DEFAULT 'open', claimed_by TEXT, answers TEXT, transcript TEXT,\n  created_at INTEGER, closed_at INTEGER, closed_by TEXT);\nCREATE TABLE IF NOT EXISTS applications (\n  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, form_id TEXT, user_id TEXT, answers TEXT,\n  status TEXT DEFAULT 'pending', reviewed_by TEXT, message_id TEXT, channel_id TEXT, created_at INTEGER);\nCREATE TABLE IF NOT EXISTS levels (guild_id TEXT, user_id TEXT, xp INTEGER DEFAULT 0, PRIMARY KEY (guild_id, user_id));\nCREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, mod_id TEXT, reason TEXT, created_at INTEGER);\nCREATE TABLE IF NOT EXISTS giveaways (\n  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, channel_id TEXT, message_id TEXT, prize TEXT,\n  winners INTEGER, ends_at INTEGER, entries TEXT DEFAULT '[]', ended INTEGER DEFAULT 0, winner_ids TEXT, host_id TEXT);\nCREATE TABLE IF NOT EXISTS stream_state (guild_id TEXT, key TEXT, value TEXT, PRIMARY KEY (guild_id, key));\n";
const SQLITE_SCHEMA = BASE_SCHEMA + `
CREATE TABLE IF NOT EXISTS dev_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'todo', notes TEXT DEFAULT '', checklist TEXT DEFAULT '[]', attachments TEXT DEFAULT '[]', channel_id TEXT, message_id TEXT, sync_error TEXT DEFAULT '', legacy_id TEXT, version INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS dev_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, task_id INTEGER NOT NULL, user_id TEXT NOT NULL, author_type TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER);
CREATE INDEX IF NOT EXISTS dev_comments_task ON dev_comments(guild_id,task_id);
CREATE TABLE IF NOT EXISTS dev_history (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, task_id INTEGER, user_id TEXT, status TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS dev_images (task_id INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, mime TEXT NOT NULL, content TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS dev_tasks_guild ON dev_tasks(guild_id);
CREATE UNIQUE INDEX IF NOT EXISTS dev_tasks_legacy ON dev_tasks(guild_id,legacy_id);
`;
const POSTGRES_SCHEMA = 'CREATE SCHEMA IF NOT EXISTS allbot;\n' + SQLITE_SCHEMA
  .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
  .replace(/(created_at|closed_at|ends_at|updated_at) INTEGER/g, '$1 BIGINT')
  .replace(/ON dev_tasks/g, 'ON allbot.dev_tasks')
  .replace(/ON dev_comments/g, 'ON allbot.dev_comments')
  .replace(/CREATE TABLE IF NOT EXISTS (\w+)/g, 'CREATE TABLE IF NOT EXISTS allbot.$1');
module.exports = { SQLITE_SCHEMA, POSTGRES_SCHEMA };
