const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,MessageFlags}=require('discord.js');
const form=require('./report-form');
const {categories}=require('./report-categories');
const choices=[['mlo','MLO-fejl'],['bug','Bug / scriptfejl'],['vehicle','Køretøj'],['inventory','Inventory / items'],['job','Job / firma'],['mapping','Mapping'],['economy','Bank / økonomi'],['garage','Garage'],['voice','Voice / radio'],['ui','Menu / HUD']];
const priorityOptions=[['low','🟢 Lav',ButtonStyle.Success],['high','🟠 Mellem / vigtig',ButtonStyle.Secondary],['critical','🔴 Kritisk',ButtonStyle.Danger],['custom','Egen vurdering',ButtonStyle.Secondary]];
const priorityRow=category=>new ActionRowBuilder().addComponents(...priorityOptions.map(([id,label,style])=>new ButtonBuilder().setCustomId(`dev:level:${category}:${id}`).setLabel(label).setStyle(style)));
function panel(){
  const rows=[];
  for(let n=0;n<choices.length;n+=5)rows.push(new ActionRowBuilder().addComponents(...choices.slice(n,n+5).map(([id,label])=>new ButtonBuilder().setCustomId('dev:category:'+id).setLabel(label).setStyle(ButtonStyle.Secondary))));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev:category:other').setLabel('Andet – skriv selv').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('dev:categories:all').setLabel('Alle kategorier').setStyle(ButtonStyle.Secondary)));
  rows.push(priorityRow('choose'));
  return {content:'🛠️ **Indmeld en sag til udvikleren**\n**1. Vælg hvad fejlen handler om.**\n**2. Vælg prioritet:** 🟢 Lav · 🟠 Mellem / vigtig · 🔴 Kritisk.\n**3. Beskriv fejlen og vedhæft eventuelt et billede.**\n\nDu kan også starte med prioriteten nederst. Kategori og prioritet følger automatisk sagen til udviklertavlen. Du får status og mulighed for at svare i en privat besked.',components:rows,allowedMentions:{parse:[]}};
}
function categoryMenu(priority='choose'){
  return {content:'**Vælg kategori**'+(priority==='choose'?'':' · '+priorityOptions.find(p=>p[0]===priority)?.[1]),flags:MessageFlags.Ephemeral,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dev:categoryselect:'+priority).setPlaceholder('Hvad handler sagen om?').addOptions(categories.map(c=>({label:c.label,value:c.id}))))]};
}
async function selectPriority(i,category){
  if(!categories.some(c=>c.id===category))throw new Error('Ukendt kategori');
  const label=categories.find(c=>c.id===category).label;
  return i.reply({content:`**${label}**\nVælg, hvor vigtig fejlen er. Derefter åbner formularen til beskrivelse og billede.`,components:[priorityRow(category)],flags:MessageFlags.Ephemeral});
}
async function interact(i){
  const [,action,value,priority]=i.customId.split(':');
  if(action==='categories')return i.reply(categoryMenu());
  if(action==='category')return selectPriority(i,value);
  if(action==='categoryselect'){
    const category=i.values[0];if(!categories.some(c=>c.id===category))throw new Error('Ukendt kategori');
    if(value==='choose')return selectPriority(i,category);
    form.importance(value,value==='custom'?'Valgt af borgeren':'');
    return i.showModal(form.modal(category,value));
  }
  if(action==='level'){
    if(!priorityOptions.some(p=>p[0]===priority))throw new Error('Ukendt prioritet');
    if(value==='choose')return i.reply(categoryMenu(priority));
    if(!categories.some(c=>c.id===value))throw new Error('Ukendt kategori');
    return i.showModal(form.modal(value,priority));
  }
}
async function refreshPanels(client){
  const {db}=require('../db');
  const rows=await db.prepare("SELECT guild_id,details FROM dev_audit WHERE action='panel_sent' ORDER BY id DESC LIMIT 100").all();
  const seen=new Set();let updated=0;
  for(const row of rows){
    let channelId;try{channelId=JSON.parse(row.details).channel;}catch{continue;}
    const guild=client.guilds.cache.get(row.guild_id);if(!guild||!channelId||seen.has(channelId))continue;seen.add(channelId);
    try{
      const channel=await guild.channels.fetch(channelId);if(!channel?.isTextBased())continue;
      const messages=await channel.messages.fetch({limit:100});
      for(const message of messages.values()){
        if(message.author.id!==client.user.id||!message.components.some(row=>row.components?.some(c=>c.customId==='dev:report'||/^dev:(category|categories|level):/.test(c.customId||''))))continue;
        await message.edit(panel());updated++;
        await require('./developer-audit').record(guild.id,0,client.user.id,'panel_updated',{channel:channelId,messageId:message.id});
      }
    }catch(error){console.warn('[fejlpanel]',error.code||error.name);}
  }
  console.log('[fejlpanel]',updated,'eksisterende paneler opdateret');return updated;
}
module.exports={panel,interact,categoryMenu,priorityRow,refreshPanels};
