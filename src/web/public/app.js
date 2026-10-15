// Kontrolpanel – ren JavaScript, ingen build-step.
const $app = document.getElementById('app');
let me = null, G = null, pollTimer = null;

// ---------- Hjælpere ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || 'GET',keepalive:!!opts.keepalive, headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if(r.status===428){if(me?.access)me.access.unlocked=false;queueMicrotask(()=>route());throw new Error('Lås op med din personlige kode');}
  if (r.status === 401) { location.href = '/login'; throw new Error('Log ind'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {const error=new Error(j.error || `Fejl ${r.status}`);error.status=r.status;throw error;}
  return j;
}
function toast(msg, err) {
  const d = h('div', { class: err ? 'err' : '' }, msg);
  document.getElementById('toast').append(d);
  setTimeout(() => d.remove(), 3500);
}
const run = (fn) => async (e) => {
  const b = e?.currentTarget; if (b) b.disabled = true;
  try { await fn(e); } catch (x) { toast(x.message, true); } finally { if (b) b.disabled = false; }
};
const date = (t) => (t ? new Date(t).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const chName = (id) => G.channels.find((c) => c.id === id)?.name;
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const icon = (g, cls) => (g.icon ? h('img', { src: g.icon.startsWith('http') ? g.icon : `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`, alt: '' }) : h('div', { class: 'ph' }, initials(g.name)));

// ---------- Felt-typer ----------
function optionList(list, prefix = '', none = '— ingen —') {
  return [h('option', { value: '' }, none), ...list.map((x) => h('option', { value: x.id }, prefix + x.name))];
}
function field(f, obj) {
  const v = obj[f.k];
  const set = (x) => { obj[f.k] = x; };
  let input;
  switch (f.t) {
    case 'select':input=h('select',{onchange:e=>set(e.target.value)},...Object.entries(f.options).map(([value,label])=>h('option',{value},label)));input.value=v||Object.keys(f.options)[0];break;
    case 'toggle':
      return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: v, onchange: (e) => set(e.target.checked) }), h('i'), f.l);
    case 'textarea':
      input = h('textarea', { value: v ?? '', oninput: (e) => set(e.target.value) }); break;
    case 'number':
      input = h('input', { type: 'number', value: v ?? 0, min: f.min, max: f.max, oninput: (e) => set(Number(e.target.value)) }); break;
    case 'list':
      input = h('textarea', { value: (v || []).join('\n'), placeholder: 'Én pr. linje', oninput: (e) => set(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)) }); break;
    case 'channel': case 'category': case 'voice': case 'role': {
      const src = { channel: G.channels, category: G.categories, voice: G.voiceChannels, role: G.roles }[f.t];
      input = h('select', { onchange: (e) => set(e.target.value) }, optionList(src, f.t === 'channel' ? '# ' : f.t === 'role' ? '@ ' : ''));
      input.value = v || '';
      break;
    }
    case 'roles': case 'channels': {
      const src = f.t === 'roles' ? G.roles : G.channels;
      const wrap = h('div');
      const draw = () => {
        const cur = obj[f.k] || [];
        wrap.replaceChildren(
          h('div', { class: 'chips' }, cur.map((id) => h('span', { class: 'chip' }, (f.t === 'roles' ? '@' : '#') + (src.find((x) => x.id === id)?.name || id),
            h('button', { type: 'button', onclick: () => { set(cur.filter((x) => x !== id)); draw(); } }, '×')))),
          h('select', { onchange: (e) => { if (e.target.value && !cur.includes(e.target.value)) set([...cur, e.target.value]); draw(); } },
            optionList(src.filter((x) => !cur.includes(x.id)), '', '+ Tilføj…')),
        );
      };
      draw();
      input = wrap; break;
    }
    case 'rows': {
      const wrap = h('div', { class: 'rows' });
      const draw = () => {
        const cur = obj[f.k] || (obj[f.k] = []);
        wrap.replaceChildren(
          ...cur.map((row, i) => h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn sec sm del', onclick: () => { cur.splice(i, 1); draw(); } }, 'Fjern'),
            h('div', { class: 'grid' }, f.fields.map((sf) => field(sf, row))))),
          h('button', { type: 'button', class: 'btn sec', onclick: () => { const next=structuredClone(f.new);if(next.id)next.id='ny-'+crypto.randomUUID().slice(0,8);cur.push(next); draw(); } }, `+ ${f.add || 'Tilføj'}`),
        );
      };
      draw();
      return h('div', { class: 'full' }, h('label', { class: 'f' }, h('span', {}, f.l)), wrap);
    }
    default:
      input = h('input', { type: 'text', value: v ?? '', placeholder: f.ph, oninput: (e) => set(e.target.value) });
  }
  const wide = f.t === 'textarea' || f.t === 'list' || f.wide;
  return h('label', { class: `f${wide ? ' full' : ''}` }, h('span', {}, f.l), input, f.hint && h('small', {}, f.hint));
}

