(() => {
  const RULES = [
    [1,'Respekt','Alle spillere skal behandles med respekt. Chikane, mobning, racisme, diskrimination, trusler, hetz og anden grov eller krænkende adfærd accepteres ikke. Dette gælder også konflikter, der starter i RP.'],
    [2,'Staff','Staff skal behandles respektfuldt. Er du uenig i en staff-afgørelse, skal sagen tages op gennem de korrekte kanaler og ikke gennem diskussion eller konflikt midt i RP. Staff må ikke misbruge deres rettigheder til egen fordel.'],
    [3,'Roleplay','Dream Network er en 16+ semi-seriøs RP-server. Du skal altid forsøge at skabe RP, der passer til situationen og din karakter. Du skal give andre spillere mulighed for at bidrage til situationen.'],
    [4,'Fail RP','Fail RP er handlinger, der bryder med realistisk eller meningsfuld roleplay. Eksempler: urealistisk opførsel i alvorlige situationer, ignorering af skader, urealistisk kørsel uden RP-grund og handlinger, der tydeligt kun har til formål at vinde en situation.'],
    [5,'Metagaming','Metagaming er brug af information, som din karakter ikke har fået gennem RP. Information fra eksempelvis Discord, streams, TikTok, YouTube, OOC-samtaler eller andre spillere må ikke bruges IC.'],
    [6,'Powergaming','Powergaming er, når du tvinger en handling igennem på en anden spiller uden at give mulighed for en realistisk reaktion. Du må ikke bestemme over en anden spillers karakter uden at give spilleren mulighed for at deltage i RP’en.'],
    [7,'RDM','Random Deathmatch er ikke tilladt. Du må ikke dræbe eller angribe andre spillere uden en gyldig RP-grund.'],
    [8,'VDM','Vehicle Deathmatch er ikke tilladt. Køretøjer må ikke bruges som våben uden en gyldig RP-grund.'],
    [9,'Fear RP','Din karakter skal værdsætte sit liv. Hvis du befinder dig i en situation, hvor din karakter realistisk ville være bange for at dø, skal du reagere derefter.'],
    [10,'New Life Rule','Efter din karakters død må du som udgangspunkt ikke huske den konkrete situation, der førte til døden. Du må ikke vende tilbage til situationen for at hævne dig.'],
    [11,'PK','PK – Player Kill. Et PK betyder, at din karakter mister bestemte minder eller informationer fra en RP-situation. Din karakter er ikke permanent død. Efter et PK må karakteren ikke bruge den information, som skal være glemt.'],
    [12,'CK','CK – Character Kill. Et CK betyder, at din karakter dør permanent. Efter et CK kan karakteren ikke bruges igen, tidligere relationer og konflikter afsluttes, og information fra karakterens tidligere liv må ikke bruges på en ny karakter. Et CK skal som udgangspunkt godkendes af staff inden gennemførelse.'],
    [13,'Combat Logging','Det er ikke tilladt at forlade serveren for at undgå arrestation, røveri, skudveksling, konflikter, gældende RP eller andre konsekvenser. Hvis du mister forbindelsen under en situation, bør du vende tilbage så hurtigt som muligt og informere de involverede eller staff.'],
    [14,'Cop Baiting','Det er ikke tilladt bevidst at provokere politiet for at få en biljagt eller anden RP-situation uden et reelt RP-formål.'],
    [15,'Fearless / Rambo RP','Du må ikke opføre dig, som om din karakter er usårlig. Du skal reagere realistisk på våben, overmagt, skader, farlige situationer og trusler mod dit liv.'],
    [16,'Våben','Våben skal bruges med RP-formål. Det er ikke tilladt at trække eller bruge våben uden en relevant situation. Du må ikke bruge våben fra urealistiske steder eller "trylle" våben frem uden RP.'],
    [17,'Kriminel RP','Kriminalitet skal skabe RP. Røverier, gidseltagninger, bandekonflikter og andre kriminelle aktiviteter må ikke udelukkende udføres for at få penge eller kills.'],
    [18,'Røverier','Røverier skal udføres med et RP-formål. Det er ikke tilladt gentagne gange at røve den samme spiller uden en relevant RP-grund.'],
    [19,'Gidsler','Gidsler skal behandles som en del af RP’en. Det er ikke tilladt at bruge gidsler udelukkende som et værktøj til at tvinge en bestemt situation igennem. Venner er ikke gidsler. Man må ikke tage venner eller nære relationer som gidsler.'],
    [20,'Bander','Bander skal skabe RP og følge både serverens generelle regler og reglerne for bander. Der er ikke noget fast maksimum på antal medlemmer i en bande.'],
    [21,'Politi','Politiet skal skabe fair og meningsfuld RP. Politiets udstyr, køretøjer, våben og beføjelser må ikke misbruges. Korruption kræver godkendelse fra staff.'],
    [22,'EMS','EMS skal kunne udføre deres arbejde uden unødvendig forstyrrelse. Angreb eller vold mod EMS kræver en meget stærk RP-grund.'],
    [23,'Jobs','Jobs skal udføres på en måde, der skaber RP. Det er ikke tilladt at misbruge jobs, job-systemer eller jobfunktioner for økonomisk gevinst.'],
    [24,'Økonomi','Det er ikke tilladt at duplikere penge, duplikere items, misbruge fakturaer, misbruge boss-menuer, misbruge scripts, flytte penge for at omgå regler eller udnytte økonomiske fejl.'],
    [25,'Bugs & Exploits','Bugs og exploits må ikke udnyttes. Finder du en fejl, skal den rapporteres til staff. Bevidst misbrug af exploits kan føre til permanent ban.'],
    [26,'Cheats & Modmenuer','Cheats, modmenuer, injectors og anden software, der giver en urimelig fordel, er ikke tilladt. Dette gælder også eksterne programmer, scripts eller værktøjer, der manipulerer spillet.'],
    [27,'Tredjepartssoftware','Du må ikke bruge tredjepartssoftware til at få en fordel over andre spillere. Det gælder eksempelvis software til Aimbot, Wallhack, ESP, Godmode, Speedhack, Exploits og andre former for snyd.'],
    [28,'OOC og IC','OOC og IC skal holdes adskilt. En konflikt mellem to spillere må ikke automatisk blive til en konflikt mellem deres karakterer. Personlige problemer skal ikke tages med ind i RP.'],
    [29,'Streamsniping','Det er ikke tilladt at se en spillers stream eller video for at finde ud af, hvor spilleren befinder sig eller hvad personen planlægger, og derefter bruge informationen IC.'],
    [30,'Sund fornuft','Ikke alle situationer kan beskrives i et regelsæt. Hvis en handling tydeligt ødelægger RP eller giver en urimelig fordel, kan staff gribe ind, selvom situationen ikke står beskrevet ordret i reglerne. Reglernes ånd gælder lige så meget som selve teksten.'],
    [31,'Respekt','Alle medlemmer skal behandles respektfuldt. Ingen mobning, chikane, hetz, trusler, racisme, diskrimination eller personangreb.'],
    [32,'Trusler','Trusler mod andre medlemmer accepteres ikke. Dette gælder både direkte og indirekte trusler.'],
    [33,'Doxxing','Det er strengt forbudt at dele eller true med at dele andres personlige oplysninger. Dette inkluderer eksempelvis adresse, telefonnummer, privat e-mail, IP-adresse, billeder uden tilladelse og andre private oplysninger.'],
    [34,'Spam','Spam er ikke tilladt. Dette gælder blandt andet gentagne beskeder, mass mentions, unødvendige tags, spam i voice, reklamer, linkspam og emoji-/GIF-spam.'],
    [35,'Reklamer','Reklame for andre servere, communities, Discords eller tjenester er ikke tilladt uden tilladelse fra staff.'],
    [36,'NSFW','NSFW-indhold er ikke tilladt i Dream Networks almindelige kanaler. Indhold skal desuden altid overholde Discords egne regler og alderskrav.'],
    [37,'Chikane','Det er ikke tilladt at målrette et medlem med gentagen chikane, provokation eller hetz. Dette gælder også efter en konflikt i RP.'],
    [38,'Hate Speech','Hadefuldt indhold eller angreb på personer på baggrund af beskyttede karakteristika accepteres ikke.'],
    [39,'Farligt og ulovligt indhold','Det er ikke tilladt at bruge Dream Networks Discord til at organisere, fremme eller facilitere ulovlige aktiviteter.'],
    [40,'Gore og ekstremt indhold','Indhold, der har til formål at chokere, chikanere eller vise grov vold/gore, må ikke deles i vores community.'],
    [41,'Svindel','Forsøg på at snyde, bedrage eller franarre andre medlemmer penge, konti, genstande eller oplysninger er ikke tilladt.'],
    [42,'Falske profiler','Det er ikke tilladt at udgive sig for at være et andet medlem, staff, en udvikler, en anden person eller en virksomhed eller organisation.'],
    [43,'Staff impersonation','Du må ikke udgive dig for at være staff eller bruge staff-navne, roller eller identitet til at snyde andre.'],
    [44,'Staff DM','Det er ikke tilladt at presse eller chikanere staff gennem gentagne DM’s om en afgørelse. Hvis du ønsker at klage over en afgørelse, skal du bruge den relevante supportkanal.'],
    [45,'Tickets','Tickets skal bruges til deres formål. Spam, falske tickets eller bevidst misbrug af ticketsystemet kan medføre straf.'],
    [46,'Voice-kanaler','I voice-kanaler gælder de samme krav om respekt som i tekstkanaler. Det er ikke tilladt at råbe bevidst, afspille forstyrrende lyde, bruge soundboard til spam, forstyrre andre med vilje eller optage/dele private samtaler på en måde, der krænker andres rettigheder.'],
    [47,'Discord-konti','Forsøg på at omgå en Dream Network-ban ved at bruge en anden konto kan medføre yderligere sanktioner.'],
    [48,'Bots & automatisering','Bots må ikke misbruges til spam, manipulation eller andre handlinger, der skader serveren. Self-bots og user-bots er ikke tilladt efter Discords egne regler.'],
    [49,'Falske oplysninger & manipulation','Bevidst manipulation, falske anklager, falske screenshots eller forsøg på at vildlede staff kan medføre sanktioner.'],
    [50,'Discords regler gælder','Alle medlemmer skal overholde Discords Terms of Service og Community Guidelines. Hvis Discord ændrer deres regler, kan Dream Network opdatere vores regler tilsvarende.']
  ];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let selected = new Map();
  let mode = 'warning';
  let personId = null;

  function injectStyles() {
    if (document.getElementById('dream-rules-style')) return;
    const s = document.createElement('style'); s.id = 'dream-rules-style';
    s.textContent = `
      #dreamRulesModal{position:fixed;inset:0;background:#000d;backdrop-filter:blur(7px);display:none;align-items:center;justify-content:center;padding:18px;z-index:100}
      #dreamRulesModal.open{display:flex}.dreamRulesBox{width:min(900px,100%);max-height:92vh;overflow:auto;background:#11151b;border:1px solid #1769a8;border-radius:15px;padding:20px;box-shadow:0 20px 60px #000b}
      .dreamRulesHead{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #183247;padding-bottom:14px}.dreamRulesHead h2{margin:0}
      .dreamRulesSearch{margin:14px 0}.dreamRulesSearch input{margin:0}.dreamRuleList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:330px;overflow:auto;padding-right:4px}
      .dreamRule{background:#0b0f14;border:1px solid #173b5c;border-radius:9px;padding:10px;cursor:pointer;display:flex;gap:10px;align-items:flex-start}.dreamRule:hover{border-color:#299cff}.dreamRule.selected{border-color:#8b5cf6;box-shadow:0 0 0 1px #8b5cf644;background:#171222}.dreamRuleNo{min-width:34px;color:#9c6cff;font-weight:900}.dreamRuleName{font-weight:800}.dreamRuleDesc{color:#929aa5;font-size:12px;margin-top:3px;line-height:1.35}.dreamTick{margin-left:auto;color:#9c6cff;font-weight:900}.dreamSelected{margin-top:15px;border-top:1px solid #183247;padding-top:14px}.dreamSelected h3{margin:0 0 9px}.dreamSelRow{display:flex;align-items:center;gap:8px;background:#0b0f14;border:1px solid #173b5c;border-radius:8px;padding:8px;margin:6px 0}.dreamRemove{margin-left:auto;padding:5px 9px!important}.dreamRuleActions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px;padding-top:14px;border-top:1px solid #183247}.dreamDuration{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.dreamDuration button.active{box-shadow:0 0 0 2px #fff3;border-color:#fff}.dreamRulePreview{margin-top:12px;padding:10px;background:#090d12;border:1px solid #173b5c;border-radius:8px;color:#aaa}.dreamRuleError{color:#ff6872;margin-top:10px}.dreamRuleBtn{padding:10px 15px;border:1px solid #299cff;border-radius:8px;background:linear-gradient(#1685ed,#0754a0);color:#fff;font-weight:800;cursor:pointer}.dreamRuleBtn.gray{background:#15181d;border-color:#3d4650;color:#ddd}.dreamRuleBtn.warn{background:linear-gradient(#ffad19,#d46b00);border-color:#ffb52b;color:#160d00}.dreamRuleBtn.ban{background:linear-gradient(#ff2735,#b4000b);border-color:#ff3b48;color:#fff}
      @media(max-width:720px){.dreamRuleList{grid-template-columns:1fr}.dreamRulesBox{padding:14px}}
    `; document.head.appendChild(s);
  }

  function ensureModal() {
    if (document.getElementById('dreamRulesModal')) return;
    const m = document.createElement('div'); m.id='dreamRulesModal';
    m.innerHTML = `<div class="dreamRulesBox">
      <div class="dreamRulesHead"><h2 id="dreamRulesTitle">⚠️ VÆLG REGEL</h2><button class="dreamRuleBtn gray" id="dreamRulesClose">Luk</button></div>
      <div class="dreamRulesSearch"><input id="dreamRulesSearchInput" placeholder="Søg efter regel, fx RDM eller Combat Logging..."></div>
      <div id="dreamRuleList" class="dreamRuleList"></div>
      <div class="dreamSelected"><h3>Valgte regler:</h3><div id="dreamSelectedList"></div></div>
      <div id="dreamDurationWrap"></div><div id="dreamRuleError" class="dreamRuleError"></div>
      <div class="dreamRuleActions"><button class="dreamRuleBtn gray" id="dreamRulesCancel">❌ Annuller</button><button class="dreamRuleBtn" id="dreamRulesApprove">✅ GODKEND</button></div>
    </div>`;
    document.body.appendChild(m);
    document.getElementById('dreamRulesClose').onclick = close;
    document.getElementById('dreamRulesCancel').onclick = close;
    document.getElementById('dreamRulesSearchInput').oninput = renderRules;
    document.getElementById('dreamRulesApprove').onclick = approve;
    m.addEventListener('click', e => { if(e.target === m) close(); });
  }

  function renderRules() {
    const q = (document.getElementById('dreamRulesSearchInput').value || '').toLowerCase().trim();
    const list = document.getElementById('dreamRuleList');
    list.innerHTML = RULES.filter(r => (`${r[0]} ${r[1]} ${r[2]}`).toLowerCase().includes(q)).map(r => {
      const on = selected.has(r[0]);
      return `<div class="dreamRule ${on?'selected':''}" data-rule="${r[0]}"><div class="dreamRuleNo">§${r[0]}</div><div><div class="dreamRuleName">${esc(r[1])}</div><div class="dreamRuleDesc">${esc(r[2])}</div></div><div class="dreamTick">${on?'✓':'○'}</div></div>`;
    }).join('') || '<div class="muted">Ingen regler fundet.</div>';
    list.querySelectorAll('.dreamRule').forEach(el => el.onclick = () => toggle(Number(el.dataset.rule)));
    const chosen = [...selected.values()];
    document.getElementById('dreamSelectedList').innerHTML = chosen.length ? chosen.map(r => `<div class="dreamSelRow"><span style="color:#9c6cff">✓</span><b>§${r[0]} – ${esc(r[1])}</b><button class="dreamRuleBtn gray dreamRemove" data-remove="${r[0]}">➖ Fjern</button></div>`).join('') : '<div class="muted">Ingen regler valgt endnu.</div>';
    document.querySelectorAll('[data-remove]').forEach(b => b.onclick=()=>{selected.delete(Number(b.dataset.remove));renderRules();});
    document.getElementById('dreamDurationWrap').innerHTML = mode === 'ban' ? `<div class="dreamSelected"><h3>Banlængde</h3><div class="dreamDuration">${[['','Permanent'],['1','1 dag'],['3','3 dage'],['7','7 dage'],['14','14 dage'],['30','30 dage']].map(x=>`<button class="dreamRuleBtn gray ${x[0]===currentDuration?'active':''}" data-duration="${x[0]}">${x[1]}</button>`).join('')}</div></div>` : '';
    document.querySelectorAll('[data-duration]').forEach(b=>b.onclick=()=>{currentDuration=b.dataset.duration;renderRules();});
  }
  let currentDuration='';
  function toggle(n){const r=RULES.find(x=>x[0]===n);if(!r)return;if(selected.has(n))selected.delete(n);else selected.set(n,r);renderRules();}
  function open(id,type){ensureModal();injectStyles();personId=id;mode=type;selected=new Map();currentDuration='';document.getElementById('dreamRulesTitle').textContent=type==='ban'?'🔨 VÆLG REGEL TIL BAN':'⚠️ VÆLG REGEL TIL ADVARSEL';document.getElementById('dreamRulesSearchInput').value='';document.getElementById('dreamRuleError').textContent='';document.getElementById('dreamRulesModal').classList.add('open');renderRules();setTimeout(()=>document.getElementById('dreamRulesSearchInput').focus(),50)}
  function close(){const m=document.getElementById('dreamRulesModal');if(m)m.classList.remove('open')}
  async function approve(){
    const err=document.getElementById('dreamRuleError');err.textContent='';
    if(!selected.size){err.textContent='Vælg mindst én regel.';return;}
    const chosen=[...selected.values()];
    const reason=chosen.map(r=>`§${r[0]} – ${r[1]}`).join(' + ');
    const notes=chosen.map(r=>`§${r[0]} – ${r[1]}\n${r[2]}`).join('\n\n');
    const btn=document.getElementById('dreamRulesApprove');btn.disabled=true;btn.textContent='Gemmer...';
    try{
      if(mode==='warning') await api('/api/people/'+personId+'/warnings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,notes})});
      else { let until=''; if(currentDuration){const d=new Date();d.setDate(d.getDate()+Number(currentDuration));until=d.toISOString();} await api('/api/people/'+personId+'/bans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,notes,until})}); }
      close(); if(typeof load==='function') await load(); if(typeof openP==='function') await openP(personId);
    }catch(e){err.textContent=e.message||'Kunne ikke gemme.';}
    btn.disabled=false;btn.textContent='✅ GODKEND';
  }
  window.DreamNetworkRules={RULES,open,close};
  window.addWarning = id => open(id,'warning');
  window.addBan = id => open(id,'ban');
  document.addEventListener('DOMContentLoaded',()=>{injectStyles();ensureModal();});
})();
