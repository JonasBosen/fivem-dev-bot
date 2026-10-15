// Giveaways (inspireret af Appy / Tickety): knap for at deltage, automatisk trækning, reroll.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { db, settings } = require('../db');
const { embed, isAdmin, hasAnyRole, sendTo, parseDuration } = require('../util');

const EPH = { flags: MessageFlags.Ephemeral };

function gwEmbed(g, entries) {
  const ended = g.ended;
  return embed(`🎉 ${g.prize}`, ended
    ? `Slut! Vinder(e): ${g.winner_ids ? JSON.parse(g.winner_ids).map((w) => `<@${w}>`).join(', ') || 'ingen' : 'ingen'}`
    : `Tryk på knappen for at deltage!\nSlutter: <t:${Math.floor(g.ends_at / 1000)}:R>\nVindere: **${g.winners}**\nVært: <@${g.host_id}>`, ended ? 0x99aab5 : 0xfee75c)
    .setFooter({ text: `Deltagere: ${entries.length} · ID ${g.id}` });
}
function gwRow(g, n) {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw:join:${g.id}`).setEmoji('🎉').setLabel(`Deltag (${n})`).setStyle(ButtonStyle.Primary).setDisabled(!!g.ended));
}

async function start(guild, channelId, prize, durationMs, winners, hostId) {
  const ends = Date.now() + durationMs;
  const info = (await db.prepare('INSERT INTO giveaways (guild_id, channel_id, prize, winners, ends_at, host_id) VALUES (?,?,?,?,?,?)')
    .run(guild.id, channelId, prize, winners, ends, hostId));
  const g = (await db.prepare('SELECT * FROM giveaways WHERE id=?').get(info.lastInsertRowid));
  const msg = await sendTo(guild, channelId, { embeds: [gwEmbed(g, [])], components: [gwRow(g, 0)] });
  if (!msg) { (await db.prepare('DELETE FROM giveaways WHERE id=?').run(g.id)); throw new Error('Kunne ikke sende i kanalen.'); }
  (await db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(msg.id, g.id));
  return g.id;
}

function pick(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

async function end(client, id, reroll = false) {
  const g = (await db.prepare('SELECT * FROM giveaways WHERE id=?').get(id));
  if (!g) throw new Error('Giveaway findes ikke.');
  if (g.ended && !reroll) throw new Error('Allerede slut.');
  const entries = JSON.parse(g.entries);
  const winners = pick(entries, g.winners);
  (await db.prepare('UPDATE giveaways SET ended=1, winner_ids=? WHERE id=?').run(JSON.stringify(winners), id));
  const guild = client.guilds.cache.get(g.guild_id);
  if (!guild) return winners;
  const updated = (await db.prepare('SELECT * FROM giveaways WHERE id=?').get(id));
  const ch = guild.channels.cache.get(g.channel_id);
  const msg = ch && (await ch.messages.fetch(g.message_id).catch(() => null));
  if (msg) await msg.edit({ embeds: [gwEmbed(updated, entries)], components: [gwRow(updated, entries.length)] }).catch(() => {});
  await sendTo(guild, g.channel_id, winners.length
    ? `🎉 Tillykke ${winners.map((w) => `<@${w}>`).join(', ')}! I har vundet **${g.prize}**${reroll ? ' (reroll)' : ''}!`
    : `Ingen deltog i **${g.prize}** 😢`);
  return winners;
}

function startTimer(client) {
  setInterval(async () => {
    const due = (await db.prepare('SELECT id FROM giveaways WHERE ended=0 AND ends_at<=?').all(Date.now()));
    for (const g of due) end(client, g.id).catch((e) => console.warn('[giveaway]', e.message));
  }, 15_000);
}

async function canManage(member) {
  const cfg = (await settings.get(member.guild.id)).giveaways;
  return isAdmin(member) || hasAnyRole(member, [cfg.managerRole]);
}

async function onInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('gw:join:')) return;
  const id = Number(interaction.customId.split(':')[2]);
  const g = (await db.prepare('SELECT * FROM giveaways WHERE id=?').get(id));
  if (!g || g.ended) return interaction.reply({ content: 'Denne giveaway er slut.', ...EPH });
  let entries = JSON.parse(g.entries);
  const joined = entries.includes(interaction.user.id);
  entries = joined ? entries.filter((e) => e !== interaction.user.id) : [...entries, interaction.user.id];
  (await db.prepare('UPDATE giveaways SET entries=? WHERE id=?').run(JSON.stringify(entries), id));
  await interaction.update({ embeds: [gwEmbed(g, entries)], components: [gwRow(g, entries.length)] });
  return interaction.followUp({ content: joined ? 'Du er meldt fra.' : 'Du deltager nu! 🍀', ...EPH });
}

async function onCommand(interaction) {
  if (!(await canManage(interaction.member))) return interaction.reply({ content: 'Ingen adgang.', ...EPH });
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === 'start') {
      const ms = parseDuration(interaction.options.getString('varighed'));
      if (!ms) return interaction.reply({ content: 'Ugyldig varighed. Eksempler: 30m, 2h, 1d', ...EPH });
      const id = await start(interaction.guild, interaction.channelId, interaction.options.getString('præmie'), ms, interaction.options.getInteger('vindere') || 1, interaction.user.id);
      return interaction.reply({ content: `Giveaway #${id} startet ✅`, ...EPH });
    }
    const id = interaction.options.getInteger('id');
    await end(interaction.client, id, sub === 'reroll');
    return interaction.reply({ content: 'Færdig ✅', ...EPH });
  } catch (e) { return interaction.reply({ content: e.message, ...EPH }); }
}

module.exports = { start, end, startTimer, onInteraction, onCommand };
