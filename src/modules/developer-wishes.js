const {ActionRowBuilder,StringSelectMenuBuilder,MessageFlags}=require('discord.js');const {settings}=require('../db');const {categories}=require('./report-categories');
const defaults={text:'💡 **Ønsker til serveren**\nForeslå fx et MLO, en bil eller en ny funktion. Beskriv dit ønske og vedhæft gerne et billede. Du får svar og status privat.',buttons:[{label:'Opret ønsker til serveren',emoji:'💡',color:'green',category:'choose'}]};
function panel(config){const payload=require('./report-panel').panel(config||defaults);for(const row of payload.components)for(const [i,b]of row.components.entries())b.setCustomId('dev:wish:'+b.data.custom_id.split(':').at(-1));return payload;}
function combined(config={}){const report=require('./report-panel').panel(config.reportPanel?.buttons?.length?config.reportPanel:undefined),wish=panel(config.wishPanel?.buttons?.length?config.wishPanel:undefined),text=report.content+'\n\n'+wish.content;return {content:text.length<=2000?text:report.content,embeds:text.length<=2000?[]:[{description:wish.content}],components:[new ActionRowBuilder().addComponents(report.components[0].components[0],wish.components[0].components[0])],allowedMentions:{parse:[]}};}
async function onInteraction(i){const [,action,index]=i.customId.split(':');if(!await require('./developer').canReport(i.guild,i.user.id))return i.reply({content:'Du mangler borgerrollen.',flags:MessageFlags.Ephemeral});let category;if(action==='wish'){const cfg=(await settings.get(i.guild.id)).developer.wishPanel||defaults;const button=cfg.buttons[Number(index)];if(!button)throw new Error('Knappen findes ikke længere');category=button.category;if(category==='choose')return i.reply({content:'Hvad ønsker du til serveren?',flags:MessageFlags.Ephemeral,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dev:wishcategory').setPlaceholder('Vælg kategori for ønsket').addOptions(categories.map(c=>({label:c.label.replace(/-fejl/g,''),value:c.id}))))]});}else category=i.values[0];if(!categories.some(c=>c.id===category))throw new Error('Vælg en kategori');return i.showModal(require('./report-form').modal(category,'low','request'));}
async function sendPanel(guild,channelId){
 const cfg=(await settings.get(guild.id)).developer,channel=await guild.channels.fetch(channelId);if(!channel?.isTextBased())throw new Error('Vælg en tekstkanal');
 const messages=await channel.messages.fetch({limit:100});
 if(cfg.wishPanelDelivery?.channel===channelId&&cfg.wishPanelDelivery.messageId&&!messages.has(cfg.wishPanelDelivery.messageId)){const old=await channel.messages.fetch(cfg.wishPanelDelivery.messageId).catch(e=>{if(e.code===10008)return null;throw e;});if(old)messages.set(old.id,old);}
 const own=[...messages.values()].filter(m=>m.author.id===guild.client.user.id),has=(m,prefix)=>m.components.some(r=>r.components?.some(c=>(c.customId||'').startsWith(prefix)));
 const existing=own.find(m=>has(m,'dev:custom:'))||own.find(m=>has(m,'dev:wish:'));
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
