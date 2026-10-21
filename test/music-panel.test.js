const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {initDb,db,settings}=require('../src/db'),panel=require('../src/modules/music-panel');
test('Discord music panel accepts song links and controls only the callers voice channel with DJ restrictions',async()=>{
 await initDb();try{
 const gid='music-panel-test',member={voice:{channel:{id:'own-voice'}},permissions:{has:()=>false},roles:{cache:new Map()}};
 await settings.setModule(gid,'music',{enabled:true,djRole:''});
 let modal,reply,played,controlled;const fleet={play:async(...args)=>{played=args;return {track:{title:'Sang'},bot:'Musik 1'};},list:()=>[{id:'wrong',ready:true,channelId:'other-voice'},{id:'right',ready:true,channelId:'own-voice'}],control:async(...args)=>controlled=args,state:()=>({playing:true,current:{title:'Sang'},queue:[{title:'Næste'}]})};
 const i={guildId:gid,guild:{members:{fetch:async()=>member}},user:{id:'caller'},channelId:'music-text',customId:'musicpanel:add',reply:async p=>reply=p,showModal:async p=>modal=p,deferReply:async()=>{},editReply:async p=>reply=p,fields:{getTextInputValue:()=> 'https://www.youtube.com/watch?v=82j2uf5tiKc'}};
 await panel.interact(i,fleet);assert.equal(modal.data.custom_id,'musicpanel:submit');
 i.customId='musicpanel:submit';await panel.interact(i,fleet);assert.deepEqual(played.slice(0,4),[gid,'own-voice','https://www.youtube.com/watch?v=82j2uf5tiKc','music-text']);
 i.customId='musicpanel:skip';await panel.interact(i,fleet);assert.deepEqual(controlled,[gid,'right','skip']);
 i.customId='musicpanel:queue';await panel.interact(i,fleet);assert.match(reply.content,/Næste/);
 member.voice.channel=null;await panel.interact(i,fleet);assert.match(reply.content,/Gå ind/);
 member.voice.channel={id:'own-voice'};await settings.setModule(gid,'music',{enabled:true,djRole:'dj'});await panel.interact(i,fleet);assert.match(reply.content,/DJ-rollen/);
 const payload=panel.payload();assert.equal(payload.components.flatMap(r=>r.components).length,7);assert.deepEqual(payload.allowedMentions,{parse:[]});
 }finally{await db.close();}
});
