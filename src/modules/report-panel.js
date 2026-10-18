const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,MessageFlags}=require('discord.js');
const form=require('./report-form');
const {categories}=require('./report-categories');
const choices=[['mlo','MLO-fejl'],['bug','Bug / scriptfejl'],['vehicle','Køretøj'],['inventory','Inventory / items'],['job','Job / firma'],['mapping','Mapping'],['economy','Bank / økonomi'],['garage','Garage'],['voice','Voice / radio'],['ui','Menu / HUD']];
const priorityOptions=[['low','🟢 Lav',ButtonStyle.Success],['high','🟠 Mellem / vigtig',ButtonStyle.Secondary],['critical','🔴 Kritisk',ButtonStyle.Danger],['custom','Egen vurdering',ButtonStyle.Secondary]];
const prompts=new Map();
const promptKey=(guildId,userId)=>guildId+':'+userId;
async function startPrompt(i,payload){const result=await i.reply(payload);prompts.set(promptKey(i.guildId,i.user.id),{webhook:i.webhook,expires:Date.now()+14*60*1000});setTimeout(()=>{const current=prompts.get(promptKey(i.guildId,i.user.id));if(current?.expires<=Date.now())prompts.delete(promptKey(i.guildId,i.user.id));},14*60*1000).unref?.();return result;}
async function clearPrompt(guildId,userId){const key=promptKey(guildId,userId),prompt=prompts.get(key);prompts.delete(key);if(prompt&&prompt.expires>Date.now())await prompt.webhook.deleteMessage('@original').catch(()=>{});}
const priorityRow=(category,reportType='bug')=>new ActionRowBuilder().addComponents(...priorityOptions.map(([id,label,style])=>new ButtonBuilder().setCustomId(`dev:level:${category}:${id}:${reportType}`).setLabel(label).setStyle(style)));
function buttonRows(buttons,prefix='dev:custom'){
 const rows=[];buttons.forEach((b,i)=>{if(i%5===0)rows.push(new ActionRowBuilder());const button=new ButtonBuilder().setCustomId(prefix+':'+i).setLabel(b.label).setStyle({blue:ButtonStyle.Primary,green:ButtonStyle.Success,red:ButtonStyle.Danger,gray:ButtonStyle.Secondary}[b.color]);if(b.emoji)button.setEmoji(b.emoji);rows.at(-1).addComponents(button);});return rows;
}
function panel(config){
 const cfg=require('./report-panel-config').validate(config||require('./report-panel-config').defaults),rows=buttonRows(cfg.buttons);
 return {content:cfg.text,components:rows,allowedMentions:{parse:[]}};
}
function categoryMenu(priority='choose',reportType='bug'){
  const menu=new StringSelectMenuBuilder().setCustomId('dev:categoryselect:'+priority+':'+reportType).setPlaceholder('Hvad handler sagen om?').addOptions(categories.map(c=>({label:c.label,value:c.id})));
  return {content:(reportType==='request'?'**Vælg kategori for dit ønske**':'**Vælg kategori**')+(priority==='choose'?'':' · '+priorityOptions.find(p=>p[0]===priority)?.[1]),flags:MessageFlags.Ephemeral,components:[new ActionRowBuilder().addComponents(menu)]};
}
async function selectPriority(i,category,reportType='bug',update=false){
  if(!categories.some(c=>c.id===category))throw new Error('Ukendt kategori');
  const label=categories.find(c=>c.id===category).label;
  const payload={content:`**${label}**\nVælg, hvor vigtig ${reportType==='request'?'ønsket':'fejlen'} er. Derefter åbner formularen til beskrivelse og billede.`,components:[priorityRow(category,reportType)],flags:MessageFlags.Ephemeral};return update?i.update(payload):startPrompt(i,payload);
}
async function interact(i){
  const [,action,value,priority='low',type='bug']=i.customId.split(':');
  if(action==='custom'){
    const saved=(await require('../db').settings.get(i.guild.id)).developer,fromWish=i.customId.startsWith('dev:wish:'),cfg=(fromWish?saved.wishPanel:saved.reportPanel)||(fromWish?require('./developer-wishes').defaults:require('./report-panel-config').defaults);
    const button=cfg.buttons[Number(value)];if(!button)throw new Error('Knappen er fjernet. Brug det opdaterede panel.');
    const reportType=fromWish?'request':button.reportType||'bug';
    return button.category==='choose'?startPrompt(i,categoryMenu('choose',reportType)):selectPriority(i,button.category,reportType);
  }
  if(action==='base')return startPrompt(i,categoryMenu('choose',value==='request'?'request':'bug'));
  if(action==='categories')return startPrompt(i,categoryMenu());
  if(action==='category')return selectPriority(i,value);
  if(action==='categoryselect'){
    const category=i.values[0];if(!categories.some(c=>c.id===category))throw new Error('Ukendt kategori');
    const reportType=['bug','request'].includes(priority)?priority:'bug',importance=['low','high','critical','custom'].includes(value)?value:'choose';
    if(importance==='choose')return selectPriority(i,category,reportType,true);
    return i.showModal(form.modal(category,importance,reportType));
  }
  if(action==='level'){
    if(!priorityOptions.some(p=>p[0]===priority))throw new Error('Ukendt prioritet');
    const reportType=['bug','request'].includes(type)?type:'bug';
    if(value==='choose')return i.update(categoryMenu(priority,reportType));
    if(!categories.some(c=>c.id===value))throw new Error('Ukendt kategori');
    return i.showModal(form.modal(value,priority,reportType));
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
        if(message.author.id!==client.user.id||!(message.content===saved.text||previousText&&message.content===previousText||message.components.some(row=>row.components?.some(c=>c.customId==='dev:report'||/^dev:(base|category|categories|level|custom|wish):/.test(c.customId||'')))))continue;
        await message.edit(await require('./discord-design').apply(guild.id,'developer',require('./developer-wishes').combined((await require('../db').settings.get(guild.id)).developer)));updated++;
        await require('./developer-audit').record(guild.id,0,client.user.id,'panel_updated',{channel:channelId,messageId:message.id});
      }
    }catch(error){console.warn('[fejlpanel]',error.code||error.name);}
  }
  console.log('[fejlpanel]',updated,'eksisterende paneler opdateret');return updated;
}
module.exports={panel,buttonRows,interact,categoryMenu,priorityRow,refreshPanels,clearPrompt,startPrompt};
