const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('../src/modules/command-catalog');
test('catalog reads Discord rather than local definitions, prefers server overrides, shares requests and does not cache failures',async()=>{
 let requests=0,fail=true;const local={id:'1',name:'play',type:1,description:'Afspil',options:[]},global={...local,id:'2',description:'Global'};
 const guild={id:'catalog-test',commands:{fetch:async()=>{requests++;await new Promise(r=>setTimeout(r,10));if(fail)throw new Error('Discord utilgængelig');return new Map([['1',local]]);}},client:{application:{commands:{fetch:async()=>new Map([['2',global],['3',{id:'3',name:'stop',type:1,options:[]}]])}}}};
 await assert.rejects(load(guild),/utilgængelig/);fail=false;const [a,b]=await Promise.all([load(guild),load(guild)]);assert.equal(requests,2);assert.equal(a,b);assert.equal(a.commands.length,2);assert.equal(a.commands.find(c=>c.name==='play').scope,'server');assert.equal(a.commands.find(c=>c.name==='play').description,'Afspil');await load(guild);assert.equal(requests,2);
});
