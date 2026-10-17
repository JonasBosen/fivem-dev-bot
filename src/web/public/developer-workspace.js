async function renderDeveloperWorkspace(isWishes=false) {
  const base=`/api/guild/${G.id}/developer`,boardType=isWishes?'request':'bug',listUrl=base+'?board='+boardType,columnsUrl=base+'/columns?board='+boardType;const switchBoard=wishes=>{if(wishes===isWishes)return;if(!canLeave())return;panelTabSet('section:'+G.id+(wishes?'-developer-wishes':'-developer'),wishes?'wishes':'board');location.hash='#/g/'+G.id+'/'+(wishes?'developer-wishes':'developer');};
  const gate=await api('/api/guild/'+G.id+'/developer-access');
  if(!gate.unlocked){const pin=h('input',{type:'password',inputmode:'numeric',pattern:'[0-9]{2}-?[0-9]{2}',maxlength:5,autocomplete:'off','aria-label':'Udviklerkode'});return [h('form',{class:'card',onsubmit:async e=>{e.preventDefault();try{await api('/api/guild/'+G.id+'/developer-access/unlock',{method:'POST',body:{pin:pin.value}});await route();}catch(err){toast(err.message,true);}}},h('h2',{},'Lås udviklerpanelet op'),h('p',{},'Indtast den separate firecifrede kode, med eller uden bindestreg. Din Discord skal også have udviklerrollen.'),pin,h('button',{class:'btn',type:'submit'},'Lås op'))];}
  const [reportCategories,workspace]=await Promise.all([api('/report-categories.json'),api(base+'/workspace?board='+boardType)]);
  const {tasks:initialTasks,panelConfig,columns:initialColumns,presence:initialPresence,wishPanelConfig:initialWishConfig}=workspace;
  const caseBadges={bug:h('span',{class:'conversation-unread',hidden:true,'aria-live':'polite'}),request:h('span',{class:'conversation-unread',hidden:true,'aria-live':'polite'})};
  let badgeRequest=0;
  async function updateCaseBadges(markId){const version=++badgeRequest;try{const counts=await api(markId?base+'/'+markId+'/case-read':base+'/new-cases',markId?{method:'POST',body:{}}:undefined);if(version!==badgeRequest)return;for(const type of ['bug','request']){const badge=caseBadges[type],count=counts[type]||0;badge.hidden=count===0;badge.textContent=String(count);badge.setAttribute('aria-label',count+' ulæste sager');}}catch(e){if(markId)toast('Læsestatus blev ikke gemt: '+e.message,true);}}
  for(const type of ['bug','request']){const count=workspace.newCaseCounts?.[type]||0;caseBadges[type].hidden=!count;caseBadges[type].textContent=String(count);caseBadges[type].setAttribute('aria-label',count+' ulæste sager');}
  const reportLabel=p=>p?.reportCategory==='other'?p.reportCategoryCustom:reportCategories.find(c=>c.id===p?.reportCategory)?.label||'';
  let presence=initialPresence;const presenceRows=h('tbody');
  let columns=initialColumns,draggedColumn=null;
  let tasks=initialTasks, selected=null, dirty=false, saving=false;
  const replySeen=new Map(tasks.map(t=>[t.id,t.latestCitizenReply||0])),unread=new Set(tasks.filter(t=>t.unreadCitizenReply).map(t=>t.id)),readThrough=new Map(tasks.filter(t=>!t.unreadCitizenReply).map(t=>[t.id,t.latestCitizenReply||0]));
  const unreadBadge=id=>unread.has(id)?h('span',{class:'conversation-unread','aria-label':'Ny besked fra borger'},'1'):null;
  let refreshConversation=null,polling=false,dragged=null,moving=false,calendar=null,conversationVisible=false,updateConversationBadge=null;
  const layoutGuild=G.id+(isWishes?'-wishes':''),layoutUser=me.user.id;let legacy;try{legacy=JSON.parse(localStorage.getItem('developer-layout-v1:'+layoutGuild+':'+layoutUser));}catch{}const layoutMemory=await personalMemory(G.id,layoutUser,boardType,legacy);
  const layout=developerLayout(layoutGuild,layoutUser,layoutMemory),windows=new Map(),windowHost=h('div',{class:'case-windows'});
  const listBody=h('tbody');
  const drawer=h('div',{class:'dev-drawer',hidden:true,role:'dialog','aria-modal':'true','aria-label':'Redigér sag'});
  const drawerBackdrop=h('div',{class:'dev-drawer-backdrop',onclick:close});
  const archiveFilter=h('select',{onchange:()=>draw()},h('option',{value:'active'},'Aktive opgaver'),h('option',{value:'archived'},'Arkiverede opgaver'));
  const rank=t=>t.planning?.position||-t.created_at;
  async function move(id,state,beforeId){
    if(moving||!canLeave())return;moving=true;
    try{
      const task=await api(`${base}/${id}`);
      const target=columns.find(c=>c.id===state);if(!target)throw new Error('Kolonnen findes ikke');
      const lane=tasks.filter(t=>t.id!==id&&columnForTask(t)===state&&!!t.planning?.archived===(archiveFilter.value==='archived')).sort((a,b)=>rank(a)-rank(b));
      let index=beforeId?lane.findIndex(t=>t.id===beforeId):lane.length;if(index<0)index=lane.length;
      const left=index>0?rank(lane[index-1]):(lane[index]?rank(lane[index])-2048:0);
      const right=lane[index]?rank(lane[index]):left+2048;
      await api(`${base}/${id}`,{method:'PUT',body:{...task,status:target.status,planning:{...task.planning,columnId:state,priority:state==='critical'?'critical':state==='todo'&&task.planning.priority==='critical'?'normal':task.planning.priority,position:(left+right)/2}}});
      if(windows.has(id)&&!windows.get(id).dirty)await open(id,true);await refresh();toast('Opgaven er flyttet og gemt');
    }finally{moving=false;dragged=null;}
  }
  const columnForTask=t=>{const assigned=t.planning?.columnId;if(assigned)return columns.some(c=>c.id===assigned)?assigned:'unassigned';const baseLane=taskLane(t);return columns.some(c=>c.id===baseLane)?baseLane:'unassigned';};
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
  const unload=e=>{if(dirty||[...windows.values()].some(w=>w.dirty)){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  const hashChanged=()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('hashchange',hashChanged);};
  window.addEventListener('hashchange',hashChanged);
  function canLeave(){return !(dirty||[...windows.values()].some(w=>w.dirty))||window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade opgaven?');}
  function drawPresence(){presenceRows.replaceChildren(...presence.map(p=>h('tr',{},h('td',{},p.discord_name),h('td',{},(Number(p.total_ms)/3600000).toFixed(2)+' timer'),h('td',{},p.active&&Date.now()-Number(p.last_seen)<75000?'Aktiv i panelet':'Ikke aktiv'),h('td',{},date(Number(p.last_seen))))));}
  function draw(){
    if(layout.dragging)return;
    calendar?.draw();drawList();drawPresence();layout.clearLanes();
    const active=tasks.filter(t=>!['done','closed','rejected'].includes(t.status));
    const metric=(value,label,state)=>h('span',{class:'work-count status-'+state},value,h('small',{},label));
    counts.replaceChildren(metric(tasks.filter(t=>t.status==='todo').length,'Ikke taget','todo'),metric(tasks.filter(t=>t.status==='doing').length,'Taget · I gang','doing'),metric(active.filter(t=>t.planning?.priority==='critical').length,'Kritiske åbne','critical'),metric(tasks.filter(t=>t.status==='closed').length,'Afsluttet','closed'),metric((presence.reduce((n,p)=>n+Number(p.total_ms||0),0)/3600000).toFixed(2)+' t','Samlet tid i panelet','todo'));
    const query=search.value.trim().toLowerCase();
    const visibleColumns=[...layout.order(columns),...(tasks.some(t=>columnForTask(t)==='unassigned')?[{id:'unassigned',name:'Uden kolonne · sager er bevaret',color:'#94a3b8',status:'todo'}]:[])];
    const buildBoard=(target,wishes)=>{target.replaceChildren(...visibleColumns.map(({id:state,name:label,color,status})=>{
      const items=tasks.filter(t=>(t.planning?.reportType==='request')===wishes&&!!t.planning?.archived===(archiveFilter.value==='archived')&&columnForTask(t)===state&&(!priorityFilter.value||t.planning?.priority===priorityFilter.value)&&(!typeFilter.value||t.planning?.kind===typeFilter.value)&&(!categoryFilter.value||t.planning?.reportCategory===categoryFilter.value)&&`${t.id} ${t.title} ${t.description} ${t.planning?.resource||''} ${t.planning?.assignee||''} ${reportLabel(t.planning)}`.toLowerCase().includes(query)).sort((a,b)=>rank(a)-rank(b));
      const lane=h('section',{class:`work-lane status-${state}`,style:'--state:'+color+';border-color:'+color,'data-column-id':state,ondragover:e=>{e.preventDefault();e.dataTransfer.dropEffect='move';},ondrop:run(async e=>{e.preventDefault();if(draggedColumn&&!layout.locked){layout.moveColumn(draggedColumn,state,columns);draggedColumn=null;draw();}else if(dragged&&state!=='unassigned')await move(dragged,state);})},h('h3',{draggable:String(!layout.locked&&state!=='unassigned'),ondragstart:e=>{if(layout.locked||state==='unassigned'){e.preventDefault();return;}draggedColumn=state;e.dataTransfer.setData('text/plain','column:'+state);e.stopPropagation();},ondragend:()=>{draggedColumn=null;}},h('span',{class:'work-dot'}),label,h('span',{class:'work-total'},items.length)),
        ...(items.length?items.map(t=>h('button',{draggable:String(!layout.locked),ondragstart:e=>{if(layout.locked){e.preventDefault();return;}dragged=t.id;e.dataTransfer.setData('text/plain',String(t.id));e.dataTransfer.effectAllowed='move';},ondragend:()=>{dragged=null;},ondragover:e=>{e.preventDefault();e.stopPropagation();},ondrop:run(async e=>{e.preventDefault();e.stopPropagation();if(dragged&&dragged!==t.id)await move(dragged,state,t.id);}),class:`work-ticket priority-${t.planning?.priority||'normal'} status-${state}${windows.has(t.id)?' selected':''}${unread.has(t.id)?' has-unread':''}`,onclick:run(()=>open(t.id))},
          h('div',{class:'work-ticket-top'},h('span',{},`#${t.id}`),unreadBadge(t.id),h('span',{'aria-label':label},['done','closed'].includes(state)?'☑':state==='doing'?'◩':'☐')),
          h('span',{class:'drag-grip','aria-label':'Træk for at flytte sagen'},'⠿ Træk kortet'),h('b',{},t.title),h('small',{class:'muted'},'Borger: '+(t.planning?.reporterName||t.user_id)),t.planning?.developers?.length&&h('small',{class:'muted'},'Udviklere: '+t.planning.developers.map(d=>d.name).join(', ')),['low','high','critical'].includes(t.planning?.priority)&&h('span',{class:'priority-badge priority-'+t.planning.priority},({low:'🟢 Lav',high:'🟠 Mellem / vigtig',critical:'🔴 Kritisk'})[t.planning.priority]),t.planning?.scheduledStart&&h('small',{class:'schedule-badge'},'◷ '+date(Date.parse(t.planning.scheduledStart))),h('small',{class:'work-planning-badges'},[reportLabel(t.planning),t.planning?.priority==='critical'?'':priorities[t.planning?.priority]||'Normal',t.planning?.resource,t.planning?.assignee,t.planning?.deadline?'Frist: '+t.planning.deadline:''].filter(Boolean).join(' · ')),h('p',{},t.description.slice(0,110)),h('div',{class:'work-ticket-bottom'},`${t.checklist.filter(c=>c.done).length}/${t.checklist.length} punkter`,h('small',{},date(t.updated_at))))) : [h('p',{class:'muted'},'Ingen opgaver her')]) );
    layout.lane(lane,state);return lane;
    }));layout.board(target);};buildBoard(board,isWishes);
  }
  function drawList(){
    listBody.replaceChildren(...tasks.filter(t=>!t.planning?.archived&&(t.planning?.reportType==='request')===isWishes).map(t=>h('tr',{},h('td',{},h('button',{class:'btn sec sm',onclick:run(()=>{return open(t.id);})},'#'+t.id+' '+t.title,unreadBadge(t.id))),h('td',{class:'state-text status-'+t.status},states[t.status]),h('td',{class:'priority-badge priority-'+t.planning?.priority},priorities[t.planning?.priority]||'Normal'),h('td',{},t.planning?.scheduledStart?date(Date.parse(t.planning.scheduledStart)):'Ikke planlagt'),h('td',{},t.planning?.assignee||'Ikke tildelt'))));
  }
  async function schedule(id,day){
    if(!canLeave())return;
    const task=await api(base+'/'+id),start=new Date(day+'T09:00:00');
    if(task.planning.scheduledStart){const old=new Date(task.planning.scheduledStart);start.setHours(old.getHours(),old.getMinutes());}
    const minutes=task.planning.scheduledStart?(Date.parse(task.planning.scheduledEnd)-Date.parse(task.planning.scheduledStart))/60000:Math.max(15,(task.planning.estimateHours||1)*60);
    const end=new Date(start.getTime()+minutes*60000);
    await api(base+'/'+id,{method:'PUT',body:{...task,planning:{...task.planning,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString()}}});
    dirty=false;await refresh();if(windows.has(id)&&!windows.get(id).dirty)await open(id,true);toast('Kalendertid er gemt og borgerens statusbesked er opdateret');
  }
  async function refresh(){await updateCaseBadges();tasks=await api(listUrl);draw();}
  async function open(id,reload=false){
    const existing=windows.get(id);if(existing&&!reload){existing.focus();await updateCaseBadges(id);return;}if(existing){existing.dispose();windows.delete(id);}
    let dirty=false,saving=false,conversationVisible=false,refreshConversation=null,updateConversationBadge=null;
    const selected=id,detail=h('section',{class:'card work-detail'}),drawer=h('section',{class:'case-window','data-case-id':id,role:'dialog','aria-label':'Opgave #'+id}),saveInfo=h('span',{class:'muted'});
    const canLeave=()=>!dirty||window.confirm('Du har ændringer, der ikke er gemt. Luk sagen alligevel?');
    const setDirty=()=>{dirty=true;saveInfo.textContent='Ændringer er ikke gemt';saveInfo.className='work-unsaved';};
    const title=h('div',{class:'case-window-handle',tabindex:0,'aria-label':'Flyt vindue for sag #'+id},h('b',{},'⠿ Sag #'+id),h('span',{class:'muted'},'Træk her · tilpas i nederste højre hjørne'),h('button',{type:'button',class:'btn sec sm','aria-label':'Luk vindue for sag #'+id,onclick:()=>close()},'✕'));
    const close=()=>{if(!canLeave())return;frame.dispose();windows.delete(id);draw();};
    drawer.append(title,detail);windowHost.append(drawer);const disposeLayout=layout.windowBox(drawer,id,title);
    const frame={get dirty(){return dirty;},focus(){drawer.dispatchEvent(new PointerEvent('pointerdown'));},dispose(){disposeLayout();drawer.remove();},refresh:()=>refreshConversation?.(),badge:()=>updateConversationBadge?.()};windows.set(id,frame);detail.replaceChildren(h('p',{class:'muted'},'Indlæser sag…'));
    let task;try{task=await api(`${base}/${id}`);}catch(e){frame.dispose();windows.delete(id);throw e;}if(windows.get(id)!==frame)return;

    if(!reload)updateCaseBadges(id);
    const draft=structuredClone(task), banner=h('div',{class:`work-state status-${draft.status}`});
    saveInfo.textContent='Gemt · '+date(task.updated_at);saveInfo.className='muted';
    draft.planning ||= {};
    const planning=draft.planning;
    const selectField=(key,label,options)=>h('label',{class:'f'},h('span',{},label),h('select',{onchange:e=>{planning[key]=e.target.value;setDirty();}},...Object.entries(options).map(([v,l])=>h('option',{value:v,selected:planning[key]===v,style:v==='critical'?'color:#ef4444':''},l))));
    const scheduleStart=h('input',{type:'datetime-local',value:localDateTimeValue(planning.scheduledStart),'aria-label':'Planlagt start',onchange:e=>{planning.scheduledStart=e.target.value?new Date(e.target.value).toISOString():'';setDirty();}});
    const scheduleEnd=h('input',{type:'datetime-local',value:localDateTimeValue(planning.scheduledEnd),'aria-label':'Planlagt slut',onchange:e=>{planning.scheduledEnd=e.target.value?new Date(e.target.value).toISOString():'';setDirty();}});
    planning.developers||=[];const assignees=h('div'),peopleSelect=h('select',{'aria-label':'Vælg udvikler til sagen'},h('option',{value:''},'Hent udviklere først'));
    let availablePeople=[];
    function drawAssignees(){assignees.replaceChildren(...planning.developers.map(d=>h('span',{class:'chip'},d.name,h('button',{type:'button',onclick:()=>{planning.developers=planning.developers.filter(x=>x.id!==d.id);setDirty();drawAssignees();}},'Fjern'))));}
    const assignmentEditor=h('div',{class:'row'},h('h3',{},'Ansvarlige udviklere'),h('p',{class:'muted'},'Borger: '+(planning.reporterName||task.user_id)+' · Discord-ID '+task.user_id),assignees,h('div',{class:'actions'},h('button',{class:'btn sec',onclick:run(async()=>{availablePeople=await api(base+'/people');peopleSelect.replaceChildren(h('option',{value:''},'Vælg udvikler'),...availablePeople.map(p=>h('option',{value:p.id},p.name)));})},'Hent udviklere'),peopleSelect,h('button',{class:'btn sec',onclick:()=>{const person=availablePeople.find(p=>p.id===peopleSelect.value);if(person&&!planning.developers.some(p=>p.id===person.id)){planning.developers.push(person);setDirty();drawAssignees();}}},'Tilknyt udvikler')));drawAssignees();
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
        planning.developers=saved.planning.developers||[];drawAssignees();tasks=tasks.map(t=>t.id===id?saved:t);draw();drawState();toast(saved.sync_error||'Opgaven er gemt');
      }finally{saving=false;}
    }
    const taken=h('input',{type:'checkbox',onchange:()=>{draft.status=taken.checked?'doing':'todo';setDirty();drawState();}});
    const done=h('input',{type:'checkbox',onchange:()=>{draft.status=done.checked?'closed':'doing';setDirty();drawState();}});
    function drawState(){taken.checked=['doing','done','closed'].includes(draft.status);done.checked=['done','closed'].includes(draft.status);banner.className=`work-state status-${taskLane(draft)}`;banner.replaceChildren(h('span',{class:'work-dot'}),states[draft.status]);}
    drawState();
    const quickMove=h('select',{'aria-label':'Flyt sag til kolonne',onchange:run(async e=>{if(!e.target.value)return;await move(id,e.target.value);})},h('option',{value:''},'Flyt til kolonne…'),...columns.map(c=>h('option',{value:c.id},c.name)));
    const timer=h('button',{class:'btn sec',onclick:run(async()=>{if(planning.timerStartedAt){planning.spentHours=Math.round(((planning.spentHours||0)+(Date.now()-planning.timerStartedAt)/3600000)*100)/100;planning.timerStartedAt=0;}else planning.timerStartedAt=Date.now();setDirty();await save();await open(id,true);})},planning.timerStartedAt?'⏹ Stop timer og gem tid':'▶ Start arbejdstimer');
    const actions=h('div',{class:'actions'},quickMove,timer,h('button',{class:'btn sec',onclick:run(()=>openChangelogDialog(draft))},'📣 Udgiv som changelog'),...['todo','doing','closed','rejected'].map(s=>h('button',{class:`btn sec status-${s}`,onclick:run(async()=>{draft.status=s;setDirty();drawState();await save();})},{todo:'Sæt som ikke taget',doing:'Tag opgaven',closed:'Afslut sag',rejected:'Afvis sag'}[s])));
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
      if(selected!==id||!drawer.isConnected||drawer.hidden||!conversationVisible||document.hidden)return;
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
      work:h('div',{},assignmentEditor,fields,scheduling,notes,h('h3',{},'Tjekliste'),progress,checklist,h('div',{class:'actions'},newItem,h('button',{class:'btn sec',onclick:addItem},'Tilføj punkt'))),
      planning:h('div',{},h('h3',{},'Planlægning og tidsregistrering'),h('p',{class:planning.reportPriority==='critical'?'critical-text':'muted'},'Borgerens vurdering: '+({low:'Lav',high:'Vigtig',critical:'Kritisk',custom:planning.reportPriorityCustom}[planning.reportPriority]||'Ikke angivet')),planFields,technical),
      images:h('div',{},h('h3',{},'Billeder og dokumentation'),h('p',{class:'muted'},'Billeder fra Discord og dine egne uploads samles her. PNG, JPG, GIF eller WebP · højst 6 MB pr. billede.'),gallery,h('button',{class:'btn sec',onclick:run(async()=>drawFiles((await api(`${base}/${id}`)).files||[]))},'Hent nye billeder'),h('div',{class:'actions'},upload,uploadButton)),
      conversation:h('div',{},h('h3',{},'Samtale med borgeren'),conversation,reply,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{const saved=await api(`${base}/${id}/comments`,{method:'POST',body:{text:reply.value}});drawComments(saved.comments||[]);reply.value='';toast(saved.sync_error||'Svar sendt');})},'Send svar'),h('button',{class:'btn sec',onclick:run(()=>refreshConversation())},'Hent nye beskeder')))
    };
    async function tab(key){conversationVisible=key==='conversation';content.replaceChildren(panels[key]);[...tabs.children].forEach(b=>b.classList.toggle('on',b.dataset.tab===key));if(conversationVisible)await refreshConversation();}
    for(const [key,label]of Object.entries({work:'Noter & tjekliste',planning:'FiveM & planlægning',images:'Billeder',conversation:'Samtale'}))tabs.append(h('button',{class:'btn sec','data-tab':key,onclick:run(()=>tab(key))},label));
    updateConversationBadge=()=>{const button=tabs.querySelector('[data-tab=conversation]');button.replaceChildren('Samtale');const badge=unreadBadge(id);if(badge)button.append(badge);};updateConversationBadge();
    const deleteButton=h('button',{class:'btn bad',onclick:run(async()=>{if(!window.confirm('Slet sagen fra tavlen? Historik og dokumentation bevares i loggen.'))return;await api(`${base}/${id}`,{method:'DELETE',body:{}});dirty=false;frame.dispose();windows.delete(id);detail.replaceChildren(h('p',{},'Sagen er slettet fra tavlen. Historikken er bevaret i loggen.'));await refresh();toast('Sagen er slettet og logget');})},'Slet sag');
    const archiveButton=h('button',{class:'btn sec',onclick:run(async()=>{draft.planning.archived=!draft.planning.archived;setDirty();await save();toast(draft.planning.archived?'Opgaven er arkiveret':'Opgaven er genåbnet på tavlen');await open(id,true);})},draft.planning.archived?'Gendan fra arkiv':'Arkivér opgave');
    detail.replaceChildren(h('div',{class:'top'},h('h2',{},`Opgave #${id}`),h('div',{class:'actions'},banner,h('button',{class:'btn sec','aria-label':'Luk sagskort',onclick:close},'✕ Luk'))),h('div',{class:'actions'},archiveButton,deleteButton),h('p',{class:'muted'},'Oprettet '+date(task.created_at)+' · Sagens alder: '+Math.max(0,Math.floor((Date.now()-task.created_at)/3600000))+' timer · Forventet: '+(task.planning?.estimateHours||0)+' t · Registreret: '+(task.planning?.spentHours||0)+' t'),actions,h('div',{class:'work-checkboxes'},h('label',{},taken,' Opgaven er taget'),h('label',{},done,' Sagen er afsluttet')),tabs,content,h('div',{class:'work-save'},h('button',{class:'btn',onclick:run(save)},'Gem opgave, noter og tjekliste'),saveInfo));
    tab('work');draw();drawer.hidden=false;detail.scrollTop=0;detail.querySelector('button')?.focus();
  }
  const newTask={title:'',description:''};
  const templates={bug:'Fejlrapport',feature:'Ny funktion',optimization:'Ydelsesoptimering',mapping:'Mapping / MLO',vehicle:'Køretøj',ui:'NUI / interface'};
  const template=h('select',{},...Object.entries(templates).map(([v,l])=>h('option',{value:v},l)));
  const newCard=h('details',{class:'card work-new'},h('summary',{},'+ Opret en intern opgave'),h('p',{class:'muted'},'Gem egne arbejdsopgaver, idéer eller huskelister her.'),h('label',{class:'f'},'Opgavetype',template),field({k:'title',l:'Titel'},newTask),field({k:'description',l:'Beskrivelse',t:'textarea'},newTask),h('button',{class:'btn',onclick:run(async()=>{
    if(!canLeave())return;const task=await api(base,{method:'POST',body:{...newTask,reportType:boardType}});const plan={...task.planning,kind:template.value};const steps=template.value==='optimization'?['Mål udgangspunkt med profiler','Find belastende resource','Implementér optimering','Mål igen og test på server']:['Genskab / afgræns opgaven','Implementér ændringen','Test på testserver','Kontrollér før release'];await api(`${base}/${task.id}`,{method:'PUT',body:{...task,planning:plan,checklist:steps.map(text=>({text,done:false}))}});dirty=false;newTask.title='';newTask.description='';await refresh();newCard.open=false;await open(task.id);toast('Opgaven er gemt');
  })},'Opret og åbn opgave'));

  const logBody=h('div'),logCount=h('p',{class:'muted'});let nextLog=null,logLoaded=false,logLoading=false,loadedCount=0;
  const labels={changelog_created:'Changelog-udkast oprettet',changelog_generated:'Changelog skrevet med AI',changelog_image_generated:'AI-billede oprettet til changelog',changelog_published:'Changelog udgivet til Discord',panel_sent:'Panel sendt til Discord',settings_updated:'Indstillinger ændret',created:'Sag oprettet',updated:'Sag ændret',rejected:'Sag afvist',deleted:'Sag slettet',comment:'Kommentar tilføjet',image_uploaded:'Billede vedhæftet'};
  const older=h('button',{class:'btn sec',onclick:run(()=>loadLogs(false))},'Hent ældre hændelser');older.hidden=true;
  async function loadLogs(reset){
    if(logLoading)return;logLoading=true;
    try{
      const result=await api(base+'/audit/events?board='+boardType+(!reset&&nextLog?'&before='+nextLog:''));
      if(reset){logBody.replaceChildren();loadedCount=0;}
      logBody.append(...result.events.map(e=>h('details',{class:'work-comment'},h('summary',{},date(e.created_at)+' · #'+e.task_id+' · '+(labels[e.action]||e.action)+' · '+e.user_id),h('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere'},JSON.stringify(e.details,null,2)),e.details.fileId&&h('a',{href:base+'/'+e.task_id+'/files/'+e.details.fileId,target:'_blank',rel:'noopener'},'Åbn vedhæftet billede'),e.action==='created'&&e.details.image&&h('a',{href:base+'/'+e.task_id+'/image',target:'_blank',rel:'noopener'},'Åbn oprindeligt billede'))));
      loadedCount+=result.events.length;nextLog=result.next;older.hidden=!nextLog;logLoaded=true;logCount.textContent=loadedCount+' hændelser indlæst'+(!nextLog?' · hele historikken er indlæst':'');
    }finally{logLoading=false;}
  }
  const log=h('div',{class:'card audit-workspace'},h('span',{class:'workspace-eyebrow'},'HISTORIK & DOKUMENTATION'),h('h2',{},'Udviklerens aktivitetslog'),h('p',{class:'muted'},'Oprettelser, noter, tjeklister, tid, status, billeder og sletninger gemmes i databasen. Sletning af en sag fjerner ikke dens historik. Hent ældre hændelser for at se længere tilbage.'),h('button',{class:'btn sec',onclick:run(()=>loadLogs(true))},'Opdatér log'),logCount,logBody,older);
  const panelChannel=h('select',{},...optionList(G.channels,'# ','Vælg Discord-kanal'));
  const wishButtonBuilder=await renderReportButtonBuilder(base,reportCategories,initialWishConfig,'wish-panel-config');
  const wishChannel=h('select',{},...optionList(G.channels,'# ','Vælg ønskekanal'));
  const wishPanel=h('div',{class:'card'},h('h2',{},'Ønsker til serveren'),h('p',{class:'muted'},'MLO, biler, scripts og andre forslag behandles på denne separate tavle. Ønsker har egne sager, samtaler, kolonner og planlægning. De blandes ikke med fejlmeldinger.'),wishChannel,h('button',{class:'btn',onclick:run(async()=>{await api(base+'/wishes/panel',{method:'POST',body:{channel:wishChannel.value}});toast('Ønskepanelet er sendt til Discord');})},'Send ønskepanel til Discord'));
  const buttonBuilder=await renderReportButtonBuilder(base,reportCategories,panelConfig);
  const discord=h('div',{class:'card'},h('span',{class:'workspace-eyebrow'},'DISCORD & OPSÆTNING'),h('h2',{},'Fejlmeldingspanel til borgerne'),h('p',{class:'muted'},'Vælg en kanal og send panelet. Borgeren kan indsende titel, beskrivelse og billede. Sagen lander på FiveM-arbejdstavlen.'),panelChannel,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{if(!panelChannel.value)throw new Error('Vælg en kanal');await api(base+'/panel',{method:'POST',body:{channel:panelChannel.value}});toast('Fejlmeldingspanelet er sendt til Discord');})},'Send panel til Discord')),h('p',{class:'muted'},'Borgerkommandoer: /fejl · /fejlstatus · /fejlsvar · /fejlbillede. Interne noter, planlægning og logs er kun til udviklere og administratorer.'));
  const lockButton=h('button',{class:'btn sec',onclick:run(async()=>{if(!canLeave())return;dirty=false;await api('/api/guild/'+G.id+'/developer-access/lock',{method:'POST',body:{}});await route();})},'Lås udviklerpanelet');
  const changePin=h('div',{class:'card'},h('h3',{},'Personlig adgang'),h('p',{class:'muted'},'Udviklerpanelet kræver udviklerrollen, personlig adgang og en separat firecifret kode. Administrér din kode under Min adgang.'));
  const registry=developerRegistry(base);
  const header=h('div',{class:'card work-header workspace-hero'},h('div',{},h('span',{class:'workspace-eyebrow'},'FIVEM · UDVIKLINGSCENTER'),h('h2',{},isWishes?'Ønsker til serveren':'Fra fejlmelding til færdig release'),h('p',{class:'muted'},'Én arbejdsplads til planlægning, dokumentation og borgersager.')),counts,lockButton);
  const layoutLock=h('button',{class:'btn sec',onclick:()=>{layout.toggle();layoutLock.textContent=layout.locked?'🔒 Lås layout op':'🔓 Lås layout';draw();drawColumns();}},layout.locked?'🔒 Lås layout op':'🔓 Lås layout');
  const columnEditor=h('details',{class:'card column-editor'}),columnRows=h('div');
  const newColumn={name:'Ny kolonne',color:'#7c6cff',status:'todo'};
  async function persistColumns(next){columns=await api(columnsUrl,{method:'PUT',body:next});drawColumns();draw();}
  function drawColumns(){columnRows.replaceChildren(...layout.order(columns).map(c=>{const name=h('input',{value:c.name,'aria-label':'Navn på kolonne '+c.name,disabled:layout.locked}),color=h('input',{type:'color',value:c.color,'aria-label':'Farve på kolonne '+c.name,disabled:layout.locked}),status=h('select',{'aria-label':'Sagstatus for '+c.name,disabled:layout.locked},...Object.entries({todo:'Ikke taget',doing:'I gang',closed:'Afsluttet',rejected:'Afvist'}).map(([value,label])=>h('option',{value},label)));status.value=c.status;return h('div',{class:'row'},h('div',{class:'grid'},name,color,status),h('div',{class:'actions'},h('button',{class:'btn sec',disabled:layout.locked,onclick:run(()=>persistColumns(columns.map(x=>x.id===c.id?{...x,name:name.value,color:color.value,status:status.value}:x)))},'Gem kolonne'),h('button',{class:'btn sec',disabled:layout.locked||layout.order(columns)[0].id===c.id,onclick:()=>{const ordered=layout.order(columns),i=ordered.findIndex(x=>x.id===c.id);if(i>0){layout.moveColumn(c.id,ordered[i-1].id,columns);draw();drawColumns();}}},'Flyt kolonne til venstre'),h('button',{class:'btn bad',onclick:run(async()=>{if(!window.confirm('Slet kolonnen? Sagerne bevares og vises under Uden kolonne.'))return;await persistColumns(columns.filter(x=>x.id!==c.id));})},'Slet kolonne')));}));}
  columnEditor.append(h('summary',{},'Administrér kolonner'),h('p',{class:'muted'},'Lås layoutet op for at ændre navn, farve, rækkefølge og størrelse. Træk i kolonnens overskrift for at placere den frit, også under andre kolonner. Oprettelse og sletning er altid muligt; sager slettes aldrig sammen med en kolonne.'),columnRows,h('div',{class:'grid'},field({k:'name',l:'Navn på ny kolonne'},newColumn),h('label',{class:'f'},'Farve på ny kolonne',h('input',{type:'color',value:newColumn.color,oninput:e=>newColumn.color=e.target.value}))),h('button',{class:'btn',onclick:run(()=>persistColumns([...columns,{...newColumn,id:'column-'+crypto.randomUUID().slice(0,12)}]))},'Opret kolonne'));drawColumns();
  const layoutReset=h('button',{class:'btn sec',onclick:()=>{if(layout.locked)return toast('Lås layoutet op først');layout.reset();draw();}},'Nulstil placeringer og størrelser');
  const memoryStatus=h('span',{class:'muted','aria-live':'polite'});layoutMemory.subscribe(text=>memoryStatus.textContent=text);
  const layoutDock=h('div',{class:'layout-dock','aria-label':'Låsning af arbejdsområdets layout'},layoutLock,layoutReset,memoryStatus);
  const tools=h('div',{class:'work-tools'},search,priorityFilter,typeFilter,categoryFilter,archiveFilter,h('button',{class:'btn sec',onclick:run(refresh)},'Hent nye sager'));
  pollTimer=setInterval(async()=>{
    if(document.hidden||polling||dragged||draggedColumn||moving||layout.dragging)return;polling=true;
    try{
      const [latest]=await Promise.all([api(listUrl),updateCaseBadges()]);
      for(const task of latest){const previous=replySeen.get(task.id)||0;if(task.unreadCitizenReply&&task.latestCitizenReply>(readThrough.get(task.id)||0))unread.add(task.id);else unread.delete(task.id);if(task.latestCitizenReply>previous)toast('Nyt svar fra borger på sag #'+task.id);replySeen.set(task.id,task.latestCitizenReply||0);}for(const frame of windows.values())frame.badge();
      const changed=JSON.stringify(tasks)!==JSON.stringify(latest);tasks=latest;if(changed)draw();await Promise.all([...windows.values()].map(frame=>frame.refresh()));
    }catch(e){if(e.status===423){dirty=false;clearInterval(pollTimer);await route();}}finally{polling=false;}
  },7000);
  calendar=developerCalendar({getTasks:()=>tasks,onOpen:async id=>{if(canLeave())await open(id);},onSchedule:schedule,draggedTask:()=>dragged,onDrag:id=>{dragged=id;},canMove:canLeave});
  const list=h('div',{class:'card tablewrap'},h('h2',{},'Alle aktive sager'),h('table',{class:'table'},h('thead',{},h('tr',{},...['Sag','Status','Prioritet','Kalendertid','Ansvarlig'].map(x=>h('th',{},x)))),listBody));

  const escape=e=>{if(e.key==='Escape'){const last=[...windows.values()].at(-1);if(last&&!last.dirty){last.dispose();for(const [id,w]of windows)if(w===last)windows.delete(id);}}};window.addEventListener('keydown',escape);
  const beat=async(suspend=false)=>{if(!suspend&&document.hidden||!windowHost.isConnected)return;try{presence=await api(base+'/presence',{method:'POST',body:{active:!suspend},keepalive:suspend});drawPresence();}catch(e){if(e.status===423){clearInterval(heartbeatTimer);}}};const heartbeatTimer=setInterval(()=>beat(),30000);setTimeout(()=>beat(),0);const onVisibility=()=>beat(document.hidden),onPageHide=()=>beat(true);document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',onPageHide);
  const previousCleanup=window.developerCleanup;previousCleanup?.();window.developerCleanup=()=>{beat(true);clearInterval(heartbeatTimer);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('keydown',escape);window.removeEventListener('beforeunload',unload);for(const w of windows.values())w.dispose();layout.destroy();layoutMemory.destroy();};
  const changelog=await changelogWorkspace();
  const cleanup=window.developerCleanup;window.developerCleanup=()=>{changelog.dispose();cleanup?.();};
  draw();
  return [header,dashboardTabs([
    {id:'discord',icon:'⚙',label:'Discord & indstillinger',content:isWishes?[wishPanel,wishButtonBuilder,changePin]:[buttonBuilder,discord,changePin,...(!G.developerOnly?[settingsCard('developer','Adgang og roller')]:[])]},
    {id:'board',icon:'▦',label:'FiveM-arbejdstavle',badge:caseBadges.bug,onOpen:()=>switchBoard(false),content:isWishes?[]:[h('p',{class:'muted'},'Træk kolonnernes overskrifter for at placere dem frit på tavlen. Træk kort mellem kolonner eller oven på et andet kort for at ændre rækkefølgen. Flytninger gemmes med det samme. På mobil kan du åbne kortet og bruge statusknapperne.'),tools,columnEditor,newCard,board]},
    {id:'wishes',icon:'💡',label:'Ønsker til serveren',badge:caseBadges.request,onOpen:()=>switchBoard(true),content:isWishes?[tools,columnEditor,newCard,board]:[]},
    {id:'changelog',icon:'📣',label:'Changelog',content:[changelog.element],onOpen:()=>changelog.load().catch(e=>toast(e.message,true))},
    {id:'calendar',icon:'◷',label:'Kalender',content:[calendar.element]},
    {id:'list',icon:'☷',label:'Sagsliste',content:[list]},
    {id:'registry',icon:'🗂',label:'Serverregister',content:[registry.element],onOpen:()=>registry.load().catch(e=>toast(e.message,true))},
    {id:'presence',icon:'◷',label:'Udviklere og paneltid',content:[h('div',{class:'card'},h('h2',{},'Samlet registreret tid i udviklerpanelet'),h('p',{class:'muted'},'Tid registreres, mens det oplåste panel er åbent i en synlig fane. Skjulte faner tæller ikke. Arbejdstimer på sager registreres separat. Oversigten opdateres hvert 30. sekund.'),h('table',{class:'table'},h('thead',{},h('tr',{},...['Discord-navn','Tid i panelet','Status','Senest set'].map(t=>h('th',{},t)))),presenceRows))]},
    {id:'logs',icon:'≡',label:'Aktivitetslog',content:[log],onOpen:()=>{if(!logLoaded)loadLogs(true).catch(e=>toast(e.message,true));}}
  ],G.id+(isWishes?'-developer-wishes':'-developer'),isWishes?'wishes':'board'),windowHost,layoutDock];
}

