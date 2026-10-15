async function renderDeveloperWorkspace() {
  const base=`/api/guild/${G.id}/developer`;
  const access=await api('/api/guild/'+G.id+'/developer-access');
  const pin=h('input',{type:'password',inputmode:'numeric',pattern:'[0-9]{4}',maxlength:4,autocomplete:'off',placeholder:'••••','aria-label':'Firecifret kode'});
  if(!access.unlocked){
    const form=h('form',{class:'card developer-lock',onsubmit:run(async e=>{e.preventDefault();if(!/^\d{4}$/.test(pin.value))throw new Error('Skriv fire cifre');await api('/api/guild/'+G.id+'/developer-access/'+(access.configured?'unlock':'setup'),{method:'POST',body:{pin:pin.value}});pin.value='';await route();})},h('span',{class:'workspace-eyebrow'},'BESKYTTET ARBEJDSOMRÅDE'),h('h2',{},'Udviklerpanelet er låst'),h('p',{class:'muted'},access.configured?'Indtast den fælles firecifrede kode. Administratoradgang alene låser ikke panelet op.':'Serverejeren skal oprette den fælles firecifrede kode her. Den gemmes som en saltet hash.'),pin,h('button',{type:'submit',class:'btn',disabled:!access.configured&&!access.canSetup},access.configured?'Lås panelet op':'Opret kode og åbn'));
    return [form];
  }
  const reportCategories=await api('/report-categories.json');
  const reportLabel=p=>p?.reportCategory==='other'?p.reportCategoryCustom:reportCategories.find(c=>c.id===p?.reportCategory)?.label||'';
  let tasks=await api(base), selected=null, dirty=false, saving=false;
  const replySeen=new Map(tasks.map(t=>[t.id,t.latestCitizenReply||0])),unread=new Set(tasks.filter(t=>t.unreadCitizenReply).map(t=>t.id)),readThrough=new Map(tasks.filter(t=>!t.unreadCitizenReply).map(t=>[t.id,t.latestCitizenReply||0]));
  const unreadBadge=id=>unread.has(id)?h('span',{class:'conversation-unread','aria-label':'Ny besked fra borger'},'1'):null;
  let refreshConversation=null,polling=false,dragged=null,moving=false,calendar=null,conversationVisible=false,updateConversationBadge=null;
  const listBody=h('tbody');
  const drawer=h('div',{class:'dev-drawer',hidden:true,role:'dialog','aria-modal':'true','aria-label':'Redigér sag'});
  const drawerBackdrop=h('div',{class:'dev-drawer-backdrop',onclick:()=>{if(canLeave()){dirty=false;drawer.hidden=true;}}});
  const archiveFilter=h('select',{onchange:()=>draw()},h('option',{value:'active'},'Aktive opgaver'),h('option',{value:'archived'},'Arkiverede opgaver'));
  const rank=t=>t.planning?.position||-t.created_at;
  async function move(id,state,beforeId){
    if(moving||!canLeave())return;moving=true;
    try{
      const task=await api(`${base}/${id}`);
      const lane=tasks.filter(t=>t.id!==id&&taskLane(t)===state&&!!t.planning?.archived===(archiveFilter.value==='archived')).sort((a,b)=>rank(a)-rank(b));
      let index=beforeId?lane.findIndex(t=>t.id===beforeId):lane.length;if(index<0)index=lane.length;
      const left=index>0?rank(lane[index-1]):(lane[index]?rank(lane[index])-2048:0);
      const right=lane[index]?rank(lane[index]):left+2048;
      await api(`${base}/${id}`,{method:'PUT',body:{...task,status:state==='critical'?'todo':state,planning:{...task.planning,priority:state==='critical'?'critical':state==='todo'&&task.planning.priority==='critical'?'normal':task.planning.priority,position:(left+right)/2}}});
      if(selected===id&&!drawer.hidden){dirty=false;await open(id);}await refresh();toast('Opgaven er flyttet og gemt');
    }finally{moving=false;dragged=null;}
  }
  const states={todo:'Ikke taget',critical:'Kritisk',doing:'Taget · I gang',closed:'Afsluttet',rejected:'Afvist'};
  const board=h('div',{class:'work-board'}), detail=h('section',{class:'card work-detail'},h('h2',{},'Dit arbejdsområde'),h('p',{class:'muted'},'Åbn en sag eller opret en opgave. Her kan du gemme noter, billeder og tjeklister.'));
  const search=h('input',{type:'search',placeholder:'Søg efter titel, beskrivelse eller sagsnummer',oninput:()=>draw()});
  const priorities={low:'Lav',normal:'Normal',high:'Høj',critical:'Kritisk'};
  const kinds={bug:'Fejl',feature:'Ny funktion',optimization:'Optimering',mapping:'Mapping / MLO',vehicle:'Køretøj',ui:'UI / NUI',maintenance:'Vedligehold'};
  const priorityFilter=h('select',{onchange:()=>draw()},h('option',{value:''},'Alle prioriteter'),...Object.entries(priorities).map(([v,l])=>h('option',{value:v},l)));
  const typeFilter=h('select',{onchange:()=>draw()},h('option',{value:''},'Alle typer'),...Object.entries(kinds).map(([v,l])=>h('option',{value:v},l)));
  const categoryFilter=h('select',{onchange:()=>draw()},h('option',{value:''},'Alle borgerkategorier'),...reportCategories.map(c=>h('option',{value:c.id},c.label)));
  const counts=h('div',{class:'work-counts'}), saveInfo=h('span',{class:'muted'},'Alle opgaver gemmes i den fælles database');
  const setDirty=()=>{dirty=true;saveInfo.textContent='Ændringer er ikke gemt';saveInfo.className='work-unsaved';};
  const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  const hashChanged=()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('hashchange',hashChanged);};
  window.addEventListener('hashchange',hashChanged);
  function canLeave(){return !dirty||window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade opgaven?');}
  function draw(){
    calendar?.draw();drawList();
    const active=tasks.filter(t=>!['done','closed','rejected'].includes(t.status));
    const metric=(value,label,state)=>h('span',{class:'work-count status-'+state},value,h('small',{},label));
    counts.replaceChildren(metric(tasks.filter(t=>t.status==='todo').length,'Ikke taget','todo'),metric(tasks.filter(t=>t.status==='doing').length,'Taget · I gang','doing'),metric(active.filter(t=>t.planning?.priority==='critical').length,'Kritiske åbne','critical'),metric(tasks.filter(t=>t.status==='closed').length,'Afsluttet','closed'),metric(tasks.reduce((n,t)=>n+(t.planning?.spentHours||0),0).toFixed(1)+' t','Registreret tid','todo'));
    const query=search.value.trim().toLowerCase();
    board.replaceChildren(...Object.entries(states).map(([state,label])=>{
      const items=tasks.filter(t=>!!t.planning?.archived===(archiveFilter.value==='archived')&&taskLane(t)===state&&(!priorityFilter.value||t.planning?.priority===priorityFilter.value)&&(!typeFilter.value||t.planning?.kind===typeFilter.value)&&(!categoryFilter.value||t.planning?.reportCategory===categoryFilter.value)&&`${t.id} ${t.title} ${t.description} ${t.planning?.resource||''} ${t.planning?.assignee||''} ${reportLabel(t.planning)}`.toLowerCase().includes(query)).sort((a,b)=>rank(a)-rank(b));
      return h('section',{class:`work-lane status-${state}`,ondragover:e=>{e.preventDefault();e.dataTransfer.dropEffect='move';},ondrop:run(async e=>{e.preventDefault();if(dragged)await move(dragged,state);})},h('h3',{},h('span',{class:'work-dot'}),label,h('span',{class:'work-total'},items.length)),
        ...(items.length?items.map(t=>h('button',{draggable:'true',ondragstart:e=>{dragged=t.id;e.dataTransfer.setData('text/plain',String(t.id));e.dataTransfer.effectAllowed='move';},ondragend:()=>{dragged=null;},ondragover:e=>{e.preventDefault();e.stopPropagation();},ondrop:run(async e=>{e.preventDefault();e.stopPropagation();if(dragged&&dragged!==t.id)await move(dragged,state,t.id);}),class:`work-ticket priority-${t.planning?.priority||'normal'} status-${state}${selected===t.id?' selected':''}${unread.has(t.id)?' has-unread':''}`,onclick:run(async()=>{if(canLeave())await open(t.id);})},
          h('div',{class:'work-ticket-top'},h('span',{},`#${t.id}`),unreadBadge(t.id),h('span',{'aria-label':states[state]},['done','closed'].includes(state)?'☑':state==='doing'?'◩':'☐')),
          h('span',{class:'drag-grip','aria-label':'Træk for at flytte sagen'},'⠿ Træk kortet'),h('b',{},t.title),['low','high','critical'].includes(t.planning?.priority)&&h('span',{class:'priority-badge priority-'+t.planning.priority},({low:'🟢 Lav',high:'🟠 Mellem / vigtig',critical:'🔴 Kritisk'})[t.planning.priority]),t.planning?.scheduledStart&&h('small',{class:'schedule-badge'},'◷ '+date(Date.parse(t.planning.scheduledStart))),h('small',{class:'work-planning-badges'},[reportLabel(t.planning),t.planning?.priority==='critical'?'':priorities[t.planning?.priority]||'Normal',t.planning?.resource,t.planning?.assignee,t.planning?.deadline?'Frist: '+t.planning.deadline:''].filter(Boolean).join(' · ')),h('p',{},t.description.slice(0,110)),h('div',{class:'work-ticket-bottom'},`${t.checklist.filter(c=>c.done).length}/${t.checklist.length} punkter`,h('small',{},date(t.updated_at))))) : [h('p',{class:'muted'},'Ingen opgaver her')]) );
    }));
  }
  function drawList(){
    listBody.replaceChildren(...tasks.filter(t=>!t.planning?.archived).map(t=>h('tr',{},h('td',{},h('button',{class:'btn sec sm',onclick:run(()=>{if(canLeave())return open(t.id);})},'#'+t.id+' '+t.title,unreadBadge(t.id))),h('td',{class:'state-text status-'+t.status},states[t.status]),h('td',{class:'priority-badge priority-'+t.planning?.priority},priorities[t.planning?.priority]||'Normal'),h('td',{},t.planning?.scheduledStart?date(Date.parse(t.planning.scheduledStart)):'Ikke planlagt'),h('td',{},t.planning?.assignee||'Ikke tildelt'))));
  }
  async function schedule(id,day){
    if(!canLeave())return;
    const task=await api(base+'/'+id),start=new Date(day+'T09:00:00');
    if(task.planning.scheduledStart){const old=new Date(task.planning.scheduledStart);start.setHours(old.getHours(),old.getMinutes());}
    const minutes=task.planning.scheduledStart?(Date.parse(task.planning.scheduledEnd)-Date.parse(task.planning.scheduledStart))/60000:Math.max(15,(task.planning.estimateHours||1)*60);
    const end=new Date(start.getTime()+minutes*60000);
    await api(base+'/'+id,{method:'PUT',body:{...task,planning:{...task.planning,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString()}}});
    dirty=false;await refresh();if(selected===id&&!drawer.hidden)await open(id);toast('Kalendertid er gemt og borgerens statusbesked er opdateret');
  }
  async function refresh(){tasks=await api(base);draw();}
  async function open(id){
    const task=await api(`${base}/${id}`);selected=id;dirty=false;conversationVisible=false;
    const draft=structuredClone(task), banner=h('div',{class:`work-state status-${draft.status}`});
    saveInfo.textContent='Gemt · '+date(task.updated_at);saveInfo.className='muted';
    draft.planning ||= {};
    const planning=draft.planning;
    const selectField=(key,label,options)=>h('label',{class:'f'},h('span',{},label),h('select',{onchange:e=>{planning[key]=e.target.value;setDirty();}},...Object.entries(options).map(([v,l])=>h('option',{value:v,selected:planning[key]===v,style:v==='critical'?'color:#ef4444':''},l))));
    const scheduleStart=h('input',{type:'datetime-local',value:localDateTimeValue(planning.scheduledStart),'aria-label':'Planlagt start',onchange:e=>{planning.scheduledStart=e.target.value?new Date(e.target.value).toISOString():'';setDirty();}});
    const scheduleEnd=h('input',{type:'datetime-local',value:localDateTimeValue(planning.scheduledEnd),'aria-label':'Planlagt slut',onchange:e=>{planning.scheduledEnd=e.target.value?new Date(e.target.value).toISOString():'';setDirty();}});
    const scheduling=h('div',{class:'schedule-editor'},h('h3',{},'Kalenderaftale med borgeren'),h('p',{class:'muted'},'Vælg den tid, sagen bliver kigget på. Borgerens Discord-besked opdateres, når du gemmer. Felterne viser din lokale tid ('+Intl.DateTimeFormat().resolvedOptions().timeZone+').'),h('div',{class:'grid'},h('label',{class:'f'},'Planlagt start',scheduleStart),h('label',{class:'f'},'Planlagt slut',scheduleEnd)),h('button',{class:'btn sec sm',onclick:()=>{planning.scheduledStart='';planning.scheduledEnd='';scheduleStart.value='';scheduleEnd.value='';setDirty();}},'Fjern kalenderaftale'));
    const planFields=h('div',{class:'grid'},selectField('reportCategory','Borgerens kategori',{'':'Ikke kategoriseret',...Object.fromEntries(reportCategories.map(c=>[c.id,c.label]))}),field({k:'reportCategoryCustom',l:'Egen kategori (ved Andet)'},planning),selectField('kind','Type',kinds),selectField('priority','Prioritet',priorities),selectField('environment','Miljø',{test:'Testserver',live:'Live-server',local:'Lokal udvikling'}),
      field({k:'assignee',l:'Ansvarlig udvikler / team'},planning),field({k:'resource',l:'Resource / script (fx qb-garages)'},planning),field({k:'release',l:'Release / milepæl'},planning),
      h('label',{class:'f'},h('span',{},'Deadline'),h('input',{type:'date',value:planning.deadline||'',oninput:e=>{planning.deadline=e.target.value;setDirty();}})),
      field({k:'estimateHours',l:'Forventet tid (timer)',t:'number',min:0,max:10000},planning),field({k:'spentHours',l:'Brugt tid (timer)',t:'number',min:0,max:10000},planning),
      field({k:'coordinates',l:'Koordinater / sted'},planning),field({k:'commitUrl',l:'Link til commit / pull request'},planning));
    planFields.querySelectorAll('input[type=number]').forEach(el=>el.step='0.25');
    planFields.addEventListener('input',setDirty);
    const technical=h('div',{},h('h3',{},'FiveM: reproduktion og test'),...[
      ['reproduction','Trin til at genskabe fejlen'],['expected','Forventet resultat'],['actual','Faktisk resultat / F8- eller serverlog'],['testPlan','Testplan og kontrol før release']
    ].map(([k,l])=>field({k,l,t:'textarea'},planning)));
    technical.addEventListener('input',setDirty);
    const fields=h('div',{class:'grid'},field({k:'title',l:'Opgavens titel'},draft),field({k:'description',l:'Beskrivelse og trin til at genskabe fejlen',t:'textarea'},draft));
    fields.addEventListener('input',setDirty);
    const notes=field({k:'notes',l:'Interne arbejdsnoter',t:'textarea',hint:'Kun synlige i udviklerpanelet. Sendes aldrig til borgeren.'},draft);notes.addEventListener('input',setDirty);
    async function save(){
      if(saving)return;saving=true;
      try{
        const saved=await api(`${base}/${id}`,{method:'PUT',body:draft});
        draft.version=saved.version;dirty=false;saveInfo.textContent='Gemt · '+date(saved.updated_at);saveInfo.className='muted';
        tasks=tasks.map(t=>t.id===id?saved:t);draw();drawState();toast(saved.sync_error||'Opgaven er gemt');
      }finally{saving=false;}
    }
    const taken=h('input',{type:'checkbox',onchange:()=>{draft.status=taken.checked?'doing':'todo';setDirty();drawState();}});
    const done=h('input',{type:'checkbox',onchange:()=>{draft.status=done.checked?'closed':'doing';setDirty();drawState();}});
    function drawState(){taken.checked=['doing','done','closed'].includes(draft.status);done.checked=['done','closed'].includes(draft.status);banner.className=`work-state status-${taskLane(draft)}`;banner.replaceChildren(h('span',{class:'work-dot'}),states[draft.status]);}
    drawState();
    const quickMove=h('select',{'aria-label':'Flyt sag til kolonne',onchange:run(async e=>{if(!e.target.value)return;await move(id,e.target.value);})},h('option',{value:''},'Flyt til kolonne…'),...Object.entries(states).map(([value,label])=>h('option',{value},label)));
    const timer=h('button',{class:'btn sec',onclick:run(async()=>{if(planning.timerStartedAt){planning.spentHours=Math.round(((planning.spentHours||0)+(Date.now()-planning.timerStartedAt)/3600000)*100)/100;planning.timerStartedAt=0;}else planning.timerStartedAt=Date.now();setDirty();await save();await open(id);})},planning.timerStartedAt?'⏹ Stop timer og gem tid':'▶ Start arbejdstimer');
    const actions=h('div',{class:'actions'},quickMove,timer,...['todo','doing','closed','rejected'].map(s=>h('button',{class:`btn sec status-${s}`,onclick:run(async()=>{draft.status=s;setDirty();drawState();await save();})},{todo:'Sæt som ikke taget',doing:'Tag opgaven',closed:'Afslut sag',rejected:'Afvis sag'}[s])));
    const checklist=h('div'),progress=h('p',{class:'muted'});
    function drawChecks(){
      progress.textContent=`${draft.checklist.filter(c=>c.done).length} af ${draft.checklist.length} punkter udført`;
      checklist.replaceChildren(...draft.checklist.map((item,i)=>h('div',{class:`work-check${item.done?' completed':''}`},h('input',{type:'checkbox',checked:item.done,onchange:e=>{item.done=e.target.checked;setDirty();drawChecks();}}),h('input',{value:item.text,maxlength:300,'aria-label':'Tjeklistepunkt',oninput:e=>{item.text=e.target.value;setDirty();}}),h('button',{class:'btn sec sm','aria-label':'Flyt tjeklistepunkt op',disabled:i===0,onclick:()=>{if(i>0){[draft.checklist[i-1],draft.checklist[i]]=[draft.checklist[i],draft.checklist[i-1]];setDirty();drawChecks();}}},'↑'),h('button',{class:'btn sec sm','aria-label':'Flyt tjeklistepunkt ned',disabled:i===draft.checklist.length-1,onclick:()=>{if(i<draft.checklist.length-1){[draft.checklist[i+1],draft.checklist[i]]=[draft.checklist[i],draft.checklist[i+1]];setDirty();drawChecks();}}},'↓'),h('button',{class:'btn sec sm',onclick:()=>{draft.checklist.splice(i,1);setDirty();drawChecks();}},'Fjern'))));
    }
    const newItem=h('input',{placeholder:'Tilføj et delmål eller et arbejdstrin',maxlength:300});
    const addItem=()=>{if(newItem.value.trim()){if(draft.checklist.length>=100)return toast('Maks. 100 punkter',true);draft.checklist.push({text:newItem.value.trim(),done:false});newItem.value='';setDirty();drawChecks();}};
    newItem.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addItem();}});drawChecks();
    const gallery=h('div',{class:'work-gallery'});
    function drawFiles(files){gallery.replaceChildren(
      ...task.attachments.map(a=>h('a',{href:`${base}/${id}/image`,target:'_blank',rel:'noopener'},h('img',{src:`${base}/${id}/image`,alt:a.name||'Billede fra borger'}),h('small',{},'Billede fra fejlmeldingen'))),
      ...files.map(f=>h('a',{href:`${base}/${id}/files/${f.id}`,target:'_blank',rel:'noopener'},h('img',{src:`${base}/${id}/files/${f.id}`,alt:f.name}),h('small',{},f.name))));}
    drawFiles(task.files||[]);
    const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/gif,image/webp',multiple:true,'aria-label':'Tilføj billeder til opgaven'});
    const uploadButton=h('button',{class:'btn sec',onclick:run(async()=>{
      const files=[...upload.files];if(!files.length)throw new Error('Vælg mindst ét billede');
      for(const file of files){
        if(file.size>6*1024*1024)throw new Error(`${file.name}: højst 6 MB pr. billede`);
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Filen kunne ikke læses'));reader.readAsDataURL(file);});
        drawFiles(await api(`${base}/${id}/files`,{method:'POST',body:{name:file.name,data}}));
      }
      upload.value='';toast('Billeder er gemt på opgaven');
    })},'Gem valgte billeder');
    const conversation=h('div',{class:'work-conversation'});
    function drawComments(list){conversation.replaceChildren(...list.slice().reverse().map(c=>h('article',{class:`work-comment ${c.author_type}`},h('b',{},c.author_type==='developer'?'Udvikler':'Borger'),h('small',{},' · '+date(c.created_at)),h('p',{},c.body))));}
    drawComments(task.comments||[]);
    refreshConversation=async()=>{
      if(selected!==id||drawer.hidden||!conversationVisible||document.hidden)return;
      const known=tasks.find(t=>t.id===id)?.latestCitizenReply||0;
      const latest=await api(base+'/'+id);if(selected!==id||drawer.hidden||!conversationVisible||document.hidden)return;
      drawComments(latest.comments||[]);
      const through=Math.max(known,...(latest.comments||[]).filter(c=>c.author_type==='citizen').map(c=>Number(c.id)));
      if(through>(readThrough.get(id)||0)){await api(base+'/'+id+'/conversation-read',{method:'POST',body:{through}});readThrough.set(id,through);}
      if(selected===id){unread.delete(id);updateConversationBadge?.();draw();}
    };
    const reply=h('textarea',{maxlength:1800,placeholder:'Skriv en besked til borgeren. Denne tekst bliver sendt til Discord.'});
    const tabs=h('div',{class:'work-tabs'}),content=h('div');
    const panels={
      work:h('div',{},fields,scheduling,notes,h('h3',{},'Tjekliste'),progress,checklist,h('div',{class:'actions'},newItem,h('button',{class:'btn sec',onclick:addItem},'Tilføj punkt'))),
      planning:h('div',{},h('h3',{},'Planlægning og tidsregistrering'),h('p',{class:planning.reportPriority==='critical'?'critical-text':'muted'},'Borgerens vurdering: '+({low:'Lav',high:'Vigtig',critical:'Kritisk',custom:planning.reportPriorityCustom}[planning.reportPriority]||'Ikke angivet')),planFields,technical),
      images:h('div',{},h('h3',{},'Billeder og dokumentation'),h('p',{class:'muted'},'Billeder fra Discord og dine egne uploads samles her. PNG, JPG, GIF eller WebP · højst 6 MB pr. billede.'),gallery,h('button',{class:'btn sec',onclick:run(async()=>drawFiles((await api(`${base}/${id}`)).files||[]))},'Hent nye billeder'),h('div',{class:'actions'},upload,uploadButton)),
      conversation:h('div',{},h('h3',{},'Samtale med borgeren'),conversation,reply,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{const saved=await api(`${base}/${id}/comments`,{method:'POST',body:{text:reply.value}});drawComments(saved.comments||[]);reply.value='';toast(saved.sync_error||'Svar sendt');})},'Send svar'),h('button',{class:'btn sec',onclick:run(()=>refreshConversation())},'Hent nye beskeder')))
    };
    async function tab(key){conversationVisible=key==='conversation';content.replaceChildren(panels[key]);[...tabs.children].forEach(b=>b.classList.toggle('on',b.dataset.tab===key));if(conversationVisible)await refreshConversation();}
    for(const [key,label]of Object.entries({work:'Noter & tjekliste',planning:'FiveM & planlægning',images:'Billeder',conversation:'Samtale'}))tabs.append(h('button',{class:'btn sec','data-tab':key,onclick:run(()=>tab(key))},label));
    updateConversationBadge=()=>{const button=tabs.querySelector('[data-tab=conversation]');button.replaceChildren('Samtale',unreadBadge(id));};updateConversationBadge();
    const deleteButton=h('button',{class:'btn bad',onclick:run(async()=>{if(!window.confirm('Slet sagen fra tavlen? Historik og dokumentation bevares i loggen.'))return;await api(`${base}/${id}`,{method:'DELETE',body:{}});dirty=false;selected=null;drawer.hidden=true;detail.replaceChildren(h('p',{},'Sagen er slettet fra tavlen. Historikken er bevaret i loggen.'));await refresh();toast('Sagen er slettet og logget');})},'Slet sag');
    const archiveButton=h('button',{class:'btn sec',onclick:run(async()=>{draft.planning.archived=!draft.planning.archived;setDirty();await save();toast(draft.planning.archived?'Opgaven er arkiveret':'Opgaven er genåbnet på tavlen');await open(id);})},draft.planning.archived?'Gendan fra arkiv':'Arkivér opgave');
    detail.replaceChildren(h('div',{class:'top'},h('h2',{},`Opgave #${id}`),h('div',{class:'actions'},banner,h('button',{class:'btn sec','aria-label':'Luk sagskort',onclick:()=>{if(canLeave()){dirty=false;drawer.hidden=true;}}},'✕ Luk'))),h('div',{class:'actions'},archiveButton,deleteButton),h('p',{class:'muted'},'Oprettet '+date(task.created_at)+' · Sagens alder: '+Math.max(0,Math.floor((Date.now()-task.created_at)/3600000))+' timer · Forventet: '+(task.planning?.estimateHours||0)+' t · Registreret: '+(task.planning?.spentHours||0)+' t'),actions,h('div',{class:'work-checkboxes'},h('label',{},taken,' Opgaven er taget'),h('label',{},done,' Sagen er afsluttet')),tabs,content,h('div',{class:'work-save'},h('button',{class:'btn',onclick:run(save)},'Gem opgave, noter og tjekliste'),saveInfo));
    tab('work');draw();drawer.hidden=false;detail.scrollTop=0;detail.querySelector('button')?.focus();
  }
  const newTask={title:'',description:''};
  const templates={bug:'Fejlrapport',feature:'Ny funktion',optimization:'Ydelsesoptimering',mapping:'Mapping / MLO',vehicle:'Køretøj',ui:'NUI / interface'};
  const template=h('select',{},...Object.entries(templates).map(([v,l])=>h('option',{value:v},l)));
  const newCard=h('details',{class:'card work-new'},h('summary',{},'+ Opret en intern opgave'),h('p',{class:'muted'},'Gem egne arbejdsopgaver, idéer eller huskelister her.'),h('label',{class:'f'},'Opgavetype',template),field({k:'title',l:'Titel'},newTask),field({k:'description',l:'Beskrivelse',t:'textarea'},newTask),h('button',{class:'btn',onclick:run(async()=>{
    if(!canLeave())return;const task=await api(base,{method:'POST',body:newTask});const plan={...task.planning,kind:template.value};const steps=template.value==='optimization'?['Mål udgangspunkt med profiler','Find belastende resource','Implementér optimering','Mål igen og test på server']:['Genskab / afgræns opgaven','Implementér ændringen','Test på testserver','Kontrollér før release'];await api(`${base}/${task.id}`,{method:'PUT',body:{...task,planning:plan,checklist:steps.map(text=>({text,done:false}))}});dirty=false;newTask.title='';newTask.description='';await refresh();newCard.open=false;await open(task.id);toast('Opgaven er gemt');
  })},'Opret og åbn opgave'));

  const logBody=h('div'),logCount=h('p',{class:'muted'});let nextLog=null,logLoaded=false,logLoading=false,loadedCount=0;
  const labels={panel_sent:'Panel sendt til Discord',settings_updated:'Indstillinger ændret',created:'Sag oprettet',updated:'Sag ændret',rejected:'Sag afvist',deleted:'Sag slettet',comment:'Kommentar tilføjet',image_uploaded:'Billede vedhæftet'};
  const older=h('button',{class:'btn sec',onclick:run(()=>loadLogs(false))},'Hent ældre hændelser');older.hidden=true;
  async function loadLogs(reset){
    if(logLoading)return;logLoading=true;
    try{
      const result=await api(base+'/audit/events'+(!reset&&nextLog?'?before='+nextLog:''));
      if(reset){logBody.replaceChildren();loadedCount=0;}
      logBody.append(...result.events.map(e=>h('details',{class:'work-comment'},h('summary',{},date(e.created_at)+' · #'+e.task_id+' · '+(labels[e.action]||e.action)+' · '+e.user_id),h('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere'},JSON.stringify(e.details,null,2)),e.details.fileId&&h('a',{href:base+'/'+e.task_id+'/files/'+e.details.fileId,target:'_blank',rel:'noopener'},'Åbn vedhæftet billede'),e.action==='created'&&e.details.image&&h('a',{href:base+'/'+e.task_id+'/image',target:'_blank',rel:'noopener'},'Åbn oprindeligt billede'))));
      loadedCount+=result.events.length;nextLog=result.next;older.hidden=!nextLog;logLoaded=true;logCount.textContent=loadedCount+' hændelser indlæst'+(!nextLog?' · hele historikken er indlæst':'');
    }finally{logLoading=false;}
  }
  const log=h('div',{class:'card audit-workspace'},h('span',{class:'workspace-eyebrow'},'HISTORIK & DOKUMENTATION'),h('h2',{},'Udviklerens aktivitetslog'),h('p',{class:'muted'},'Oprettelser, noter, tjeklister, tid, status, billeder og sletninger gemmes i databasen. Sletning af en sag fjerner ikke dens historik. Hent ældre hændelser for at se længere tilbage.'),h('button',{class:'btn sec',onclick:run(()=>loadLogs(true))},'Opdatér log'),logCount,logBody,older);
  const panelChannel=h('select',{},...optionList(G.channels,'# ','Vælg Discord-kanal'));
  const buttonBuilder=await renderReportButtonBuilder(base,reportCategories);
  const discord=h('div',{class:'card'},h('span',{class:'workspace-eyebrow'},'DISCORD & OPSÆTNING'),h('h2',{},'Fejlmeldingspanel til borgerne'),h('p',{class:'muted'},'Vælg en kanal og send panelet. Borgeren kan indsende titel, beskrivelse og billede. Sagen lander på FiveM-arbejdstavlen.'),panelChannel,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{if(!panelChannel.value)throw new Error('Vælg en kanal');await api(base+'/panel',{method:'POST',body:{channel:panelChannel.value}});toast('Fejlmeldingspanelet er sendt til Discord');})},'Send panel til Discord')),h('p',{class:'muted'},'Borgerkommandoer: /fejl · /fejlstatus · /fejlsvar · /fejlbillede. Interne noter, planlægning og logs er kun til udviklere og administratorer.'));
  const lockButton=h('button',{class:'btn sec',onclick:run(async()=>{if(!canLeave())return;dirty=false;await api('/api/guild/'+G.id+'/developer-access/lock',{method:'POST',body:{}});await route();})},'Lås udviklerpanelet');
  const changePin=h('details',{class:'card'},h('summary',{},'Skift adgangskode (serverejeren)'),h('p',{class:'muted'},'Andre brugere bliver låst ude, når koden ændres.'),pin,h('button',{class:'btn',onclick:run(async()=>{await api('/api/guild/'+G.id+'/developer-access/change',{method:'POST',body:{pin:pin.value}});pin.value='';toast('Adgangskoden er ændret');})},'Gem ny firecifret kode'));
  const header=h('div',{class:'card work-header workspace-hero'},h('div',{},h('span',{class:'workspace-eyebrow'},'FIVEM · UDVIKLINGSCENTER'),h('h2',{},'Fra fejlmelding til færdig release'),h('p',{class:'muted'},'Én arbejdsplads til planlægning, dokumentation og borgersager.')),counts,lockButton);
  const tools=h('div',{class:'work-tools'},search,priorityFilter,typeFilter,categoryFilter,archiveFilter,h('button',{class:'btn sec',onclick:run(refresh)},'Hent nye sager'));
  pollTimer=setInterval(async()=>{
    if(polling||dragged||moving)return;polling=true;
    try{
      const latest=await api(base);
      for(const task of latest){const previous=replySeen.get(task.id)||0;if(task.unreadCitizenReply&&task.latestCitizenReply>(readThrough.get(task.id)||0))unread.add(task.id);else unread.delete(task.id);if(task.latestCitizenReply>previous)toast('Nyt svar fra borger på sag #'+task.id);replySeen.set(task.id,task.latestCitizenReply||0);}updateConversationBadge?.();
      const changed=JSON.stringify(tasks)!==JSON.stringify(latest);tasks=latest;if(changed)draw();if(!drawer.hidden&&conversationVisible&&refreshConversation)await refreshConversation();
    }catch(e){if(e.status===423){dirty=false;clearInterval(pollTimer);await route();}}finally{polling=false;}
  },7000);
  calendar=developerCalendar({getTasks:()=>tasks,onOpen:async id=>{if(canLeave())await open(id);},onSchedule:schedule,draggedTask:()=>dragged,onDrag:id=>{dragged=id;},canMove:canLeave});
  const list=h('div',{class:'card tablewrap'},h('h2',{},'Alle aktive sager'),h('table',{class:'table'},h('thead',{},h('tr',{},...['Sag','Status','Prioritet','Kalendertid','Ansvarlig'].map(x=>h('th',{},x)))),listBody));
  drawer.append(drawerBackdrop,detail);
  const escape=e=>{if(e.key==='Escape'&&!drawer.hidden&&canLeave()){dirty=false;drawer.hidden=true;}};window.addEventListener('keydown',escape);
  const previousCleanup=window.developerCleanup;previousCleanup?.();window.developerCleanup=()=>{window.removeEventListener('keydown',escape);window.removeEventListener('beforeunload',unload);};
  draw();
  return [header,dashboardTabs([
    {id:'discord',icon:'⚙',label:'Discord & indstillinger',content:[buttonBuilder,discord,changePin,...(!G.developerOnly?[settingsCard('developer','Adgang og roller')]:[])]},
    {id:'board',icon:'▦',label:'FiveM-arbejdstavle',content:[h('p',{class:'muted'},'Træk kort mellem kolonner eller oven på et andet kort for at ændre rækkefølgen. Flytninger gemmes med det samme. På mobil kan du åbne kortet og bruge statusknapperne.'),tools,newCard,board]},
    {id:'calendar',icon:'◷',label:'Kalender',content:[calendar.element]},
    {id:'list',icon:'☷',label:'Sagsliste',content:[list]},
    {id:'logs',icon:'≡',label:'Aktivitetslog',content:[log],onOpen:()=>{if(!logLoaded)loadLogs(true).catch(e=>toast(e.message,true));}}
  ],G.id+'-developer','board'),drawer];
}

