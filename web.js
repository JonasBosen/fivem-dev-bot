const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');

module.exports = function startWeb(ctx) {
  const { db, save, createTask, addLog, applyAction, afterChange, isDevUserId, displayName, env } = ctx;
  const { CLIENT_ID, CLIENT_SECRET, BASE_URL, SESSION_SECRET } = env;
  const base = BASE_URL.replace(/\/$/, '');
  const REDIRECT = `${base}/auth/callback`;
  const PORT = process.env.PORT || 3000;

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '50kb' }));
  app.use(session({
    secret: SESSION_SECRET, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: base.startsWith('https'), maxAge: 7 * 24 * 3600 * 1000 },
  }));

  /* ---------------- Discord-login ---------------- */

  app.get('/auth/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.state = state;
    const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify', state });
    res.redirect('https://discord.com/oauth2/authorize?' + p);
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.state) return res.status(400).send('Ugyldigt login-forsøg. Prøv igen.');
    delete req.session.state;
    try {
      const tr = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code: String(code), redirect_uri: REDIRECT }),
      });
      if (!tr.ok) throw new Error('token');
      const tok = await tr.json();
      const ur = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
      if (!ur.ok) throw new Error('user');
      const u = await ur.json();
      if (!(await isDevUserId(u.id))) return res.status(403).send('Du har ikke adgang. Kræver udviklerrollen på Discord-serveren.');
      req.session.user = { id: u.id, name: u.global_name || u.username };
      res.redirect('/');
    } catch (e) {
      console.error('Login fejlede:', e.message);
      res.status(500).send('Login fejlede. Prøv igen.');
    }
  });

  app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

  /* ---------------- API (kun udviklere) ---------------- */

  const roleCache = new Map(); // userId -> { ok, at }
  async function auth(req, res, next) {
    const u = req.session.user;
    if (!u) return res.status(401).json({ error: 'Ikke logget ind' });
    let c = roleCache.get(u.id);
    if (!c || Date.now() - c.at > 60_000) {
      c = { ok: await isDevUserId(u.id), at: Date.now() };
      roleCache.set(u.id, c);
    }
    if (!c.ok) return req.session.destroy(() => res.status(403).json({ error: 'Ingen adgang' }));
    next();
  }

  const nameCache = new Map();
  async function nameOf(id) {
    if (!id) return null;
    const c = nameCache.get(id);
    if (c && Date.now() - c.at < 10 * 60_000) return c.name;
    const name = await displayName(id);
    nameCache.set(id, { name, at: Date.now() });
    return name;
  }

  async function serialize(t, withLog) {
    const o = {
      id: t.id, title: t.title, description: t.description, extra: t.extra, source: t.source, status: t.status,
      note: t.note, createdAt: t.createdAt, updatedAt: t.updatedAt,
      assigneeName: await nameOf(t.assignee),
      createdByName: await nameOf(t.createdBy),
    };
    if (withLog) {
      o.log = await Promise.all(t.log.map(async (l) => ({
        at: l.at, action: l.action, text: l.text, userName: await nameOf(l.user),
      })));
    }
    return o;
  }

  app.get('/api/me', auth, (req, res) => res.json(req.session.user));

  app.get('/api/tasks', auth, async (req, res) => {
    const tasks = Object.values(db.tasks).sort((a, b) => a.id - b.id);
    res.json(await Promise.all(tasks.map((t) => serialize(t, false))));
  });

  app.get('/api/tasks/:id', auth, async (req, res) => {
    const t = db.tasks[req.params.id];
    if (!t) return res.status(404).json({ error: 'Opgaven findes ikke' });
    res.json(await serialize(t, true));
  });

  app.post('/api/tasks', auth, async (req, res) => {
    if (!req.is('json')) return res.status(415).json({ error: 'Forkert format' });
    const title = String(req.body.title || '').trim().slice(0, 100);
    const description = String(req.body.description || '').trim().slice(0, 1500);
    if (!title) return res.status(400).json({ error: 'Titel mangler' });
    const t = createTask({ title, description, source: 'dev', createdBy: req.session.user.id });
    const entry = addLog(t, req.session.user.id, 'Opgave oprettet (web)', title);
    save();
    await afterChange(t, entry);
    res.json(await serialize(t, true));
  });

  app.post('/api/tasks/:id/:action', auth, async (req, res) => {
    if (!req.is('json')) return res.status(415).json({ error: 'Forkert format' });
    const t = db.tasks[req.params.id];
    if (!t) return res.status(404).json({ error: 'Opgaven findes ikke' });
    const action = req.params.action;
    const note = String(req.body.note || '').trim().slice(0, 1000);
    if ((action === 'done' || action === 'reject') && !note) {
      return res.status(400).json({ error: action === 'done' ? 'Skriv hvad der er gjort' : 'Skriv en begrundelse' });
    }
    const r = applyAction(t, action, req.session.user.id, note);
    if (r.error) return res.status(409).json({ error: r.error });
    save();
    await afterChange(t, r.entry);
    res.json(await serialize(t, true));
  });

  app.get('/health', (req, res) => res.send('ok'));
  app.use(express.static(path.join(__dirname, 'public')));

  app.listen(PORT, () => console.log(`Hjemmesiden kører på port ${PORT} (${base})`));
};
