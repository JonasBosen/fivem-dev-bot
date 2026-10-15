require('dotenv').config({ quiet: true });
const { db, initDb } = require('../src/db');
async function main() {
  if ((!process.env.DATABASE_URL && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)) || !process.env.GUILD_ID) throw new Error('DATABASE_URL og GUILD_ID kræves');
  await initDb();
  try {
    // Read only: the old snapshot remains intact for rollback.
    const snapshot = await db.prepare('SELECT data FROM public.bot_state WHERE id=1').get();
    const state = typeof snapshot?.data === 'string' ? JSON.parse(snapshot.data) : snapshot?.data;
    let count = 0;
    for (const task of Object.values(state?.tasks || {})) {
      const result = await db.prepare('INSERT INTO dev_tasks (guild_id,user_id,title,description,status,notes,checklist,attachments,created_at,updated_at,legacy_id) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,legacy_id) DO NOTHING').run(
        process.env.GUILD_ID, task.createdBy || 'unknown', String(task.title || 'Importeret opgave').slice(0,200),
        [task.description,task.extra].filter(Boolean).join('\n\n').slice(0,4000),
        ['todo','doing','done','rejected'].includes(task.status)?task.status:'todo',
        [task.note,task.assignee?'Tidligere ansvarlig: '+task.assignee:'',task.log?.length?'Tidligere historik:\n'+JSON.stringify(task.log,null,2):''].filter(Boolean).join('\n\n').slice(0,12000),
        '[]','[]', Date.parse(task.createdAt)||Date.now(),Date.parse(task.updatedAt)||Date.now(),String(task.id));
      count += result.changes;
    }
    console.log(`${count} opgaver importeret. Eksisterende data bevaret.`);
  } finally { await db.close(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
