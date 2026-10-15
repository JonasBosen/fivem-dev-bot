// Tickets (inspireret af Ticket Tool / Tickety / Appy):
// panel med kategorier, spørgsmål før ticket åbnes, claim, luk, transcript gemt i databasen.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const { db, settings } = require('../db');
const { embed, fill, memberVars, hasAnyRole, isAdmin, sendTo, escapeHtml } = require('../util');

const EPH = { flags: MessageFlags.Ephemeral };

function panelPayload(cfg) {
  const types = cfg.types.slice(0, 25);
  let row;
  if (types.length <= 5) {
    row = new ActionRowBuilder().addComponents(types.map((t) => {
      const b = new ButtonBuilder().setCustomId(`ticket:open:${t.id}`).setLabel(t.label.slice(0, 80)).setStyle({blue:ButtonStyle.Primary,green:ButtonStyle.Success,red:ButtonStyle.Danger,gray:ButtonStyle.Secondary}[t.color]||ButtonStyle.Primary);
      if (t.emoji) b.setEmoji(t.emoji);
      return b;
    }));
  } else {
    row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:select').setPlaceholder('Vælg kategori')
      .addOptions(types.map((t) => ({ label: t.label.slice(0, 100), value: t.id, ...(t.emoji ? { emoji: t.emoji } : {}) }))));
  }
  return { embeds: [embed(cfg.panelTitle, cfg.panelText)], components: types.length ? [row] : [] };
}

async function sendPanel(guild, channelId) {
  const cfg = (await settings.get(guild.id)).tickets;
  const msg = await sendTo(guild, channelId, await require('./panel-media').decorate(guild.id,cfg,embed(cfg.panelTitle,cfg.panelText),panelPayload(cfg)));
  if (!msg) throw new Error('Kunne ikke sende panelet – tjek kanal og botens rettigheder.');
  return msg;
}

function isStaff(member, cfg, typeId) {
  return isAdmin(member) || hasAnyRole(member,[...cfg.supportRoles,...(cfg.types.find(t=>t.id===typeId)?.supportRoles||[])]);
}

async function startOpen(interaction, typeId) {
  const cfg = (await settings.get(interaction.guild.id)).tickets;
  if (!cfg.enabled) return interaction.reply({ content: 'Tickets er slået fra.', ...EPH });
  const type = cfg.types.find((t) => t.id === typeId);
  if (!type) return interaction.reply({ content: 'Denne kategori findes ikke længere.', ...EPH });

  const open = (await db.prepare("SELECT COUNT(*) n FROM tickets WHERE guild_id=? AND user_id=? AND status='open'").get(interaction.guild.id, interaction.user.id)).n;
  if (open >= (cfg.maxOpenPerUser || 1)) return interaction.reply({ content: `Du har allerede ${open} åben ticket.`, ...EPH });

  const questions = (type.questions || []).filter(Boolean).slice(0, 5);
  if (questions.length) {
    const modal = new ModalBuilder().setCustomId(`ticket:modal:${type.id}`).setTitle(type.label.slice(0, 45));
    questions.forEach((q, i) => modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
    return interaction.showModal(modal);
  }
  await interaction.deferReply(EPH);
  const ch = await createTicket(interaction.member, type, []);
  return interaction.editReply(`Din ticket er oprettet: ${ch}`);
}

async function createTicket(member, type, answers) {
  const guild = member.guild;
  const cfg = (await settings.get(guild.id)).tickets;
  if(!cfg.enabled)throw new Error('Supportsager er slået fra');
  type=cfg.types.find(t=>t.id===type.id);if(!type)throw new Error('Kategorien findes ikke længere');
  const supportRoles=[...new Set([...cfg.supportRoles,...(type.supportRoles||[])])];
  const open=await db.prepare("SELECT COUNT(*) n FROM tickets WHERE guild_id=? AND user_id=? AND status='open'").get(guild.id,member.id);if(Number(open.n)>=(cfg.maxOpenPerUser||1))throw new Error('Du har nået grænsen for åbne supportsager');
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
    ...supportRoles.filter((r) => guild.roles.cache.has(r)).map((r) => ({
      id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    })),
  ];
  const parentId=type.categoryId||cfg.categoryId;const parent=parentId&&guild.channels.cache.get(parentId)?.type===ChannelType.GuildCategory?parentId:null;
  const info = (await db.prepare('INSERT INTO tickets (guild_id, user_id, type, answers, created_at) VALUES (?,?,?,?,?)')
    .run(guild.id, member.id, type.id, JSON.stringify(answers), Date.now()));
  const id = info.lastInsertRowid;
  const name = `${type.id}-${id}-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
  const channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites, topic: `Ticket #${id} · ${member.user.tag}` });
  (await db.prepare('UPDATE tickets SET channel_id=? WHERE id=?').run(channel.id, id));

  const e = embed(`${type.emoji || '🎫'} ${type.label} · #${id}`, fill(cfg.openMessage, memberVars(member)));
  (type.questions || []).slice(0, 5).forEach((q, i) => answers[i] && e.addFields({ name: q.slice(0, 256), value: answers[i].slice(0, 1024) }));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Luk').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Tag sagen').setEmoji('🙌').setStyle(ButtonStyle.Success),
  );
  const pings = [`<@${member.id}>`, ...supportRoles.filter(Boolean).map((r) => `<@&${r}>`)].join(' ');
  const components=[row];if(cfg.quickResponses?.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:quick').setPlaceholder('Hurtigsvar til borgeren (support)').addOptions(cfg.quickResponses.slice(0,25).map((q,i)=>({label:q.label.slice(0,100),value:String(i)})))));
  await channel.send({ content:pings,embeds:[e],components,allowedMentions:{parse:[],users:[member.id],roles:supportRoles} });
  await sendTo(guild, cfg.logChannel, { embeds: [embed('Ticket åbnet', `#${id} · ${type.label} · <@${member.id}> · ${channel}`)] });
  return channel;
}

