require('dotenv').config();
const fs = require('fs');
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, Events,
} = require('discord.js');

const {
  DISCORD_TOKEN, CLIENT_ID, GUILD_ID, DEV_ROLE_ID, LOG_CHANNEL_ID, REVIEW_CHANNEL_ID,
} = process.env;

for (const [k, v] of Object.entries({ DISCORD_TOKEN, CLIENT_ID, GUILD_ID, DEV_ROLE_ID, LOG_CHANNEL_ID, REVIEW_CHANNEL_ID })) {
  if (!v) { console.error(`Mangler ${k} i .env`); process.exit(1); }
}

/* ------------------------------ Database (JSON) ------------------------------ */

const store = require('./store');
const db = { counter: 0, tasks: {}, panels: [] }; // fyldes ved opstart fra store.load()
const save = () => store.save(db);

/* --------------------------------- Konstanter -------------------------------- */

const STATUS = {
  todo:     { label: 'Ikke startet', emoji: '🔴', color: 0xe74c3c },
  doing:    { label: 'I gang',       emoji: '🟡', color: 0xf1c40f },
  done:     { label: 'Færdig',       emoji: '🟢', color: 0x2ecc71 },
  rejected: { label: 'Afvist',       emoji: '⚫', color: 0x7f8c8d },
};
const PAGE = 10;
const EPHEMERAL = MessageFlags.Ephemeral;
const ticketCooldown = new Map();

/* ---------------------------------- Helpers ---------------------------------- */

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const row = (...c) => new ActionRowBuilder().addComponents(...c);
const ts = (d) => `<t:${Math.floor(new Date(d).getTime() / 1000)}:f>`;

function isDev(member) {
  return !!member && (member.roles.cache.has(DEV_ROLE_ID) || member.permissions.has(PermissionFlagsBits.Administrator));
}

function addLog(task, userId, action, text) {
  const entry = { at: new Date().toISOString(), user: userId, action, text: text || '' };
  task.log.push(entry);
  task.updatedAt = entry.at;
  return entry;
}

async function sendLog(client, task, entry) {
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setColor(STATUS[task.status].color)
      .setTitle(`#${task.id} · ${trunc(task.title, 200)}`)
      .addFields(
        { name: 'Handling', value: entry.action, inline: true },
        { name: 'Af', value: entry.user === 'ticket' ? 'Borger' : `<@${entry.user}>`, inline: true },
        { name: 'Status nu', value: `${STATUS[task.status].emoji} ${STATUS[task.status].label}`, inline: true },
      )
      .setTimestamp(new Date(entry.at));
    if (entry.text) embed.addFields({ name: 'Detaljer', value: trunc(entry.text, 1000) });
    await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) { console.error('Kunne ikke skrive log:', e.message); }
}

/* ---------------------------------- Rendering --------------------------------- */

function taskEmbed(t) {
  const e = new EmbedBuilder()
    .setColor(STATUS[t.status].color)
    .setTitle(`#${t.id} · ${trunc(t.title, 200)}`)
    .setDescription(trunc(t.description || '*Ingen beskrivelse*', 3500))
    .addFields(
      { name: 'Status', value: `${STATUS[t.status].emoji} ${STATUS[t.status].label}`, inline: true },
      { name: 'Kilde', value: t.source === 'ticket' ? '🎫 Borger-ticket' : '🛠️ Intern', inline: true },
      { name: 'Oprettet af', value: t.createdBy ? `<@${t.createdBy}>` : 'Ukendt', inline: true },
    )
    .setFooter({ text: `Oprettet ${new Date(t.createdAt).toLocaleString('da-DK')}` });
  if (t.assignee) e.addFields({ name: 'Taget af', value: `<@${t.assignee}>`, inline: true });
  if (t.extra) e.addFields({ name: 'Ekstra info', value: trunc(t.extra, 1000) });
  if (t.note) e.addFields({ name: t.status === 'rejected' ? 'Begrundelse' : 'Hvad der er gjort', value: trunc(t.note, 1000) });
  return e;
}

