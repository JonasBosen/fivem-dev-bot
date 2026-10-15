const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {initDb,db}=require('../src/db');
const developer=require('../src/modules/developer');
const catalog=require('../src/modules/report-categories');
test('citizen categories and custom text persist on developer cases and audit entries',async()=>{
  await initDb();
  try{
    const guild={id:'guild-a'};
    const mlo=await developer.create(guild,'citizen',{title:'Dør mangler',description:'Politistation',reportCategory:'mlo',reportPriority:'critical'});
    assert.equal(mlo.planning.reportCategory,'mlo');assert.equal(mlo.planning.kind,'mapping');
    assert.equal(catalog.label(mlo.planning),'MLO / interiør');
    assert.equal(mlo.planning.priority,'critical');
    assert.equal(mlo.planning.reportPriority,'critical');
    const custom=await developer.create(guild,'citizen',{title:'Egen sag',description:'Beskrivelse',reportCategory:'other',reportCategoryCustom:'Minigolf på havnen'});
    assert.equal(catalog.label(custom.planning),'Minigolf på havnen');
    const audit=await require('../src/modules/developer-audit').list(guild.id);
    assert.equal(audit[0].details.category.reportCategoryCustom,'Minigolf på havnen');
    await assert.rejects(developer.create(guild,'citizen',{title:'Test',description:'',reportCategory:'other'}),/Skriv kategorien/);
    await assert.rejects(developer.create(guild,'citizen',{title:'Test',description:'',reportCategory:'unknown'}),/gyldig kategori/);
    assert.equal((await require('../src/modules/developer-planning').all('guild-b'))[mlo.id],undefined);
  }finally{await db.close();}
});
