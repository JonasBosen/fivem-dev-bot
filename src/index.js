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
const musicFleet=require('./modules/music-fleet');
const stream = require('./modules/stream-platforms');
const { startWeb } = require('./web/server');
const { initDb,db } = require('./db');

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
  fødselsdag:require('./modules/community-studios'),
  stream,
  fejlbillede: developer, fejlsvar: developer, fejl: developer, fejlstatus: developer, warn: moderation, warnings: moderation, kick: moderation, ban: moderation, unban: moderation, timeout: moderation, clear: moderation,
  ticket: tickets, application: applications, giveaway: giveaways,
  play: musicFleet, next: musicFleet, skip: musicFleet, pause: musicFleet, resume: musicFleet, stop: musicFleet, shuffle: musicFleet, queue: musicFleet, nowplaying: musicFleet, volume: musicFleet, loop: musicFleet,
};

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] Logget ind som ${c.user.tag} på ${c.guilds.cache.size} servere`);
  c.user.setActivity('/play · /ticket · dashboard', { type: ActivityType.Listening });
  await register(c.user.id).catch((e) => console.error('[kommandoer]', e.message));
  giveaways.startTimer(c);
  stream.startPolling(c);
  require('./modules/community-studios').start(c);
  require('./modules/developer-wishes').ensureBesideDeveloperPanel(c).catch(e=>console.warn('[ønskepanel]',e.code||e.message));
  require('./modules/report-panel').refreshPanels(c).catch(e=>console.warn('[fejlpanel]',e.message));
  music.init(c).then(()=>musicFleet.init(c)).catch((e) => console.error('[musik]', e.message));
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if(/^dev:(reply|replysubmit):/.test(i.customId||''))return await developer.onDirectReply(i,client);
    if(!i.inGuild())return;
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
    if(id.startsWith('birthday:'))return await require('./modules/community-studios').onInteraction(i);
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
    if (await musicFleet.onMessage(m)) return;
    if (await community.customCommand(m)) return;

  } catch (e) { console.warn('[besked]', e.message); }
});

client.on(Events.GuildMemberAdd,m=>{community.onJoin(m).catch(e=>console.warn('[join]',e.message));require('./modules/members-panel').record(m,'joined').catch(e=>console.warn('[medlem]',e.message));});
client.on(Events.GuildMemberRemove,m=>{community.onLeave(m).catch(()=>{});require('./modules/members-panel').record(m,'left').catch(e=>console.warn('[medlem]',e.message));});

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));

client.on(Events.Error,error=>console.warn('[discord]',error.code||error.name));
client.on(Events.ShardError,error=>console.warn('[discord-forbindelse]',error.code||error.name));
const runtime=require('./service-runtime').createRuntime({initDb,probe:()=>db.prepare('SELECT data FROM settings WHERE guild_id = ?').get('__runtime_check__'),isReady:()=>!process.env.DISCORD_TOKEN||client.isReady(),connect:()=>client.login(process.env.DISCORD_TOKEN)});
const web=startWeb(client,{runtime,listen:false});const server=web.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('[dashboard] Serveren lytter på HTTP'));
runtime.start().catch(error=>console.error('[start]',error.code||error.name));
let stopping=false;async function shutdown(){if(stopping)return;stopping=true;runtime.stop();const deadline=setTimeout(()=>process.exit(0),10000);deadline.unref();server.close();await client.destroy();await db.close();clearTimeout(deadline);process.exit(0);}
process.once('SIGTERM',()=>shutdown().catch(()=>process.exit(1)));
process.once('SIGINT',()=>shutdown().catch(()=>process.exit(1)));
