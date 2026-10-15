const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';delete process.env.DATABASE_URL;
const {initDb,db}=require('../src/db'),gate=require('../src/modules/developer-gate');
test('developer PIN excludes administrators without code, is hashed, rate limited and revoked when changed',async()=>{
  await initDb();try{
    const guild={id:'guild',ownerId:'owner'},owner={user:{id:'owner'}},admin={user:{id:'admin'}};
    await assert.rejects(gate.setup(guild,admin,'1234'),/Kun serverejeren/);
    await gate.setup(guild,owner,'9284');
    const row=await db.prepare('SELECT * FROM dev_gate WHERE guild_id=?').get(guild.id);assert.ok(row.hash&&!JSON.stringify(row).includes('9284'));
    assert.equal((await gate.status(guild,admin)).unlocked,false);
    await gate.unlock(guild,admin,'9284','ip1');assert.equal((await gate.status(guild,admin)).unlocked,true);
    await assert.rejects(gate.setup(guild,owner,'1111'),/allerede/);
    await gate.change(guild,owner,'6482');assert.equal((await gate.status(guild,admin)).unlocked,false);
    for(let i=0;i<5;i++)await assert.rejects(gate.unlock(guild,admin,'0000','ip2'),/Forkert/);
    await assert.rejects(gate.unlock(guild,admin,'6482','ip2'),/mange/);
    const another={user:{id:'another-developer'}};await gate.unlock(guild,another,'64-82','ip2');assert.equal((await gate.status(guild,another)).unlocked,true);assert.equal((await gate.status(guild,owner)).unlocked,true);const sharedA={user:{id:'developer-a'}},sharedB={user:{id:'developer-b'}};await Promise.all([gate.unlock(guild,sharedA,'64-82','same-ip'),gate.unlock(guild,sharedB,'6482','same-ip')]);assert.equal((await gate.status(guild,sharedA)).unlocked,true);assert.equal((await gate.status(guild,sharedB)).unlocked,true);delete sharedA.devGate;assert.equal((await gate.status(guild,sharedB)).unlocked,true);
    owner.devGate.guild.until=Date.now()-1;assert.equal((await gate.status(guild,owner)).unlocked,false);
    assert.equal((await gate.status({id:'other'},admin)).unlocked,false);
  }finally{await db.close();}
});
