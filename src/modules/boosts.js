const {settings}=require('../db');
const {embed,fill,memberVars}=require('../util');
const media=require('./panel-media');
const state=require('./durable-state');
const {PermissionFlagsBits:P}=require('discord.js');
async function destination(guild,id){
 const channel=await require('./panel-diagnostics').destination(guild,id);
 const bot=guild.members.me||await guild.members.fetchMe();
 if(!channel.permissionsFor(bot)?.has(P.AttachFiles))throw Error('Botten mangler Vedhæft filer i kanalen');
 return channel;
}
async function validate(guild,input){
 const cfg={enabled:input.enabled,channel:input.channel||'',message:input.message,title:input.title||'Tak for server boost',mediaId:input.mediaId||'',imageUrl:input.imageUrl||'',color:input.color||'#f47fff'};
 if(typeof cfg.enabled!=='boolean'||typeof cfg.message!=='string'||!cfg.message.trim()||cfg.message.length>1800)throw Error('Skriv en takketekst på 1–1800 tegn');
 if(typeof cfg.channel!=='string'||cfg.channel&&!/^\d{17,20}$/.test(cfg.channel))throw Error('Vælg en tekstkanal');
 media.validate(cfg);
 if(cfg.mediaId&&!await media.get(guild.id,cfg.mediaId,'boosts'))throw Error('Vælg et billede fra dette panels bibliotek');
 if(cfg.enabled||cfg.channel)await destination(guild,cfg.channel);
 return cfg;
}
async function configure(guild,input){
 const cfg=await validate(guild,input);await settings.setModule(guild.id,'boosts',cfg);return cfg;
}
async function payload(member,cfg){
 return media.decorate(member.guild.id,cfg,embed(cfg.title,fill(cfg.message,memberVars(member))),{content:'<@'+member.id+'>',allowedMentions:{parse:[],users:[member.id]}},'boosts');
}
async function testBoost(guild,userId,input){
 const cfg=await validate(guild,input),channel=await destination(guild,cfg.channel),member=await guild.members.fetch(userId);
 const demo=await payload(member,cfg);demo.embeds[0].setFooter({text:'DEMO · Test af server boost'});
 const message=await channel.send(demo);return {ok:true,messageId:message.id};
}
async function onMember(oldMember,member){
 if(oldMember.partial||oldMember.premiumSinceTimestamp||!member.premiumSinceTimestamp||member.user.bot)return;
 return notify(member,member.premiumSinceTimestamp);
}
async function onMessage(message){
 if(!message.guild||![8,9,10,11].includes(message.type)||message.author?.bot)return;
 const member=message.member||await message.guild.members.fetch(message.author.id);
 if(member.premiumSinceTimestamp&&Math.abs(message.createdTimestamp-member.premiumSinceTimestamp)<60000)return;
 return notify(member,'message-'+message.id);
}
async function notify(member,eventId){
 const guild=member.guild,cfg=(await settings.get(guild.id)).boosts;
 if(!cfg.enabled)return;
 const key='boost-thanks:'+guild.id+':'+member.id+':'+eventId;
 return state.serial(key,async()=>{
  if((await state.read(key)).status)return;
  const channel=await destination(guild,cfg.channel);
  const messagePayload=await payload(member,cfg);
  let claimed=false;await state.write(key,value=>{if(value.status)return value;claimed=true;return {status:'sending',at:Date.now()};});if(!claimed)return;
  try{const message=await channel.send(messagePayload);await state.write(key,()=>({status:'sent',messageId:message.id,at:Date.now()}));}
  catch(error){await state.write(key,()=>({status:'check_required',at:Date.now(),error:String(error.code||error.message).slice(0,200)}));throw error;}
 });
}
module.exports={configure,onMember,onMessage,testBoost};
