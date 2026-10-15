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

test('citizens and developers can exchange comments without exposing internal notes',async()=>{
  await initDb();
  try {
    await settings.setModule('guild-a','developer',{enabled:true,roles:['developer']});
    let notification;
    const guild={id:'guild-a',members:{fetch:async({user})=>({permissions:{has:()=>false},roles:{cache:{has:id=>user==='dev'&&id==='developer'}}})},client:{users:{fetch:async()=>({send:async payload=>notification=payload})}}};
    let task=await developer.create(guild,'citizen',{title:'Garage',description:'Fejl ved parkering'});
    task=await developer.update(guild,task.id,{...task,notes:'Kun udviklere må se dette'},'dev');
    task=await developer.comment(guild,task.id,'citizen','Det sker også i en anden garage');
    assert.equal(task.comments[0].author_type,'citizen');
    await assert.rejects(developer.comment(guild,task.id,'stranger','Læs min besked'),/Ingen adgang/);
    await assert.rejects(developer.comment(guild,task.id,'citizen','Jeg er udvikler',true),/Ingen adgang/);
    await assert.rejects(developer.comment({...guild,id:'guild-b'},task.id,'citizen','Anden server'),/findes ikke/);
    task=await developer.comment(guild,task.id,'dev','Vi undersøger det. Kan du prøve igen?',true);
    assert.equal(task.comments.length,2);
    assert.match(notification.content,/Vi undersøger det/);
    assert.ok(!JSON.stringify(notification).includes('Kun udviklere'));
    await assert.rejects(developer.comment(guild,task.id,'dev','Spam',true),/fem sekunder/);
  } finally {await db.close();}
});

test('configured citizen and manager roles grant separate access and removal takes effect',async()=>{
  await initDb();
  try {
    await settings.setModule('guild-a','general',{adminRoles:['owner','leadership','manager']});
    await settings.setModule('guild-a','developer',{enabled:true,reporterRoles:['citizen']});
    const assigned=new Set(['citizen']);
    const guild={id:'guild-a',members:{fetch:async()=>({permissions:{has:()=>false},roles:{cache:{has:id=>assigned.has(id)}}})}};
    assert.equal(await developer.canReport(guild,'user'),true);
    assert.equal(await developer.canManage(guild,'user'),false);
    assigned.clear();
    assert.equal(await developer.canReport(guild,'user'),false);
    assigned.add('leadership');
    assert.equal(await developer.canManage(guild,'user'),true);
    assert.equal(await developer.canReport(guild,'user'),true);
  } finally {await db.close();}
});

test('FiveM planning fields persist, stay private and appear in the audit history',async()=>{
  await initDb();
  try {
    const guild={id:'guild-a',client:{}};
    let task=await developer.create(guild,'dev',{title:'Garage bug',description:'Bil forsvinder'});
    task=await developer.update(guild,task.id,{...task,planning:{...task.planning,priority:'critical',resource:'qb-garages',assignee:'Udvikler',estimateHours:2.5,spentHours:1.25,deadline:'2026-10-20',actual:'Intern stacktrace'}},'dev');
    assert.equal(task.planning.resource,'qb-garages');
    assert.equal((await require('../src/modules/developer-planning').all(guild.id))[task.id].spentHours,1.25);
    assert.deepEqual(await require('../src/modules/developer-planning').all('other-guild'),{});
    const history=await require('../src/modules/developer-audit').list(guild.id);
    assert.equal(history[0].details.after.planning.priority,'critical');
    await assert.rejects(developer.update(guild,task.id,{...task,planning:{...task.planning,spentHours:-1}},'dev'),/Timer/);
    await assert.rejects(developer.update(guild,task.id,{...task,planning:{...task.planning,commitUrl:'javascript:alert(1)'}},'dev'),/https/);
  }finally{await db.close();}
});
