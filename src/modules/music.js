// Musik (inspireret af Jockie Music): play/kø/skip/pause/loop/shuffle/lydstyrke + styring fra dashboardet.
// Kilder: SoundCloud, Spotify, Apple Music, Vimeo, filer m.m. via @discord-player/extractor.
// YouTube via discord-player-youtubei; Spotify-metadata bridges til en understøttet lydkilde.
const { Player, QueueRepeatMode } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { MessageFlags } = require('discord.js');
const { settings } = require('../db');
const { embed, isAdmin, hasAnyRole } = require('../util');

function createMusicService() {
const EPH = { flags: MessageFlags.Ephemeral };
let player;

async function init(client) {
  player = new Player(client);
  await player.extractors.loadMulti(DefaultExtractors);
  try { // YouTube-understøttelse
    const { YoutubeExtractor } = require('discord-player-youtubei');
    await player.extractors.register(YoutubeExtractor, {});
    console.log('[musik] YouTube aktiveret');
  } catch (e) { console.warn('[musik] YouTube kunne ikke startes:',e.message); }

  player.events.on('playerStart', async (queue, track) => {
    const cfg = (await settings.get(queue.guild.id)).music;
    if (cfg.announceSongs && queue.metadata?.channel) {
      queue.metadata.channel.send({ embeds: [embed('🎶 Spiller nu', `[${track.title}](${track.url}) · ${track.author}\n⏱️ ${track.duration}`).setThumbnail(track.thumbnail || null)] }).catch(() => {});
    }
  });
  player.events.on('error', (q, e) => console.warn('[musik]', e.message));
  player.events.on('playerError', (q, e) => {
    console.warn('[musik afspilning]', e.message);
    q.metadata?.channel?.send('⚠️ Kunne ikke afspille sangen, springer over.').catch(() => {});
  });
}

const queueOf = (guildId) => player?.nodes.get(guildId) || null;

async function canControl(member) {
  const cfg = (await settings.get(member.guild.id)).music;
  return !cfg.djRole || isAdmin(member) || hasAnyRole(member, [cfg.djRole]);
}

async function play(guild, voiceChannel, query, textChannel, requestedBy) {
  const cfg = (await settings.get(guild.id)).music;
  if (!cfg.enabled) throw new Error('Musik er slået fra på denne server.');
  const { track, searchResult } = await player.play(voiceChannel, query, {
    requestedBy,
    nodeOptions: {
      metadata: { channel: textChannel },
      volume: cfg.defaultVolume,
      leaveOnEmpty: cfg.leaveOnEmpty,
      leaveOnEmptyCooldown: 60_000,
      leaveOnEnd: true,
      leaveOnEndCooldown: 120_000,
      maxSize: cfg.maxQueue,
      selfDeaf: true,
    },
  });
  return { track, playlist: searchResult.playlist };
}

function state(guildId) {
  const q = queueOf(guildId);
  if (!q || !q.currentTrack) return { playing: false, queue: [] };
  const t = q.currentTrack;
  return {
    playing: true,
    paused: q.node.isPaused(),
    volume: q.node.volume,
    repeat: ['off', 'track', 'queue', 'autoplay'][q.repeatMode] || 'off',
    voiceChannel: q.channel?.name,
    current: { title: t.title, author: t.author, url: t.url, duration: t.duration, thumbnail: t.thumbnail, progress: q.node.getTimestamp()?.current?.label },
    queue: q.tracks.toArray().slice(0, 50).map((x) => ({ title: x.title, author: x.author, duration: x.duration, url: x.url })),
  };
}

function control(guildId, action, value) {
  const q = queueOf(guildId);
  if (!q) throw new Error('Der spilles ikke noget.');
  switch (action) {
    case 'skip': q.node.skip(); break;
    case 'pause': q.node.pause(); break;
    case 'resume': q.node.resume(); break;
    case 'stop': q.delete(); break;
    case 'shuffle': q.tracks.shuffle(); break;
    case 'clear': q.tracks.clear(); break;
    case 'volume': q.node.setVolume(Math.min(Math.max(Number(value) || 0, 0), 150)); break;
    case 'remove': q.removeTrack(Number(value)); break;
    case 'loop': q.setRepeatMode({ off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE, autoplay: QueueRepeatMode.AUTOPLAY }[value] ?? QueueRepeatMode.OFF); break;
    default: throw new Error('Ukendt handling');
  }
}

async function onCommand(interaction) {
  const name = interaction.commandName;
  if (!(await canControl(interaction.member))) return interaction.reply({ content: 'Du skal have DJ-rollen.', ...EPH });
  try {
    if (name === 'play') {
      const vc = interaction.member.voice.channel;
      if (!vc) return interaction.reply({ content: 'Gå ind i en talekanal først.', ...EPH });
      const q = queueOf(interaction.guild.id);
      if (q?.channel && q.channel.id !== vc.id) return interaction.reply({ content: `Jeg spiller allerede i ${q.channel}.`, ...EPH });
      await interaction.deferReply();
      const { track, playlist } = await play(interaction.guild, vc, interaction.options.getString('sang'), interaction.channel, interaction.user);
      return interaction.editReply({ embeds: [embed('➕ Tilføjet', playlist ? `Playliste **${playlist.title}** (${playlist.tracks.length} sange)` : `[${track.title}](${track.url}) · ${track.duration}`)] });
    }
    const map = { next:'skip', skip: 'skip', pause: 'pause', resume: 'resume', stop: 'stop', shuffle: 'shuffle' };
    if (map[name]) { control(interaction.guild.id, map[name]); return interaction.reply(`✅ ${name}`); }
    if (name === 'volume') { control(interaction.guild.id, 'volume', interaction.options.getInteger('procent')); return interaction.reply(`🔊 Lydstyrke: ${interaction.options.getInteger('procent')}%`); }
    if (name === 'loop') { control(interaction.guild.id, 'loop', interaction.options.getString('tilstand')); return interaction.reply(`🔁 Loop: ${interaction.options.getString('tilstand')}`); }
    if (name === 'queue' || name === 'nowplaying') {
      const s = state(interaction.guild.id);
      if (!s.playing) return interaction.reply({ content: 'Der spilles ikke noget.', ...EPH });
      const list = s.queue.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.title} · ${t.duration}`).join('\n');
      return interaction.reply({ embeds: [embed('🎶 Spiller nu', `[${s.current.title}](${s.current.url}) · ${s.current.progress || ''}/${s.current.duration}${name === 'queue' ? `\n\n**Kø (${s.queue.length}):**\n${list || 'Tom'}` : ''}`).setThumbnail(s.current.thumbnail || null)] });
    }
  } catch (e) {
    return interaction.deferred ? interaction.editReply({ content: `⚠️ ${e.message}` }) : interaction.reply({ content: `⚠️ ${e.message}`, ...EPH });
  }
}

return { init, play, state, control, onCommand };
}
module.exports = { ...createMusicService(), createMusicService };
