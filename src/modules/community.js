// Velkomst, auto-roller, verificering, levels og custom commands (inspireret af MEE6 / Appy / Tickety).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { db, settings } = require('../db');
const { embed, fill, memberVars, sendTo } = require('../util');

const EPH = { flags: MessageFlags.Ephemeral };

// ---------- Velkomst ----------
async function welcomePayload(member,cfg){const vars=memberVars(member),e=embed(fill(cfg.title||'Velkommen til {server}',vars),fill(cfg.message,vars));if(cfg.showAvatar!==false)e.setThumbnail(member.user.displayAvatarURL());const payload=await require('./panel-media').decorate(member.guild.id,cfg,e,{content:cfg.mentionMember===false?'':('<@'+member.id+'>'),allowedMentions:{parse:[],users:cfg.mentionMember===false?[]:[member.id]}});if(cfg.imageOnly){delete payload.embeds;if(!cfg.mediaId)payload.content=(payload.content+' '+cfg.imageUrl).trim();}return require('./discord-design').apply(member.guild.id,'welcome',payload);}
async function onJoin(member) {
  const cfg = (await settings.get(member.guild.id)).welcome;
  if (!cfg.enabled) return;
  const vars = memberVars(member);
  if (cfg.channel && (cfg.message||cfg.mediaId||cfg.imageUrl)) {
    await sendTo(member.guild, cfg.channel, await welcomePayload(member,cfg));
  }
  if (cfg.dmMessage) member.send(fill(cfg.dmMessage, vars)).catch(() => {});
  for (const r of cfg.autoRoles.filter(Boolean)) await member.roles.add(r).catch((e) => console.warn('[autorole]', e.message));
}

async function onLeave(member) {
  const cfg = (await settings.get(member.guild.id)).welcome;
  if (!cfg.enabled || !cfg.goodbyeChannel) return;
  await sendTo(member.guild, cfg.goodbyeChannel, fill(cfg.goodbyeMessage, memberVars(member)));
}

// ---------- Verificering ----------
async function sendVerifyPanel(guild, channelId) {
  const cfg = (await settings.get(guild.id)).verification;
  const msg = await sendTo(guild, channelId, await require('./discord-design').apply(guild.id,'verification',{
    embeds: [embed(cfg.panelTitle, cfg.panelText)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify').setLabel('Verificér mig').setEmoji('✅').setStyle(ButtonStyle.Success))],
  }));
  if (!msg) throw new Error('Kunne ikke sende panelet.');
  return msg;
}

async function onVerify(interaction) {
  const cfg = (await settings.get(interaction.guild.id)).verification;
  if (!cfg.enabled || !cfg.role) return interaction.reply({ content: 'Verificering er ikke sat op.', ...EPH });
  const ageDays = (Date.now() - interaction.user.createdTimestamp) / 864e5;
  if (ageDays < cfg.minAccountAgeDays) return interaction.reply({ content: `Din konto skal være mindst ${cfg.minAccountAgeDays} dage gammel.`, ...EPH });
  if (interaction.member.roles.cache.has(cfg.role)) return interaction.reply({ content: 'Du er allerede verificeret.', ...EPH });
  await interaction.member.roles.add(cfg.role);
  return interaction.reply({ content: '✅ Du er nu verificeret!', ...EPH });
}

// ---------- Levels ----------
const xpForLevel = (l) => 5 * l * l + 50 * l + 100; // samme kurve som MEE6
function levelFromXp(xp) {
  let level = 0;
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++; }
  return { level, current: xp, needed: xpForLevel(level) };
}
const cooldowns = new Map();

async function giveXp(message) {
  const cfg = (await settings.get(message.guild.id)).levels;
  if (!cfg.enabled || cfg.noXpChannels.includes(message.channelId)) return;
  const key = `${message.guild.id}:${message.author.id}`;
  if (Date.now() - (cooldowns.get(key) || 0) < cfg.cooldownSeconds * 1000) return;
  cooldowns.set(key, Date.now());
  const gain = cfg.xpMin + Math.floor(Math.random() * (Math.max(cfg.xpMax, cfg.xpMin) - cfg.xpMin + 1));
  const before = (await db.prepare('SELECT xp FROM levels WHERE guild_id=? AND user_id=?').get(message.guild.id, message.author.id))?.xp || 0;
  (await db.prepare('INSERT INTO levels (guild_id, user_id, xp) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp = xp + ?')
    .run(message.guild.id, message.author.id, gain, gain));
  const oldL = levelFromXp(before).level, newL = levelFromXp(before + gain).level;
  if (newL > oldL) {
    const text = fill(cfg.message, memberVars(message.member, { level: newL }));
    if (cfg.announceChannel) await sendTo(message.guild, cfg.announceChannel, text);
    else message.channel.send(text).catch(() => {});
    for (const r of cfg.rewards.filter((x) => x.role && Number(x.level) <= newL)) await message.member.roles.add(r.role).catch(() => {});
  }
}

async function rank(guildId, userId) {
  const xp = (await db.prepare('SELECT xp FROM levels WHERE guild_id=? AND user_id=?').get(guildId, userId))?.xp || 0;
  const pos = (await db.prepare('SELECT COUNT(*) n FROM levels WHERE guild_id=? AND xp > ?').get(guildId, xp)).n + 1;
  return { xp, pos, ...levelFromXp(xp) };
}
async function leaderboard(guildId, limit = 10) {
  return (await db.prepare('SELECT user_id, xp FROM levels WHERE guild_id=? ORDER BY xp DESC LIMIT ?').all(guildId, limit))
    .map((r) => ({ ...r, level: levelFromXp(r.xp).level }));
}

async function onCommand(interaction) {
  if (interaction.commandName === 'rank') {
    const u = interaction.options.getUser('bruger') || interaction.user;
    const r = (await rank(interaction.guild.id, u.id));
    const bar = '█'.repeat(Math.round((r.current / r.needed) * 15)).padEnd(15, '░');
    return interaction.reply({ embeds: [embed(`${u.username} · Level ${r.level}`, `Placering: **#${r.pos}**\n${bar} ${r.current}/${r.needed} XP\nTotal XP: ${r.xp}`).setThumbnail(u.displayAvatarURL())] });
  }
  if (interaction.commandName === 'leaderboard') {
    const rows = (await leaderboard(interaction.guild.id));
    return interaction.reply({ embeds: [embed('🏆 Leaderboard', rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> · Level ${r.level} · ${r.xp} XP`).join('\n') || 'Ingen data endnu.')] });
  }
}

// ---------- Custom commands ----------
async function customCommand(message) {
  const s = (await settings.get(message.guild.id));
  const prefix = s.general.prefix || '!';
  if (!message.content.startsWith(prefix)) return false;
  const name = message.content.slice(prefix.length).split(/\s+/)[0].toLowerCase();
  const cmd = s.custom.commands.find((c) => c.name && c.name.toLowerCase() === name);
  if (!cmd) return false;
  await message.channel.send(fill(cmd.response, memberVars(message.member))).catch(() => {});
  return true;
}

module.exports = { welcomePayload,onJoin, onLeave, sendVerifyPanel, onVerify, giveXp, rank, leaderboard, onCommand, customCommand };
