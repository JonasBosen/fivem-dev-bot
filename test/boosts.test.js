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
