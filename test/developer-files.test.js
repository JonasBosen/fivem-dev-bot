const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {db,initDb,settings}=require('../src/db');
const files=require('../src/modules/developer-files');
const developer=require('../src/modules/developer');
const png={name:'fejl.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII='};
test('developer uploads persist multiple images and enforce guild and file restrictions',async()=>{
  await initDb();
  try{
    const task=await developer.create({id:'guild-a'},'dev',{title:'Arbejdsopgave',description:''});
    await files.upload('guild-a',task.id,'dev',png);
    const images=await files.upload('guild-a',task.id,'dev',{...png,name:'løsning.png'});
    assert.equal(images.length,2);
    assert.equal((await developer.get('guild-a',task.id)).files[1].name,'løsning.png');
    assert.equal((await files.list('guild-b',task.id)).length,0);
    await assert.rejects(files.upload('guild-b',task.id,'dev',png),/findes ikke/);
    assert.throws(()=>files.decodeImage({name:'fake.png',data:'data:image/png;base64,SGVsbG8='}),/gyldigt billede/);
    assert.throws(()=>files.decodeImage({name:'script.svg',data:'data:image/svg+xml;base64,SGVsbG8='}),/PNG/);
    assert.throws(()=>files.decodeImage({name:'big.png',data:'x'.repeat(10*1024*1024)}),/6 MB/);
    const row=await db.prepare('SELECT mime,content FROM dev_files WHERE guild_id=? AND task_id=? AND id=?').get('guild-a',task.id,images[0].id);
    assert.equal(row.mime,'image/png');
    assert.ok(row.content.startsWith('iVBOR'));
  }finally{await db.close();}
});

test('citizen can add an image to their own case and rejection/deletion leave an audit trail',async()=>{
  await initDb();
  const originalFetch=global.fetch;
  try{
    await settings.setModule('guild-a','developer',{enabled:true,reporterRoles:['citizen']});
    const guild={id:'guild-a',members:{fetch:async()=>({permissions:{has:()=>false},roles:{cache:{has:id=>id==='citizen'}}})},client:{}};
    let task=await developer.create(guild,'citizen-user',{title:'Fejl med bil',description:'Test'});
    global.fetch=async()=>new Response(Buffer.from(png.data.split(',')[1],'base64'),{headers:{'content-type':'image/png'}});
    const attachment={url:'https://cdn.discordapp.com/attachments/test/image.png',name:'borger.png',size:100};
    await assert.rejects(files.citizenUpload(guild,task.id,'other-user',attachment),/anden borger/);
    assert.equal((await files.citizenUpload(guild,task.id,'citizen-user',attachment)).length,1);
    task=await developer.update(guild,task.id,{...task,status:'rejected'},'developer');
    assert.equal(task.status,'rejected');
    await developer.remove(guild,task.id,'developer');
    assert.equal(await developer.get(guild.id,task.id),undefined);
    assert.ok(await db.prepare('SELECT * FROM dev_tasks WHERE guild_id=? AND id=?').get(guild.id,task.id));
    const log=await require('../src/modules/developer-audit').list(guild.id);
    assert.deepEqual(log.map(e=>e.action),['deleted','rejected','image_uploaded','created']);
    assert.equal(log[0].details.title,'Fejl med bil');
    assert.equal((await require('../src/modules/developer-audit').list('guild-b')).length,0);
    await assert.rejects(files.citizenUpload(guild,task.id,'citizen-user',attachment),/findes ikke/);
  }finally{global.fetch=originalFetch;await db.close();}
});