async function renderReportButtonBuilder(base,categories,config,configPath='panel-config'){
 const draft=config||await api(base+'/'+configPath);
 const rows=h('div',{class:'rows'}),preview=h('div',{class:'actions'});
 const colors={blue:'Blå',green:'Grøn',red:'Rød',gray:'Grå'};
 function select(label,value,options,change){const el=h('select',{onchange:e=>{change(e.target.value);drawPreview();}},...options.map(([id,name])=>h('option',{value:id},name)));el.value=value;return h('label',{class:'f'},label,el);}
 function drawPreview(){preview.replaceChildren(...draft.buttons.map(b=>h('button',{type:'button',class:'btn',style:'background:'+({blue:'#5865f2',green:'#248046',red:'#da373c',gray:'#4e5058'}[b.color]),title:'Forhåndsvisning'},(b.emoji?b.emoji+' ':'')+b.label)));}
 function draw(){rows.replaceChildren(...draft.buttons.map((b,i)=>{const label=field({k:'label',l:'Tekst på knappen'},b),emoji=field({k:'emoji',l:'Emoji (valgfri)'},b);label.addEventListener('input',drawPreview);emoji.addEventListener('input',drawPreview);return h('div',{class:'row'},h('div',{class:'grid'},label,emoji,select('Farve',b.color,Object.entries(colors),v=>b.color=v),select('Knappen åbner',b.category,[['choose','Borgeren vælger selv kategori'],...categories.map(c=>[c.id,c.label])],v=>b.category=v)),h('div',{class:'actions'},h('button',{type:'button',class:'btn sec sm',disabled:i===0,onclick:()=>{draft.buttons.splice(i-1,0,draft.buttons.splice(i,1)[0]);draw();}},'Flyt op'),h('button',{type:'button',class:'btn bad sm',onclick:()=>{draft.buttons.splice(i,1);draw();}},'Fjern knap')));}));drawPreview();}
 draw();
 return h('div',{class:'card'},renderDiscordDesigner('developer'),h('h2',{},'Byg dine egne Discord-knapper'),h('p',{class:'muted'},'Vælg tekst, emoji, farve og kategori for hver knap. Fjern alle knapper for et panel uden knapper. Discord tillader blå, grøn, rød og grå knapper; orange understøttes ikke.'),field({k:'text',l:'Besked i Discord-panelet',t:'textarea'},draft),rows,h('button',{type:'button',class:'btn sec',onclick:()=>{if(draft.buttons.length>=25){toast('Der må højst være 25 knapper',true);return;}draft.buttons.push({label:'Ny knap',emoji:'',color:'blue',category:'choose'});draw();}},'Tilføj knap'),h('h3',{},'Forhåndsvisning'),preview,h('button',{type:'button',class:'btn',onclick:run(async()=>{const result=await api(base+'/'+configPath,{method:'PUT',body:draft});toast('Knapper gemt · '+(result.updatedPanels||0)+' eksisterende Discord-paneler opdateret.');})},'Gem knapper og opdater Discord'));
}
