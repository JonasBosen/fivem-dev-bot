const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.DB_FILE=':memory:';
const {PermissionsBitField,PermissionFlagsBits:P,ChannelType}=require('discord.js');
const {initDb,db}=require('../src/db'),state=require('../src/modules/durable-state'),lab=require('../src/modules/testlab');
const gid='928657151260516382',owner='100000000000000001',other='100000000000000002',textId='200000000000000001',voiceId='200000000000000002',roleId='300000000000000001';
function fixture(){
 const sent=[],changes=[],all=new PermissionsBitField(PermissionsBitField.All),none=new PermissionsBitField();
 const bot={id:'bot',permissions:all,roles:{highest:{position:99}}};
 const members=new Map([[owner,{id:owner,user:{bot:false},permissions:all,roles:{cache:new Map(),highest:{position:99}}}],[other,{id:other,user:{bot:false},permissions:none,roles:{cache:new Map(),highest:{position:1}}}]]);
 const roles=new Map([[roleId,{id:roleId,name:'Tester',position:1,managed:false,permissions:none}]]);
 const text={id:textId,type:ChannelType.GuildText,permissionsFor:()=>all,send:async payload=>{sent.push(payload);return {id:String(400000000000000000n+BigInt(sent.length)),url:'https://discord.com/channels/test'};}};
 const voice={id:voiceId,type:ChannelType.GuildVoice,bitrate:64000,userLimit:0,permissionsFor:()=>all,edit:async value=>{changes.push(value);Object.assign(voice,value);}};
 const channels=new Map([[textId,text],[voiceId,voice]]);
 const guild={id:gid,ownerId:owner,maximumBitrate:96000,client:{user:{id:'bot'},isReady:()=>true},members:{fetchMe:async()=>bot,fetch:async arg=>members.get(typeof arg==='string'?arg:arg.user)},roles:{fetch:async id=>roles.get(id),cache:roles},channels:{cache:channels,fetch:async id=>channels.get(id)}};
 return {guild,roles,members,sent,voice,changes};
}
test('testlab validates separation, revisions, Discord side effects, deduplication and durable jobs',async()=>{
 await initDb();try{
  const f=fixture(),guild=f.guild,cfg=lab.defaults();assert.equal(cfg.enabled,false);assert.ok(Object.values(cfg.features).every(m=>!m.enabled));
  const input={...cfg,actionCooldownSeconds:0,testChannels:[textId,voiceId],testerRoles:[roleId],roleMenu:{roles:[roleId],exclusive:true}};
  await lab.configure(guild,owner,input);
  const poll={channelId:textId,question:'Hvilken test?',answers:['En','To'],duration:24,multi:false};
  assert.equal((await lab.preview(guild,owner,'polls',poll)).mode,'preview');assert.equal(f.sent.length,0);
  await assert.rejects(lab.execute(guild,owner,'polls',poll,crypto.randomUUID()),/Aktivér/);
  await assert.rejects(lab.configure(guild,owner,input),/ændret/);
  let current=await lab.load(gid);await lab.configure(guild,owner,{...current,enabled:true,features:Object.fromEntries(Object.keys(current.features).map(k=>[k,{enabled:true}]))});
  const requestId=crypto.randomUUID(),result=await lab.execute(guild,owner,'polls',poll,requestId);assert.equal(result.type,'polls');assert.equal(f.sent.length,1);assert.equal(f.sent[0].allowedMentions.parse.length,0);
  assert.deepEqual(await lab.execute(guild,owner,'polls',poll,requestId),result);assert.equal(f.sent.length,1);
  await assert.rejects(lab.execute(guild,owner,'polls',{...poll,channelId:'999999999999999999'},crypto.randomUUID()),/testkanal/);
  const permissionsFor=f.guild.channels.cache.get(textId).permissionsFor;f.guild.channels.cache.get(textId).permissionsFor=m=>m.id===other?new PermissionsBitField():permissionsFor(m);
  await assert.rejects(lab.execute(guild,other,'polls',poll,crypto.randomUUID()),/rettighed/);
  const before=Date.now(),job=await lab.execute(guild,owner,'reminders',{channelId:textId,content:'Husk testen',at:before+65000},crypto.randomUUID());
  await lab.tick(guild,before+1000);assert.equal(f.sent.length,1);await lab.tick(guild,before+70000);await lab.tick(guild,before+80000);assert.equal(f.sent.length,2);assert.equal((await lab.load(gid)).jobs.find(j=>j.id===job.id).status,'sent');
  const canceled=await lab.execute(guild,owner,'reminders',{channelId:textId,content:'Annulleres',at:Date.now()+65000},crypto.randomUUID());await lab.cancelJob(guild,owner,canceled.id);await lab.tick(guild,Date.now()+90000);assert.equal(f.sent.length,2);
  const voiceResult=await lab.execute(guild,owner,'voice',{channelId:voiceId,bitrate:80,limit:8},crypto.randomUUID());assert.equal(f.voice.bitrate,80000);await lab.finish(guild,owner,voiceResult.id);assert.equal(f.voice.bitrate,64000);
  await assert.rejects(lab.execute(guild,owner,'voice',{channelId:voiceId,bitrate:128,limit:0},crypto.randomUUID()),/højst 96/);
  assert.equal((await state.read('testlab:other',{})).enabled,undefined);
 }finally{await db.close();}
});
test('team generation is balanced and configuration rejects powerful roles and stale updates',async()=>{
 await initDb();try{
  const f=fixture();f.guild.id='another-guild';const teams=lab.divide(['a','b','c','d','e','f','g'],3,()=>0);assert.deepEqual(teams.map(t=>t.length),[3,2,2]);assert.equal(new Set(teams.flat()).size,7);
  f.roles.get(roleId).permissions=new PermissionsBitField(P.Administrator);
  await assert.rejects(lab.safeRole(f.guild,roleId),/administrative/);
  assert.throws(()=>lab.normalize('polls',{channelId:textId,question:'Test',answers:['A','A'],duration:1}),/forskellige/);
  assert.throws(()=>lab.normalize('events',{name:'Test',description:'Test',location:'Her',start:Date.now()-1000,end:Date.now()+10000}),/fremtidig/);
 }finally{await db.close();}
});
test('a failed scheduled send becomes check_required and is not blindly retried',async()=>{
 await initDb();try{
  const f=fixture();f.guild.id='failure-guild';let sends=0;f.guild.channels.cache.get(textId).send=async()=>{sends++;throw Error('connection lost');};
  await state.write('testlab:failure-guild',()=>({...lab.defaults(),enabled:true,testChannels:[textId],features:{reminders:{enabled:true}},jobs:[{id:crypto.randomUUID(),channelId:textId,uid:owner,content:'Test',at:0,status:'scheduled'}]}));
  await lab.tick(f.guild);await lab.tick(f.guild);assert.equal(sends,1);assert.equal((await lab.load(f.guild.id)).jobs[0].status,'check_required');
 }finally{await db.close();}
});
