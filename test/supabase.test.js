const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {keyFor}=require('../src/supabase-adapter');
test('Supabase RPC binds hostile input as data and only permits approved statements',async()=>{
  const pg=new PGlite();
  try {
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE public.bot_state (id INTEGER,data JSONB);');
    await pg.exec(require('fs').readFileSync(require('path').join(__dirname,'../supabase-allbot.sql'),'utf8'));
    const call=async(sql,params)=>(await pg.query('SELECT public.allbot_execute($1,$2::jsonb) result',[keyFor(sql),JSON.stringify(params)])).rows[0].result;
    const task=await call('INSERT INTO dev_tasks (guild_id,user_id,title,description,status,notes,checklist,attachments,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',['a','citizen',"$1'); DROP SCHEMA allbot CASCADE; --",'Title $2 with quotes \' and unicode æøå','todo','','[]','[]',Date.now(),Date.now()]);
    assert.equal(task.rowCount,1);
    assert.equal(task.rows[0].title,"$1'); DROP SCHEMA allbot CASCADE; --");
    const saved=await call('SELECT * FROM dev_tasks WHERE guild_id=? AND id=?',['a',task.rows[0].id]);
    assert.equal(saved.rows[0].description,'Title $2 with quotes \' and unicode æøå');
    assert.equal((await call('SELECT * FROM dev_tasks WHERE guild_id=? AND id=?',['b',task.rows[0].id])).rowCount,0);
    await call('INSERT INTO site_audit (guild_id,user_id,module,action,details,created_at) VALUES (?,?,?,?,?,?)',['a','dev','developer','saved','{}',Date.now()]);
    await call('INSERT INTO dev_audit (guild_id,task_id,user_id,action,details,created_at) VALUES (?,?,?,?,?,?)',['a',task.rows[0].id,'dev','updated','{}',Date.now()]);
    assert.equal((await call('SELECT * FROM site_audit WHERE guild_id=? AND module=? AND id<CAST(? AS BIGINT) ORDER BY id DESC LIMIT 100',['a','developer',Number.MAX_SAFE_INTEGER])).rowCount,1);
    assert.equal((await call('SELECT * FROM dev_audit WHERE guild_id=? AND id<CAST(? AS BIGINT) ORDER BY id DESC LIMIT 100',['a',Number.MAX_SAFE_INTEGER])).rowCount,1);
    await assert.rejects(call('DROP SCHEMA allbot CASCADE',[]),/Unknown query/);
    await assert.rejects(call('SELECT * FROM dev_tasks WHERE guild_id=? AND id=?',['a']),/Invalid parameters/);
    assert.equal((await pg.query("SELECT has_function_privilege('anon','public.allbot_execute(text,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await pg.query("SELECT has_function_privilege('authenticated','public.allbot_execute(text,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await pg.query("SELECT has_function_privilege('service_role','public.allbot_execute(text,jsonb)','EXECUTE') allowed")).rows[0].allowed,true);
  } finally {await pg.close();}
});