// ---------- Indstillinger pr. modul ----------
const PH = 'Pladsholdere: {user} {username} {server} {count}';
const SCHEMA = {
  developer: [{k:'enabled',l:'Aktivér fejlmeldinger',t:'toggle'},{k:'roles',l:'Udviklerroller',t:'roles'},{k:'reporterRoles',l:'Roller der må sende fejlmeldinger og svar (tom = alle medlemmer)',t:'roles'}],
  general: [{ k: 'prefix', l: 'Prefix til custom commands', ph: '!' },{k:'adminRoles',l:'Roller med adgang til hele dashboardet',t:'roles'}],
  tickets: [
    { k: 'enabled', t: 'toggle', l: 'Supportsager slået til' },
    {k:'allowCitizenClose',t:'toggle',l:'Borgeren må selv lukke sin sag'},
    { k: 'maxOpenPerUser', t: 'number', l: 'Maks åbne tickets pr. bruger', min: 1 },
    { k: 'categoryId', t: 'category', l: 'Kategori nye tickets oprettes i' },
    { k: 'logChannel', t: 'channel', l: 'Log-kanal (transcripts sendes hertil)' },
    { k: 'supportRoles', t: 'roles', l: 'Support-roller', wide: true },
    { k: 'panelTitle', l: 'Panel: titel' },
    { k: 'panelText', t: 'textarea', l: 'Panel: tekst' },
    { k: 'openMessage', t: 'textarea', l: 'Besked i ny ticket', hint: PH },
    {k:'quickResponses',t:'rows',l:'Hurtigsvar til support',add:'Nyt hurtigsvar',new:{label:'',text:''},fields:[{k:'label',l:'Titel på hurtigsvar'},{k:'text',t:'textarea',l:'Besked til borgeren'}]},
    { k: 'types', t: 'rows', l: 'Kategorier (op til 5 vises som knapper, flere som dropdown)', add: 'Ny kategori',
      new: { id: 'ny', label: 'Ny kategori', emoji: '🎫', questions: [] },
      fields: [{ k: 'id', l: 'ID (kort, uden mellemrum)' }, { k: 'label', l: 'Navn' }, { k: 'emoji', l: 'Emoji' },
        {k:'color',t:'select',l:'Knapfarve',options:{blue:'Blå',green:'Grøn',red:'Rød',gray:'Grå'}},{k:'categoryId',t:'category',l:'Egen Discord-kategori (valgfri)'},{k:'supportRoles',t:'roles',l:'Ekstra supportroller til kategorien'},{ k: 'questions', t: 'list', l: 'Spørgsmål før ticket åbnes (maks 5)' }] },
  ],
  applications: [
    { k: 'reviewChannel', t: 'channel', l: 'Kanal hvor ansøgninger gennemgås' },
    { k: 'panelTitle', l: 'Panel: titel' },
    { k: 'panelText', t: 'textarea', l: 'Panel: tekst' },
    { k: 'forms', t: 'rows', l: 'Formularer (højst 25 knapper)', add: 'Ny formular',
      new: { id: 'ny',enabled:true, name: 'Ny formular', acceptRole: '', questions: [] },
      fields: [{ k: 'id', l: 'ID' }, { k: 'name', l: 'Navn' }, { k: 'acceptRole', t: 'role', l: 'Rolle ved accept' },
        {k:'enabled',t:'toggle',l:'Åben for ansøgninger'},{k:'buttonLabel',l:'Egen knaptekst (valgfri)'},{k:'emoji',l:'Emoji'},{k:'color',t:'select',l:'Knapfarve',options:{blue:'Blå',green:'Grøn',red:'Rød',gray:'Grå'}},{k:'requiredRole',t:'role',l:'Krævet rolle for at ansøge'},{k:'minAccountAgeDays',t:'number',min:0,l:'Minimumsalder på Discord-konto (dage)'},{k:'reviewChannel',t:'channel',l:'Egen behandlingskanal (valgfri)'},{k:'removeRole',t:'role',l:'Fjern rolle ved accept'},{k:'denyRole',t:'role',l:'Tildel rolle ved afvisning'},{k:'acceptMessage',t:'textarea',l:'Privat svar ved accept (tom = standard)'},{k:'denyMessage',t:'textarea',l:'Privat svar ved afvisning (tom = standard)'},{ k: 'questions', t: 'list', l: 'Spørgsmål (maks 5)' }] },
  ],
  giveaways: [{ k: 'managerRole', t: 'role', l: 'Rolle der må styre giveaways' }],
  music: [
    { k: 'enabled', t: 'toggle', l: 'Musik slået til' },
    { k: 'announceSongs', t: 'toggle', l: 'Annoncér ny sang i chatten' },
    { k: 'leaveOnEmpty', t: 'toggle', l: 'Forlad tom talekanal' },
    { k: 'djRole', t: 'role', l: 'DJ-rolle (tom = alle må)' },
    { k: 'defaultVolume', t: 'number', l: 'Standard-lydstyrke (%)', min: 0, max: 150 },
    { k: 'maxQueue', t: 'number', l: 'Maks sange i køen', min: 1 },
  ],
  moderation: [
    { k: 'enabled', t: 'toggle', l: 'Automod slået til' },
    { k: 'antiSpam', t: 'toggle', l: 'Anti-spam (auto-timeout)' },
    { k: 'blockLinks', t: 'toggle', l: 'Blokér links' },
    { k: 'modLogChannel', t: 'channel', l: 'Mod-log kanal' },
    { k: 'spamMessages', t: 'number', l: 'Spam: antal beskeder', min: 2 },
    { k: 'spamSeconds', t: 'number', l: 'Spam: inden for sekunder', min: 1 },
    { k: 'honeypotChannel', t: 'channel', l: 'Honeypot-kanal', hint: 'Alle (undtagen staff) der skriver her bliver fjernet – fanger spam-bots.' },
    { k: 'exemptRoles', t: 'roles', l: 'Roller der ignoreres af automod', wide: true },
    { k: 'badWords', t: 'list', l: 'Forbudte ord' },
    { k: 'allowedDomains', t: 'list', l: 'Tilladte domæner når links er blokeret' },
  ],
  welcome: [
    { k: 'enabled', t: 'toggle', l: 'Velkomst slået til' },{k:'title',l:'Overskrift · {server}'},{k:'imageOnly',t:'toggle',l:'Send kun billede/GIF som vedhæftning'},{k:'mentionMember',t:'toggle',l:'Ping det nye medlem'},{k:'showAvatar',t:'toggle',l:'Vis medlemmets profilbillede'},
    { k: 'channel', t: 'channel', l: 'Velkomst-kanal' },
    { k: 'autoRoles', t: 'roles', l: 'Auto-roller ved join', wide: true },
    { k: 'message', t: 'textarea', l: 'Velkomstbesked', hint: PH },
    { k: 'dmMessage', t: 'textarea', l: 'Privat besked (DM) – tom = ingen' },
    { k: 'goodbyeChannel', t: 'channel', l: 'Farvel-kanal' },
    { k: 'goodbyeMessage', t: 'textarea', l: 'Farvel-besked' },
  ],
  verification: [
    { k: 'enabled', t: 'toggle', l: 'Verificering slået til' },
    { k: 'role', t: 'role', l: 'Rolle man får ved verificering' },
    { k: 'minAccountAgeDays', t: 'number', l: 'Min. kontoalder (dage)', min: 0 },
    { k: 'panelTitle', l: 'Panel: titel' },
    { k: 'panelText', t: 'textarea', l: 'Panel: tekst' },
  ],
  levels: [
    { k: 'enabled', t: 'toggle', l: 'Niveauer slået til' },
    { k: 'announceChannel', t: 'channel', l: 'Level-up kanal (tom = samme kanal)' },
    { k: 'xpMin', t: 'number', l: 'XP min pr. besked', min: 0 },
    { k: 'xpMax', t: 'number', l: 'XP maks pr. besked', min: 0 },
    { k: 'cooldownSeconds', t: 'number', l: 'Cooldown (sekunder)', min: 0 },
    { k: 'noXpChannels', t: 'channels', l: 'Kanaler uden XP', wide: true },
    { k: 'message', t: 'textarea', l: 'Level-up besked', hint: PH + ' {level}' },
    { k: 'rewards', t: 'rows', l: 'Rolle-belønninger', add: 'Ny belønning', new: { level: 5, role: '' },
      fields: [{ k: 'level', t: 'number', l: 'Level', min: 1 }, { k: 'role', t: 'role', l: 'Rolle' }] },
  ],
  custom: [
    { k: 'commands', t: 'rows', l: 'Kommandoer (brug prefix + navn, f.eks. !regler)', add: 'Ny kommando', new: { name: '', response: '' },
      fields: [{ k: 'name', l: 'Navn' }, { k: 'response', t: 'textarea', l: 'Svar' }] },
  ],
  stream: [
    { k: 'channel', t: 'channel', l: 'Notifikations-kanal' },
    { k: 'pingRole', t: 'role', l: 'Rolle der pinges' },
    { k: 'deleteWhenOffline', t: 'toggle', l: 'Slet Twitch-besked når streamen slutter' },
    { k: 'twitch', t: 'list', l: 'Twitch-brugernavne' },
    { k: 'youtube', t: 'list', l: 'YouTube kanal-ID’er (starter med UC…)' },
    { k: 'twitchMessage', t: 'textarea', l: 'Twitch-besked', hint: '{name} {title} {game} {url}' },
    { k: 'youtubeMessage', t: 'textarea', l: 'YouTube-besked', hint: '{name} {title} {url}' },
  ],
};

