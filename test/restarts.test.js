const {test}=require('node:test'),assert=require('node:assert/strict');process.env.DB_FILE=':memory:';delete process.env.DATABASE_URL;
const {initDb,settings,db}=require('../src/db'),restarts=require('../src/modules/restarts');
test('Danish restart scheduling crosses midnight and daylight saving correctly',()=>{
 assert.equal(new Date(restarts.nextRestart(['18:00'],Date.parse('2026-10-15T15:00:00Z'))).toISOString(),'2026-10-15T16:00:00.000Z');
 assert.equal(new Date(restarts.nextRestart(['06:00'],Date.parse('2026-10-15T21:00:00Z'))).toISOString(),'2026-10-16T04:00:00.000Z');
 assert.equal(new Date(restarts.nextRestart(['06:00'],Date.parse('2026-10-24T21:00:00Z'))).toISOString(),'2026-10-25T05:00:00.000Z');
 assert.equal(new Date(restarts.nextRestart(['02:30'],Date.parse('2026-03-28T23:00:00Z'))).toISOString(),'2026-03-30T00:30:00.000Z');
 assert.throws(()=>restarts.validate({enabled:true,channel:'123',pingRole:'',times:['25:00'],warningMinutes:[5]}));
});
test('one countdown message updates, milestone notices survive reload and later daily restarts run again',async()=>{
 await initDb();try{const sent=[],edits=[],messages=new Map();const channel={isTextBased:()=>true,isThread:()=>false,messages:{fetch:async id=>messages.get(id)},send:async data=>{sent.push(data);const msg={id:String(sent.length),edit:async data=>edits.push(data)};messages.set(msg.id,msg);return msg;}};const guild={id:'restarts',channels:{fetch:async()=>channel}};
 const cfg={enabled:true,channel:'123456789012345678',pingRole:'234567890123456789',times:['18:00'],warningMinutes:[5,2]};await restarts.configure(guild,cfg);
 const at=s=>Date.parse('2026-10-15T'+s+'Z');await restarts.tick(guild,at('15:55:00'));assert.equal(sent.length,1);assert.deepEqual(sent[0].allowedMentions.roles,[cfg.pingRole]);await restarts.tick(guild,at('15:55:15'));assert.equal(sent.length,1);assert.equal(edits.length,1);
 delete require.cache[require.resolve('../src/modules/restarts')];const reloaded=require('../src/modules/restarts');await reloaded.tick(guild,at('15:58:00'));assert.equal(sent.length,2);assert.match(sent[1].content,/2 minutter/);await reloaded.tick(guild,at('15:58:15'));assert.equal(sent.length,2);
 await reloaded.tick(guild,at('16:00:01'));assert.match(edits.at(-1).content,/tidspunkt er nået/);assert.equal((await settings.get(guild.id)).restart.state.finished,true);
 await reloaded.tick(guild,Date.parse('2026-10-16T15:55:00Z'));assert.equal(sent.length,3);await reloaded.configure(guild,{...cfg,enabled:false});assert.match(edits.at(-1).content,/slået fra/);
 }finally{await db.close();}
});
