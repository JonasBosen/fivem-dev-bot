const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, LabelBuilder, FileUploadBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { db, settings } = require('../db');
const {isManager}=require('../access');
const STATUS = { todo: 'Afventer behandling', doing: 'I gang', done: 'Færdig', rejected: 'Afvist' };
const parse = r => r && ({ ...r, checklist: JSON.parse(r.checklist || '[]'), attachments: JSON.parse(r.attachments || '[]') });
async function canReport(guild,uid) {
  const config=(await settings.get(guild.id)).developer;
  if(!config.enabled) return false;
  if(await canManage(guild,uid)) return true;
  const roles=Array.isArray(config.reporterRoles)?config.reporterRoles:[];
  if(!roles.length) return true;
  const member=await guild.members.fetch({user:uid,force:true}).catch(()=>null);
  return !!member&&roles.some(id=>member.roles.cache.has(id));
}
async function get(gid, id) {
  if(await db.prepare('SELECT task_id FROM dev_deleted WHERE guild_id=? AND task_id=?').get(gid,id)) return undefined;
  const task = parse(await db.prepare('SELECT * FROM dev_tasks WHERE guild_id=? AND id=?').get(gid, id));
  if (task) task.comments = await db.prepare('SELECT * FROM dev_comments WHERE guild_id=? AND task_id=? ORDER BY id DESC LIMIT 100').all(gid,id);
  if(task) task.files=await require('./developer-files').list(gid,id);
  if(task) task.planning=await require('./developer-planning').get(gid,id);
  return task;
}
async function comment(guild,id,uid,text,asDeveloper=false) {
  if(typeof text !== 'string' || !text.trim() || text.length>1800) throw new Error('Skriv en besked på 1–1800 tegn');
  const task = await get(guild.id,id);
  if(!task) throw new Error('Sagen findes ikke');
  if(asDeveloper ? !await canManage(guild,uid) : task.user_id!==uid) throw new Error('Ingen adgang til sagen');
  if(!asDeveloper && !await canReport(guild,uid)) throw new Error('Borgerrollen kræves for at sende svar');
  const recent = await db.prepare('SELECT id FROM dev_comments WHERE guild_id=? AND task_id=? AND user_id=? AND created_at>?').get(guild.id,id,uid,Date.now()-5000);
  if(recent) throw new Error('Vent fem sekunder mellem beskeder');
  await db.prepare('INSERT INTO dev_comments (guild_id,task_id,user_id,author_type,body,created_at) VALUES (?,?,?,?,?,?)').run(guild.id,id,uid,asDeveloper?'developer':'citizen',text.trim(),Date.now());
  await require('./developer-audit').record(guild.id,id,uid,'comment',{author:asDeveloper?'developer':'citizen',text:text.trim()});
  await db.prepare('UPDATE dev_tasks SET updated_at=? WHERE guild_id=? AND id=?').run(Date.now(),guild.id,id);
  const updated = await get(guild.id,id);
  await sync(guild.client,updated);
  if(asDeveloper && task.user_id!==uid) {
    try {
      const user=await guild.client.users.fetch(task.user_id);
      await user.send({content:`💬 Svar på fejlmelding #${id}:\n${text.trim()}\n\nSvar på serveren med /fejlsvar id:${id} besked:dit svar`,allowedMentions:{parse:[]}});
    } catch { await db.prepare('UPDATE dev_tasks SET sync_error=? WHERE guild_id=? AND id=?').run('Svaret er gemt. Borgerens private beskeder kunne ikke modtage det; svaret kan læses med /fejlstatus.',guild.id,id); }
  }
  return get(guild.id,id);
}
async function canManage(guild, uid) {
  if(await isManager(guild,uid)) return true;
  const member = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
  const config = (await settings.get(guild.id)).developer;
  return !!member && (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild) || (Array.isArray(config.roles) ? config.roles : []).some(id => member.roles.cache.has(id)));
}
function validate(input) {
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('Titel skal være 1–200 tegn');
  if (typeof input.description !== 'string' || input.description.length > 4000) throw new Error('Beskrivelse må højst være 4000 tegn');
  if (!Object.hasOwn(STATUS, input.status)) throw new Error('Ukendt status');
  if (typeof input.notes !== 'string' || input.notes.length > 12000) throw new Error('Noter må højst være 12000 tegn');
  if (!Array.isArray(input.checklist) || input.checklist.length > 100 || input.checklist.some(x => typeof x.text !== 'string' || x.text.length > 300 || typeof x.done !== 'boolean')) throw new Error('Ugyldig tjekliste');
}
async function create(guild, uid, input, attachment) {
  const task = { title: input.title, description: input.description || '', status: 'todo', notes: '', checklist: [] };
  validate(task);
  if (attachment && (!attachment.contentType?.startsWith('image/') || attachment.size > 6 * 1024 * 1024)) throw new Error('Billedet skal være under 6 MB');
  let image;
  if (attachment) {
    const url = new URL(attachment.url);
    if (url.protocol !== 'https:' || !['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)) throw new Error('Ugyldigt Discord-billede');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Billedet kunne ikke gemmes');
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(mime)) throw new Error('Brug PNG, JPG, WebP eller GIF');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if(size>10*1024*1024) throw new Error('Billedet er for stort'); chunks.push(Buffer.from(chunk)); }
    image = { mime, content: Buffer.concat(chunks).toString('base64') };
  }
  const result = await db.prepare('INSERT INTO dev_tasks (guild_id,user_id,title,description,status,notes,checklist,attachments,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(guild.id, uid, task.title.trim(), task.description, task.status, '', '[]', JSON.stringify(attachment ? [{ url: attachment.url, name: attachment.name }] : []), Date.now(), Date.now());
  if (image) await db.prepare('INSERT INTO dev_images (task_id,guild_id,mime,content) VALUES (?,?,?,?)').run(Number(result.lastInsertRowid),guild.id,image.mime,image.content);
  await require('./developer-audit').record(guild.id,Number(result.lastInsertRowid),uid,'created',{title:task.title,description:task.description,image:attachment?.name||null});
  return get(guild.id, Number(result.lastInsertRowid));
}
function view(task) {
  const embed = new EmbedBuilder().setTitle(`#${task.id} · ${task.title}`.slice(0, 256)).setDescription(task.description || 'Ingen beskrivelse').setColor({ todo: 0x94a3b8, doing: 0xf59e0b, done: 0x22c55e, rejected: 0xef4444 }[task.status]).addFields({ name: 'Status', value: STATUS[task.status] }).setFooter({ text: 'Svar: /fejlsvar · Vedhæft billede: /fejlbillede id:'+task.id });
  if (task.attachments[0]) embed.setImage(task.attachments[0].url);
  const latest = (task.comments || []).slice(0,3).reverse();
  if(latest.length) embed.addFields({name:'Seneste beskeder',value:latest.map(c=>`${c.author_type==='developer'?'Udvikler':'Borger'}: ${c.body.slice(0,270)}`).join('\n\n').slice(0,1024)});
  return { embeds: [embed], allowedMentions: { parse: [] } };
}
async function sync(client, task) {
  if (!task.channel_id || !task.message_id) return;
  try {
    const channel = await client.channels.fetch(task.channel_id);
    const message = await channel.messages.fetch(task.message_id);
    await message.edit(view(task));
    await db.prepare('UPDATE dev_tasks SET sync_error=? WHERE guild_id=? AND id=?').run('', task.guild_id, task.id);
  } catch {
    await db.prepare('UPDATE dev_tasks SET sync_error=? WHERE guild_id=? AND id=?').run('Discord-beskeden kunne ikke opdateres. Prøv igen.', task.guild_id, task.id);
  }
}
async function update(guild, id, input, uid) {
  validate(input);
  const previous = await get(guild.id, id);
  if (!previous) throw new Error('Sagen findes ikke');
  const planning=require('./developer-planning').validate(input.planning||previous.planning);
  if (!Number.isSafeInteger(input.version)) throw new Error('Version mangler');
  const result = await db.prepare('UPDATE dev_tasks SET title=?,description=?,status=?,notes=?,checklist=?,updated_at=?,version=version+1 WHERE guild_id=? AND id=? AND version=?').run(input.title.trim(), input.description, input.status, input.notes, JSON.stringify(input.checklist), Date.now(), guild.id, id, input.version);
  if (!result.changes) throw new Error('En anden har ændret sagen. Genindlæs før du gemmer.');
  await require('./developer-planning').save(guild.id,id,planning);
  await require('./developer-audit').record(guild.id,id,uid,input.status==='rejected'?'rejected':'updated',{before:{title:previous.title,description:previous.description,status:previous.status,notes:previous.notes,checklist:previous.checklist,planning:previous.planning},after:{title:input.title,description:input.description,status:input.status,notes:input.notes,checklist:input.checklist,planning}});
  await db.prepare('INSERT INTO dev_history (guild_id,task_id,user_id,status,created_at) VALUES (?,?,?,?,?)').run(guild.id, id, uid, input.status, Date.now());
  await sync(guild.client, await get(guild.id, id));
  return get(guild.id, id);
}
async function sendPanel(guild, channelId) {
  const config = (await settings.get(guild.id)).developer;
  if (!config.enabled) throw new Error('Aktivér udviklermodulet først');
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased()) throw new Error('Vælg en tekstkanal');
  await channel.send({ content: '🛠️ **Fejlmelding til udvikleren**\nTryk for at beskrive fejlen. Du kan vedhæfte et billede direkte i formularen. Du får en privat statusbesked, der opdateres under behandlingen.', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev:report').setLabel('Meld en fejl').setStyle(ButtonStyle.Primary))] });
}
async function submit(i, title, description, attachment) {
  if (!(await settings.get(i.guildId)).developer.enabled) throw new Error('Fejlmeldinger er deaktiveret');
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  if(!await canReport(i.guild,i.user.id)) return i.editReply('Du skal have borgerrollen for at indsende en fejlmelding.');
  const recent = await db.prepare('SELECT id FROM dev_tasks WHERE guild_id=? AND user_id=? AND created_at>?').get(i.guildId, i.user.id, Date.now() - 60000);
  if (recent) return i.editReply('Vent et minut mellem fejlmeldinger.');
  const task = await create(i.guild, i.user.id, { title, description }, attachment);
  // A normal DM remains editable after Discord interaction tokens expire.
  try {
    const message = await i.user.send(view(task));
    await db.prepare('UPDATE dev_tasks SET channel_id=?,message_id=? WHERE guild_id=? AND id=?').run(message.channelId, message.id, i.guildId, task.id);
    await i.editReply(`Fejlmelding #${task.id} er oprettet. Status er sendt i en privat besked. Du kan også bruge /fejlstatus. Tilføj flere billeder med /fejlbillede id:${task.id} billede:din fil.`);
  } catch { await i.editReply(`Fejlmelding #${task.id} er oprettet. Dine private beskeder er lukkede; følg sagen med /fejlstatus.`); }
}
async function onCommand(i) {
  if(i.commandName==='fejlbillede') {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const id=i.options.getInteger('id');
    await require('./developer-files').citizenUpload(i.guild,id,i.user.id,i.options.getAttachment('billede'));
    return i.editReply(`Billedet er gemt på sag #${id}. Udvikleren kan se det under Billeder i sagen.`);
  }
  if (i.commandName === 'fejlsvar') {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const task=await comment(i.guild,i.options.getInteger('id'),i.user.id,i.options.getString('besked'));
    return i.editReply({...view(task),content:'Dit svar er sendt til udviklertavlen.'});
  }
  if (i.commandName === 'fejlstatus') {
    const t = await get(i.guildId, i.options.getInteger('id'));
    if (!t || (t.user_id !== i.user.id && !await canManage(i.guild, i.user.id))) return i.reply({ content: 'Sagen findes ikke eller du mangler adgang.', flags: MessageFlags.Ephemeral });
    return i.reply({ ...view(t), flags: MessageFlags.Ephemeral });
  }
  return submit(i, i.options.getString('titel'), i.options.getString('beskrivelse'), i.options.getAttachment('billede'));
}
async function onInteraction(i) {
  if (i.customId === 'dev:report' && i.isButton()) {
    const modal = new ModalBuilder().setCustomId('dev:submit').setTitle('Meld en fejl');
    for (const [id, label, max, style] of [['title','Kort titel',200,TextInputStyle.Short], ['description','Hvad skete der? Hvordan genskabes fejlen?',4000,TextInputStyle.Paragraph]]) modal.addLabelComponents(new LabelBuilder().setLabel(label).setTextInputComponent(new TextInputBuilder().setCustomId(id).setMaxLength(max).setStyle(style).setRequired(true)));
    modal.addLabelComponents(new LabelBuilder().setLabel('Vedhæft billede (valgfrit)').setDescription('PNG, JPG, GIF eller WebP · højst 6 MB').setFileUploadComponent(new FileUploadBuilder().setCustomId('image').setMinValues(0).setMaxValues(1).setRequired(false)));
    return i.showModal(modal);
  }
  if (i.customId === 'dev:submit' && i.isModalSubmit()) return submit(i, i.fields.getTextInputValue('title'), i.fields.getTextInputValue('description'), i.fields.getUploadedFiles('image')?.first());
}
async function remove(guild,id,uid) {
  const task=await get(guild.id,id);
  if(!task) throw new Error('Sagen findes ikke');
  await require('./developer-audit').record(guild.id,id,uid,'deleted',{title:task.title,status:task.status,notes:task.notes,checklist:task.checklist,description:task.description,planning:task.planning});
  await db.prepare('INSERT INTO dev_deleted (guild_id,task_id,user_id,created_at) VALUES (?,?,?,?) ON CONFLICT(guild_id,task_id) DO NOTHING').run(guild.id,id,uid,Date.now());
}
module.exports = { STATUS, get, create, update, remove, comment, sync, validate, canManage, canReport, sendPanel, onCommand, onInteraction };
