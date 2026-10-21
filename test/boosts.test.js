const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';
const {initDb,db}=require('../src/db'),boosts=require('../src/modules/boosts');
test('boost thanks validates destinations, sends customized image and mentions once, ignores unrelated updates and disabled guilds',async()=>{
 await initDb();try{
 const sent=[],gid='928657151260516382',uid='123456789012345678';
 const channel={id:'123456789012345679',type:0,permissionsFor:()=>({has:()=>true}),send:async p=>{sent.push(p);return {id:'message'};}};
 const guild={id:gid,name:'Dream Network',members:{me:{id:'bot'}},channels:{fetch:async()=>channel}};
 const cfg={enabled:true,channel:channel.id,title:'Tusind tak!',message:'Tak {user}, {username}, for støtten til {server}!',imageUrl:'https://example.com/boost.png',color:'#f47fff'};
 await boosts.configure(guild,cfg);
 const member={id:uid,guild,premiumSinceTimestamp:100,user:{username:'Jonas',bot:false}};
 await Promise.all([boosts.onMember({premiumSinceTimestamp:null},member),boosts.onMember({premiumSinceTimestamp:null},member)]);
 assert.equal(sent.length,1);assert.equal(sent[0].embeds[0].data.image.url,cfg.imageUrl);assert.match(sent[0].embeds[0].data.description,/Jonas.*Dream Network/);assert.deepEqual(sent[0].allowedMentions,{parse:[],users:[uid]});
 await boosts.onMember({premiumSinceTimestamp:100},member);assert.equal(sent.length,1);
 await boosts.onMember({premiumSinceTimestamp:100},{...member,premiumSinceTimestamp:null});assert.equal(sent.length,1);
 await boosts.onMember({premiumSinceTimestamp:null},{...member,premiumSinceTimestamp:200});assert.equal(sent.length,2);
 await boosts.onMessage({guild,type:8,author:member.user,member,id:'first',createdTimestamp:100});assert.equal(sent.length,2);
 const additional={guild,type:8,author:member.user,member,id:'extra',createdTimestamp:100000};await boosts.onMessage(additional);await boosts.onMessage(additional);assert.equal(sent.length,3);
 await boosts.configure(guild,{...cfg,enabled:false});await boosts.onMember({premiumSinceTimestamp:null},{...member,premiumSinceTimestamp:300});assert.equal(sent.length,3);
 await assert.rejects(boosts.configure(guild,{...cfg,channel:''}),/tekstkanal/);
 await assert.rejects(boosts.configure(guild,{...cfg,imageUrl:'http://example.com/image.png'}),/HTTPS/);
 await assert.rejects(boosts.configure(guild,{...cfg,mediaId:'foreign'}),/bibliotek/);
 }finally{await db.close();}
});

test('boost demo uses unsaved settings and tags the caller while automation is disabled without changing saved settings',async()=>{
 await initDb();try{
 const {settings}=require('../src/db'),sent=[],gid='boost-demo',uid='123456789012345678';
 const member={id:uid,user:{username:'DemoJonas'},guild:null};
 const channel={id:'123456789012345679',type:0,permissionsFor:()=>({has:()=>true}),send:async p=>{sent.push(p);return {id:'demo-message'};}};
 const guild={id:gid,name:'Dream Network',members:{me:{id:'bot'},fetch:async id=>{assert.equal(id,uid);return member;}},channels:{fetch:async id=>{assert.equal(id,channel.id);return channel;}}};member.guild=guild;
 const saved=await settings.get(gid),cfg={...saved.boosts,enabled:false,channel:channel.id,message:'Demo til {user} på {server}',title:'Min demo',imageUrl:'https://example.com/demo.png'};
 const result=await boosts.testBoost(guild,uid,cfg);assert.equal(result.ok,true);assert.equal(sent.length,1);assert.deepEqual(sent[0].allowedMentions,{parse:[],users:[uid]});assert.equal(sent[0].content,'<@'+uid+'>');assert.equal(sent[0].embeds[0].data.title,'Min demo');assert.equal(sent[0].embeds[0].data.image.url,cfg.imageUrl);assert.match(sent[0].embeds[0].data.footer.text,/DEMO/);assert.match(sent[0].embeds[0].data.description,/Dream Network/);
 assert.deepEqual((await settings.get(gid)).boosts,saved.boosts);
 await assert.rejects(boosts.testBoost(guild,uid,{...cfg,mediaId:'other-guild'}),/bibliotek/);assert.equal(sent.length,1);
 }finally{await db.close();}
});
