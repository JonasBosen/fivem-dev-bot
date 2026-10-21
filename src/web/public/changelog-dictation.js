function changelogDictation(field,options){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let recognition=null,active=false,disposed=false,timer=null,keepListening=false,seen=new Set();
 const status=h('p',{'aria-live':'polite',class:'muted'}),overflow=h('textarea',{readonly:true,hidden:true,rows:4,'aria-label':'Indtalt tekst uden plads i stikordsfeltet'});
 const button=h('button',{type:'button',class:'btn sec',onclick:()=>{
  if(active){keepListening=false;button.disabled=true;status.textContent='Afslutter indtaling…';recognition.stop();return;}
  if(options.blocked()||disposed)return;
  if(!Recognition){options.error(Error('Denne browser understøtter ikke indtaling. Åbn panelet i Chrome eller Edge, eller skriv i feltet.'));return;}
  seen=new Set();recognition=new Recognition();recognition.lang='da-DK';recognition.continuous=true;recognition.interimResults=true;
  recognition.onresult=event=>{
   if(disposed)return;
   let interim='';
   for(let i=event.resultIndex;i<event.results.length;i++){
    const result=event.results[i],text=result[0].transcript.trim();
    if(!result.isFinal){interim+=text+' ';continue;}
    if(seen.has(i))continue;seen.add(i);if(!text)continue;
    const next=field.value+(field.value.trim()?'\n':'')+text;
    if(next.length>60000){overflow.hidden=false;overflow.value+=(overflow.value?'\n':'')+text;status.textContent='Stikordsfeltet er fyldt. Ekstra tale står nedenfor og kan kopieres.';keepListening=false;recognition.stop();}
    else{field.value=next;options.change();}
   }
   if(overflow.hidden)status.textContent=interim?'Hører: '+interim:'Lytter… Tal på dansk. Tryk Stop når du er færdig.';
  };
  recognition.onerror=event=>{if(disposed)return;keepListening=false;const messages={'not-allowed':'Tillad mikrofonen i browserens adressefelt og prøv igen.','audio-capture':'Ingen mikrofon fundet. Kontrollér din mikrofon.','no-speech':'Der blev ikke hørt tale. Tryk på mikrofonen og prøv igen.',network:'Talegenkendelsen kunne ikke forbinde. Kontrollér nettet og prøv igen.','service-not-allowed':'Browserens talegenkendelse er ikke tilgængelig. Prøv Chrome eller Edge.'};if(event.error!=='aborted')options.error(Error(messages[event.error]||'Indtaling kunne ikke gennemføres. Den skrevne tekst er bevaret.'));};
  recognition.onend=()=>{if(keepListening&&!disposed){seen=new Set();try{recognition.start();return;}catch{keepListening=false;options.error(Error('Indtalingen kunne ikke fortsætte. Teksten er bevaret.'));}}clearTimeout(timer);active=false;if(disposed)return;if(overflow.hidden)status.textContent='Mikrofonen er stoppet. Ret teksten og tryk Lav changelog med AI.';options.refresh();};
  active=true;keepListening=true;status.textContent='Starter mikrofonen… Tillad adgang, hvis browseren spørger.';options.refresh();
  try{recognition.start();timer=setTimeout(()=>{if(active){keepListening=false;status.textContent='30 minutter er gået. Afslutter indtaling…';recognition.stop();}},1800000);}catch{keepListening=false;active=false;options.refresh();options.error(Error('Mikrofonen kunne ikke startes. Kontrollér browserens mikrofontilladelse.'));}
 }},'🎙 Indtal beskrivelse');
 const element=h('div',{class:'changelog-dictation'},button,status,h('small',{class:'muted'},'Dansk tale til tekst · op til 30 minutter ad gangen. Browserens taletjeneste behandler lyden. Gennemse teksten før du sender den til AI.'),overflow);
 return {element,active:()=>active,update:()=>{button.textContent=active?'⏹ Stop mikrofon':'🎙 Indtal beskrivelse';button.setAttribute('aria-pressed',String(active));button.disabled=disposed||(!active&&options.blocked());if(!Recognition&&!active)status.textContent='Indtaling kræver en browser med talegenkendelse, fx Chrome eller Edge.';},dispose:()=>{disposed=true;keepListening=false;clearTimeout(timer);if(recognition){recognition.onresult=null;recognition.onerror=null;recognition.onend=null;recognition.abort();}active=false;}};
}
