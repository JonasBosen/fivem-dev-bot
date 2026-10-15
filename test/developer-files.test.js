const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {db,initDb}=require('../src/db');
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
