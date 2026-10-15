const {test}=require('node:test');
const assert=require('node:assert/strict');
const {choose}=require('../src/modules/music-fleet');
test('music allocation reuses the same channel and isolates occupied channels',()=>{
  const bots=[{id:'a',ready:true,channelId:'channel-a'},{id:'b',ready:true,channelId:null},{id:'c',ready:false,channelId:null}];
  assert.equal(choose(bots,'channel-a').id,'a');
  assert.equal(choose(bots,'channel-b').id,'b');
  assert.throws(()=>choose(bots,'channel-b','a'),/optaget/);
  assert.throws(()=>choose(bots,'channel-b','c'),/ikke online/);
  assert.throws(()=>choose([{id:'a',ready:true,channelId:'channel-a'}],'channel-b'),/Alle musikbots/);
  assert.equal(choose(Array.from({length:150},(_,i)=>({id:String(i),ready:true,channelId:i<149?'channel-'+i:null})),'new-channel').id,'149');
});