function settingsCard(mod, title) {
  const draft = structuredClone(G.settings[mod]);
  return h('div', { class: 'card' },
    h('h2', {}, title),
    h('div', { class: 'grid' }, SCHEMA[mod].map((f) => field(f, draft))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn sec', onclick: () => { G.settings[mod] = structuredClone(G.defaults[mod]); route(); toast('Standard indlæst – husk at gemme'); } }, 'Nulstil'),
      h('button', { class: 'btn', onclick: run(async () => { G.settings[mod] = await api(`/api/guild/${G.id}/settings/${mod}`, { method: 'PUT', body: draft }); toast('Gemt ✅'); }) }, 'Gem')));
}

function panelCard(type, text) {
  const sel = h('select', {}, optionList(G.channels, '# ', '— vælg kanal —'));
  return h('div', { class: 'card' }, h('h2', {}, 'Send panel'), h('p', { class: 'muted' }, text),
    h('div', { class: 'grid' }, sel, h('div', {}, h('button', { class: 'btn', onclick: run(async () => {
      if (!sel.value) throw new Error('Vælg en kanal');
      await api(`/api/guild/${G.id}/panel/${type}`, { method: 'POST', body: { channel: sel.value } });
      toast('Panel sendt ✅');
    }) }, 'Send panel'))));
}

