function orderedPages(){const order=G?.settings?.appearance?.navigationOrder||[];return [...PAGES].sort((a,b)=>{const rank=id=>order.includes(id)?order.indexOf(id):order.length+PAGES.findIndex(p=>p[0]===id);return rank(a[0])-rank(b[0]);});}
function applyAppearance(input={}){
  const cfg={title:'Alle bots samlet',accent:'#7c6cff',background:'#0f1115',panel:'#171a21',text:'#e6e8ee',radius:12,density:'comfortable',backgroundImage:'',...input};
  const root=document.documentElement;
  for(const [key,variable]of Object.entries({accent:'--accent',background:'--bg',panel:'--panel',text:'--text'}))if(/^#[0-9a-f]{6}$/i.test(cfg[key]))root.style.setProperty(variable,cfg[key]);
  root.style.setProperty('--r',Math.max(0,Math.min(30,Number(cfg.radius)))+'px');
  document.body.classList.toggle('compact',cfg.density==='compact');
  document.body.style.backgroundImage='';
  if(cfg.backgroundImage){try{const url=new URL(cfg.backgroundImage);if(url.protocol==='https:')document.body.style.backgroundImage='linear-gradient(#0f1115b8,#0f1115d9), url('+JSON.stringify(url.href)+')';}catch{}}
  document.title=cfg.title;
}
async function renderAppearance(){
  const draft=structuredClone(G.settings.appearance);
  const preview=()=>applyAppearance(draft);
  const order=orderedPages().map(p=>p[0]),orderList=h('div',{class:'nav-order-list'});let dragged=null;
  function move(from,to){if(from===to||from<0||to<0||to>=order.length)return;order.splice(to,0,order.splice(from,1)[0]);draft.navigationOrder=[...order];drawOrder();}
  function drawOrder(){orderList.replaceChildren(...order.map((id,i)=>h('div',{class:'nav-order-row',draggable:'true','data-page':id,ondragstart:e=>{dragged=id;e.dataTransfer.setData('text/plain',id);},ondragend:()=>{dragged=null;},ondragover:e=>e.preventDefault(),ondrop:e=>{e.preventDefault();if(dragged)move(order.indexOf(dragged),i);}},h('span',{},'⠿ '+PAGES.find(p=>p[0]===id).slice(1).join(' ')),h('div',{class:'actions'},h('button',{type:'button',class:'btn sec sm',disabled:i===0,'aria-label':'Flyt '+id+' op',onclick:()=>move(i,i-1)},'↑'),h('button',{type:'button',class:'btn sec sm',disabled:i===order.length-1,'aria-label':'Flyt '+id+' ned',onclick:()=>move(i,i+1)},'↓')))));}
  drawOrder();
  const navigation=h('div',{class:'card'},h('h2',{},'Rækkefølge i venstremenuen'),h('p',{class:'muted'},'Træk punkterne op og ned, eller brug pilene. Rækkefølgen gemmes sammen med designet og deles på serverens dashboard.'),orderList,h('button',{class:'btn',onclick:run(async()=>{G.settings.appearance=await api('/api/guild/'+G.id+'/settings/appearance',{method:'PUT',body:draft});toast('Menurækkefølgen er gemt');await route();})},'Gem rækkefølge'));

  const form=h('div',{class:'grid'},field({k:'title',l:'Sidens navn'},draft),...['accent','background','panel','text'].map((k,i)=>h('label',{class:'f'},h('span',{},['Accentfarve','Baggrundsfarve','Panelfarve','Tekstfarve'][i]),h('input',{type:'color',value:draft[k],oninput:e=>{draft[k]=e.target.value;preview();}}))),field({k:'backgroundImage',l:'Baggrundsbillede (HTTPS-link)'},draft),field({k:'radius',l:'Afrunding på paneler (0–30)',t:'number',min:0,max:30},draft),h('label',{class:'f'},'Tæthed',h('select',{onchange:e=>{draft.density=e.target.value;preview();}},...['comfortable','compact'].map(v=>h('option',{value:v,selected:draft.density===v},v==='compact'?'Kompakt':'Luftig')))));
  form.addEventListener('input',preview);
  return [h('div',{class:'card workspace-hero'},h('span',{class:'workspace-eyebrow'},'DIT DASHBOARD'),h('h2',{},'Indstillinger for siden'),h('p',{class:'muted'},'Designet deles af serverens dashboard. Prøv farver og baggrund her; gem for at gøre dem fælles.'),form,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{G.settings.appearance=await api(`/api/guild/${G.id}/settings/appearance`,{method:'PUT',body:draft});preview();toast('Design og menurækkefølge er gemt');await route();})},'Gem design'),h('button',{class:'btn sec',onclick:()=>{applyAppearance(G.settings.appearance);toast('Gemt design er vist igen');}},'Vis gemt design'))),navigation];
}
async function renderStreamWorkspace(){
  let accounts=await api(`/api/guild/${G.id}/stream/accounts`);
  const status=await api(`/api/guild/${G.id}/stream/status`);
  const names={twitch:'Twitch',youtube:'YouTube',kick:'Kick',tiktok:'TikTok'};
  const sections=Object.entries(names).map(([platform,label])=>{
    const cfg=structuredClone(G.settings.stream.platforms[platform]);
    const diagnosticBox=h('div',{class:'stream-diagnosis'});let diagnosticLoaded=false;
    function drawDiagnosis(data){diagnosticLoaded=true;diagnosticBox.replaceChildren(h('h3',{},'Forbindelse og seneste kontrol'),...data.issues.map(message=>h('p',{class:'diagnostic-warning'},'⚠ '+message)),...data.accounts.map(a=>h('article',{class:'row'},h('b',{},a.handle),h('p',{class:a.error?'diagnostic-warning':'muted'},a.error||'Streamerrollen er bekræftet.'),h('p',{class:a.lastCheck?.state==='live'?'state-text status-closed':'muted'},a.lastCheck?(a.lastCheck.message+' · '+date(a.lastCheck.checkedAt)):'Ingen live-kontrol registreret endnu. Tryk Kontrollér nu.'))),!data.credentialsReady&&platform!=='tiktok'&&h('a',{class:'btn sec',href:'https://dashboard.render.com/web/srv-db8b651srm7s73e1rtq0/env',target:'_blank',rel:'noopener'},'Åbn API-opsætning på Render'));}
    const loadDiagnosis=async()=>drawDiagnosis(await api('/api/guild/'+G.id+'/stream/diagnostics/'+platform));
    const diagnosticCard=h('div',{class:'card'},h('h2',{},'Kontrollér '+label+'-forbindelsen'),diagnosticBox,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{drawDiagnosis(await api('/api/guild/'+G.id+'/stream/check/'+platform,{method:'POST',body:{}}));})},'Kontrollér nu'),h('button',{class:'btn sec',onclick:run(async()=>{await api('/api/guild/'+G.id+'/stream/test/'+platform,{method:'POST',body:{ping:false}});toast('Testbesked sendt uden ping');})},'Send test uden ping'),h('button',{class:'btn sec',onclick:run(async()=>{await api('/api/guild/'+G.id+'/stream/test/'+platform,{method:'POST',body:{ping:true}});toast('Testbesked sendt med den valgte PING-rolle');})},'Send test med PING')));
    const form=h('div',{class:'grid'},...[
      {k:'enabled',t:'toggle',l:'Aktivér '+label},{k:'channel',t:'channel',l:'Discord-kanal til streambeskeder'},
      {k:'streamerRole',t:'role',l:'Rolle der giver ret til at være streamer'},{k:'pingRole',t:'role',l:'PING-rolle (modtagere)'},
      {k:'deleteWhenOffline',t:'toggle',l:'Slet beskeden, når streamen slutter'},
      {k:'message',t:'textarea',l:'Streambesked',hint:'{name} {title} {game} {url}'}
    ].map(f=>field(f,cfg)));
    const member=h('select',{},h('option',{value:''},'Hent medlemmer med streamerrollen'));
    const userId=h('input',{placeholder:'Eller indsæt Discord-bruger-ID','aria-label':label+' Discord-bruger-ID'});
    const handle=h('input',{placeholder:platform==='youtube'?'YouTube kanal-ID (UC…)':'Brugernavn på '+label,'aria-label':label+' kanal'});
    const rows=h('div');
    function draw(){rows.replaceChildren(...accounts.filter(a=>a.platform===platform).map(a=>h('div',{class:'row top'},h('div',{},h('b',{},a.handle),h('div',{class:'muted'},'Discord: '+a.user_id)),h('button',{class:'btn bad sm',onclick:run(async()=>{accounts=await api(`/api/guild/${G.id}/stream/accounts/${platform}/${a.user_id}`,{method:'DELETE'});draw();toast('Tilknytningen er fjernet');})},'Fjern'))));}
    draw();
    const note=platform==='tiktok'?'TikTok bruger manuel start og slut med /stream live og /stream slut. Automatisk live-status er endnu ikke tilsluttet.':platform==='youtube'?'Nye livestreams findes cirka hvert 30. minut af hensyn til API-kvoten. Aktive streams kontrolleres hvert 2. minut. Flere kanaler kan kræve højere YouTube-kvote.':'Live-status kontrolleres cirka hvert 2. minut. Platformfejl behandles ikke som en afsluttet stream.';
    return {id:platform,label,icon:platform==='kick'?'K':'●',onOpen:()=>{if(!diagnosticLoaded)loadDiagnosis().catch(e=>{diagnosticBox.textContent=e.message;});},content:[diagnosticCard,
      h('div',{class:'card workspace-hero'},h('span',{class:'workspace-eyebrow'},label.toUpperCase()+' · STREAMCENTER'),h('h2',{},label+' stream-alerts'),h('span',{class:'badge '+(status[platform]?'open':'closed')},status[platform]?'API-oplysninger tilsluttet':'Manuel start/slut tilgængelig'),h('p',{class:'muted'},note),!status[platform]&&platform!=='tiktok'&&h('p',{class:'muted'},'Automatik kræver '+({twitch:'TWITCH_CLIENT_ID og TWITCH_CLIENT_SECRET',youtube:'YOUTUBE_API_KEY',kick:'KICK_CLIENT_ID og KICK_CLIENT_SECRET'}[platform])+' på Render.'),form,h('button',{class:'btn',onclick:run(async()=>{
        const latest=await api(`/api/guild/${G.id}`);const draft=latest.settings.stream;draft.platforms[platform]=cfg;
        G.settings.stream=await api(`/api/guild/${G.id}/settings/stream`,{method:'PUT',body:draft});toast(label+' er gemt');await loadDiagnosis();
      })},'Gem '+label)),
      h('div',{class:'card'},h('h2',{},'Discord-bruger → streamkanal'),h('p',{class:'muted'},'Gem først streamerrollen ovenfor. Giv rollen til personen og tilknyt deres kanal her én gang. Rollen alene fortæller ikke, hvilken konto personen streamer fra.'),h('button',{class:'btn sec',onclick:run(async()=>{
        const saved=G.settings.stream.platforms[platform];if(!saved.streamerRole)throw new Error('Gem en streamerrolle først');
        const members=await api(`/api/guild/${G.id}/stream/members?role=${saved.streamerRole}`);
        member.replaceChildren(h('option',{value:''},'Vælg Discord-person'),...members.map(m=>h('option',{value:m.id},m.name+' · '+m.id)));toast(members.length+' medlemmer fundet');
      })},'Hent personer med rollen'),h('div',{class:'grid'},member,userId,handle),h('button',{class:'btn',onclick:run(async()=>{accounts=await api(`/api/guild/${G.id}/stream/accounts`,{method:'POST',body:{platform,userId:userId.value.trim()||member.value,handle:handle.value}});draw();handle.value='';toast('Streamkanalen er knyttet til personen');await loadDiagnosis();})},'Tilknyt streamkanal'),rows,h('p',{class:'muted'},'Personen kan også selv bruge /stream tilmeld. PING-rollen får kun besked ved start. Botten skal kunne sende og slette sine beskeder i kanalen.'))
    ]};
  });
  return [dashboardTabs(sections,G.id+'-streams')];
}
document.addEventListener('click',event=>{
  if(!G||!me)return;
  const el=event.target.closest('button,a,summary');if(!el||el.closest('#toast'))return;
  const module=location.hash.split('/')[3]||'overview';if(module!=='developer')return;
  const action=(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,100);if(!action)return;
  api(`/api/guild/${G.id}/audit/interaction`,{method:'POST',body:{module,action}}).catch(()=>{});
});

