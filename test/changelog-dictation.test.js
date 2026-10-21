const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('dictation appends final Danish speech once, preserves overflow, handles denial and releases microphone',()=>{
 let recorder,changes=0,error;
 class Recognition{constructor(){recorder=this;}start(){}stop(){this.onend?.();}abort(){this.aborted=true;}}
 const h=(tag,attrs={},...children)=>({value:'',...attrs,tag,children,setAttribute(k,v){this[k]=v;}});
 const context={window:{SpeechRecognition:Recognition},h,setTimeout,clearTimeout};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/web/public/changelog-dictation.js','utf8'),context);
 const field={value:'Eksisterende stikord'},widget=context.changelogDictation(field,{blocked:()=>false,change:()=>changes++,refresh:()=>{},error:e=>error=e});
 const button=widget.element.children[0];button.onclick();assert.equal(widget.active(),true);assert.equal(recorder.lang,'da-DK');
 const final=Object.assign([{transcript:'Garagen er rettet.'}],{isFinal:true});
 recorder.onresult({resultIndex:0,results:[final]});recorder.onresult({resultIndex:0,results:[final]});
 assert.equal(field.value,'Eksisterende stikord\nGaragen er rettet.');assert.equal(changes,1);
 button.onclick();assert.equal(widget.active(),false);
 button.onclick();field.value='x'.repeat(59999);recorder.onresult({resultIndex:0,results:[final]});assert.equal(field.value.length,59999);assert.equal(widget.element.children[3].value,'Garagen er rettet.');
 button.onclick();recorder.onerror({error:'not-allowed'});assert.match(error.message,/Tillad mikrofonen/);widget.dispose();assert.equal(recorder.aborted,true);assert.equal(recorder.onresult,null);
});


test('dictation continues across browser sessions until the 30 minute deadline or manual stop',()=>{
 let recorder,deadline,delay,starts=0;
 class Recognition{constructor(){recorder=this;}start(){starts++;}stop(){this.onend?.();}abort(){}}
 const h=(tag,attrs={},...children)=>({value:'',...attrs,children,setAttribute(){}});
 const context={window:{SpeechRecognition:Recognition},h,setTimeout:(fn,ms)=>{deadline=fn;delay=ms;return 1;},clearTimeout:()=>{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/web/public/changelog-dictation.js','utf8'),context);
 const field={value:''},widget=context.changelogDictation(field,{blocked:()=>false,change:()=>{},refresh:()=>{},error:e=>{throw e;}});
 const button=widget.element.children[0];button.onclick();assert.equal(delay,30*60*1000);
 const result=text=>({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:true})]});
 recorder.onresult(result('Første ændring'));recorder.onend();assert.equal(starts,2);assert.equal(widget.active(),true);
 recorder.onresult(result('Anden ændring'));assert.equal(field.value,'Første ændring\nAnden ændring');
 deadline();assert.equal(widget.active(),false);assert.equal(starts,2);
 button.onclick();button.onclick();assert.equal(widget.active(),false);assert.equal(starts,3);widget.dispose();
});
