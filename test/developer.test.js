const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_FILE = ':memory:';
delete process.env.DATABASE_URL;
const { db, initDb, settings } = require('../src/db');
const developer = require('../src/modules/developer');

test('developer workflow persists checklist, rejects stale edits and isolates guilds', async () => {
  await initDb();
  const guild = { id: 'guild-a', client: {} };
  try {
    let task = await developer.create(guild,'citizen',{title:'Bil forsvinder',description:'Ved garagen'});
    assert.equal(task.status,'todo');
    assert.equal(await developer.get('guild-b',task.id),undefined);
    const draft = {...task,status:'doing',notes:'Undersøger garage-script',checklist:[{text:'Genskab fejlen',done:true}]};
    task = await developer.update(guild,task.id,draft,'dev');
    assert.equal(task.version,2);
    assert.equal(task.checklist[0].done,true);
    await assert.rejects(developer.update(guild,task.id,draft,'other-dev'),/anden har ændret/);
    await assert.rejects(developer.update({...guild,id:'guild-b'},task.id,{...task,status:'done'},'dev'),/findes ikke/);
    await assert.rejects(developer.update(guild,task.id,{...task,status:'unknown'},'dev'),/Ukendt status/);
    task = await developer.update(guild,task.id,{...task,status:'done'},'dev');
    assert.equal(task.status,'done');
    assert.equal((await db.prepare('SELECT * FROM dev_history WHERE guild_id=?').all(guild.id)).length,2);
    await db.prepare('UPDATE dev_tasks SET channel_id=?,message_id=? WHERE guild_id=? AND id=?').run('channel','message',guild.id,task.id);
    await developer.sync({channels:{fetch:async()=>{throw new Error('offline');}}},await developer.get(guild.id,task.id));
    assert.match((await developer.get(guild.id,task.id)).sync_error,/kunne ikke/);
    let sent;
    await developer.sync({channels:{fetch:async()=>({messages:{fetch:async()=>({edit:async payload=>sent=payload})}})}},await developer.get(guild.id,task.id));
    assert.equal((await developer.get(guild.id,task.id)).sync_error,'');
    assert.equal(sent.embeds[0].data.fields[0].value,'Færdig');
    assert.ok(!JSON.stringify(sent).includes('Undersøger garage-script'));
  } finally { await db.close(); }
});

test('developer role is checked from current Discord membership',async()=>{
  await initDb();
  try {
    await settings.setModule('guild-a','developer',{enabled:true,roles:['developer']});
    let hasRole=true;
    const guild={id:'guild-a',members:{fetch:async opts=>{assert.equal(opts.force,true);return {permissions:{has:()=>false},roles:{cache:{has:id=>id==='developer'&&hasRole}}};}}};
    assert.equal(await developer.canManage(guild,'dev'),true);
    hasRole=false;
    assert.equal(await developer.canManage(guild,'dev'),false);
  } finally {await db.close();}
});