// ---------- Sider ----------
const PAGES = [
  ['developer', '🛠️', 'Udvikler & fejlmeldinger'], ['overview', '📊', 'Oversigt'], ['tickets', '🎫', 'Supportsager'], ['applications', '📝', 'Ansøgninger'],
  ['music', '🎵', 'Musik'], ['moderation', '🛡️', 'Moderation'], ['welcome', '👋', 'Velkomst & verificering'],
  ['levels', '⭐', 'Niveauer'], ['giveaways', '🎉', 'Præmielodtrækninger'], ['stream', '🔴', 'Streambeskeder'], ['birthdays','🎂','Fødselsdage'], ['slideshow','🖼️','Highlights / diasshow'], ['custom', '💬', 'Kommandoer'], ['appearance','🎨','Indstillinger for siden'],['account','🔑','Min adgang'],
];

const pages = {
  async account(){return renderMyAccess();},
  async appearance(){return renderAppearance();},

  async developer() { return renderDeveloperWorkspace(); },
  async overview() {
    const s = G.stats;
    const stat = (n, l) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, l));
    return [
      h('div', { class: 'stats' }, stat(G.members, 'Medlemmer'), stat(s.openTickets, 'Åbne supportsager'), stat(s.totalTickets, 'Supportsager i alt'),
        stat(s.pendingApps, 'Ansøgninger der venter'), stat(s.activeGiveaways, 'Aktive giveaways'), stat(s.warnings, 'Advarsler')),
      h('div', { class: 'card' }, h('h2', {}, 'Kom godt i gang'),
        h('ol', { class: 'muted' },
          h('li', {}, 'Tickets: vælg support-roller og log-kanal, og send panelet.'),
          h('li', {}, 'Ansøgninger: vælg review-kanal, ret spørgsmålene og send panelet.'),
          h('li', {}, 'Velkomst & verificering: slå til og vælg kanal/rolle.'),
          h('li', {}, 'Musik: brug /play i Discord eller styr afspilleren her fra panelet.'),
          h('li', {}, 'Stream-alerts: tilføj Twitch-navne og YouTube-kanaler.'))),
      settingsCard('general', 'Generelt'),
    ];
  },

  async tickets() {
    const list = await api(`/api/guild/${G.id}/tickets`);
    let filter = 'open';
    const body = h('tbody');
    const draw = () => {
      const rows = list.filter((t) => filter === 'all' || t.status === filter);
      body.replaceChildren(...(rows.length ? rows.map(row) : [h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Ingen tickets.'))]));
    };
    const row = (t) => h('tr', {},
      h('td', {}, `#${t.id}`), h('td', {}, t.type), h('td', {}, t.user || t.user_id),
      h('td', {}, h('span', { class: `badge ${t.status}` }, t.status === 'open' ? 'Åben' : 'Lukket')),
      h('td', {}, t.claimed || '–'), h('td', {}, date(t.created_at)),
      h('td', {}, t.status === 'open'
        ? h('button', { class: 'btn bad sm', onclick: run(async () => { await api(`/api/guild/${G.id}/tickets/${t.id}/close`, { method: 'POST' }); toast('Ticket lukket'); setTimeout(route, 1500); }) }, 'Luk')
        : h('a', { class: 'btn sec sm', href: `/api/guild/${G.id}/tickets/${t.id}/transcript`, target: '_blank' }, 'Transcript')));
    const tab = (k, l) => h('button', { class: 'btn sec sm', onclick: () => { filter = k; draw(); } }, l);
    draw();
    return [
      h('div', { class: 'card' }, h('h2', {}, 'Supportsager'), h('div', { class: 'tabs' }, tab('open', 'Åbne'), tab('closed', 'Lukkede'), tab('all', 'Alle')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['ID', 'Kategori', 'Bruger', 'Status', 'Claimet af', 'Oprettet', ''].map((x) => h('th', {}, x)))), body))),
      panelCard('tickets', 'Sender en besked med knapper hvor medlemmer kan åbne en ticket.'),
      await renderModuleStudio('tickets','Ticketsystemets indstillinger og design'),
    ];
  },

  async applications() {
    const stat=(n,l)=>h('div',{class:'stat'},h('b',{},n),h('span',{},l));
    const list = await api(`/api/guild/${G.id}/applications`);
    const forms = Object.fromEntries(G.settings.applications.forms.map((f) => [f.id, f]));
    const cards = list.slice(0, 50).map((a) => h('div', { class: 'row' },
      h('div', { class: 'top', style: 'margin:0 0 8px' },
        h('b', {}, `#${a.id} · ${forms[a.form_id]?.name || a.form_id} · ${a.user || a.user_id}`),
        h('span', { class: `badge ${a.status}` }, { pending: 'Afventer', accepted: 'Accepteret', denied: 'Afvist' }[a.status])),
      ...(forms[a.form_id]?.questions || []).map((q, i) => a.answers[i] && h('p', {}, h('b', {}, q), h('br'), a.answers[i])),
      a.status === 'pending' && h('div', { class: 'actions' },
        h('button', { class: 'btn bad sm', onclick: run(async () => { await api(`/api/guild/${G.id}/applications/${a.id}/deny`, { method: 'POST' }); toast('Afvist'); route(); }) }, 'Afvis'),
        h('button', { class: 'btn ok sm', onclick: run(async () => { await api(`/api/guild/${G.id}/applications/${a.id}/accept`, { method: 'POST' }); toast('Accepteret'); route(); }) }, 'Accepter'))));
    const search=h('input',{type:'search',placeholder:'Søg i indsendelser…','aria-label':'Søg i indsendelser'});
    const filter=h('select',{'aria-label':'Filtrer efter status'},...Object.entries({all:'Alle indsendelser',pending:'Afventer behandling',accepted:'Accepterede',denied:'Afviste'}).map(([value,label])=>h('option',{value},label)));
    const results=h('div',{class:'rows'});
    function draw(){const matches=list.slice(0,50).map((a,i)=>({a,card:cards[i]})).filter(({a})=>(filter.value==='all'||a.status===filter.value)&&JSON.stringify([a.id,forms[a.form_id]?.name,a.user,a.user_id,a.answers]).toLocaleLowerCase('da').includes(search.value.toLocaleLowerCase('da')));results.replaceChildren(...(matches.length?matches.map(x=>x.card):[h('p',{class:'muted'},'Ingen indsendelser passer til din søgning.')]));}
    search.addEventListener('input',draw);filter.addEventListener('change',draw);draw();
    return dashboardTabs([
      {id:'overview',label:'Oversigt',content:[h('div',{class:'card'},h('h2',{},'Ansøgninger til Dream Network'),h('p',{class:'muted'},'Opret formularer, send et panel til Discord, og behandl medlemmernes indsendelser her.'),h('div',{class:'stats'},stat(Object.keys(forms).length,'Formularer'),stat(list.filter(a=>a.status==='pending').length,'Afventer behandling'),stat(list.filter(a=>a.status==='accepted').length,'Accepterede')),h('h3',{},'Jeres formularer'),...Object.values(forms).map(f=>h('div',{class:'row'},h('b',{},f.name),h('p',{class:'muted'},(f.questions||[]).length+' spørgsmål · '+(f.acceptRole?'Tildeler en rolle ved accept':'Ingen automatisk rolle')))),!Object.keys(forms).length&&h('p',{},'Opret jeres første formular under Formularer og indstillinger.'))]},
      {id:'forms',label:'Formularer og indstillinger',content:[await renderModuleStudio('applications','Formularer og indstillinger')]},
      {id:'panels',label:'Discord-paneler',content:[panelCard('applications','Send en besked med knapper, som medlemmer kan bruge til at åbne jeres formularer.')]},
      {id:'submissions',label:'Indsendelser',content:[h('div',{class:'card'},h('h2',{},'Indsendelser'),h('div',{class:'actions'},search,filter),results)]}
    ],G.id+'-applications','overview');
  },

  async music() {
    const botSelect=h('select',{},h('option',{value:''},'Automatisk: brug en ledig musikbot'));
    const fleetBox=h('div',{class:'card'});
    let bots=[];
    const box = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Henter…'));
    const ctl = (a, v) => run(async () => { await api(`/api/guild/${G.id}/music/${a}`, { method: 'POST', body: { value: v,bot:botSelect.value } }); refresh(); });
    async function refresh() {
      const s = await api(`/api/guild/${G.id}/music?bot=${encodeURIComponent(botSelect.value)}`).catch(() => null);
      if (!s) return;
      if (!s.playing) return box.replaceChildren(h('h2', {}, 'Afspiller'), h('p', { class: 'muted' }, 'Der spilles ikke noget lige nu.'));
      const vol = h('input', { type: 'range', min: 0, max: 150, value: s.volume, onchange: (e) => ctl('volume', e.target.value)() });
      const loop = h('select', { onchange: (e) => ctl('loop', e.target.value)() }, ['off', 'track', 'queue', 'autoplay'].map((m) => h('option', { value: m }, { off: 'Loop: fra', track: 'Loop: sang', queue: 'Loop: kø', autoplay: 'Autoplay' }[m])));
      loop.value = s.repeat;
      box.replaceChildren(h('h2', {}, `Afspiller · ${s.voiceChannel || ''}`),
        h('div', { class: 'np' }, h('img', { src: s.current.thumbnail || '', alt: '' }),
          h('div', { style: 'flex:1;min-width:220px' }, h('b', {}, s.current.title), h('div', { class: 'muted' }, `${s.current.author} · ${s.current.progress || '0:00'} / ${s.current.duration}`),
            h('div', { class: 'ctl' },
              h('button', { class: 'btn sec', onclick: ctl(s.paused ? 'resume' : 'pause') }, s.paused ? '▶ Fortsæt' : '⏸ Pause'),
              h('button', { class: 'btn sec', onclick: ctl('skip') }, '⏭ Skip'),
              h('button', { class: 'btn sec', onclick: ctl('shuffle') }, '🔀 Bland'),
              h('button', { class: 'btn bad', onclick: ctl('stop') }, '⏹ Stop'), loop),
            h('label', { class: 'f', style: 'margin-top:10px' }, h('span', {}, `Lydstyrke (${s.volume}%)`), vol))),
        h('h3', { style: 'margin-top:18px' }, `Kø (${s.queue.length})`),
        h('table', { class: 'table' }, h('tbody', {}, s.queue.map((t, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, t.title, h('div', { class: 'muted' }, t.author)), h('td', {}, t.duration),
          h('td', {}, h('button', { class: 'btn sec sm', onclick: ctl('remove', i) }, 'Fjern')))))));
    }
    async function refreshFleet(){bots=await api(`/api/guild/${G.id}/music/bots`);const previous=botSelect.value;botSelect.replaceChildren(h('option',{value:''},'Automatisk: brug en ledig musikbot'),...bots.map(b=>h('option',{value:b.id},b.name+(b.channelId?' · optaget':' · ledig'))));botSelect.value=previous;}
    botSelect.addEventListener('change',()=>refresh());
    await refreshFleet();
    refresh();
    pollTimer = setInterval(()=>{refresh();refreshFleet().catch(()=>{});},5000);
    const q = h('input', { placeholder: 'Sangnavn, YouTube- eller Spotify-link' });
    const vc = h('select', {}, optionList(G.voiceChannels, '🔊 ', '— talekanal —'));
    const tc = h('select', {}, optionList(G.channels, '# ', '— annoncér i kanal (valgfri) —'));
    return [box,
      h('div', { class: 'card' }, h('h2', {}, 'Afspil fra panelet'), h('div', { class: 'grid' }, q, vc, tc,botSelect),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: run(async () => {
          const r = await api(`/api/guild/${G.id}/music/play`, { method: 'POST', body: { query: q.value, voiceChannel: vc.value, textChannel: tc.value,bot:botSelect.value } });
          if(r.botId)botSelect.value=r.botId;toast(`Tilføjet: ${r.title}`); q.value = ''; refresh();
        }) }, '▶ Afspil'))),
      settingsCard('music', 'Indstillinger'),await renderMusicFleetCard()];
  },

  async moderation() {
    const list = await api(`/api/guild/${G.id}/warnings`);
    return [settingsCard('moderation', 'Automod & log'),
      h('div', { class: 'card' }, h('h2', {}, 'Seneste advarsler'), h('div', { class: 'tablewrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Bruger', 'Årsag', 'Af', 'Dato', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, list.length ? list.map((w) => h('tr', {}, h('td', {}, w.user), h('td', {}, w.reason), h('td', {}, w.mod), h('td', {}, date(w.created_at)),
          h('td', {}, h('button', { class: 'btn sec sm', onclick: run(async () => { await api(`/api/guild/${G.id}/warnings/${w.id}`, { method: 'DELETE' }); route(); }) }, 'Slet'))))
          : h('tr', {}, h('td', { colspan: 5, class: 'muted' }, 'Ingen advarsler.')))))),
      h('div', { class: 'card muted' }, 'Kommandoer i Discord: /warn /warnings /kick /ban /unban /timeout /clear')];
  },

  async welcome() {
    return [await renderModuleStudio('welcome','Velkomst, farvel og automatiske roller'), settingsCard('verification', 'Verificering'),
      panelCard('verification', 'Sender en "Verificér mig"-knap. Tip: giv @everyone adgang til kun denne kanal, og verificeret-rollen adgang til resten.')];
  },

  async levels() {
    const lb = await api(`/api/guild/${G.id}/leaderboard`);
    return [settingsCard('levels', 'Indstillinger'),
      h('div', { class: 'card' }, h('h2', {}, 'Leaderboard'), h('table', { class: 'table' },
        h('tbody', {}, lb.length ? lb.map((r, i) => h('tr', {}, h('td', {}, `#${i + 1}`), h('td', {}, r.user), h('td', {}, `Level ${r.level}`), h('td', {}, `${r.xp} XP`)))
          : h('tr', {}, h('td', { class: 'muted' }, 'Ingen data endnu.')))))];
  },

  async giveaways() {
    const list = await api(`/api/guild/${G.id}/giveaways`);
    const draft = { prize: '', duration: '1d', winners: 1, channel: '' };
    return [
      h('div', { class: 'card' }, h('h2', {}, 'Ny giveaway'),
        h('div', { class: 'grid' }, field({ k: 'prize', l: 'Præmie' }, draft), field({ k: 'duration', l: 'Varighed (30m, 2h, 1d, 1w)' }, draft),
          field({ k: 'winners', t: 'number', l: 'Antal vindere', min: 1 }, draft), field({ k: 'channel', t: 'channel', l: 'Kanal' }, draft)),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: run(async () => { await api(`/api/guild/${G.id}/giveaways`, { method: 'POST', body: draft }); toast('Giveaway startet 🎉'); route(); }) }, 'Start giveaway'))),
      h('div', { class: 'card' }, h('h2', {}, 'Præmielodtrækninger'), h('div', { class: 'tablewrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['ID', 'Præmie', 'Kanal', 'Deltagere', 'Slutter', 'Status', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, list.length ? list.map((g) => h('tr', {}, h('td', {}, `#${g.id}`), h('td', {}, g.prize), h('td', {}, `#${chName(g.channel_id) || '?'}`), h('td', {}, g.entries), h('td', {}, date(g.ends_at)),
          h('td', {}, h('span', { class: `badge ${g.ended ? 'closed' : 'open'}` }, g.ended ? 'Slut' : 'Aktiv')),
          h('td', {}, h('button', { class: 'btn sec sm', onclick: run(async () => { await api(`/api/guild/${G.id}/giveaways/${g.id}/${g.ended ? 'reroll' : 'end'}`, { method: 'POST' }); toast('Færdig'); route(); }) }, g.ended ? 'Reroll' : 'Afslut nu'))))
          : h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Ingen giveaways endnu.')))))),
      settingsCard('giveaways', 'Indstillinger')];
  },

  async stream() { return renderStreamWorkspace(); },
  async legacyStream() {
    return [settingsCard('stream', 'Twitch & YouTube notifikationer'),
      h('div', { class: 'card muted' }, 'Twitch kræver TWITCH_CLIENT_ID og TWITCH_CLIENT_SECRET i .env. YouTube virker uden nøgle – find kanal-ID’et (UC…) under "Del kanal → Kopiér kanal-ID". Der tjekkes hvert 2. minut.')];
  },

  async birthdays(){return renderBirthdays();},
  async slideshow(){return renderSlideshow();},
  async custom() { return dashboardTabs([{id:'discord',label:'Discord-kommandoer',content:[await renderCommandCatalog()]},{id:'custom',label:'Egne tekstkommandoer',content:[settingsCard('custom','Egne tekstkommandoer')]}],G.id+'-commands','discord'); },
};