async function buildTranscript(channel, ticket) {
  let all = [], before;
  for (let i = 0; i < 10; i++) { // op til 1000 beskeder
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all = all.reverse();
  const rows = all.map((m) => {
    const files = [...m.attachments.values()].map((a) => `<a href="${escapeHtml(a.url)}">📎 ${escapeHtml(a.name)}</a>`).join(' ');
    const embeds = m.embeds.map((e) => `<div class="em"><b>${escapeHtml(e.title || '')}</b><br>${escapeHtml(e.description || '')}${(e.fields || []).map((f) => `<br><b>${escapeHtml(f.name)}</b>: ${escapeHtml(f.value)}`).join('')}</div>`).join('');
    return `<div class="m"><img src="${escapeHtml(m.author.displayAvatarURL({ size: 64 }))}"><div><span class="a">${escapeHtml(m.author.tag)}</span> <span class="t">${new Date(m.createdTimestamp).toLocaleString('da-DK')}</span><div>${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>${embeds}${files}</div></div>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Ticket #${ticket.id}</title><style>body{font-family:system-ui;background:#313338;color:#dbdee1;padding:20px;max-width:900px;margin:auto}.m{display:flex;gap:12px;margin:14px 0}.m img{width:40px;height:40px;border-radius:50%}.a{font-weight:600;color:#fff}.t{color:#949ba4;font-size:12px}.em{border-left:4px solid #5865f2;background:#2b2d31;padding:8px;margin-top:4px;border-radius:4px}a{color:#00a8fc}</style><h2>Ticket #${ticket.id} · ${escapeHtml(channel.name)}</h2>${rows}`;
}

async function closeTicket(guild, ticket, closerId, reason = '') {
  const cfg = (await settings.get(guild.id)).tickets;
  const channel = guild.channels.cache.get(ticket.channel_id);
  let transcript = '';
  if (channel) transcript = await buildTranscript(channel, ticket).catch(() => '');
  (await db.prepare("UPDATE tickets SET status='closed', closed_at=?, closed_by=?, transcript=? WHERE id=?").run(Date.now(), closerId, transcript, ticket.id));
  const file = transcript ? [new AttachmentBuilder(Buffer.from(transcript), { name: `ticket-${ticket.id}.html` })] : [];
  await sendTo(guild, cfg.logChannel, { embeds: [embed('Ticket lukket', `#${ticket.id} · åbnet af <@${ticket.user_id}> · lukket af <@${closerId}>${reason ? `\nÅrsag: ${reason}` : ''}`, 0xed4245)], files: file });
  const user = await guild.client.users.fetch(ticket.user_id).catch(() => null);
  if (user) user.send({ content: `Din ticket #${ticket.id} på **${guild.name}** er lukket.`, files: file }).catch(() => {});
  if (channel) setTimeout(() => channel.delete('Ticket lukket').catch(() => {}), 4000);
}

async function ticketByChannel(channelId) {
  return (await db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(channelId));
}

async function onInteraction(interaction) {
  const id = interaction.customId || '';
  if (interaction.isButton() && id.startsWith('ticket:open:')) return startOpen(interaction, id.split(':')[2]);
  if (interaction.isStringSelectMenu() && id === 'ticket:select') return startOpen(interaction, interaction.values[0]);
  if (interaction.isModalSubmit() && id.startsWith('ticket:modal:')) {
    const cfg = (await settings.get(interaction.guild.id)).tickets;
    const type = cfg.types.find((t) => t.id === id.split(':')[2]);
    if (!type) return interaction.reply({ content: 'Kategorien findes ikke længere.', ...EPH });
    await interaction.deferReply(EPH);
    const answers = (type.questions || []).slice(0, 5).map((_, i) => interaction.fields.getTextInputValue(`q${i}`));
    const ch = await createTicket(interaction.member, type, answers);
    return interaction.editReply(`Din ticket er oprettet: ${ch}`);
  }
  if(id==='ticket:quick'&&interaction.isStringSelectMenu()){const ticket=await ticketByChannel(interaction.channelId),cfg=(await settings.get(interaction.guild.id)).tickets;if(!ticket||!isStaff(interaction.member,cfg,ticket.type))return interaction.reply({content:'Kun support kan sende hurtigsvar.',...EPH});const answer=cfg.quickResponses?.[Number(interaction.values[0])];if(!answer)throw new Error('Hurtigsvaret findes ikke længere');return interaction.reply({content:answer.text,allowedMentions:{parse:[]}});}
  if (interaction.isButton() && (id === 'ticket:close' || id === 'ticket:claim')) {
    const ticket = (await ticketByChannel(interaction.channelId));
    if (!ticket) return interaction.reply({ content: 'Dette er ikke en åben ticket.', ...EPH });
    const cfg = (await settings.get(interaction.guild.id)).tickets;
    if (id === 'ticket:claim') {
      if (!isStaff(interaction.member,cfg,ticket.type)) return interaction.reply({ content: 'Kun support kan claime.', ...EPH });
      (await db.prepare('UPDATE tickets SET claimed_by=? WHERE id=?').run(interaction.user.id, ticket.id));
      return interaction.reply({ embeds: [embed(null, `🙌 <@${interaction.user.id}> har taget denne ticket.`)] });
    }
    if (!isStaff(interaction.member, cfg) && interaction.user.id !== ticket.user_id) return interaction.reply({ content: 'Du kan ikke lukke denne ticket.', ...EPH });
    await interaction.reply({ embeds: [embed(null, '🔒 Ticket lukkes og transcript gemmes…', 0xed4245)] });
    return closeTicket(interaction.guild, ticket, interaction.user.id);
  }
}

async function onCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = (await settings.get(interaction.guild.id)).tickets;
  if (sub === 'panel') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Kræver "Administrer server".', ...EPH });
    await sendPanel(interaction.guild, interaction.channelId);
    return interaction.reply({ content: 'Panel sendt ✅', ...EPH });
  }
  const ticket = (await ticketByChannel(interaction.channelId));
  if (!ticket) return interaction.reply({ content: 'Brug kommandoen i en åben ticket.', ...EPH });
  if (!isStaff(interaction.member, cfg) && sub !== 'close') return interaction.reply({ content: 'Kun support.', ...EPH });
  if (sub === 'close') {
    if (!isStaff(interaction.member, cfg) && interaction.user.id !== ticket.user_id) return interaction.reply({ content: 'Ingen adgang.', ...EPH });
    await interaction.reply('🔒 Lukker ticket…');
    return closeTicket(interaction.guild, ticket, interaction.user.id, interaction.options.getString('årsag') || '');
  }
  const user = interaction.options.getUser('bruger');
  if (sub === 'add') {
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    return interaction.reply(`➕ ${user} er tilføjet.`);
  }
  if (sub === 'remove') {
    await interaction.channel.permissionOverwrites.delete(user.id);
    return interaction.reply(`➖ ${user} er fjernet.`);
  }
}

module.exports = { sendPanel, closeTicket, onInteraction, onCommand };
