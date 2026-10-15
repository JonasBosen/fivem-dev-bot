function dashboardTabs(sections,key,initial) {
  const root=h('div',{class:'dashboard-sections'}),nav=h('div',{class:'section-nav',role:'tablist','aria-label':'Områder i kategorien'});
  const panels=sections.map((s,i)=>h('section',{class:'section-panel',role:'tabpanel',id:`section-${key}-${i}`},...(Array.isArray(s.content)?s.content:[s.content])));
  let stored;try{stored=sessionStorage.getItem('section:'+key);}catch{}
  let active=sections.findIndex(s=>s.id===(stored||initial));if(active<0)active=0;
  function select(index){
    panels.forEach((p,i)=>p.hidden=i!==index);
    [...nav.children].forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    try{sessionStorage.setItem('section:'+key,sections[index].id);}catch{}
    sections[index].onOpen?.();
  }
  sections.forEach((s,i)=>nav.append(h('button',{type:'button',role:'tab','aria-controls':panels[i].id,onclick:()=>select(i),onkeydown:e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=(i+(e.key==='ArrowRight'?1:-1)+sections.length)%sections.length;select(n);nav.children[n].focus();}}},h('span',{class:'section-icon'},s.icon||'◈'),h('span',{},s.label))));
  root.append(nav,...panels);select(active);return root;
}
function categorySections(page,content){
  const specs={overview:[['Oversigt',[0,1,3]],['Indstillinger',[2]]],tickets:[['Supportsager',[0]],['Discord-panel & indstillinger',[1,2]]],applications:[['Ansøgninger',[0]],['Formularer & Discord-panel',[1,2]]],music:[['Afspiller & kø',[0,1]],['Musikbots',[3]],['Musikindstillinger',[2]]],moderation:[['Indstillinger',[0]],['Advarsler & kommandoer',[1,2]]],welcome:[['Velkomst',[0]],['Verificering & Discord-panel',[1,2]]],levels:[['Rangliste',[1]],['XP & belønninger',[0]]],giveaways:[['Opret præmielodtrækning',[0]],['Aktive & afsluttede',[1]],['Indstillinger',[2]],['Præmiehjul',[3]]],stream:[['Streamindstillinger',[0]],['Tilslutninger & vejledning',[1]]],custom:[['Kommandoer',[0]],['Vejledning',[]]]};
  if(!specs[page])return h('div',{},content);
  return dashboardTabs(specs[page].map(([label,indices],i)=>({id:String(i),label,content:indices.length?indices.map(n=>content[n]).filter(Boolean):[h('div',{class:'card'},h('h2',{},'Egne kommandoer'),h('p',{class:'muted'},'Opret kommandoens navn og svar under Kommandoer. Medlemmer kan bruge den med serverens valgte præfiks.'))]})),G.id+'-'+page);
}