async function renderReportButtonBuilder(base,categories){
 const draft=await api(base+'/panel-config');
 const rows=h('div',{class:'rows'}),preview=h('div',{class:'actions'});
 const colors={blue:'Blå',green:'Grøn',red:'Rød',gray:'Grå'};
 function select(label,value,options,change){const el=h('select',{onchange:e=>{change(e.target.value);drawPreview();}},...options.map(([id,name])=>h('option',{value:id},name)));el.value=value;return h('label',{class:'f'},label,el);}
 function drawPreview(){preview.replaceChildren(...draft.buttons.map(b=>h('button',{type:'button',class:'btn',style:'background:'+({blue:'#5865f2',green:'#248046',red:'#da373c',gray:'#4e5058'}[b.color]),title:'Forhåndsvisning'},(b.emoji?b.emoji+' ':'')+b.label)));}
 function draw(){rows.replaceChildren(...draft.buttons.map((b,i)=>{const label=field({k:'label',l:'Tekst på knappen'},b),emoji=field({k:'emoji',l:'Emoji (valgfri)'},b);label.addEventListener('input',drawPreview);emoji.addEventListener('input',drawPreview);return h('div',{class:'row'},h('div',{class:'grid'},label,emoji,select('Farve',b.color,Object.entries(colors),v=>b.color=v),select('Knappen åbner',b.category,[['choose','Borgeren vælger selv kategori'],...categories.map(c=>[c.id,c.label])],v=>b.category=v)),h('div',{class:'actions'},h('button',{type:'button',class:'btn sec sm',disabled:i===0,onclick:()=>{draft.buttons.splice(i-1,0,draft.buttons.splice(i,1)[0]);draw();}},'Flyt op'),h('button',{type:'button',class:'btn bad sm',onclick:()=>{draft.buttons.splice(i,1);draw();}},'Fjern knap')));}));drawPreview();}
 draw();
 return h('div',{class:'card'},h('h2',{},'Byg dine egne Discord-knapper'),h('p',{class:'muted'},'Vælg tekst, emoji, farve og kategori for hver knap. Fjern alle knapper for et panel uden knapper. Discord tillader blå, grøn, rød og grå knapper; orange understøttes ikke.'),field({k:'text',l:'Besked i Discord-panelet',t:'textarea'},draft),rows,h('button',{type:'button',class:'btn sec',onclick:()=>{if(draft.buttons.length>=25){toast('Der må højst være 25 knapper',true);return;}draft.buttons.push({label:'Ny knap',emoji:'',color:'blue',category:'choose'});draw();}},'Tilføj knap'),h('h3',{},'Forhåndsvisning'),preview,h('button',{type:'button',class:'btn',onclick:run(async()=>{const result=await api(base+'/panel-config',{method:'PUT',body:draft});toast('Knapper gemt · '+result.updatedPanels+' eksisterende Discord-paneler opdateret.');})},'Gem knapper og opdater Discord'));
}
