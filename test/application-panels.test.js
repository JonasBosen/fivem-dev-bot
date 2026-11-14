const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {initDb,db,settings}=require('../src/db'),panels=require('../src/modules/application-panels');
test('allowlist panel has independent media and edits only the latest own panel in its destination',async()=>{
 await initDb();try{
  const commonId='123456789012345678',writtenId='123456789012345679',sent=[],edited=[];
  const own={id:'123456789012345681',author:{id:'bot'},components:[{components:[{customId:'app:start:allowlist'},{customId:'app:start:staff'}]}],edit:async p=>{edited.push(p);return {id:own.id,channelId:commonId};}};
  const foreign={id:'123456789012345689',author:{id:'appy'},components:own.components,edit:async()=>{throw Error('Do not edit Appy');}};
  const ch=(id,name,messages)=>({id,name,type:0,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),messages:{fetch:async()=>new Map(messages.map(m=>[m.id,m]))},send:async p=>{sent.push(p);return {id:'123456789012345690',channelId:id};}});
  const channels=[ch('123456789012345677','💂staff-ansøgninger💂afventer',[]),ch(commonId,'📋ansøgninger📋',[own,foreign]),ch(writtenId,'📑skriftlig-ansøgning',[])];
  const guild={id:'panel-test',client:{user:{id:'bot'}},members:{me:{}},channels:{cache:new Map(channels.map(c=>[c.id,c])),fetch:async id=>channels.find(c=>c.id===id)}};
  await settings.setModule(guild.id,'applications',{panelTitle:'Alle ansøgninger',panelText:'Vælg en ansøgning',imageUrl:'https://example.com/creator.png',forms:[{id:'allowlist',name:'Dream Network Allowlist',questions:['Hvorfor?']},{id:'staff',name:'Staff',questions:['Hvorfor?']}]});
  let drafts=await panels.list(guild);assert.deepEqual(drafts[0].forms,['staff']);assert.equal(drafts[0].channel,commonId);assert.deepEqual(drafts[1].forms,['allowlist']);assert.equal(drafts[1].channel,writtenId);assert.equal(drafts[1].imageUrl,'');
  await panels.save(guild,drafts[0]);await panels.send(guild,'general');assert.equal(edited.length,1);assert.deepEqual(edited[0].components[0].toJSON().components.map(c=>c.custom_id),['app:start:staff']);assert.equal(edited[0].embeds[0].data.image.url,'https://example.com/creator.png');
  const written={...drafts[1],imageUrl:'https://example.com/allowlist.png'};await panels.save(guild,written);await panels.send(guild,written.id);assert.equal(sent.length,1);assert.equal(sent[0].embeds[0].data.image.url,written.imageUrl);assert.deepEqual(sent[0].components[0].toJSON().components.map(c=>c.custom_id),['app:start:allowlist']);
  drafts=await panels.list(guild);assert.equal(drafts[0].imageUrl,'https://example.com/creator.png');assert.equal(drafts[1].imageUrl,written.imageUrl);
  await assert.rejects(panels.save(guild,{...written,forms:['missing']}),/eksisterende formularer/);await assert.rejects(panels.save(guild,{...written,imageUrl:'http://example.com/a.png'}),/HTTPS/);
 }finally{await db.close();}
});