// ---------- Visning ----------
async function renderGuildList(){location.hash='#/g/'+me.targetGuildId+'/'+(me.access.manager?'overview':'developer');}

async function route() {
  window.developerCleanup?.();window.developerCleanup=null;
  clearInterval(pollTimer);
  if(!me?.access?.unlocked)return renderPersonalAccess();
  const [, , gid, page = 'overview'] = location.hash.split('/');
  if(gid&&page==='developer'&&!me.access.developer){location.hash='#/g/'+gid+'/overview';return;}
  if(gid&&page==='restart'){location.hash='#/g/'+gid+'/overview';return;}
  if(gid&&page==='logs'){sessionStorage.setItem('section:'+gid+'-developer','logs');location.hash='#/g/'+gid+'/developer';return;}
  if (!gid||gid!==me.targetGuildId) return renderGuildList();
  try {
    if (!G || G.id !== gid) G = await api(`/api/guild/${gid}`);
  } catch (e) { toast(e.message, true); location.hash = ''; return; }
  if (G.developerOnly && !['developer','account','appearance'].includes(page)) { location.hash = '#/g/'+gid+'/developer'; return; }
  applyAppearance(G.settings.appearance);
  const side = h('nav', { class: 'side' },
    h('div', { class: 'guild' }, icon(G), h('div', {}, h('b', {}, G.name), h('div', { class: 'muted', style: 'font-size:12px' }, `${G.members} medlemmer`))),
    orderedPages().filter(p=>(!G.developerOnly||['developer','account','appearance'].includes(p[0]))&&(p[0]!=='developer'||me.access.developer)).map(([k, ic, l]) => h('a', { class: `nav${k === page ? ' on' : ''}`, href: `#/g/${gid}/${k}` }, ic, ' ', l)),
    h('div', { class: 'foot' }, h('a', { href: '#/g/'+gid+'/account' }, 'Min adgang'), h('br'), h('a', { href: '/logout', class: 'muted' }, 'Log ud')));
  const main = h('main', {}, h('div', { class: 'top' },
    h('button', { class: 'btn sec menu-btn', onclick: () => side.classList.toggle('open') }, '☰'),
    h('h1', {}, PAGES.find((p) => p[0] === page)?.[2] || ''), h('span')), h('p', { class: 'muted' }, 'Indlæser…'));
  $app.replaceChildren(h('div', { class: 'shell' }, side, main));
  try {
    const content = await (pages[page] || pages.overview)();
    main.lastChild.replaceWith(['developer','stream','appearance','logs','applications','custom','restart','account'].includes(page)?h('div',{},content):categorySections(page,content));
  } catch (e) { main.lastChild.replaceWith(h('div', { class: 'card' }, `Fejl: ${e.message}`)); }
}

