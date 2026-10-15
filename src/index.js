require('dotenv').config({ quiet: true });
const { Client, GatewayIntentBits, Events, ActivityType, MessageFlags } = require('discord.js');
const { register } = require('./commands');
process.env.DISCORD_CLIENT_ID ||= process.env.CLIENT_ID;
process.env.DISCORD_CLIENT_SECRET ||= process.env.CLIENT_SECRET;
const developer = require('./modules/developer');
const tickets = require('./modules/tickets');
const applications = require('./modules/applications');
const giveaways = require('./modules/giveaways');
const community = require('./modules/community');
const moderation = require('./modules/moderation');
const music = require('./modules/music');
const stream = require('./modules/stream');
const { startWeb } = require('./web/server');
const { initDb } = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // privilegeret: slå til i Developer Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // privilegeret: slå til i Developer Portal
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const commandRoutes = {
  fejl: developer, fejlstatus: developer, warn: moderation, warnings: moderation, kick: moderation, ban: moderation, unban: moderation, timeout: moderation, clear: moderation,
  rank: community, leaderboard: community,
  ticket: tickets, application: applications, giveaway: giveaways,
  play: music, skip: music, pause: music, resume: music, stop: music, shuffle: music, queue: music, nowplaying: music, volume: music, loop: music,
};

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logget ind som ${c.user.tag} på ${c.guilds.cache.size} servere`);
  c.user.setActivity('/play · /ticket · dashboard', { type: ActivityType.Listening });
  await register(c.user.id).catch((e) => console.error('[kommandoer]', e.message));
  await music.init(c).catch((e) => console.error('[musik]', e.message));
  giveaways.startTimer(c);
  stream.startPolling(c);
});

client.on(Events.InteractionCreate, async (i) => {
  if (!i.inGuild()) return;
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'dashboard') return i.reply({ content: `🔧 Kontrolpanel: ${process.env.BASE_URL || 'http://localhost:3000'}`, flags: MessageFlags.Ephemeral });
      if (i.commandName === 'verify-panel') {
        await community.sendVerifyPanel(i.guild, i.channelId);
        return i.reply({ content: 'Panel sendt ✅', flags: MessageFlags.Ephemeral });
      }
      const mod = commandRoutes[i.commandName];
      if (mod) return await mod.onCommand(i);
    }
    const id = i.customId || '';
    if (id.startsWith('dev:')) return await developer.onInteraction(i);
    if (id.startsWith('ticket:')) return await tickets.onInteraction(i);
    if (id.startsWith('app:')) return await applications.onInteraction(i);
    if (id.startsWith('gw:')) return await giveaways.onInteraction(i);
    if (id === 'verify') return await community.onVerify(i);
  } catch (e) {
    console.error('[interaktion]', e);
    const msg = { content: `⚠️ Der skete en fejl: ${e.message}`, flags: MessageFlags.Ephemeral };
    if (i.isRepliable()) (i.deferred || i.replied ? i.followUp(msg) : i.reply(msg)).catch(() => {});
  }
});

client.on(Events.MessageCreate, async (m) => {
  if (!m.guild || m.author.bot) return;
  try {
    if (await moderation.automod(m)) return;
    if (await community.customCommand(m)) return;
    await community.giveXp(m);
  } catch (e) { console.warn('[besked]', e.message); }
});

client.on(Events.GuildMemberAdd, (m) => community.onJoin(m).catch((e) => console.warn('[join]', e.message)));
client.on(Events.GuildMemberRemove, (m) => community.onLeave(m).catch(() => {}));

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));

async function start() {
  let databaseReady = false;
  try { await initDb(); databaseReady = true; }
  catch (error) { console.error('[database] Opsætning mangler eller forbindelsen fejlede:', error.code || 'Tjek DATABASE_URL'); }
  startWeb(client, { databaseReady });
  if (databaseReady && process.env.DISCORD_TOKEN) await client.login(process.env.DISCORD_TOKEN);
  else console.log('[opsætning] Dashboard kører. Tilføj database og Discord-oplysninger under Environment.');
}
start().catch((error) => { console.error('[start]', error.code || error.name); process.exitCode = 1; });
