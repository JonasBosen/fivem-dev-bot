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
 button.onclick();field.value='x'.repeat(3999);recorder.onresult({resultIndex:0,results:[final]});assert.equal(field.value.length,3999);assert.equal(widget.element.children[3].value,'Garagen er rettet.');
 button.onclick();recorder.onerror({error:'not-allowed'});assert.match(error.message,/Tillad mikrofonen/);widget.dispose();assert.equal(recorder.aborted,true);assert.equal(recorder.onresult,null);
});

