const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {format,ensure}=require('../src/modules/changelog-format');
const emojis={red:'<:dn_check_red:123456789012345678>',green:'<:dn_check_green:123456789012345679>',orange:'<:dn_check_orange:123456789012345680>'};
test('custom checks keep spaces, topic emojis and are idempotent for old and new drafts',()=>{
 const content='## Opdatering\n🔴Fjernet bil\n- 🟢Tilføjet MLO\n🟡 Rettet økonomien\n🟠 🚗 Opdateret bilen';
 const expected='## Opdatering\n'+emojis.red+' 🚗 Fjernet bil\n'+emojis.green+' 🏢 Tilføjet MLO\n'+emojis.orange+' 💰 Rettet økonomien\n'+emojis.orange+' 🚗 Opdateret bilen';
 assert.equal(format(content,emojis),expected);assert.equal(format(expected,emojis),expected);assert.equal(format('En almindelig overskrift',emojis),'En almindelig overskrift');
});
test('application emojis reuse existing assets and concurrent calls never create duplicates',async()=>{
 let created=0,reads=0;const existing=new Map([['green',{id:'123456789012345679',name:'dn_check_green'}]]);const manager={fetch:async()=>{reads++;return {find:fn=>[...existing.values()].find(fn)};},create:async({name,attachment})=>{assert.ok(fs.statSync(attachment).size<256*1024);created++;return {id:String(123456789012345600n+BigInt(created)),name};}};
 const client={application:{emojis:manager}};const [a,b]=await Promise.all([ensure(client),ensure(client)]);assert.deepEqual(a,b);assert.equal(reads,1);assert.equal(created,2);assert.equal(a.green,emojis.green);
});
test('failed emoji installation can be retried without caching failure',async()=>{
 let failed=true;const client={application:{emojis:{fetch:async()=>{if(failed)throw Error('Discord offline');return {find:()=>({id:'123456789012345678'})};}}}};
 await assert.rejects(ensure(client),/offline/);failed=false;assert.ok((await ensure(client)).red.includes('dn_check_red'));
});
