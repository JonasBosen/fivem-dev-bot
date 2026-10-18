const {test}=require('node:test'),assert=require('node:assert/strict');
const {destination}=require('../src/modules/panel-diagnostics');
test('panel creation rejects deleted channels, voice channels and missing bot permissions with actionable errors',async()=>{
 const bot={},channel={id:'123456789012345678',name:'support',type:0,permissionsFor:()=>({has:()=>true})};let current=channel;
 const guild={members:{me:bot},channels:{fetch:async()=>current}};
 assert.equal(await destination(guild,channel.id),channel);
 current=null;await assert.rejects(destination(guild,channel.id),/findes ikke længere/);
 current={...channel,type:2};await assert.rejects(destination(guild,channel.id),/tekstkanal/);
 current={...channel,permissionsFor:()=>({has:()=>false})};await assert.rejects(destination(guild,channel.id),/Se kanal, Send beskeder, Indlejr links/);
 await assert.rejects(destination(guild,'not-a-channel'),/Vælg/);
});
