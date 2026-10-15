async function renderDeveloperWorkspace() {
  const base=`/api/guild/${G.id}/developer`;
  let tasks=await api(base), selected=null, dirty=false, saving=false;
  const states={todo:'Ikke taget',doing:'Taget · I gang',done:'Færdig',rejected:'Afvist'};
  const board=h('div',{class:'work-board'}), detail=h('section',{class:'card work-detail'},h('h2',{},'Dit arbejdsområde'),h('p',{class:'muted'},'Åbn en sag eller opret en opgave. Her kan du gemme noter, billeder og tjeklister.'));
  const search=h('input',{type:'search',placeholder:'Søg efter titel, beskrivelse eller sagsnummer',oninput:()=>draw()});
  const counts=h('div',{class:'work-counts'}), saveInfo=h('span',{class:'muted'},'Alle opgaver gemmes i den fælles database');
  const setDirty=()=>{dirty=true;saveInfo.textContent='Ændringer er ikke gemt';saveInfo.className='work-unsaved';};
  const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  const hashChanged=()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('hashchange',hashChanged);};
  window.addEventListener('hashchange',hashChanged);
  function canLeave(){return !dirty||window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade opgaven?');}
  function draw(){
    counts.replaceChildren(...['todo','doing','done'].map(s=>h('span',{class:`work-count status-${s}`},String(tasks.filter(t=>t.status===s).length),h('small',{},states[s]))));
    const query=search.value.trim().toLowerCase();
    board.replaceChildren(...Object.entries(states).map(([state,label])=>{
      const items=tasks.filter(t=>t.status===state&&`${t.id} ${t.title} ${t.description}`.toLowerCase().includes(query));
      return h('section',{class:`work-lane status-${state}`},h('h3',{},h('span',{class:'work-dot'}),label,h('span',{class:'work-total'},items.length)),
        ...(items.length?items.map(t=>h('button',{class:`work-ticket status-${state}${selected===t.id?' selected':''}`,onclick:run(async()=>{if(canLeave())await open(t.id);})},
          h('div',{class:'work-ticket-top'},h('span',{},`#${t.id}`),h('span',{'aria-label':states[state]},state==='done'?'☑':state==='doing'?'◩':'☐')),
          h('b',{},t.title),h('p',{},t.description.slice(0,110)),h('div',{class:'work-ticket-bottom'},`${t.checklist.filter(c=>c.done).length}/${t.checklist.length} punkter`,h('small',{},date(t.updated_at))))) : [h('p',{class:'muted'},'Ingen opgaver her')]) );
    }));
  }
  async function refresh(){tasks=await api(base);draw();}
  async function open(id){
    const task=await api(`${base}/${id}`);selected=id;dirty=false;
    const draft=structuredClone(task), banner=h('div',{class:`work-state status-${draft.status}`});
    saveInfo.textContent='Gemt · '+date(task.updated_at);saveInfo.className='muted';
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
    const done=h('input',{type:'checkbox',onchange:()=>{draft.status=done.checked?'done':'doing';setDirty();drawState();}});
    function drawState(){taken.checked=['doing','done'].includes(draft.status);done.checked=draft.status==='done';banner.className=`work-state status-${draft.status}`;banner.replaceChildren(h('span',{class:'work-dot'}),states[draft.status]);}
    drawState();
    const actions=h('div',{class:'actions'},...['todo','doing','done','rejected'].map(s=>h('button',{class:`btn sec status-${s}`,onclick:run(async()=>{draft.status=s;setDirty();drawState();await save();})},{todo:'Sæt som ikke taget',doing:'Tag opgaven',done:'Markér færdig',rejected:'Afvis sag'}[s])));
    const checklist=h('div'),progress=h('p',{class:'muted'});
    function drawChecks(){
      progress.textContent=`${draft.checklist.filter(c=>c.done).length} af ${draft.checklist.length} punkter udført`;
      checklist.replaceChildren(...draft.checklist.map((item,i)=>h('div',{class:`work-check${item.done?' completed':''}`},h('input',{type:'checkbox',checked:item.done,onchange:e=>{item.done=e.target.checked;setDirty();drawChecks();}}),h('input',{value:item.text,maxlength:300,'aria-label':'Tjeklistepunkt',oninput:e=>{item.text=e.target.value;setDirty();}}),h('button',{class:'btn sec sm',onclick:()=>{draft.checklist.splice(i,1);setDirty();drawChecks();}},'Fjern'))));
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
    const reply=h('textarea',{maxlength:1800,placeholder:'Skriv en besked til borgeren. Denne tekst bliver sendt til Discord.'});
    const tabs=h('div',{class:'work-tabs'}),content=h('div');
    const panels={
      work:h('div',{},fields,notes,h('h3',{},'Tjekliste'),progress,checklist,h('div',{class:'actions'},newItem,h('button',{class:'btn sec',onclick:addItem},'Tilføj punkt'))),
      images:h('div',{},h('h3',{},'Billeder og dokumentation'),h('p',{class:'muted'},'Billeder fra Discord og dine egne uploads samles her. PNG, JPG, GIF eller WebP · højst 6 MB pr. billede.'),gallery,h('button',{class:'btn sec',onclick:run(async()=>drawFiles((await api(`${base}/${id}`)).files||[]))},'Hent nye billeder'),h('div',{class:'actions'},upload,uploadButton)),
      conversation:h('div',{},h('h3',{},'Samtale med borgeren'),conversation,reply,h('div',{class:'actions'},h('button',{class:'btn',onclick:run(async()=>{const saved=await api(`${base}/${id}/comments`,{method:'POST',body:{text:reply.value}});drawComments(saved.comments||[]);reply.value='';toast(saved.sync_error||'Svar sendt');})},'Send svar'),h('button',{class:'btn sec',onclick:run(async()=>{drawComments((await api(`${base}/${id}`)).comments||[]);})},'Hent nye beskeder')))
    };
    function tab(key){content.replaceChildren(panels[key]);[...tabs.children].forEach(b=>b.classList.toggle('on',b.dataset.tab===key));}
    for(const [key,label]of Object.entries({work:'Noter & tjekliste',images:'Billeder',conversation:'Samtale'}))tabs.append(h('button',{class:'btn sec','data-tab':key,onclick:()=>tab(key)},label));
    const deleteButton=h('button',{class:'btn bad',onclick:run(async()=>{if(!window.confirm('Slet sagen fra tavlen? Historik og dokumentation bevares i loggen.'))return;await api(`${base}/${id}`,{method:'DELETE',body:{}});dirty=false;selected=null;detail.replaceChildren(h('p',{},'Sagen er slettet fra tavlen. Historikken er bevaret i loggen.'));await refresh();toast('Sagen er slettet og logget');})},'Slet sag');
    detail.replaceChildren(h('div',{class:'top'},h('h2',{},`Opgave #${id}`),banner),deleteButton,h('p',{class:'muted'},'Oprettet '+date(task.created_at)),actions,h('div',{class:'work-checkboxes'},h('label',{},taken,' Opgaven er taget'),h('label',{},done,' Opgaven er færdig')),tabs,content,h('div',{class:'work-save'},h('button',{class:'btn',onclick:run(save)},'Gem opgave, noter og tjekliste'),saveInfo));
    tab('work');draw();detail.scrollIntoView({behavior:'smooth',block:'start'});
  }
  const newTask={title:'',description:''};
  const newCard=h('details',{class:'card work-new'},h('summary',{},'+ Opret en intern opgave'),h('p',{class:'muted'},'Gem egne arbejdsopgaver, idéer eller huskelister her.'),field({k:'title',l:'Titel'},newTask),field({k:'description',l:'Beskrivelse',t:'textarea'},newTask),h('button',{class:'btn',onclick:run(async()=>{
    if(!canLeave())return;const task=await api(base,{method:'POST',body:newTask});dirty=false;newTask.title='';newTask.description='';await refresh();newCard.open=false;await open(task.id);toast('Opgaven er gemt');
  })},'Opret og åbn opgave'));
  const logBody=h('div');
  const labels={created:'Sag oprettet',updated:'Sag ændret',rejected:'Sag afvist',deleted:'Sag slettet',comment:'Kommentar tilføjet',image_uploaded:'Billede vedhæftet'};
  const log=h('details',{class:'card'},h('summary',{},'Aktivitetslog · ændringer, billeder og slettede sager'),h('p',{class:'muted'},'Viser de seneste 300 hændelser. Historikken bevares også, når en sag slettes. Loggen vises kun for udviklere og administratorer.'),h('button',{class:'btn sec',onclick:run(async()=>{const events=await api(base+'/audit/events');logBody.replaceChildren(...events.map(e=>h('details',{class:'work-comment'},h('summary',{},date(e.created_at)+' · #'+e.task_id+' · '+(labels[e.action]||e.action)+' · '+e.user_id),h('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere'},JSON.stringify(e.details,null,2)),e.details.fileId&&h('a',{href:base+'/'+e.task_id+'/files/'+e.details.fileId,target:'_blank',rel:'noopener'},'Åbn vedhæftet billede'),e.action==='created'&&e.details.image&&h('a',{href:base+'/'+e.task_id+'/image',target:'_blank',rel:'noopener'},'Åbn oprindeligt billede'))));})},'Hent aktivitetslog'),logBody);
  draw();
  return [h('div',{class:'card work-header'},h('div',{},h('h2',{},'Udviklerens arbejdsplads'),h('p',{class:'muted'},'Planlæg arbejdet, gem dokumentation og følg borgernes fejlmeldinger ét sted.')),counts),h('div',{class:'work-tools'},search,h('button',{class:'btn sec',onclick:run(refresh)},'Hent nye sager')),newCard,board,detail,log,
    ...(!G.developerOnly?[panelCard('developer','Send fejlmeldingspanelet til Discord.'),settingsCard('developer','Adgang og roller')]:[])];
}
