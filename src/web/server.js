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
const music = require('../modules/music');
const { parseDuration } = require('../util');

const {isManager}=require('../access');
const API = 'https://discord.com/api/v10';

function startWeb(client, { databaseReady = true, databaseError = '', listen = true } = {}) {
  const app = express();
  const BASE = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const REDIRECT = `${BASE}/auth/callback`;
  const owners = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: BASE.startsWith('https'), maxAge: 7 * 864e5 },
  }));

  // ---------- Login ----------
  app.get(['/login', '/auth/login'], (req, res) => {
    if (!databaseReady || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) return res.status(503).send('AllBot mangler opsætning. Tilføj DATABASE_URL, DISCORD_CLIENT_ID og DISCORD_CLIENT_SECRET i Render Environment.');
    req.session.state = crypto.randomBytes(16).toString('hex');
    const q = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify guilds', state: req.session.state, prompt: 'none' });
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
      const [user, guilds] = await Promise.all([fetch(`${API}/users/@me`, { headers: auth }).then((r) => r.json()), fetch(`${API}/users/@me/guilds`, { headers: auth }).then((r) => r.json())]);
      if (!user.id || !Array.isArray(guilds)) throw new Error('Discord kunne ikke bekræfte brugeren');
      req.session.regenerate((err) => {
        if (err) return res.status(500).send('Session-fejl');
        req.session.user = { id: user.id, username: user.global_name || user.username, avatar: user.avatar };
        req.session.guilds = (Array.isArray(guilds) ? guilds : [])
          .filter((g) => g.owner || (BigInt(g.permissions) & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) !== 0n)
          .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
        res.redirect('/');
      });
    } catch (e) { console.error('[login]', e.message); res.status(500).send('Login fejlede. Prøv igen.'); }
  });

  app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

  // ---------- Adgangskontrol ----------
  const auth = (req, res, next) => (req.session.user ? next() : res.status(401).json({ error: 'Ikke logget ind' }));
  const guildAccess = async (req, res, next) => {
    try {
    const gid = req.params.gid;
    const guild = client.guilds.cache.get(gid);

    if (!guild) return res.status(404).json({ error: 'Botten er ikke på denne server' });
    if (!owners.includes(req.session.user.id) && !await isManager(guild,req.session.user.id)) return res.status(403).json({ error: 'Du mangler administratoradgang' });
    req.guild = guild;
    next();
    } catch { res.status(503).json({ error: 'Adgang kunne ikke kontrolleres' }); }
  };
  const wrap = (fn) => async (req, res) => {
    try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  };

  // Same-origin protection for browser mutations (sessions use SameSite=Lax).
  app.use('/api', (req, res, next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin') !== BASE) return res.status(403).json({ error: 'Ugyldig oprindelse' });
    next();
  });
  const devAccess = async (req,res,next) => {
    try {
      const guild = client.guilds.cache.get(req.params.gid);
      if (!guild || !await developer.canManage(guild, req.session.user.id)) return res.status(403).json({error:'Kræver udviklerrolle eller administrator'});
      req.guild = guild; next();
    } catch { res.status(503).json({error:'Adgang kunne ikke kontrolleres'}); }
  };
  app.get('/api/guild/:gid/developer/:id/image',auth,devAccess,wrap(async (req,res)=>{
    const image=await db.prepare('SELECT mime,content FROM dev_images WHERE guild_id=? AND task_id=?').get(req.guild.id,req.params.id);
    if(!image) return res.status(404).json({error:'Billedet findes ikke'});
    res.set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').type(image.mime).send(Buffer.from(image.content,'base64'));
  }));
  app.get('/api/guild/:gid/developer', auth, devAccess, wrap(async req =>
    (await db.prepare('SELECT * FROM dev_tasks WHERE guild_id=? ORDER BY updated_at DESC LIMIT 500').all(req.guild.id)).map(t => ({...t, checklist:JSON.parse(t.checklist), attachments:JSON.parse(t.attachments)}))));
  app.get('/api/guild/:gid/developer/:id',auth,devAccess,wrap(async req=>{
    const task=await developer.get(req.guild.id,Number(req.params.id));
    if(!task) throw new Error('Sagen findes ikke');
    return task;
  }));
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
  app.get('/health', (req, res) => res.json({ status: 'ok', databaseReady, botReady: client.isReady() }));
  app.get('/api/setup', (req, res) => res.json({
    databaseReady, botReady: client.isReady(),
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
  app.get('/api/me', auth, async (req, res) => {
    const mine = owners.includes(req.session.user.id)
      ? [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name, icon: g.icon }))
      : req.session.guilds;
    for (const guild of client.guilds.cache.values()) {
      if (!mine.some(g=>g.id===guild.id) && await developer.canManage(guild,req.session.user.id)) mine.push({id:guild.id,name:guild.name,icon:guild.icon});
    }
    const ids = new Set(mine.map((g) => g.id));
    const extra = owners.includes(req.session.user.id) ? [] : req.session.guilds.filter((g) => !ids.has(g.id));
    res.json({
      user: req.session.user,
      botReady: client.isReady(),
      invite: client.user ? `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot+applications.commands&permissions=8` : null,
      guilds: [...mine, ...extra].map((g) => ({ ...g, botIn: client.guilds.cache.has(g.id) })),
    });
  });

  app.get('/api/guild/:gid', auth, devAccess, wrap(async (req) => {
    const g = req.guild;
    if (!await isManager(g,req.session.user.id)) {
      return {id:g.id,name:g.name,icon:g.iconURL(),members:g.memberCount,developerOnly:true,channels:[],voiceChannels:[],categories:[],roles:[],settings:{},stats:{}};
    }
    const channels = [...g.channels.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition);
    return {
      id: g.id, name: g.name, icon: g.iconURL(), members: g.memberCount,
      developerOnly: false,
      settings: (await settings.get(g.id)),
      defaults: DEFAULTS,
      channels: channels.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).map((c) => ({ id: c.id, name: c.name })),
      voiceChannels: channels.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).map((c) => ({ id: c.id, name: c.name })),
      categories: channels.filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })),
      roles: [...g.roles.cache.values()].filter((r) => !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.id === g.id ? '@everyone' : r.name, color: r.hexColor })),
      stats: {
        openTickets: (await db.prepare("SELECT COUNT(*) n FROM tickets WHERE guild_id=? AND status='open'").get(g.id)).n,
        totalTickets: (await db.prepare('SELECT COUNT(*) n FROM tickets WHERE guild_id=?').get(g.id)).n,
        pendingApps: (await db.prepare("SELECT COUNT(*) n FROM applications WHERE guild_id=? AND status='pending'").get(g.id)).n,
        activeGiveaways: (await db.prepare('SELECT COUNT(*) n FROM giveaways WHERE guild_id=? AND ended=0').get(g.id)).n,
        warnings: (await db.prepare('SELECT COUNT(*) n FROM warnings WHERE guild_id=?').get(g.id)).n,
      },
    };
  }));

  app.put('/api/guild/:gid/settings/:module', auth, guildAccess, wrap(async (req) => {
    if (!Object.hasOwn(DEFAULTS, req.params.module)) throw new Error('Ukendt modul');
    return (await settings.setModule(req.guild.id, req.params.module, req.body))[req.params.module];
  }));

  app.post('/api/guild/:gid/panel/:type', auth, guildAccess, wrap(async (req) => {
    const fn = { developer: developer.sendPanel, tickets: tickets.sendPanel, applications: applications.sendPanel, verification: community.sendVerifyPanel }[req.params.type];
    if (!fn) throw new Error('Ukendt panel');
    await fn(req.guild, req.body.channel);
  }));

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
    const rows = (await db.prepare('SELECT * FROM applications WHERE guild_id=? ORDER BY id DESC LIMIT 200').all(req.guild.id));
    return Promise.all(rows.map(async (r) => ({ ...r, answers: JSON.parse(r.answers || '[]'), user: await userName(r.user_id) })));
  }));
  app.post('/api/guild/:gid/applications/:aid/:decision', auth, guildAccess, wrap(async (req) => {
    await applications.review(req.guild, Number(req.params.aid), req.params.decision === 'accept', req.session.user.id);
  }));

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
  app.get('/api/guild/:gid/music', auth, guildAccess, wrap((req) => music.state(req.guild.id)));
  app.post('/api/guild/:gid/music/play', auth, guildAccess, wrap(async (req) => {
    const vc = req.guild.channels.cache.get(req.body.voiceChannel);
    if (!vc?.isVoiceBased()) throw new Error('Vælg en talekanal');
    const text = req.guild.channels.cache.get(req.body.textChannel) || null;
    const { track } = await music.play(req.guild, vc, req.body.query, text, null);
    return { title: track.title };
  }));
  app.post('/api/guild/:gid/music/:action', auth, guildAccess, wrap((req) => { music.control(req.guild.id, req.params.action, req.body.value); }));

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
