const {PermissionFlagsBits:P,ChannelType}=require('discord.js');
const {settings}=require('../db');
const required=[P.ViewChannel,P.SendMessages,P.EmbedLinks];
const labels=['Se kanal','Send beskeder','Indlejr links'];
async function destination(guild,id){
 if(typeof id!=='string'||!/^\d{17,20}$/.test(id))throw Error('Vælg en Discord-tekstkanal');
 const channel=await guild.channels.fetch(id).catch(()=>null);
 if(!channel||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))throw Error('Kanalen findes ikke længere eller er ikke en tekstkanal. Opdatér kanallisten og vælg igen.');
 const bot=guild.members.me||await guild.members.fetchMe();
 const perms=channel.permissionsFor(bot),missing=required.flatMap((p,i)=>perms?.has(p)?[]:[labels[i]]);
 if(missing.length)throw Error('Botten mangler rettigheder i #'+channel.name+': '+missing.join(', '));
 return channel;
}
async function inspect(guild){
 const cfg=await settings.get(guild.id),bot=guild.members.me||await guild.members.fetchMe();
 const channels=[...guild.channels.cache.values()].filter(ch=>[ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(ch.type)).map(ch=>({id:ch.id,name:ch.name,ready:required.every(p=>ch.permissionsFor(bot)?.has(p)),missing:required.flatMap((p,i)=>ch.permissionsFor(bot)?.has(p)?[]:[labels[i]])}));
 const autoRoles=(cfg.welcome.autoRoles||[]).filter(Boolean).map(id=>{const role=guild.roles.cache.get(id);return {id,name:role?.name||'Slettet rolle',ready:!!role&&!role.managed&&!!bot.permissions.has(P.ManageRoles)&&bot.roles.highest.comparePositionTo(role)>0};});
 const log=cfg.tickets.logChannel&&guild.channels.cache.get(cfg.tickets.logChannel);
 return {checkedAt:Date.now(),database:'Supabase',hosting:process.env.VERCEL?'Vercel':'Lokal / daemon',channels,autoRoles,modules:Object.fromEntries(['tickets','applications','verification','developer','welcome','music','giveaways','stream','birthdays','slideshow'].map(k=>[k,{enabled:!!cfg[k]?.enabled}])),supportLog:{configured:!!log,private:!!log&&log.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)===false},note:'Kontrollen sender ingen paneler eller beskeder. Discord kan stadig afvise en handling, hvis rettigheder ændres efter kontrollen.'};
}
module.exports={destination,inspect};
