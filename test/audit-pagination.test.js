const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {db,initDb}=require('../src/db');
const audit=require('../src/modules/developer-audit');
const developer=require('../src/modules/developer');
test('audit pages retain events beyond 300 and keep guild histories separate',async()=>{
  await initDb();
  try{
    for(let i=0;i<321;i++)await audit.record('a',1,'dev','updated',{index:i});
    await audit.record('b',1,'other','created',{});
    let before,events=[];
    do{const page=await audit.page('a',before);events.push(...page.events);before=page.next;}while(before);
    assert.equal(events.length,321);
    assert.equal(new Set(events.map(e=>e.id)).size,321);
    assert.equal(events.at(-1).details.index,0);
    assert.ok(events.every(e=>e.guild_id==='a'));
    await assert.rejects(audit.page('a','invalid'),/logmarkør/);
    const guild={id:'a',client:{}};
    const task=await developer.create(guild,'dev',{title:'Releaseklar',description:''});
    const done=await developer.update(guild,task.id,{...task,status:'done'},'dev');
    const closed=await developer.update(guild,task.id,{...done,status:'closed'},'dev');
    assert.equal(closed.status,'closed');
  }finally{await db.close();}
});
