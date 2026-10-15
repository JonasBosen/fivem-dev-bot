const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';delete process.env.DATABASE_URL;
const {initDb,db}=require('../src/db'),developer=require('../src/modules/developer'),planning=require('../src/modules/developer-planning');
test('scheduled case time persists, is shown in citizen embed in Danish time and keeps notes private',async()=>{
  await initDb();try{
    let message;const guild={id:'a',client:{channels:{fetch:async()=>({messages:{fetch:async()=>({edit:async payload=>message=payload})}})}}};
    let task=await developer.create(guild,'citizen',{title:'Garagefejl',description:'Bilen forsvandt'});
    await db.prepare('UPDATE dev_tasks SET channel_id=?,message_id=? WHERE guild_id=? AND id=?').run('dm','message',guild.id,task.id);
    task=await developer.get(guild.id,task.id);
    task=await developer.update(guild,task.id,{...task,notes:'Privat note',planning:{...task.planning,scheduledStart:'2026-10-19T08:00:00.000Z',scheduledEnd:'2026-10-19T09:30:00.000Z'}},'dev');
    assert.equal(task.planning.scheduledStart,'2026-10-19T08:00:00.000Z');
    const schedule=message.embeds[0].data.fields.find(f=>f.name.includes('Planlagt'));
    assert.match(schedule.value,/mandag/);assert.match(schedule.value,/10[.:]00/);assert.match(schedule.value,/11[.:]30/);
    assert.ok(!JSON.stringify(message).includes('Privat note'));
    assert.throws(()=>planning.validate({...task.planning,scheduledEnd:'2026-10-19T07:00:00.000Z'}),/Sluttid/);
    assert.throws(()=>planning.validate({...task.planning,scheduledEnd:''}),/både/);
    const audit=await require('../src/modules/developer-audit').page(guild.id);assert.equal(audit.events[0].details.after.planning.scheduledStart,task.planning.scheduledStart);
  }finally{await db.close();}
});