async function renderCommandCatalog(){
 const list=h('div',{class:'rows'}),status=h('p',{class:'muted'},'Henter kommandoer fra Discord…'),search=h('input',{type:'search',placeholder:'Søg efter en kommando…','aria-label':'Søg i Discord-kommandoer'});let commands=[],busy=false;
 function draw(){const query=search.value.toLocaleLowerCase('da');const matches=commands.filter(c=>(c.name+' '+c.description+' '+JSON.stringify(c.options)).toLocaleLowerCase('da').includes(query));list.replaceChildren(...(matches.length?matches.map(c=>h('div',{class:'row'},h('div',{class:'top'},h('b',{},(c.type===1?'/':'')+c.name),h('span',{class:'badge'},c.scope==='server'?'Serverkommando':'Global kommando')),h('p',{},c.description||'Kommando i genvejsmenuen'),...c.options.map(o=>h('p',{class:'muted'},o.name+(o.required?' · påkrævet':'')+' — '+(o.description||''))),h('small',{class:'muted'},'Discord-ID: '+c.id))):[h('p',{class:'muted'},'Ingen kommandoer passer til din søgning.')]));}
 async function refresh(){if(busy||document.hidden)return;busy=true;try{const data=await api('/api/guild/'+G.id+'/commands');commands=data.commands;draw();status.textContent=commands.length+' kommandoer · Senest hentet '+new Date(data.checkedAt).toLocaleTimeString('da-DK')+' · Opdateres automatisk hvert 30. sekund.';}catch(e){status.textContent='Kunne ikke opdatere: '+e.message+'. Den senest hentede liste vises stadig.';}finally{busy=false;}}
 search.addEventListener('input',draw);await refresh();pollTimer=setInterval(refresh,30000);
 return h('div',{class:'card'},h('h2',{},'Discord-kommandoer'),h('p',{class:'muted'},'Listen hentes fra Discord og viser vores bots globale kommandoer og serverkommandoer. Kommandoer fra andre bots og almindelige tekstkommandoer kan ikke hentes som Discord-kommandoer.'),h('div',{class:'actions'},search,h('button',{class:'btn sec',onclick:refresh},'Hent igen')),status,list);
}

