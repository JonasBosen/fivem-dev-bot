// Moderation + automod (inspireret af MEE6 / Tickety):
// warn/kick/ban/timeout/clear, forbudte ord, link-filter, anti-spam, honeypot-kanal, mod-log.
const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db, settings } = require('../db');
const { embed, hasAnyRole, sendTo, parseDuration } = require('../util');

const EPH = { flags: MessageFlags.Ephemeral };
const recent = new Map(); // anti-spam: userKey -> timestamps

async function modLog(guild, title, text, color = 0xfaa61a) {
  const cfg = (await settings.get(guild.id)).moderation;
  return sendTo(guild, cfg.modLogChannel, { embeds: [embed(title, text, color).setTimestamp()] });
}

async function addWarning(guildId, userId, modId, reason) {
  (await db.prepare('INSERT INTO warnings (guild_id, user_id, mod_id, reason, created_at) VALUES (?,?,?,?,?)').run(guildId, userId, modId, reason, Date.now()));
}

// Returnerer true hvis beskeden blev fjernet
async function automod(message) {
  const cfg = (await settings.get(message.guild.id)).moderation;
  if (!cfg.enabled) return false;
  const m = message.member;
  if (!m) return false;

  // Honeypot: alle der skriver her (undtagen staff) bliver soft-bannet (beskeder slettes)
  if (cfg.honeypotChannel && message.channelId === cfg.honeypotChannel && !m.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.guild.members.ban(m.id, { deleteMessageSeconds: 3600, reason: 'Honeypot-kanal' }).catch(() => {});
    await message.guild.members.unban(m.id, 'Soft-ban (honeypot)').catch(() => {});
    (await modLog(message.guild, '🍯 Honeypot', `${message.author.tag} (${m.id}) skrev i honeypot-kanalen og blev fjernet.`, 0xed4245));
    return true;
  }

  if (m.permissions.has(PermissionFlagsBits.ManageMessages) || hasAnyRole(m, cfg.exemptRoles)) return false;
  const content = message.content.toLowerCase();

  const bad = cfg.badWords.filter(Boolean).find((w) => content.includes(w.toLowerCase()));
  if (bad) return punish(message, 'Forbudt ord');

  if (cfg.blockLinks) {
    const links = content.match(/https?:\/\/[^\s/]+|discord\.gg\/\S+/g) || [];
    const blocked = links.some((l) => !cfg.allowedDomains.some((d) => d && l.replace(/^https?:\/\//, '').replace(/^www\./, '').endsWith(d.toLowerCase())));
    if (blocked) return punish(message, 'Link ikke tilladt');
  }

  if (cfg.antiSpam) {
    const key = `${message.guild.id}:${m.id}`;
    const now = Date.now();
    const list = (recent.get(key) || []).filter((t) => now - t < cfg.spamSeconds * 1000);
    list.push(now);
    recent.set(key, list);
    if (list.length >= cfg.spamMessages) {
      recent.delete(key);
      await m.timeout(5 * 60_000, 'Spam').catch(() => {});
      (await modLog(message.guild, '⏱️ Auto-timeout', `${message.author.tag} fik 5 min timeout for spam.`));
      return punish(message, 'Spam', false);
    }
  }
  return false;
}

async function punish(message, reason, warn = true) {
  await message.delete().catch(() => {});
  if (warn) (await addWarning(message.guild.id, message.author.id, message.client.user.id, `Automod: ${reason}`));
  const n = await message.channel.send(`${message.author}, din besked blev fjernet (${reason}).`).catch(() => null);
  if (n) setTimeout(() => n.delete().catch(() => {}), 5000);
  (await modLog(message.guild, '🛡️ Automod', `**${reason}** · ${message.author.tag} i ${message.channel}\n> ${message.content.slice(0, 300)}`));
  return true;
}

async function onCommand(interaction) {
  const { commandName: cmd, options, guild } = interaction;
  const user = options.getUser('bruger');
  const reason = options.getString('årsag') || 'Ingen årsag angivet';
  const member = user ? await guild.members.fetch(user.id).catch(() => null) : null;
  if (member && member.roles.highest.position >= interaction.member.roles.highest.position && guild.ownerId !== interaction.user.id) {
    return interaction.reply({ content: 'Du kan ikke moderere en med samme eller højere rolle.', ...EPH });
  }
  try {
    switch (cmd) {
      case 'warn':
        (await addWarning(guild.id, user.id, interaction.user.id, reason));
        user.send(`⚠️ Du har fået en advarsel på **${guild.name}**: ${reason}`).catch(() => {});
        await (await modLog(guild, '⚠️ Advarsel', `${user.tag} af ${interaction.user.tag}\nÅrsag: ${reason}`));
        return interaction.reply(`⚠️ ${user} har fået en advarsel: ${reason}`);
      case 'warnings': {
        const rows = (await db.prepare('SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 15').all(guild.id, user.id));
        return interaction.reply({ embeds: [embed(`Advarsler for ${user.tag}`, rows.map((r) => `**#${r.id}** <t:${Math.floor(r.created_at / 1000)}:d> · ${r.reason} (af <@${r.mod_id}>)`).join('\n') || 'Ingen advarsler.')], ...EPH });
      }
      case 'kick':
        if (!member) throw new Error('Brugeren er ikke på serveren.');
        await member.kick(reason);
        await (await modLog(guild, '👢 Kick', `${user.tag} af ${interaction.user.tag}\nÅrsag: ${reason}`, 0xed4245));
        return interaction.reply(`👢 ${user.tag} er kicket.`);
      case 'ban':
        await guild.members.ban(user.id, { reason, deleteMessageSeconds: (options.getInteger('slet_dage') || 0) * 86400 });
        await (await modLog(guild, '🔨 Ban', `${user.tag} af ${interaction.user.tag}\nÅrsag: ${reason}`, 0xed4245));
        return interaction.reply(`🔨 ${user.tag} er bannet.`);
      case 'unban':
        await guild.members.unban(options.getString('bruger_id'), reason);
        return interaction.reply('✅ Unbannet.');
      case 'timeout': {
        if (!member) throw new Error('Brugeren er ikke på serveren.');
        const ms = parseDuration(options.getString('varighed'));
        if (!ms || ms > 28 * 864e5) throw new Error('Ugyldig varighed (maks 28d). Eks: 10m, 2h, 1d');
        await member.timeout(ms, reason);
        await (await modLog(guild, '⏱️ Timeout', `${user.tag} i ${options.getString('varighed')} af ${interaction.user.tag}\nÅrsag: ${reason}`));
        return interaction.reply(`⏱️ ${user.tag} har fået timeout.`);
      }
      case 'clear': {
        const n = Math.min(Math.max(options.getInteger('antal'), 1), 100);
        const del = await interaction.channel.bulkDelete(n, true);
        return interaction.reply({ content: `🧹 Slettede ${del.size} beskeder.`, ...EPH });
      }
    }
  } catch (e) {
    return interaction.reply({ content: `Fejl: ${e.message}`, ...EPH });
  }
}

module.exports = { automod, onCommand, modLog };
