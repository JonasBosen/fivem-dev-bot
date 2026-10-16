// Web-dashboard: login med Discord (OAuth2) og et JSON-API som siden i public/ bruger.
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { db, settings } = require('../db');
const { DEFAULTS } = require('../defaults');
const developer = require('../modules/developer');
const tickets = require('../modules/tickets');
const applications = require('../modules/applications');
const giveaways = require('../modules/giveaways');
const community = require('../modules/community');
const music = require('../modules/music-fleet');
const { parseDuration } = require('../util');

const personal=require('../modules/personal-access');
const audit=require('../modules/site-audit');
const stream=require('../modules/stream-platforms');
const {isManager}=require('../access');
const API = 'https://discord.com/api/v10';

function startWeb(client, { databaseReady = true, databaseError = '', listen = true, runtime } = {}) {
  const app = express();
  const BASE = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const REDIRECT = `${BASE}/auth/callback`;
  const owners = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  app.set('trust proxy', 1);
  if(runtime)app.use((req,res,next)=>{databaseReady=runtime.databaseReady;databaseError=runtime.databaseError;next();});
  app.use((req,res,next)=> /(?:\/developer\/\d+\/files|\/media)$/.test(req.path) ? next() : express.json({limit:'1mb'})(req,res,next));
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: BASE.startsWith('https'), maxAge: 7 * 864e5 },
  }));

  app.all('/integrations/txadmin/:gid',(req,res)=>res.status(410).json({error:'FiveM / txAdmin er fjernet'}));
  // ---------- Login ----------
  app.get(['/login', '/auth/login'], (req, res) => {
    if (!databaseReady || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) return res.status(503).send('AllBot mangler opsætning. Tilføj DATABASE_URL, DISCORD_CLIENT_ID og DISCORD_CLIENT_SECRET i Render Environment.');
    if(typeof req.query.next==='string'&&/^\/apply\/\d{17,20}\/[-a-z0-9_]{1,40}$/i.test(req.query.next))req.session.loginNext=req.query.next;
    req.session.state = crypto.randomBytes(16).toString('hex');
    const q = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify', state: req.session.state, prompt: 'none' });
    res.redirect(`https://discord.com/oauth2/authorize?${q}`);
  });

  app.get(['/callback', '/auth/callback'], async (req, res) => {
    try {
      if (!req.query.code || !req.query.state || !req.session.state || req.query.state !== req.session.state) return res.status(400).send('Ugyldigt login-forsøg. <a href="/login">Prøv igen</a>');
      delete req.session.state;
      const tok = await (await fetch(`${API}/oauth2/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: req.query.code, redirect_uri: REDIRECT }),
      })).json();
      if (!tok.access_token) throw new Error(tok.error_description || 'Token-fejl');
      const auth = { Authorization: `Bearer ${tok.access_token}` };
      const user=await fetch(`${API}/users/@me`,{headers:auth}).then(r=>r.json());
      if (!user.id) throw new Error('Discord kunne ikke bekræfte brugeren');
      const loginNext=req.session.loginNext;
      req.session.regenerate((err) => {
        if (err) return res.status(500).send('Session-fejl');
        req.session.user = { id: user.id, username: user.global_name || user.username, avatar: user.avatar };
        req.session.guilds=[];
        res.redirect(loginNext||'/');
      });
    } catch (e) { console.error('[login]', e.message); res.status(500).send('Login fejlede. Prøv igen.'); }
  });

  app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

  // ---------- Adgangskontrol ----------
  const discordAuth=(req,res,next)=>req.session.user?next():res.status(401).json({error:'Log ind med Discord'});
  const auth=async(req,res,next)=>discordAuth(req,res,async()=>{try{const guild=client.guilds.cache.get(personal.targetId());if(!guild||req.params.gid&&req.params.gid!==guild.id)return res.status(403).json({error:'Denne hjemmeside tilhører Dream Network'});const identity=await personal.status(guild,req.session);if(!identity.eligible)return res.status(403).json({error:'Du mangler en adgangsgivende Discord-rolle'});if(!identity.unlocked)return res.status(428).json({error:'Log ind med din personlige kode'});req.panelIdentity=identity;req.guild=guild;next();}catch{res.status(503).json({error:'Adgangen kunne ikke kontrolleres'});}});
  require('./staff-proxy').install(app,{auth,base:BASE});
  const ownerAccess=(req,res,next)=>req.panelIdentity?.owner?next():res.status(403).json({error:'Kun ejeren har adgang'});
  const guildAccess = async (req, res, next) => {
    try {
    const gid = req.params.gid;
    const guild = client.guilds.cache.get(gid);

    if (!guild) return res.status(404).json({ error: 'Botten er ikke på denne server' });
    if (!req.panelIdentity?.manager) return res.status(403).json({ error: 'Du mangler administratoradgang' });
    req.guild = guild;
    next();
    } catch { res.status(503).json({ error: 'Adgang kunne ikke kontrolleres' }); }
  };
  const wrap = (fn) => async (req, res) => {
    try { const out = await fn(req, res); if (!res.headersSent) {
      if(req.session?.user&&req.params.gid&&!['GET','HEAD'].includes(req.method)&&!req.path.endsWith('/audit/interaction')&&!req.path.endsWith('/developer/presence')){
        const bits=req.path.split('/');let module=bits[4];if(module==='developer-access')module='developer';if(module==='warnings')module='moderation';if(module==='settings'||module==='panel')module=bits[5];
        await audit.record(req.params.gid,req.session.user.id,module,req.method+' '+req.path,{before:req.auditBefore,request:req.body,result:'success'});
      }
      res.json(out ?? { ok: true });
    } }
    catch (e) {
      if(req.session?.user&&req.params.gid&&!['GET','HEAD'].includes(req.method)){const parts=req.path.split('/');const mod=parts[4]==='settings'?parts[5]:parts[4]==='developer-access'?'developer':parts[4];await audit.record(req.params.gid,req.session.user.id,mod,'request_failed',{path:req.path,error:e.message}).catch(()=>{});}
      if(!res.headersSent)res.status(400).json({ error: e.message });
    }
  };

  // Same-origin protection for browser mutations (sessions use SameSite=Lax).
  app.use('/api', (req, res, next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin') !== BASE) return res.status(403).json({ error: 'Ugyldig oprindelse' });
    next();
  });
  const accessGuild=()=>{const guild=client.guilds.cache.get(personal.targetId());if(!guild)throw new Error('Serveren er ikke tilsluttet');return guild;};
  app.get('/api/access/status',discordAuth,wrap(req=>personal.status(accessGuild(),req.session)));
  app.post('/api/access/bootstrap',discordAuth,wrap(req=>personal.issue(accessGuild(),req.session.user.id,req.session.user.id,true)));
  app.post('/api/access/check-invite',discordAuth,wrap(req=>personal.checkInvite(accessGuild(),req.session,req.body.code,req.ip)));
  app.post('/api/access/activate',discordAuth,wrap(req=>personal.activate(accessGuild(),req.session,req.body.code,req.body.password,req.body.confirm,req.ip)));
  app.post('/api/access/unlock',discordAuth,wrap(req=>personal.unlock(accessGuild(),req.session,req.body.password,req.ip)));
  app.post('/api/access/change',auth,wrap(req=>personal.change(accessGuild(),req.session,req.body.old,req.body.password,req.body.confirm,req.ip)));
  app.post('/api/access/lock',discordAuth,wrap(req=>personal.lock(accessGuild().id,req.session)));
  const appearanceKey=req=>'personal-appearance:'+req.guild.id+':'+req.session.user.id;
  app.get('/api/guild/:gid/my-workspace/:board',auth,wrap(req=>require('../modules/personal-workspace').read(req.guild.id,req.session.user.id,req.params.board)));
  app.put('/api/guild/:gid/my-workspace/:board',auth,wrap(req=>require('../modules/personal-workspace').update(req.guild.id,req.session.user.id,req.params.board,req.body)));
  const myAppearance=async req=>{const row=await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get(appearanceKey(req));if(row)return JSON.parse(row.data).appearance;return req.panelIdentity.owner?(await settings.get(req.guild.id)).appearance:require('../modules/appearance').defaults;};
  app.put('/api/guild/:gid/my-appearance',auth,wrap(async req=>{const value=require('../modules/appearance').validate(req.body);await settings.setModule(appearanceKey(req),'appearance',value);return value;}));
  app.get('/api/access/users',auth,ownerAccess,wrap(()=>personal.users(accessGuild().id)));
  app.post('/api/access/invites',auth,ownerAccess,wrap(req=>personal.issue(accessGuild(),req.session.user.id,req.body.userId)));
  app.post('/api/access/revoke',auth,ownerAccess,wrap(req=>personal.revoke(accessGuild(),req.session.user.id,req.body.userId)));
  const devRoleAccess = async (req,res,next) => {
    try {
      const guild = client.guilds.cache.get(req.params.gid);
      if (!guild || !req.panelIdentity?.developer) return res.status(403).json({error:'Kræver den aktuelle udviklerrolle på Discord'});
      req.guild = guild; next();
    } catch { res.status(503).json({error:'Adgang kunne ikke kontrolleres'}); }
  };
  const devAccess=async(req,res,next)=>devRoleAccess(req,res,async()=>{
    try{if(!(await require('../modules/developer-gate').status(req.guild,req.session)).unlocked)return res.status(423).json({error:'Lås udviklerpanelet op med den firecifrede kode.'});next();}
    catch{res.status(503).json({error:'Adgangskoden kunne ikke kontrolleres'});}
  });
  app.get('/api/guild/:gid/developer-access',auth,devRoleAccess,wrap(req=>require('../modules/developer-gate').status(req.guild,req.session)));
  app.post('/api/guild/:gid/developer-access/:action',auth,devRoleAccess,wrap(async req=>{
    if(req.params.action==='lock'){delete req.session.devGate;return {ok:true};}if(req.params.action==='unlock')return require('../modules/developer-gate').unlock(req.guild,req.session,req.body.pin,req.ip);throw new Error('Ukendt handling');
  }));
  app.post('/api/guild/:gid/developer/:id/files',auth,devAccess,express.json({limit:'9mb'}),wrap(req=>require('../modules/developer-files').upload(req.guild.id,Number(req.params.id),req.session.user.id,req.body)));
  app.get('/api/guild/:gid/developer/:id/files/:fid',auth,devAccess,wrap(async(req,res)=>{
    const image=await db.prepare('SELECT mime,content FROM dev_files WHERE guild_id=? AND task_id=? AND id=?').get(req.guild.id,req.params.id,req.params.fid);
    if(!image) return res.status(404).json({error:'Billedet findes ikke'});
    res.set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').type(image.mime).send(Buffer.from(image.content,'base64'));
  }));
  app.get('/api/guild/:gid/developer/:id/image',auth,devAccess,wrap(async (req,res)=>{
    const image=await db.prepare('SELECT mime,content FROM dev_images WHERE guild_id=? AND task_id=?').get(req.guild.id,req.params.id);
    if(!image) return res.status(404).json({error:'Billedet findes ikke'});
    res.set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').type(image.mime).send(Buffer.from(image.content,'base64'));
  }));
  const developerTasks=async req=>{
    const [planning,cfg,replyRows,rows]=await Promise.all([require('../modules/developer-planning').all(req.guild.id),settings.get(req.guild.id),db.prepare("SELECT task_id,MAX(id) AS latest FROM dev_comments WHERE guild_id=? AND author_type='citizen' GROUP BY task_id").all(req.guild.id),db.prepare('SELECT * FROM dev_tasks WHERE guild_id=? AND NOT EXISTS (SELECT 1 FROM dev_deleted WHERE dev_deleted.guild_id=dev_tasks.guild_id AND dev_deleted.task_id=dev_tasks.id) ORDER BY updated_at DESC').all(req.guild.id)]);
    const readConfig=cfg.developer,replies=Object.fromEntries(replyRows.map(r=>[r.task_id,r.latest]));
    return rows.map(t => ({...t,status:t.status==='done'?'closed':t.status,latestCitizenReply:replies[t.id]||0,unreadCitizenReply:require('../modules/developer-read-state').isUnread({id:t.id,latestCitizenReply:replies[t.id]||0},readConfig,req.session.user.id), checklist:JSON.parse(t.checklist), attachments:JSON.parse(t.attachments),planning:planning[t.id]||require('../modules/developer-planning').defaults})).filter(t=>(t.planning.reportType==='request')===(req.query.board==='request')).slice(0,500); };
  app.get('/api/guild/:gid/developer',auth,devAccess,wrap(developerTasks));
  app.get('/api/guild/:gid/developer/new-cases',auth,devAccess,wrap(req=>require('../modules/developer-case-reads').counts(req.guild.id,req.session.user.id)));
  app.post('/api/guild/:gid/developer/:id/case-read',auth,devAccess,wrap(req=>require('../modules/developer-case-reads').mark(req.guild.id,req.session.user.id,Number(req.params.id))));
  app.get('/api/guild/:gid/developer/workspace',auth,devAccess,wrap(async req=>{const [tasks,cfg,columns,presence,newCaseCounts]=await Promise.all([developerTasks(req),settings.get(req.guild.id),require('../modules/developer-board').get(req.guild.id,req.query.board==='request'?'request':'bug'),require('../modules/developer-presence').list(req.guild.id),require('../modules/developer-case-reads').counts(req.guild.id,req.session.user.id)]);return {tasks,columns,presence,newCaseCounts,panelConfig:cfg.developer.reportPanel||require('../modules/report-panel-config').defaults,wishPanelConfig:cfg.developer.wishPanel||require('../modules/developer-wishes').defaults};}));
  app.get('/api/guild/:gid/developer/audit/events',auth,devAccess,wrap(async req=>{const result=await require('../modules/developer-audit').page(req.guild.id,req.query.before),planning=await require('../modules/developer-planning').all(req.guild.id),wishes=req.query.board==='request';return {...result,events:result.events.filter(e=>e.task_id?((planning[e.task_id]?.reportType==='request')===wishes):((e.details.board==='request'||e.details.module==='wishPanel')===wishes))};}));
  app.get('/api/guild/:gid/developer/presence',auth,devAccess,wrap(req=>require('../modules/developer-presence').list(req.guild.id)));
  app.post('/api/guild/:gid/developer/presence',auth,devAccess,wrap(req=>require('../modules/developer-presence').heartbeat(req.guild.id,req.session.user.id,req.session.user.username,Date.now(),req.body.active!==false)));
  app.get('/api/guild/:gid/developer/people',auth,devAccess,wrap(async req=>{const members=await req.guild.members.fetch(),cfg=await settings.get(req.guild.id);return [...members.values()].filter(m=>!m.user.bot&&(cfg.developer.roles.some(id=>m.roles.cache.has(id)))).map(m=>({id:m.id,name:m.user.globalName||m.user.username}));}));
  app.get('/api/guild/:gid/developer/wish-panel-config',auth,devAccess,wrap(async req=>(await settings.get(req.guild.id)).developer.wishPanel||require('../modules/developer-wishes').defaults));
  app.put('/api/guild/:gid/developer/wish-panel-config',auth,devAccess,wrap(async req=>{const wishPanel=require('../modules/report-panel-config').validate(req.body),cfg=(await settings.get(req.guild.id)).developer;await settings.setModule(req.guild.id,'developer',{...cfg,wishPanel});await require('../modules/developer-audit').record(req.guild.id,0,req.session.user.id,'settings_updated',{module:'wishPanel',settings:wishPanel});if(cfg.wishPanelDelivery){await require('../modules/developer-wishes').sendPanel(req.guild,cfg.wishPanelDelivery.channel);return {...wishPanel,updatedPanels:1};}return {...wishPanel,updatedPanels:0};}));
  app.post('/api/guild/:gid/developer/wishes/panel',auth,devAccess,wrap(req=>require('../modules/developer-wishes').sendPanel(req.guild,req.body.channel)));
  app.get('/api/guild/:gid/developer/registry',auth,devAccess,wrap(req=>require('../modules/developer-registry').list(req.guild.id)));
  app.post('/api/guild/:gid/developer/registry',auth,devAccess,wrap(req=>require('../modules/developer-registry').save(req.guild.id,req.session.user.id,req.body)));
  app.put('/api/guild/:gid/developer/registry/:rid',auth,devAccess,wrap(req=>require('../modules/developer-registry').save(req.guild.id,req.session.user.id,req.body,req.params.rid)));
  app.delete('/api/guild/:gid/developer/registry/:rid',auth,devAccess,wrap(req=>require('../modules/developer-registry').remove(req.guild.id,req.session.user.id,req.params.rid)));
  app.post('/api/guild/:gid/developer/registry-import',auth,devAccess,wrap(async req=>{if(typeof req.body.text!=='string'||req.body.text.length>500000)throw new Error('Filen må højst indeholde 500.000 tegn');const registry=require('../modules/developer-registry'),rows=registry.parseImport(req.body.text,req.body.name);for(const data of rows)await registry.save(req.guild.id,req.session.user.id,{data},undefined,false);return registry.list(req.guild.id);}));
  app.get('/api/guild/:gid/developer/columns',auth,devAccess,wrap(req=>require('../modules/developer-board').get(req.guild.id,req.query.board==='request'?'request':'bug')));
  app.put('/api/guild/:gid/developer/columns',auth,devAccess,wrap(req=>require('../modules/developer-board').save(req.guild.id,req.session.user.id,req.body,req.query.board==='request'?'request':'bug')));
  app.get('/api/guild/:gid/developer/panel-config',auth,devAccess,wrap(async req=>(await settings.get(req.guild.id)).developer.reportPanel||require('../modules/report-panel-config').defaults));
  app.put('/api/guild/:gid/developer/panel-config',auth,devAccess,wrap(async req=>{const reportPanel=require('../modules/report-panel-config').validate(req.body);const cfg=(await settings.get(req.guild.id)).developer;await settings.setModule(req.guild.id,'developer',{...cfg,reportPanel});await require('../modules/developer-audit').record(req.guild.id,0,req.session.user.id,'settings_updated',{module:'reportPanel',settings:reportPanel});const updatedPanels=await require('../modules/report-panel').refreshPanels(req.guild.client,req.guild.id,cfg.reportPanel?.text);return {...reportPanel,updatedPanels};}));
  app.post('/api/guild/:gid/developer/panel',auth,devAccess,wrap(async req=>{await developer.sendPanel(req.guild,req.body.channel);await require('../modules/developer-audit').record(req.guild.id,0,req.session.user.id,'panel_sent',{channel:req.body.channel});}));
  app.delete('/api/guild/:gid/developer/:id',auth,devAccess,wrap(req=>developer.remove(req.guild,Number(req.params.id),req.session.user.id)));
  app.get('/api/guild/:gid/developer/:id',auth,devAccess,wrap(async req=>{
    const task=await developer.get(req.guild.id,Number(req.params.id));
    if(!task) throw new Error('Sagen findes ikke');
    if(!task.planning.reporterName){const user=await client.users.fetch(task.user_id).catch(()=>null);task.planning.reporterName=user?.globalName||user?.username||task.user_id;}
    return task;
  }));
  app.post('/api/guild/:gid/developer/:id/conversation-read',auth,devAccess,wrap(req=>require('../modules/developer-read-state').mark(req.guild,req.session.user.id,Number(req.params.id),req.body.through)));
  app.post('/api/guild/:gid/developer/:id/comments',auth,devAccess,wrap(req=>developer.comment(req.guild,Number(req.params.id),req.session.user.id,req.body.text,true)));
  app.post('/api/guild/:gid/developer', auth, devAccess, wrap(req => developer.create(req.guild,req.session.user.id,req.body)));
  app.put('/api/guild/:gid/developer/:id', auth, devAccess, wrap(req => developer.update(req.guild, Number(req.params.id),req.body,req.session.user.id)));
  app.post('/api/guild/:gid/developer/:id/sync', auth, devAccess, wrap(async req => {
    const task = await developer.get(req.guild.id,Number(req.params.id));
    if(!task) throw new Error('Sagen findes ikke');
    await developer.sync(client,task);
    return developer.get(req.guild.id,task.id);
  }));
  // ---------- API ----------
  app.get('/ready',(req,res)=>res.status(databaseReady&&(!process.env.DISCORD_TOKEN||client.isReady())?200:503).json({databaseReady,botReady:client.isReady()}));
  app.get('/health', (req, res) => res.json({ status: 'ok', databaseReady, botReady: client.isReady() }));
  app.get('/api/setup', (req, res) => res.json({
    databaseReady, botReady: client.isReady(), streamConnections:stream.integrationStatus(),
    loginReady: databaseReady && !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
    callbackUrl: REDIRECT,
    databaseError,
    credentials: {
      discordToken: !!process.env.DISCORD_TOKEN,
      discordClientId: !!process.env.DISCORD_CLIENT_ID,
      discordClientSecret: !!process.env.DISCORD_CLIENT_SECRET,
      supabaseUrl: !!process.env.SUPABASE_URL,
      supabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
    },
  }));
  app.get('/api/me',discordAuth,wrap(async req=>{const guild=client.guilds.cache.get(personal.targetId());if(!guild)throw new Error('Dream Network er ikke tilsluttet');return {user:req.session.user,targetGuildId:guild.id,access:await personal.status(guild,req.session),botReady:client.isReady()};}));

  app.get('/api/guild/:gid', auth, wrap(async (req) => {
    const g = req.guild;
    if (!req.panelIdentity.manager) {
      return {id:g.id,name:g.name,icon:g.iconURL(),members:g.memberCount,developerOnly:true,channels:[...g.channels.cache.values()].filter(c=>c.type===ChannelType.GuildText||c.type===ChannelType.GuildAnnouncement).map(c=>({id:c.id,name:c.name})),voiceChannels:[],categories:[],roles:[],settings:{appearance:await myAppearance(req)},stats:{}};
    }
    const channels = [...g.channels.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition);
    const [guildSettings,openTickets,totalTickets,pendingApps,activeGiveaways,warningCount]=await Promise.all([
      settings.get(g.id),db.prepare("SELECT COUNT(*) n FROM tickets WHERE guild_id=? AND status='open'").get(g.id),
      db.prepare('SELECT COUNT(*) n FROM tickets WHERE guild_id=?').get(g.id),db.prepare("SELECT COUNT(*) n FROM applications WHERE guild_id=? AND status='pending'").get(g.id),
      db.prepare('SELECT COUNT(*) n FROM giveaways WHERE guild_id=? AND ended=0').get(g.id),db.prepare('SELECT COUNT(*) n FROM warnings WHERE guild_id=?').get(g.id)
    ]);
    return {
      id: g.id, name: g.name, icon: g.iconURL(), members: g.memberCount,
      developerOnly: false,
      settings: {...guildSettings,txadmin:require('../modules/txadmin').publicConfig(guildSettings.txadmin),appearance:await myAppearance(req)},
      defaults: DEFAULTS,
      channels: channels.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).map((c) => ({ id: c.id, name: c.name })),
      voiceChannels: channels.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).map((c) => ({ id: c.id, name: c.name })),
      categories: channels.filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })),
      roles: [...g.roles.cache.values()].filter((r) => !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.id === g.id ? '@everyone' : r.name, color: r.hexColor })),
      stats: {
        openTickets: openTickets.n,
        totalTickets: totalTickets.n,
        pendingApps: pendingApps.n,
        activeGiveaways: activeGiveaways.n,
        warnings: warningCount.n,
      },
    };
  }));

  const protectDeveloperSettings=async(req,res,next)=>{
    if(!['/settings/developer','/panel/developer'].some(s=>req.path.endsWith(s)))return next();
    return devAccess(req,res,next);
  };
  app.put('/api/guild/:gid/settings/:module', auth, guildAccess, protectDeveloperSettings, wrap(async (req,res) => {
    if(['restart','levels','txadmin'].includes(req.params.module))return res.status(404).json({error:'Modulet er fjernet fra panelet'});
    if(['birthdays','slideshow'].includes(req.params.module)){const result=await require('../modules/community-studios').configure(req.guild,req.params.module,req.body);if(req.params.module==='slideshow')await require('../modules/community-studios').refreshSlideshow(req.guild);return result;}
    if(req.params.module==='appearance'){const value=require('../modules/appearance').validate(req.body);await settings.setModule(appearanceKey(req),'appearance',value);return value;}
    if(req.params.module==='welcome')req.body=require('../modules/panel-media').validate(req.body);
    if(['tickets','applications'].includes(req.params.module))req.body=require('../modules/panel-media').validateForms(req.params.module,req.body);
    if(req.params.module==='temporaryVoice')req.body=require('../modules/temporary-voice').validate(req.body);
    if(req.params.module==='stream')req.body=stream.validateConfig(req.body);
    if (!Object.hasOwn(DEFAULTS, req.params.module)) throw new Error('Ukendt modul');
    req.auditBefore=(await settings.get(req.guild.id))[req.params.module];
    const result=await settings.setModule(req.guild.id,req.params.module,req.body);
    if(['developer','general'].includes(req.params.module))await require('../modules/developer-audit').record(req.guild.id,0,req.session.user.id,'settings_updated',{module:req.params.module,settings:req.body});
    return result[req.params.module];
  }));

  app.post('/api/guild/:gid/panel/:type', auth, guildAccess, protectDeveloperSettings, wrap(async (req) => {
    const fn = { developer: developer.sendPanel, tickets: tickets.sendPanel, applications: applications.sendPanel, verification: community.sendVerifyPanel }[req.params.type];
    if (!fn) throw new Error('Ukendt panel');
    await fn(req.guild, req.body.channel,req.body.forms);
  }));

  app.get('/api/guild/:gid/audit/:module',auth,guildAccess,wrap(async(req,res)=>{if(req.params.module!=='developer')return res.status(404).json({error:'Denne log er fjernet'});if(req.params.module==='developer'&&(!req.panelIdentity.developer||!(await require('../modules/developer-gate').status(req.guild,req.session)).unlocked))return res.status(423).json({error:'Lås udviklerpanelet op med kode først'});return audit.page(req.guild.id,req.params.module,req.query.before);}));
  app.post('/api/guild/:gid/audit/interaction',auth,devRoleAccess,wrap(async req=>{
    const {module,action}=req.body||{};
    if(!audit.modules.includes(module)||typeof action!=='string'||action.length>100)throw new Error('Ugyldig hændelse');
    if(!await isManager(req.guild,req.session.user.id)&&module!=='developer')throw new Error('Ingen adgang');
    await audit.record(req.guild.id,req.session.user.id,module,'navigation',{action});
  }));
  app.post('/api/guild/:gid/slideshow/lock',auth,guildAccess,wrap(req=>require('../modules/community-studios').setUploadsLocked(req.guild,req.body.locked)));
  app.get('/api/guild/:gid/birthdays/members',auth,guildAccess,wrap(async req=>{const cfg=(await settings.get(req.guild.id)).birthdays,rows=[];const entries=Object.entries(cfg.members||{});for(let offset=0;offset<entries.length;offset+=10)rows.push(...await Promise.all(entries.slice(offset,offset+10).map(async([id,birthday])=>{const user=client.users.cache.get(id)||await client.users.fetch(id).catch(()=>null);return {id,name:user?.globalName||user?.username||'Ukendt bruger',avatar:user?.displayAvatarURL({extension:'png',size:128})||'',...birthday};})));return rows;}));
  const discordDesignAccess=(req,res,next)=>req.params.type==='developer'?devAccess(req,res,next):guildAccess(req,res,next);
  app.get('/api/guild/:gid/discord-design/:type',auth,discordDesignAccess,wrap(req=>require('../modules/discord-design').get(req.guild.id,req.params.type)));
  app.put('/api/guild/:gid/discord-design/:type',auth,discordDesignAccess,wrap(async req=>{const saved=await require('../modules/discord-design').save(req.guild.id,req.params.type,req.body);if(req.params.type==='developer')await require('../modules/developer-audit').record(req.guild.id,0,req.session.user.id,'settings_updated',{module:'discordDesign',settings:saved});if(req.params.type==='slideshow')await require('../modules/community-studios').refreshSlideshow(req.guild);return saved;}));
  app.post('/api/guild/:gid/birthdays/panel',auth,guildAccess,wrap(async req=>{const ch=await req.guild.channels.fetch(req.body.channel);if(!ch?.isTextBased())throw new Error('Vælg en tekstkanal');await ch.send(await require('../modules/discord-design').apply(req.guild.id,'birthdays',require('../modules/community-studios').birthdayPanel()));return {ok:true};}));
  app.get('/api/guild/:gid/media',auth,guildAccess,wrap(req=>require('../modules/panel-media').list(req.guild.id,req.query.scope)));
  app.post('/api/guild/:gid/media',auth,guildAccess,express.json({limit:'9mb'}),wrap(req=>require('../modules/panel-media').upload(req.guild.id,req.session.user.id,req.body,req.query.scope)));
  app.get('/api/guild/:gid/media/:id',auth,guildAccess,wrap(async(req,res)=>{const img=await require('../modules/panel-media').get(req.guild.id,req.params.id,req.query.scope||'shared');if(!img)return res.status(404).json({error:'Billedet findes ikke'});res.set('X-Content-Type-Options','nosniff').set('Cache-Control','private, max-age=300').type(img.mime).send(Buffer.from(img.content,'base64'));}));
  app.post('/api/guild/:gid/welcome/test',auth,guildAccess,wrap(async req=>{const cfg=require('../modules/panel-media').validate(req.body),member=await req.guild.members.fetch(req.session.user.id),ch=await req.guild.channels.fetch(cfg.channel);if(!ch?.isTextBased())throw new Error('Vælg en tekstkanal');await ch.send(await community.welcomePayload(member,cfg));return {ok:true};}));
  app.get('/api/guild/:gid/commands',auth,guildAccess,wrap(req=>require('../modules/command-catalog').load(req.guild)));
  app.get('/api/guild/:gid/stream/accounts',auth,guildAccess,wrap(req=>stream.accounts(req.guild.id)));
  app.get('/api/guild/:gid/stream/diagnostics/:platform',auth,guildAccess,wrap(req=>stream.inspect(req.guild,req.params.platform)));
  app.post('/api/guild/:gid/stream/check/:platform',auth,guildAccess,wrap(req=>stream.checkNow(req.guild,req.params.platform)));
  app.post('/api/guild/:gid/stream/test/:platform',auth,guildAccess,wrap(req=>stream.testDelivery(req.guild,req.params.platform,req.session.user.id,req.body?.ping===true)));
  app.get('/api/guild/:gid/stream/status',auth,guildAccess,wrap(()=>stream.integrationStatus()));
  app.get('/api/guild/:gid/stream/members',auth,guildAccess,wrap(async req=>{
    const role=String(req.query.role||'');if(!req.guild.roles.cache.has(role))throw new Error('Vælg en streamerrolle');
    const members=await req.guild.members.fetch();
    return [...members.values()].filter(m=>!m.user.bot&&m.roles.cache.has(role)).slice(0,500).map(m=>({id:m.id,name:m.displayName}));
  }));
  app.post('/api/guild/:gid/stream/accounts',auth,guildAccess,wrap(req=>stream.link(req.guild,req.body.platform,req.body.userId,req.body.handle,req.session.user.id)));
  app.delete('/api/guild/:gid/stream/accounts/:platform/:uid',auth,guildAccess,wrap(req=>stream.unlink(req.guild,req.params.platform,req.params.uid,req.session.user.id)));
  app.get('/apply/:gid/:fid',(req,res)=>res.sendFile(path.join(__dirname,'public','application-form.html')));
  const applicant=async(req,res,next)=>{if(!req.session.user)return res.status(401).json({error:'Log ind med Discord'});try{if(req.params.gid!==personal.targetId())throw Error('Ukendt server');req.guild=client.guilds.cache.get(req.params.gid);req.applicant=await req.guild.members.fetch(req.session.user.id);next();}catch{res.status(403).json({error:'Du skal være medlem af Dream Network'});}};
  app.get('/api/apply/:gid/:fid',applicant,wrap(async req=>{const form=(await settings.get(req.guild.id)).applications.forms.find(f=>f.id===req.params.fid);if(!form)throw Error('Formularen findes ikke');applications.checkAccess(form,req.applicant);return {name:form.name,questions:applications.questions(form),confirmationMessage:form.confirmationMessage||'Udfyld spørgsmålene. Du får svaret privat på Discord.',timeLimitMinutes:form.timeLimitMinutes??180};}));
  app.post('/api/apply/:gid/:fid/start',applicant,wrap(async req=>{const value=await applications.begin(req.guild,req.session.user.id,req.params.fid,'web');return {answers:value.answers,expiresAt:value.expiresAt};}));
  app.post('/api/apply/:gid/:fid/draft',applicant,wrap(req=>applications.saveDraft(req.guild,req.session.user.id,req.params.fid,req.body.answers)));
  app.post('/api/apply/:gid/:fid/submit',applicant,wrap(req=>applications.submit(req.guild,req.session.user.id,req.params.fid,req.body.answers)));
  app.post('/api/guild/:gid/applications/:aid/redeliver',auth,guildAccess,wrap(req=>applications.delivery(req.guild,Number(req.params.aid))));
  app.get('/api/guild/:gid/applications-export',auth,guildAccess,wrap(async(req,res)=>{const rows=await applications.list(req.guild.id);const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';const csv=[['ID','Formular','Discord-ID','Status','Oprettet','Behandler','Spørgsmål og svar'],...rows.map(r=>[r.id,r.metadata.form?.name||r.form_id,r.user_id,r.status,new Date(r.created_at).toISOString(),r.reviewed_by,JSON.stringify(r.answers)])].map(row=>row.map(cell).join(';')).join('\r\n');res.attachment('ansøgninger.csv').type('text/csv; charset=utf-8').send('\uFEFF'+csv);}));
  app.get('/api/guild/:gid/temporary-voice',auth,guildAccess,wrap(async req=>({rooms:await require('../modules/temporary-voice').rooms(req.guild.id)})));
  app.post('/api/guild/:gid/temporary-voice/panel',auth,guildAccess,wrap(req=>require('../modules/temporary-voice').sendPanel(req.guild,req.body.channel).then(()=>({ok:true}))));
  app.post('/api/guild/:gid/refresh-options',auth,guildAccess,wrap(async req=>{await Promise.all([req.guild.channels.fetch(),req.guild.roles.fetch()]);return {ok:true};}));
  // Tickets
  const userName = async (id) => (id ? (await client.users.fetch(id).catch(() => null))?.username || id : null);
  app.get('/api/guild/:gid/tickets', auth, guildAccess, wrap(async (req) => {
    const rows = (await db.prepare('SELECT id, channel_id, user_id, type, status, claimed_by, answers, created_at, closed_at, closed_by FROM tickets WHERE guild_id=? ORDER BY id DESC LIMIT 200').all(req.guild.id));
    return Promise.all(rows.map(async (r) => ({ ...r, answers: JSON.parse(r.answers || '[]'), user: await userName(r.user_id), claimed: await userName(r.claimed_by) })));
  }));
  app.get('/api/guild/:gid/tickets/:tid/transcript', auth, guildAccess, async (req, res) => {
    const t = (await db.prepare('SELECT transcript FROM tickets WHERE id=? AND guild_id=?').get(req.params.tid, req.guild.id));
    if (!t?.transcript) return res.status(404).send('Ingen transcript (ticketen er måske stadig åben).');
    res.set('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'").type('html').send(t.transcript);
  });
  app.post('/api/guild/:gid/tickets/:tid/close', auth, guildAccess, wrap(async (req) => {
    const t = (await db.prepare("SELECT * FROM tickets WHERE id=? AND guild_id=? AND status='open'").get(req.params.tid, req.guild.id));
    if (!t) throw new Error('Ticketen er ikke åben');
    await tickets.closeTicket(req.guild, t, req.session.user.id, 'Lukket fra dashboard');
  }));

  // Ansøgninger
  app.get('/api/guild/:gid/applications', auth, guildAccess, wrap(async (req) => {
    const rows = await applications.list(req.guild.id);
    return Promise.all(rows.map(async (r) => ({ ...r, user: await userName(r.user_id) })));
  }));
  app.post('/api/guild/:gid/applications/:aid/:decision', auth, guildAccess, wrap(async (req) => {
    if(!['accept','deny'].includes(req.params.decision))throw Error('Ukendt beslutning');
    await applications.review(req.guild, Number(req.params.aid), req.params.decision === 'accept', req.session.user.id);
  }));

  app.use('/api/guild/:gid/txadmin',auth,(req,res)=>res.status(410).json({error:'FiveM / txAdmin er fjernet'}));
  app.get('/api/guild/:gid/members/events',auth,guildAccess,wrap(req=>require('../modules/members-panel').events(req.guild.id,req.query.before)));
  app.get('/api/guild/:gid/members/banned',auth,guildAccess,wrap(async req=>({members:await require('../modules/members-panel').bans(req.guild)})));
  app.get('/api/guild/:gid/members/departed',auth,guildAccess,wrap(req=>require('../modules/members-panel').departed(req.guild,req.query.before)));
  app.get('/api/guild/:gid/members',auth,guildAccess,wrap(req=>require('../modules/members-panel').list(req.guild,req.session.user.id,req.query.search,req.query.page)));
  app.put('/api/guild/:gid/members/:uid/roles/:rid',auth,guildAccess,wrap(req=>require('../modules/members-panel').changeRole(req.guild,req.session.user.id,req.params.uid,req.params.rid,true)));
  app.delete('/api/guild/:gid/members/:uid/roles/:rid',auth,guildAccess,wrap(req=>require('../modules/members-panel').changeRole(req.guild,req.session.user.id,req.params.uid,req.params.rid,false)));
  app.get('/api/guild/:gid/giveaway-wheel',auth,guildAccess,wrap(async req=>{const wheel=require('../modules/prize-wheel');const [config,history]=await Promise.all([wheel.config(req.guild.id),wheel.history(req.guild.id)]);return {config,history};}));
  app.put('/api/guild/:gid/giveaway-wheel',auth,guildAccess,wrap(req=>require('../modules/prize-wheel').configure(req.guild,req.body)));
  app.post('/api/guild/:gid/giveaway-wheel/spin',auth,guildAccess,wrap(req=>require('../modules/prize-wheel').spin(req.guild,req.session.user.id,req.body.requestId)));
  app.post('/api/guild/:gid/giveaway-wheel/:id/announce',auth,guildAccess,wrap(req=>require('../modules/prize-wheel').retry(req.guild,req.params.id)));
  // Giveaways
  app.get('/api/guild/:gid/giveaways', auth, guildAccess, wrap(async (req) =>
    (await db.prepare('SELECT * FROM giveaways WHERE guild_id=? ORDER BY id DESC LIMIT 100').all(req.guild.id))
      .map((g) => ({ ...g, entries: JSON.parse(g.entries).length, winner_ids: JSON.parse(g.winner_ids || '[]') }))));
  app.post('/api/guild/:gid/giveaways', auth, guildAccess, wrap(async (req) => {
    const ms = parseDuration(req.body.duration);
    if (!ms) throw new Error('Ugyldig varighed (f.eks. 30m, 2h, 1d)');
    if (!req.body.prize) throw new Error('Skriv en præmie');
    return { id: await giveaways.start(req.guild, req.body.channel, req.body.prize, ms, Math.max(1, Number(req.body.winners) || 1), req.session.user.id) };
  }));
  app.post('/api/guild/:gid/giveaways/:id/:action', auth, guildAccess, wrap(async (req) => {
    const g = (await db.prepare('SELECT id FROM giveaways WHERE id=? AND guild_id=?').get(req.params.id, req.guild.id));
    if (!g) throw new Error('Findes ikke');
    await giveaways.end(client, g.id, req.params.action === 'reroll');
  }));

  // Musik
  app.get('/api/guild/:gid/music/bots',auth,guildAccess,wrap(req=>music.list(req.guild.id)));
  app.post('/api/guild/:gid/music/bots',auth,guildAccess,wrap(async req=>{
    if(typeof req.body.id!=='string'||!/^\d{17,20}$/.test(req.body.id))throw new Error('Indsæt bot-applikationens Application ID');
    if(typeof req.body.name!=='string'||!req.body.name.trim()||req.body.name.length>80)throw new Error('Skriv et navn på 1–80 tegn');
    const cfg=(await settings.get(req.guild.id)).music;
    const bots=[...(cfg.bots||[]).filter(b=>b.id!==req.body.id),{id:req.body.id,name:req.body.name.trim()}];
    await settings.setModule(req.guild.id,'music',{...cfg,bots});return bots;
  }));
  app.get('/api/guild/:gid/music', auth, guildAccess, wrap((req) => music.state(req.guild.id,req.query.bot)));
  app.post('/api/guild/:gid/music/play', auth, guildAccess, wrap(async (req) => {
    const vc = req.guild.channels.cache.get(req.body.voiceChannel);
    if (!vc?.isVoiceBased()) throw new Error('Vælg en talekanal');
    const text = req.guild.channels.cache.get(req.body.textChannel) || null;
    const { track,botId } = await music.play(req.guild.id,vc.id,req.body.query,text?.id,null,req.body.bot||undefined);
    return { title: track.title,botId };
  }));
  app.post('/api/guild/:gid/music/:action', auth, guildAccess, wrap((req) => { music.control(req.guild.id,req.body.bot||undefined,req.params.action,req.body.value); }));

  // Levels og moderation
  app.get('/api/guild/:gid/leaderboard', auth, guildAccess, wrap(async (req) =>
    Promise.all((await community.leaderboard(req.guild.id, 50)).map(async (r) => ({ ...r, user: await userName(r.user_id) })))));
  app.get('/api/guild/:gid/warnings', auth, guildAccess, wrap(async (req) =>
    Promise.all((await db.prepare('SELECT * FROM warnings WHERE guild_id=? ORDER BY id DESC LIMIT 100').all(req.guild.id))
      .map(async (w) => ({ ...w, user: await userName(w.user_id), mod: await userName(w.mod_id) })))));
  app.delete('/api/guild/:gid/warnings/:wid', auth, guildAccess, wrap(async (req) => {
    (await db.prepare('DELETE FROM warnings WHERE id=? AND guild_id=?').run(req.params.wid, req.guild.id));
  }));

  app.use(express.static(path.join(__dirname, 'public')));

  const port = Number(process.env.PORT) || 3000;
  if (listen) app.listen(port, () => console.log(`[dashboard] kører på ${BASE} (port ${port})`));
  return app;
}

module.exports = { startWeb };
