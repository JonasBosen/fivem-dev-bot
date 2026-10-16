const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,MessageFlags}=require('discord.js');
const form=require('./report-form');
const {categories}=require('./report-categories');
const choices=[['mlo','MLO-fejl'],['bug','Bug / scriptfejl'],['vehicle','Køretøj'],['inventory','Inventory / items'],['job','Job / firma'],['mapping','Mapping'],['economy','Bank / økonomi'],['garage','Garage'],['voice','Voice / radio'],['ui','Menu / HUD']];
const priorityOptions=[['low','🟢 Lav',ButtonStyle.Success],['high','🟠 Mellem / vigtig',ButtonStyle.Secondary],['critical','🔴 Kritisk',ButtonStyle.Danger],['custom','Egen vurdering',ButtonStyle.Secondary]];
const priorityRow=category=>new ActionRowBuilder().addComponents(...priorityOptions.map(([id,label,style])=>new ButtonBuilder().setCustomId(`dev:level:${category}:${id}`).setLabel(label).setStyle(style)));
function panel(config){
 const cfg=require('./report-panel-config').validate(config||require('./report-panel-config').defaults),rows=[];
 cfg.buttons.forEach((b,i)=>{if(i%5===0)rows.push(new ActionRowBuilder());const button=new ButtonBuilder().setCustomId('dev:custom:'+i).setLabel(b.label).setStyle({blue:ButtonStyle.Primary,green:ButtonStyle.Success,red:ButtonStyle.Danger,gray:ButtonStyle.Secondary}[b.color]);if(b.emoji)button.setEmoji(b.emoji);rows.at(-1).addComponents(button);});
 return {content:cfg.text,components:rows,allowedMentions:{parse:[]}};
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
  if(action==='custom'){
    const cfg=(await require('../db').settings.get(i.guild.id)).developer.reportPanel||require('./report-panel-config').defaults;
    const button=cfg.buttons[Number(value)];if(!button)throw new Error('Knappen er fjernet. Brug det opdaterede panel.');
    return button.category==='choose'?i.reply(categoryMenu()):selectPriority(i,button.category);
  }
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
async function refreshPanels(client,onlyGuild,previousText){
  const {db}=require('../db');
  const rows=await db.prepare("SELECT guild_id,details FROM dev_audit WHERE action='panel_sent' ORDER BY id DESC LIMIT 100").all();
  const seen=new Set();let updated=0;
  for(const row of rows){
    let channelId;try{channelId=JSON.parse(row.details).channel;}catch{continue;}
    if(onlyGuild&&row.guild_id!==onlyGuild)continue;const guild=client.guilds.cache.get(row.guild_id);if(!guild||!channelId||seen.has(channelId))continue;seen.add(channelId);
    try{
      const channel=await guild.channels.fetch(channelId);if(!channel?.isTextBased())continue;
      const saved=(await require('../db').settings.get(guild.id)).developer.reportPanel||require('./report-panel-config').defaults;
      const messages=await channel.messages.fetch({limit:100});
      const history=await require('./developer-audit').list(guild.id);
      for(const event of history.filter(e=>e.action==='panel_updated'&&e.details.channel===channelId&&e.details.messageId)){
        if(messages.has(event.details.messageId))continue;
        const old=await channel.messages.fetch(event.details.messageId).catch(e=>{if(e.code===10008)return null;throw e;});if(old)messages.set(old.id,old);
      }
      for(const message of messages.values()){
        if(message.author.id!==client.user.id||!(message.content===saved.text||previousText&&message.content===previousText||message.components.some(row=>row.components?.some(c=>c.customId==='dev:report'||/^dev:(category|categories|level|custom):/.test(c.customId||'')))))continue;
        await message.edit(await require('./discord-design').apply(guild.id,'developer',require('./developer-wishes').combined((await require('../db').settings.get(guild.id)).developer)));updated++;
        await require('./developer-audit').record(guild.id,0,client.user.id,'panel_updated',{channel:channelId,messageId:message.id});
      }
    }catch(error){console.warn('[fejlpanel]',error.code||error.name);}
  }
  console.log('[fejlpanel]',updated,'eksisterende paneler opdateret');return updated;
}
module.exports={panel,interact,categoryMenu,priorityRow,refreshPanels};
