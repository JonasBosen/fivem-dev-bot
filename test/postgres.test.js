const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { createPostgresAdapter } = require('../src/db');

test('PostgreSQL stores every module and preserves unrelated tables', async () => {
  const pg = new PGlite();
  const db = createPostgresAdapter(pg);
  try {
    await pg.exec("CREATE TABLE public.warnings (message TEXT); INSERT INTO public.warnings VALUES ('unchanged');");
    await db.init();
    await db.init();
    const stamp = Date.now();
    for (const table of ['tickets','applications','warnings','giveaways']) {
      const result = await db.prepare(`INSERT INTO ${table} (guild_id) VALUES (?)`).run('guild-a');
      assert.equal(result.lastInsertRowid, 1);
      assert.equal((await db.prepare(`SELECT * FROM ${table} WHERE id=? AND guild_id=?`).get(1,'guild-a')).guild_id,'guild-a');
      assert.equal(await db.prepare(`SELECT * FROM ${table} WHERE id=? AND guild_id=?`).get(1,'guild-b'),undefined);
    }
    await db.prepare('UPDATE tickets SET created_at=?, transcript=? WHERE id=?').run(stamp,'<html>æøå</html>',1);
    assert.equal(Number((await db.prepare('SELECT created_at FROM tickets WHERE id=?').get(1)).created_at),stamp);
    await db.prepare('INSERT INTO settings (guild_id,data) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET data=excluded.data').run('guild-a','{"music":true}');
    assert.equal((await db.prepare('SELECT data FROM settings WHERE guild_id=?').get('guild-a')).data,'{"music":true}');
    const xp = 'INSERT INTO levels (guild_id,user_id,xp) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp = xp + ?';
    await db.prepare(xp).run('guild-a','user',10,10);
    await db.prepare(xp).run('guild-a','user',15,15);
    assert.equal((await db.prepare('SELECT xp FROM levels WHERE guild_id=? AND user_id=?').get('guild-a','user')).xp,25);
    await db.prepare('INSERT INTO stream_state (guild_id,key,value) VALUES (?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value').run('guild-a','tw:test','live');
    await db.prepare('DELETE FROM stream_state WHERE guild_id=? AND key=?').run('guild-a','tw:test');
    assert.equal((await db.prepare('SELECT * FROM stream_state').all()).length,0);
    assert.equal((await pg.query('SELECT message FROM public.warnings')).rows[0].message,'unchanged');
  } finally { await pg.close(); }
});

test('all SQL statements in modules and dashboard parse on PostgreSQL', async () => {
  const fs = require('fs');
  const path = require('path');
  const acorn = require('acorn');
  const { postgresSql } = require('../src/db');
  const pg = new PGlite();
  try {
    await createPostgresAdapter(pg).init();
    const files = [...fs.readdirSync(path.join(__dirname,'../src/modules')).map(f=>path.join(__dirname,'../src/modules',f)),path.join(__dirname,'../src/web/server.js')];
    const queries = new Set();
    function walk(n) {
      if (!n || typeof n!=='object') return;
      if (n.type==='CallExpression' && n.callee.type==='MemberExpression' && n.callee.object.name==='db' && n.callee.property.name==='prepare') queries.add(n.arguments[0].value);
      for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walk); else if(v && typeof v==='object') walk(v);
    }
    for (const f of files) walk(acorn.parse(fs.readFileSync(f,'utf8'),{ecmaVersion:'latest'}));
    let index=0;
    for (const sql of queries) await pg.exec(`PREPARE check_${index++} AS ${postgresSql(sql)}`);
    assert.ok(queries.size>30);
  } finally { await pg.close(); }
});
