const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,MessageFlags}=require('discord.js');const {settings}=require('../db');const {categories}=require('./report-categories');
const defaults={text:'💡 **Ønsker til serveren**\nForeslå fx et MLO, en bil eller en ny funktion. Beskriv dit ønske og vedhæft gerne et billede. Du får svar og status privat.',buttons:[{label:'Opret ønsker til serveren',emoji:'💡',color:'green',category:'choose',reportType:'request'}]};
function panel(config){const payload=require('./report-panel').panel(config||defaults);for(const row of payload.components)for(const [i,b]of row.components.entries())b.setCustomId('dev:wish:'+b.data.custom_id.split(':').at(-1));return payload;}
function combined(config={}){
 const reportConfig=require('./report-panel-config').validate(config.reportPanel||require('./report-panel-config').defaults),wishConfig=require('./report-panel-config').validate(config.wishPanel||defaults);
 const baseReport={label:'Opret udvikler ticket',emoji:'🛠️',color:'blue',category:'choose',reportType:'bug'},baseWish={label:'Opret ønsker til serveren',emoji:'💡',color:'green',category:'choose',reportType:'request'};
 const isReportBase=a=>a.label===baseReport.label&&a.color==='blue'&&(!a.reportType||a.reportType==='bug'),isWishBase=a=>a.label===baseWish.label&&a.category==='choose'&&a.color==='green';
 const extras=[...reportConfig.buttons.filter(b=>!isReportBase(b)).map(b=>({...b,id:'dev:custom:'+reportConfig.buttons.indexOf(b)})),...wishConfig.buttons.filter(b=>!isWishBase(b)).map(b=>({...b,id:'dev:wish:'+wishConfig.buttons.indexOf(b)}))];
 if(extras.length>23)throw new Error('Discord tillader de to faste knapper og højst 23 ekstra knapper i ét panel');
 const all=[{...baseReport,id:'dev:base:bug'},{...baseWish,id:'dev:base:request'},...extras],rows=[];
 all.forEach((b,i)=>{if(i%5===0)rows.push(new ActionRowBuilder());const button=new ButtonBuilder().setCustomId(b.id).setLabel(b.label.slice(0,80)).setStyle({blue:ButtonStyle.Primary,green:ButtonStyle.Success,red:ButtonStyle.Danger,gray:ButtonStyle.Secondary}[b.color]||ButtonStyle.Primary);if(b.emoji)button.setEmoji(b.emoji);rows.at(-1).addComponents(button);});
 const text=reportConfig.text+'\n\n'+wishConfig.text;return {content:text.length<=2000?text:reportConfig.text,embeds:text.length<=2000?[]:[{description:wishConfig.text}],components:rows,allowedMentions:{parse:[]}};
}
async function onInteraction(i){const [,action,index,token='']=i.customId.split(':');if(!i.developerPanelAuthorized&&!await require('./developer').canReport(i.guild,i.user.id))return i.reply({content:'Du mangler borgerrollen.',flags:MessageFlags.Ephemeral});let category,flowToken=i.developerPanelCooldownToken|| (action==='wishcategory'?index:token);if(action==='wish'){const cfg=(await settings.get(i.guild.id)).developer.wishPanel||defaults;const button=cfg.buttons[Number(index)];if(!button)throw new Error('Knappen findes ikke længere');category=button.category;if(category==='choose')return i.reply({content:'Hvad ønsker du til serveren?',flags:MessageFlags.Ephemeral,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dev:wishcategory'+(flowToken?':'+flowToken:'')).setPlaceholder('Vælg kategori for ønsket').addOptions(categories.map(c=>({label:c.label.replace(/-fejl/g,''),value:c.id}))))]});}else category=i.values[0];if(!categories.some(c=>c.id===category))throw new Error('Vælg en kategori');return i.showModal(require('./report-form').modal(category,'low','request',flowToken));}
async function sendPanel(guild,channelId){
 const cfg=(await settings.get(guild.id)).developer,channel=await guild.channels.fetch(channelId);if(!channel?.isTextBased())throw new Error('Vælg en tekstkanal');
 const messages=await channel.messages.fetch({limit:100});
 if(cfg.wishPanelDelivery?.channel===channelId&&cfg.wishPanelDelivery.messageId&&!messages.has(cfg.wishPanelDelivery.messageId)){const old=await channel.messages.fetch(cfg.wishPanelDelivery.messageId).catch(e=>{if(e.code===10008)return null;throw e;});if(old)messages.set(old.id,old);}
 const own=[...messages.values()].filter(m=>m.author.id===guild.client.user.id),has=(m,prefix)=>m.components.some(r=>r.components?.some(c=>(c.customId||'').startsWith(prefix)));
 const existing=own.find(m=>has(m,'dev:base:'))||own.find(m=>has(m,'dev:custom:'))||own.find(m=>has(m,'dev:wish:'));
 if(existing&&existing.author.id!==guild.client.user.id)throw new Error('Panelet tilhører ikke denne bot');
 const payload=await require('./discord-design').apply(guild.id,'developer',combined(cfg));const message=existing?await existing.edit(payload):await channel.send(payload);
 for(const old of own)if(old.id!==message.id&&has(old,'dev:wish:')&&!has(old,'dev:custom:'))await old.delete();
 const latest=(await settings.get(guild.id)).developer;await settings.setModule(guild.id,'developer',{...latest,wishPanelDelivery:{channel:channelId,messageId:message.id,combined:true}});
 await require('./developer-audit').record(guild.id,0,guild.client.user.id,'wish_panel_sent',{module:'wishPanel',board:'request',channel:channelId,messageId:message.id,updated:!!existing});return {ok:true,channel:channelId,messageId:message.id,updated:!!existing};
}
async function ensureBesideDeveloperPanel(client){
 const gid=require('./personal-access').targetId(),guild=client.guilds.cache.get(gid);if(!guild)return;
 const cfg=(await settings.get(gid)).developer;if(cfg.wishPanelDelivery?.combined)return;if(cfg.wishPanelDelivery?.channel)return sendPanel(guild,cfg.wishPanelDelivery.channel);
 const rows=await require('../db').db.prepare("SELECT guild_id,details FROM dev_audit WHERE action='panel_sent' ORDER BY id DESC LIMIT 100").all();
 const last=rows.find(r=>r.guild_id===gid);if(!last)return;const channelId=JSON.parse(last.details).channel;if(!channelId)return;
 const result=await sendPanel(guild,channelId);console.log('[ønskepanel]',result.updated?'Eksisterende panel opdateret':'Fælles panel sendt',result.channel,result.messageId);return result;
}
module.exports={defaults,panel,combined,onInteraction,sendPanel,ensureBesideDeveloperPanel};