function taskButtons(t) {
  const b = (id, label, style) => new ButtonBuilder().setCustomId(`t:${id}:${t.id}`).setLabel(label).setStyle(style);
  if (t.status === 'todo')
    return [row(b('take', 'Opgave taget', ButtonStyle.Primary), b('reject', 'Afvis', ButtonStyle.Danger))];
  if (t.status === 'doing')
    return [row(b('done', 'Opgave færdig', ButtonStyle.Success), b('release', 'Slip opgave', ButtonStyle.Secondary), b('reject', 'Afvis', ButtonStyle.Danger))];
  return [row(b('reopen', 'Genåbn', ButtonStyle.Secondary))];
}

const taskView = (t) => ({ embeds: [taskEmbed(t)], components: taskButtons(t), allowedMentions: { parse: [] } });

function renderList(status, page = 0) {
  const tasks = Object.values(db.tasks).filter((t) => t.status === status).sort((a, b) => a.id - b.id);
  const pages = Math.max(1, Math.ceil(tasks.length / PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const slice = tasks.slice(page * PAGE, page * PAGE + PAGE);

  const embed = new EmbedBuilder()
    .setColor(STATUS[status].color)
    .setTitle(`${STATUS[status].emoji} ${STATUS[status].label}`)
    .setDescription(
      slice.length
        ? slice.map((t) => `**#${t.id}** ${t.source === 'ticket' ? '🎫 ' : ''}${trunc(t.title, 70)}${t.assignee ? ` — <@${t.assignee}>` : ''}`).join('\n')
        : '*Ingen opgaver her.*')
    .setFooter({ text: `Side ${page + 1}/${pages} · ${tasks.length} i alt` });

  const components = [];
  if (slice.length) {
    components.push(row(
      new StringSelectMenuBuilder().setCustomId('open').setPlaceholder('Åbn en opgave…')
        .addOptions(slice.map((t) => ({ label: trunc(`#${t.id} ${t.title}`, 100), value: String(t.id) })))));
  }
  components.push(row(
    new ButtonBuilder().setCustomId(`l:${status}:${page - 1}`).setLabel('◀ Forrige').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`l:${status}:${page + 1}`).setLabel('Næste ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  ));
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function panelView() {
  const count = (s) => Object.values(db.tasks).filter((t) => t.status === s).length;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Udviklingspanel')
    .setDescription('Tryk på en kategori for at se opgaverne. Åbn en opgave for at tage den, færdigmelde den eller afvise den.')
    .addFields(Object.keys(STATUS).map((s) => ({ name: `${STATUS[s].emoji} ${STATUS[s].label}`, value: String(count(s)), inline: true })))
    .setFooter({ text: 'Opdateret' }).setTimestamp();
  const lb = (s) => new ButtonBuilder().setCustomId(`p:list:${s}`).setLabel(STATUS[s].label).setEmoji(STATUS[s].emoji).setStyle(ButtonStyle.Secondary);
  return {
    embeds: [embed],
    components: [
      row(lb('todo'), lb('doing'), lb('done'), lb('rejected')),
      row(new ButtonBuilder().setCustomId('p:new').setLabel('Ny opgave').setEmoji('➕').setStyle(ButtonStyle.Success)),
    ],
  };
}

async function refreshPanels(client) {
  const alive = [];
  for (const p of db.panels) {
    try {
      const ch = await client.channels.fetch(p.channelId);
      const msg = await ch.messages.fetch(p.messageId);
      await msg.edit(panelView());
      alive.push(p);
    } catch { /* panel slettet */ }
  }
  db.panels = alive;
  save();
}

async function refreshCard(client, task, skipMessageId) {
  if (!task.messageId || task.messageId === skipMessageId) return;
  try {
    const ch = await client.channels.fetch(task.channelId);
    const msg = await ch.messages.fetch(task.messageId);
    await msg.edit(taskView(task));
  } catch { /* kort slettet */ }
}

/* --------------------------------- Modals ------------------------------------ */

function input(id, label, style, required, max, placeholder) {
  const i = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) i.setPlaceholder(placeholder);
  return row(i);
}

const newTaskModal = () => new ModalBuilder().setCustomId('m:new').setTitle('Ny opgave').addComponents(
  input('title', 'Titel', TextInputStyle.Short, true, 100),
  input('desc', 'Beskrivelse', TextInputStyle.Paragraph, false, 1500));

const ticketModal = () => new ModalBuilder().setCustomId('m:ticket').setTitle('Meld en fejl').addComponents(
  input('title', 'Hvad er fejlen? (kort)', TextInputStyle.Short, true, 100),
  input('desc', 'Beskriv fejlen', TextInputStyle.Paragraph, true, 1500, 'Hvad skete der, og hvad forventede du?'),
  input('extra', 'Hvordan kan det gentages / hvor?', TextInputStyle.Paragraph, false, 800, 'Fx sted, tidspunkt, job, køretøj, trin…'));

const noteModal = (kind, id) => new ModalBuilder()
  .setCustomId(`m:${kind}:${id}`)
  .setTitle(kind === 'done' ? `Færdigmeld #${id}` : `Afvis #${id}`)
  .addComponents(input('note', kind === 'done' ? 'Hvad er der gjort?' : 'Hvorfor afvises den?', TextInputStyle.Paragraph, true, 1000));

/* ---------------------------------- Opgaver ---------------------------------- */

function createTask({ title, description, extra, source, createdBy }) {
  db.counter += 1;
  const task = {
    id: db.counter, title, description: description || '', extra: extra || '', source,
    status: 'todo', createdBy, assignee: null, note: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    channelId: null, messageId: null, log: [],
  };
  db.tasks[task.id] = task;
  return task;
}

/* ----------------------------------- Client ---------------------------------- */

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* Fælles logik (bruges af både Discord-knapper og hjemmesiden) */

function applyAction(t, action, userId, note) {
  switch (action) {
    case 'take':
      if (t.status !== 'todo') return { error: `Opgaven er allerede ${STATUS[t.status].label.toLowerCase()}.` };
      t.status = 'doing'; t.assignee = userId;
      return { entry: addLog(t, userId, 'Opgave taget') };
    case 'release':
      if (t.status !== 'doing') return { error: 'Opgaven er ikke i gang.' };
      t.status = 'todo'; t.assignee = null;
      return { entry: addLog(t, userId, 'Opgave sluppet') };
    case 'reopen':
      if (t.status !== 'done' && t.status !== 'rejected') return { error: 'Opgaven er ikke lukket.' };
      t.status = 'todo'; t.assignee = null; t.note = '';
      return { entry: addLog(t, userId, 'Opgave genåbnet') };
    case 'done':
      if (t.status === 'done' || t.status === 'rejected') return { error: 'Opgaven er allerede lukket.' };
      t.status = 'done'; t.note = note || ''; if (!t.assignee) t.assignee = userId;
      return { entry: addLog(t, userId, 'Opgave færdig', note) };
    case 'reject':
      if (t.status === 'done' || t.status === 'rejected') return { error: 'Opgaven er allerede lukket.' };
      t.status = 'rejected'; t.note = note || '';
      return { entry: addLog(t, userId, 'Opgave afvist', note) };
    default:
      return { error: 'Ukendt handling.' };
  }
}

async function afterChange(t, entry, skipMessageId) {
  await refreshCard(client, t, skipMessageId);
  await sendLog(client, t, entry);
  await refreshPanels(client);
}

async function isDevUserId(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    return isDev(member);
  } catch { return false; }
}

async function displayName(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch { return userId; }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logget ind som ${c.user.tag}`);
  const commands = [
    new SlashCommandBuilder().setName('panel').setDescription('Opret udviklingspanelet i denne kanal')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName('ticketpanel').setDescription('Opret ticket-panelet hvor borgere kan melde fejl')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName('opgave').setDescription('Vis en opgave inkl. historik')
      .addIntegerOption((o) => o.setName('id').setDescription('Opgavens nummer').setRequired(true)),
  ].map((x) => x.toJSON());
  await c.application.commands.set(commands, GUILD_ID);

  // Hjemmeside-panel (starter kun hvis web-indstillinger er udfyldt)
  const { CLIENT_SECRET, BASE_URL, SESSION_SECRET } = process.env;
  if (CLIENT_SECRET && BASE_URL && SESSION_SECRET) {
    require('./web')({
      client: c, db, save, STATUS, createTask, addLog, applyAction, afterChange, isDevUserId, displayName,
      env: { CLIENT_ID, CLIENT_SECRET, BASE_URL, SESSION_SECRET },
    });
  } else {
    console.log('Hjemmeside deaktiveret (CLIENT_SECRET, BASE_URL og SESSION_SECRET mangler i .env).');
  }
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    /* ---- Slash commands ---- */
    if (i.isChatInputCommand()) {
      if (i.commandName === 'panel') {
        if (!isDev(i.member)) return i.reply({ content: 'Kun udviklere kan bruge dette.', flags: EPHEMERAL });
        const msg = await i.channel.send(panelView());
        db.panels.push({ channelId: msg.channelId, messageId: msg.id });
        save();
        return i.reply({ content: 'Panelet er oprettet ✅', flags: EPHEMERAL });
      }
      if (i.commandName === 'ticketpanel') {
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎫 Meld en fejl')
          .setDescription('Har du fundet en fejl på serveren? Tryk på knappen og beskriv den. Vores udviklere kigger på den.');
        await i.channel.send({ embeds: [embed], components: [row(new ButtonBuilder().setCustomId('tk:open').setLabel('Meld en fejl').setEmoji('🐞').setStyle(ButtonStyle.Primary))] });
        return i.reply({ content: 'Ticket-panelet er oprettet ✅', flags: EPHEMERAL });
      }
      if (i.commandName === 'opgave') {
        if (!isDev(i.member)) return i.reply({ content: 'Kun udviklere kan bruge dette.', flags: EPHEMERAL });
        const t = db.tasks[i.options.getInteger('id')];
        if (!t) return i.reply({ content: 'Opgaven findes ikke.', flags: EPHEMERAL });
        const hist = t.log.slice(-15).map((l) => `${ts(l.at)} — **${l.action}** ${l.user === 'ticket' ? '(borger)' : `<@${l.user}>`}${l.text ? `: ${trunc(l.text, 150)}` : ''}`).join('\n');
        const view = taskView(t);
        view.embeds.push(new EmbedBuilder().setColor(0x5865f2).setTitle('Historik').setDescription(trunc(hist || '*Ingen*', 4000)));
        return i.reply({ ...view, flags: EPHEMERAL });
      }
    }

    /* ---- Buttons ---- */
    if (i.isButton()) {
      const [kind, a, b] = i.customId.split(':');

      if (kind === 'tk' && a === 'open') {
        const last = ticketCooldown.get(i.user.id) || 0;
        if (Date.now() - last < 60_000) return i.reply({ content: 'Vent lidt før du sender en ny ticket.', flags: EPHEMERAL });
        return i.showModal(ticketModal());
      }

      // Alt herunder er kun for udviklere
      if (!isDev(i.member)) return i.reply({ content: 'Kun udviklere kan bruge dette.', flags: EPHEMERAL });

      if (kind === 'p') {
        if (a === 'new') return i.showModal(newTaskModal());
        if (a === 'list') return i.reply({ ...renderList(b, 0), flags: EPHEMERAL });
      }
      if (kind === 'l') return i.update(renderList(a, parseInt(b, 10)));

      if (kind === 't') {
        const t = db.tasks[b];
        if (!t) return i.reply({ content: 'Opgaven findes ikke længere.', flags: EPHEMERAL });

        if (a === 'done' || a === 'reject') return i.showModal(noteModal(a, t.id));

        const r = applyAction(t, a, i.user.id);
        if (r.error) return i.reply({ content: r.error, flags: EPHEMERAL });

        save();
        await i.update(taskView(t));
        return afterChange(t, r.entry, i.message.id);
      }
    }

    /* ---- Select menu ---- */
    if (i.isStringSelectMenu() && i.customId === 'open') {
      if (!isDev(i.member)) return i.reply({ content: 'Kun udviklere kan bruge dette.', flags: EPHEMERAL });
      const t = db.tasks[i.values[0]];
      if (!t) return i.reply({ content: 'Opgaven findes ikke længere.', flags: EPHEMERAL });
      return i.reply({ ...taskView(t), flags: EPHEMERAL });
    }

    /* ---- Modals ---- */
    if (i.isModalSubmit()) {
      const [, kind, id] = i.customId.split(':');

      if (kind === 'ticket') {
        ticketCooldown.set(i.user.id, Date.now());
        const t = createTask({
          title: i.fields.getTextInputValue('title'),
          description: i.fields.getTextInputValue('desc'),
          extra: i.fields.getTextInputValue('extra'),
          source: 'ticket', createdBy: i.user.id,
        });
        const entry = addLog(t, i.user.id, 'Ticket modtaget', t.title);
        const ch = await client.channels.fetch(REVIEW_CHANNEL_ID);
        const msg = await ch.send(taskView(t));
        t.channelId = msg.channelId; t.messageId = msg.id;
        save();
        await i.reply({ content: `Tak! Din fejlmelding er modtaget som **#${t.id}** ✅`, flags: EPHEMERAL });
        await sendLog(client, t, entry);
        return refreshPanels(client);
      }

      if (!isDev(i.member)) return i.reply({ content: 'Kun udviklere kan bruge dette.', flags: EPHEMERAL });

      if (kind === 'new') {
        const t = createTask({
          title: i.fields.getTextInputValue('title'),
          description: i.fields.getTextInputValue('desc'),
          source: 'dev', createdBy: i.user.id,
        });
        const entry = addLog(t, i.user.id, 'Opgave oprettet', t.title);
        save();
        await i.reply({ content: `Opgave **#${t.id}** oprettet under *Ikke startet* ✅`, flags: EPHEMERAL });
        await sendLog(client, t, entry);
        return refreshPanels(client);
      }

      if (kind === 'done' || kind === 'reject') {
        const t = db.tasks[id];
        if (!t) return i.reply({ content: 'Opgaven findes ikke længere.', flags: EPHEMERAL });
        const note = i.fields.getTextInputValue('note');
        const r = applyAction(t, kind, i.user.id, note);
        if (r.error) return i.reply({ content: r.error, flags: EPHEMERAL });
        save();
        if (i.isFromMessage()) await i.update(taskView(t));
        else await i.reply({ ...taskView(t), flags: EPHEMERAL });
        return afterChange(t, r.entry, i.message?.id);
      }
    }
  } catch (err) {
    console.error(err);
    const payload = { content: 'Der skete en fejl. Prøv igen.', flags: EPHEMERAL };
    if (i.replied || i.deferred) i.followUp(payload).catch(() => {});
    else i.reply(payload).catch(() => {});
  }
});

(async () => {
  try {
    Object.assign(db, { counter: 0, tasks: {}, panels: [] }, await store.load());
    console.log(`Lagring: ${store.enabled ? 'Supabase' : 'lokal fil (data/db.json)'} · ${Object.keys(db.tasks).length} opgaver indlæst`);
  } catch (e) {
    console.error('Kunne ikke indlæse data – stopper så intet overskrives:', e.message);
    process.exit(1);
  }

  // Gem alt før Render/hosten lukker processen ved deploy eller genstart
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => { await store.flush(); process.exit(0); });
  }

  // Render sætter RENDER_EXTERNAL_URL. Et ping hvert 10. minut kan holde en gratis tjeneste vågen.
  if (process.env.RENDER_EXTERNAL_URL && process.env.KEEPALIVE !== 'off') {
    setInterval(() => fetch(`${process.env.RENDER_EXTERNAL_URL}/health`).catch(() => {}), 10 * 60 * 1000);
  }

  await client.login(DISCORD_TOKEN);
})();