(async function boot() {
  const setup = await fetch('/api/setup').then((r) => r.json());
  if (!setup.loginReady) {
    $app.replaceChildren(h('div', { class: 'center' }, h('div', { class: 'card' },
      h('h1', {}, 'Alle bots samlet'),
      h('p', { class: 'muted' }, 'Dit online dashboard er klar. Forbind Supabase og Discord for at aktivere botten.'),
      h('p', {}, `Database: ${setup.databaseReady ? 'tilsluttet' : 'mangler forbindelse'}`),
      h('p', {}, `Discord-bot: ${setup.botReady ? 'online' : 'afventer opsætning'}`),
      h('p', {}, 'Forbindelsen bruger SUPABASE_URL og SUPABASE_SERVICE_KEY på Render.'),
      ...Object.entries({discordToken:'DISCORD_TOKEN',discordClientId:'DISCORD_CLIENT_ID',discordClientSecret:'DISCORD_CLIENT_SECRET',supabaseUrl:'SUPABASE_URL',supabaseKey:'SUPABASE_SERVICE_KEY'}).map(([key,label])=>h('p',{},label+': '+(setup.credentials?.[key]?'udfyldt':'mangler'))),
      setup.databaseError && h('p',{},'Databasefejl: '+({'SUPABASE_HTTP_401':'Supabase-nøglen blev afvist. Kontrollér den kopierede nøgle.','SUPABASE_HTTP_403':'Nøglen mangler backendadgang. Brug service_role/secret-nøglen.','SUPABASE_HTTP_404':'Databasefunktionen kunne ikke findes.','SUPABASE_PROJECT_MISMATCH':'Supabase-adressen peger på et andet projekt.'}[setup.databaseError]||setup.databaseError)),
      h('a',{class:'btn',href:'https://dashboard.render.com/web/srv-db8b651srm7s73e1rtq0/env',target:'_blank',rel:'noopener'},'Åbn indstillinger på Render'),
      h('p', {}, 'Discord OAuth2 Redirect: ', h('code', {}, setup.callbackUrl)))));
    return;
  }
  const r = await fetch('/api/me');
  if (r.status === 401) {
    $app.replaceChildren(h('div', { class: 'center' }, h('div', {},
      h('h1', { style: 'font-size:30px' }, 'Alle bots samlet'),
      h('p', { class: 'muted' }, 'Supportsager, musik, moderation, niveauer, ansøgninger, præmielodtrækninger og streambeskeder – ét sted.'),
      h('a', { class: 'btn', href: '/login' }, 'Log ind med Discord'))));
    return;
  }
  me = await r.json();
  window.addEventListener('hashchange', route);
  route();
})();