async function renderRestarts(){
 const draft=structuredClone(G.settings.restart),times=h('textarea',{'aria-label':'Daglige genstartstidspunkter',value:draft.times.join('\n')}),warnings=h('input',{'aria-label':'Advarsler i minutter',value:draft.warningMinutes.join(', ')});
 const preview=h('div',{class:'row'});
 function draw(){preview.replaceChildren(h('b',{},'🔄 Planlagt servergenstart'),h('p',{},'Der er 5 minutter tilbage.'),h('p',{class:'muted'},'Den samme besked opdateres hvert 15. sekund. Nye beskeder sendes ved de valgte varsler, f.eks. 5 og 2 minutter.'))};draw();
 return h('div',{class:'card'},h('h2',{},'Genstartsvarsler til Discord'),h('p',{class:'muted'},'Planlagte daglige genstarter i dansk tid (Europe/Copenhagen). Tiderne følger automatisk sommer- og vintertid. Botten sender varsler; den udfører eller bekræfter ikke selve genstarten.'),h('div',{class:'grid'},field({k:'enabled',l:'Aktivér automatiske varsler',t:'toggle'},draft),field({k:'channel',l:'Discord-kanal til genstartsvarsler',t:'channel'},draft),field({k:'pingRole',l:'Rolle der skal pinges (valgfri)',t:'role'},draft),h('label',{class:'f'},'Daglige genstartstidspunkter · ét pr. linje, f.eks. 06:00 og 18:00',times),h('label',{class:'f'},'Advarsler i minutter før genstart, f.eks. 15, 5, 2, 1',warnings)),h('button',{class:'btn',onclick:run(async()=>{draft.times=times.value.split('\n').map(t=>t.trim()).filter(Boolean);draft.warningMinutes=warnings.value.split(',').map(n=>Number(n.trim()));G.settings.restart=await api('/api/guild/'+G.id+'/settings/restart',{method:'PUT',body:draft});toast('Genstartsplanen er gemt. Varsler sendes automatisk i den valgte kanal.');})},'Gem genstartsplan'),h('h3',{},'Sådan ser varslet ud'),preview,h('p',{class:'muted'},'Når tidspunktet nås, ændres beskeden til, at det planlagte genstartstidspunkt er nået. Sidste udsendte varsel gemmes, så botten kan fortsætte efter en genstart.'));
}
