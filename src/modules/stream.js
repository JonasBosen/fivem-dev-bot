// Stream-notifikationer (inspireret af Streamcord / MEE6):
// Twitch "er live" (kræver TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET) og nye YouTube-videoer (via RSS, ingen nøgle).
const { db, settings } = require('../db');
const { fill, sendTo } = require('../util');

const getState = async (g, k) => (await db.prepare('SELECT value FROM stream_state WHERE guild_id=? AND key=?').get(g, k))?.value;
const setState = async (g, k, v) => v == null
  ? (await db.prepare('DELETE FROM stream_state WHERE guild_id=? AND key=?').run(g, k))
  : (await db.prepare('INSERT INTO stream_state (guild_id,key,value) VALUES (?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value').run(g, k, v));

let twitchToken = null, tokenExpires = 0;
async function twitchAuth() {
  if (twitchToken && Date.now() < tokenExpires) return twitchToken;
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
  const j = await r.json();
  if (!j.access_token) throw new Error('Twitch login fejlede – tjek TWITCH_CLIENT_ID/SECRET');
  twitchToken = j.access_token; tokenExpires = Date.now() + (j.expires_in - 60) * 1000;
  return twitchToken;
}

async function twitchLive(logins) {
  const live = new Map();
  for (let i = 0; i < logins.length; i += 100) {
    const qs = logins.slice(i, i + 100).map((l) => `user_login=${encodeURIComponent(l)}`).join('&');
    const r = await fetch(`https://api.twitch.tv/helix/streams?${qs}`, { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${await twitchAuth()}` } });
    const j = await r.json();
    for (const s of j.data || []) live.set(s.user_login.toLowerCase(), s);
  }
  return live;
}

async function youtubeLatest(channelId) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  if (!r.ok) return null;
  const xml = await r.text();
  const entry = xml.split('<entry>')[1];
  if (!entry) return null;
  const pick = (tag) => (entry.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1];
  const author = (xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1];
  const decode = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return { id: pick('yt:videoId'), title: decode(pick('title')), name: decode(author), url: `https://youtu.be/${pick('yt:videoId')}` };
}

async function check(client) {
  const hasTwitch = process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET;
  for (const guild of client.guilds.cache.values()) {
    const cfg = (await settings.get(guild.id)).stream;
    if (!cfg.channel) continue;
    const ping = cfg.pingRole ? (cfg.pingRole === guild.id ? '@everyone ' : `<@&${cfg.pingRole}> `) : '';
    const allowedMentions = { parse: ['everyone', 'roles'] };

    if (hasTwitch && cfg.twitch.length) {
      try {
        const logins = cfg.twitch.map((x) => x.trim().toLowerCase()).filter(Boolean);
        const live = await twitchLive(logins);
        for (const login of logins) {
          const key = `tw:${login}`, prev = (await getState(guild.id, key)), s = live.get(login);
          if (s && !prev) {
            const text = fill(cfg.twitchMessage, { name: s.user_name, title: s.title, game: s.game_name, url: `https://twitch.tv/${login}` });
            const msg = await sendTo(guild, cfg.channel, { content: ping + text, allowedMentions });
            (await setState(guild.id, key, msg?.id || 'live'));
          } else if (!s && prev) {
            if (cfg.deleteWhenOffline && prev !== 'live') {
              const ch = guild.channels.cache.get(cfg.channel);
              ch?.messages.delete(prev).catch(() => {});
            }
            (await setState(guild.id, key, null));
          }
        }
      } catch (e) { console.warn('[twitch]', e.message); }
    }

    for (const yt of cfg.youtube.map((x) => x.trim()).filter(Boolean)) {
      try {
        const v = await youtubeLatest(yt);
        if (!v?.id) continue;
        const key = `yt:${yt}`, prev = (await getState(guild.id, key));
        if (prev && prev !== v.id) await sendTo(guild, cfg.channel, { content: ping + fill(cfg.youtubeMessage, v), allowedMentions });
        if (prev !== v.id) (await setState(guild.id, key, v.id)); // første gang gemmes kun, så gamle videoer ikke spammes
      } catch (e) { console.warn('[youtube]', e.message); }
    }
  }
}

function startPolling(client) {
  const run = () => check(client).catch((e) => console.warn('[stream]', e.message));
  setTimeout(run, 10_000);
  setInterval(run, 2 * 60_000);
}

module.exports = { startPolling };
