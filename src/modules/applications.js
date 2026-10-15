// Ansøgninger / formularer (inspireret af Appy / Tickety):
// panel med knap pr. formular → spørgsmål i en popup → svar til review-kanal med Accepter/Afvis.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { db, settings } = require('../db');
const { embed, isAdmin, sendTo } = require('../util');

const EPH = { flags: MessageFlags.Ephemeral };

async function sendPanel(guild, channelId) {
  const cfg = (await settings.get(guild.id)).applications;
  const forms = cfg.forms.slice(0, 5);
  const row = new ActionRowBuilder().addComponents(forms.map((f) =>
    new ButtonBuilder().setCustomId(`app:start:${f.id}`).setLabel(`Ansøg: ${f.name}`.slice(0, 80)).setStyle(ButtonStyle.Primary)));
  const msg = await sendTo(guild, channelId, { embeds: [embed(cfg.panelTitle, cfg.panelText)], components: forms.length ? [row] : [] });
  if (!msg) throw new Error('Kunne ikke sende panelet – tjek kanal og rettigheder.');
  return msg;
}

async function showForm(interaction, formId) {
  const cfg = (await settings.get(interaction.guild.id)).applications;
  const form = cfg.forms.find((f) => f.id === formId);
  if (!form) return interaction.reply({ content: 'Formularen findes ikke.', ...EPH });
  const pending = (await db.prepare("SELECT id FROM applications WHERE guild_id=? AND user_id=? AND form_id=? AND status='pending'").get(interaction.guild.id, interaction.user.id, form.id));
  if (pending) return interaction.reply({ content: 'Du har allerede en ansøgning der afventer svar.', ...EPH });
  const modal = new ModalBuilder().setCustomId(`app:modal:${form.id}`).setTitle(`Ansøgning: ${form.name}`.slice(0, 45));
  form.questions.filter(Boolean).slice(0, 5).forEach((q, i) => modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
  return interaction.showModal(modal);
}

function reviewRow(id, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app:accept:${id}`).setLabel('Accepter').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`app:deny:${id}`).setLabel('Afvis').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}

async function review(guild, appId, accepted, reviewerId) {
  const app = (await db.prepare('SELECT * FROM applications WHERE id=? AND guild_id=?').get(appId, guild.id));
  if (!app || app.status !== 'pending') throw new Error('Ansøgningen er allerede behandlet.');
  const cfg = (await settings.get(guild.id)).applications;
  const form = cfg.forms.find((f) => f.id === app.form_id);
  (await db.prepare('UPDATE applications SET status=?, reviewed_by=? WHERE id=?').run(accepted ? 'accepted' : 'denied', reviewerId, app.id));
  const member = await guild.members.fetch(app.user_id).catch(() => null);
  if (accepted && member && form?.acceptRole) await member.roles.add(form.acceptRole).catch(() => {});
  if (member) member.send(`Din ansøgning (**${form?.name || app.form_id}**) på **${guild.name}** er ${accepted ? '✅ accepteret' : '❌ afvist'}.`).catch(() => {});
  // Opdater review-beskeden
  const ch = guild.channels.cache.get(app.channel_id);
  const msg = ch && (await ch.messages.fetch(app.message_id).catch(() => null));
  if (msg) {
    const e = embed(msg.embeds[0]?.title, msg.embeds[0]?.description, accepted ? 0x57f287 : 0xed4245).setFields(msg.embeds[0]?.fields || [])
      .setFooter({ text: `${accepted ? 'Accepteret' : 'Afvist'} af ${reviewerId === 'dashboard' ? 'dashboard' : (await guild.client.users.fetch(reviewerId).catch(() => null))?.tag || reviewerId}` });
    await msg.edit({ embeds: [e], components: [reviewRow(app.id, true)] }).catch(() => {});
  }
}

async function onInteraction(interaction) {
  const id = interaction.customId || '';
  if (interaction.isButton() && id.startsWith('app:start:')) return (await showForm(interaction, id.split(':')[2]));
  if (interaction.isModalSubmit() && id.startsWith('app:modal:')) {
    const cfg = (await settings.get(interaction.guild.id)).applications;
    const form = cfg.forms.find((f) => f.id === id.split(':')[2]);
    if (!form) return interaction.reply({ content: 'Formularen findes ikke.', ...EPH });
    const qs = form.questions.filter(Boolean).slice(0, 5);
    const answers = qs.map((_, i) => interaction.fields.getTextInputValue(`q${i}`));
    const info = (await db.prepare('INSERT INTO applications (guild_id, form_id, user_id, answers, created_at) VALUES (?,?,?,?,?)')
      .run(interaction.guild.id, form.id, interaction.user.id, JSON.stringify(answers), Date.now()));
    const e = embed(`Ansøgning #${info.lastInsertRowid}: ${form.name}`, `Fra <@${interaction.user.id}> (${interaction.user.tag})\nKonto oprettet <t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`)
      .addFields(qs.map((q, i) => ({ name: q.slice(0, 256), value: answers[i].slice(0, 1024) || '-' })));
    const msg = await sendTo(interaction.guild, cfg.reviewChannel, { embeds: [e], components: [reviewRow(info.lastInsertRowid)] });
    if (msg) (await db.prepare('UPDATE applications SET message_id=?, channel_id=? WHERE id=?').run(msg.id, msg.channelId, info.lastInsertRowid));
    return interaction.reply({ content: '✅ Din ansøgning er sendt! Du får besked når den er behandlet.', ...EPH });
  }
  if (interaction.isButton() && (id.startsWith('app:accept:') || id.startsWith('app:deny:'))) {
    if (!isAdmin(interaction.member) && !interaction.member.permissions.has('ManageRoles')) return interaction.reply({ content: 'Ingen adgang.', ...EPH });
    await interaction.deferUpdate();
    try { await review(interaction.guild, Number(id.split(':')[2]), id.startsWith('app:accept:'), interaction.user.id); }
    catch (e) { await interaction.followUp({ content: e.message, ...EPH }); }
  }
}

async function onCommand(interaction) {
  if (interaction.options.getSubcommand() === 'panel') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Kræver "Administrer server".', ...EPH });
    await sendPanel(interaction.guild, interaction.channelId);
    return interaction.reply({ content: 'Panel sendt ✅', ...EPH });
  }
}

module.exports = { sendPanel, review, onInteraction, onCommand };
