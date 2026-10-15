const {Client,GatewayIntentBits,Events,MessageFlags}=require('discord.js');
const music=require('./music');
const {settings}=require('../db');
const {isAdmin,hasAnyRole,embed}=require('../util');
function choose(candidates,channelId,explicit){
  const available=candidates.filter(c=>c.ready);
  if(explicit){const bot=available.find(c=>c.id===explicit);if(!bot)throw new Error('Den valgte musikbot er ikke online på serveren');if(bot.channelId&&bot.channelId!==channelId)throw new Error('Den valgte musikbot er optaget i en anden kanal');return bot;}
  const same=available.find(c=>c.channelId===channelId);if(same)return same;
  const free=available.find(c=>!c.channelId);if(!free)throw new Error('Alle musikbots er optaget. Tilslut en ekstra musikbot i dashboardet.');return free;
}
const workers=new Map(),reservations=new Map(),locks=new Map();
function candidates(gid){return [...workers.values()].filter(w=>w.client.guilds.cache.has(gid)).map(w=>({id:w.client.user?.id||w.key,name:w.name||w.client.user?.username||w.key,ready:w.ready&&w.client.isReady(),channelId:reservations.get(w.key+':'+gid)||w.client.guilds.cache.get(gid)?.members.me?.voice.channelId||null,worker:w}));}
function list(gid){return candidates(gid).map(({worker,...item})=>({...item,state:worker.service.state(gid)}));}
async function init(mainClient){
  workers.set('main',{key:'main',client:mainClient,service:music,ready:true,name:mainClient.user.username});
  const seen=new Set([process.env.DISCORD_TOKEN]);
  for(const [key,raw]of Object.entries(process.env)){
    if(!/^MUSIC_BOT_\d+_TOKEN$/.test(key)||!raw?.trim()||seen.has(raw.trim()))continue;
    const token=raw.trim();seen.add(token);
    const id=key.replace(/_TOKEN$/,'');
    const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates]});
    const worker={key:id,client,service:music.createMusicService(),ready:false,name:process.env[id+'_NAME']||id};workers.set(id,worker);
    client.once(Events.ClientReady,async()=>{try{await worker.service.init(client);worker.ready=true;console.log('[musikpulje]',id,'online');}catch{console.error('[musikpulje]',id,'kunne ikke initialiseres');}});
    client.on('error',()=>console.warn('[musikpulje]',id,'forbindelsesfejl'));
    client.login(token).catch(()=>console.error('[musikpulje]',id,'login fejlede. Kontrollér tokenet.'));
  }
}
async function play(gid,channelId,query,textId,user,explicit){
  const selected=choose(candidates(gid),channelId,explicit),w=selected.worker,key=w.key+':'+gid;
  reservations.set(key,channelId);
  const previous=locks.get(key)||Promise.resolve();
  const promise=previous.catch(()=>{}).then(async()=>{
    const guild=w.client.guilds.cache.get(gid),vc=await guild.channels.fetch(channelId);
    if(!vc?.isVoiceBased())throw new Error('Vælg en talekanal');
    const channel=textId?await guild.channels.fetch(textId).catch(()=>null):null;
    return {...await w.service.play(guild,vc,query,channel,user),bot:selected.name,botId:selected.id};
  });locks.set(key,promise);
  try{return await promise;}finally{if(locks.get(key)===promise){locks.delete(key);reservations.delete(key);}}
}
function state(gid,id){const w=id?[...workers.values()].find(w=>w.client.user?.id===id):workers.get('main');return w?.service.state(gid)||{playing:false,queue:[]};}
function control(gid,id,action,value){const w=id?[...workers.values()].find(w=>w.client.user?.id===id):workers.get('main');if(!w?.ready)throw new Error('Musikbotten er ikke klar');return w.service.control(gid,action,value);}
async function onCommand(i){
  const config=(await settings.get(i.guildId)).music;
  if(config.djRole&&!isAdmin(i.member)&&!hasAnyRole(i.member,[config.djRole]))return i.reply({content:'Du skal have DJ-rollen.',flags:MessageFlags.Ephemeral});
  const vc=i.member.voice.channel;
  if(!vc)return i.reply({content:'Gå ind i den talekanal, du vil høre musik i.',flags:MessageFlags.Ephemeral});
  if(i.commandName==='play'){
    await i.deferReply();
    const result=await play(i.guildId,vc.id,i.options.getString('sang'),i.channelId,i.user);
    return i.editReply({embeds:[embed('Tilføjet til musik',result.track.title+' · '+result.bot)]});
  }
  const bot=candidates(i.guildId).find(b=>b.channelId===vc.id&&b.ready);
  if(!bot)return i.reply({content:'Der er ingen musikbot i din talekanal.',flags:MessageFlags.Ephemeral});
  // Reuse the selected service's command handler with the same voice channel and settings.
  return bot.worker.service.onCommand(i);
}

function parseMessage(content,prefix='!'){
  if(!prefix||!content.startsWith(prefix))return null;
  const [command,...rest]=content.slice(prefix.length).trim().split(/\s+/);
  if(!['play','next','skip','stop','pause','resume','queue','volume','shuffle','nowplaying','loop'].includes(command.toLowerCase()))return null;
  return {name:command.toLowerCase(),query:rest.join(' ')};
}
async function onMessage(message){
  const cfg=await settings.get(message.guild.id),parsed=parseMessage(message.content,cfg.general.prefix);
  if(!parsed)return false;
  try{
    if(parsed.name==='play'&&!parsed.query)throw new Error('Skriv play efterfulgt af et sangnavn eller et YouTube-/Spotify-link.');
    if(parsed.name==='volume'&&(!/^\d+$/.test(parsed.query)||Number(parsed.query)>150))throw new Error('Lydstyrke skal være 0–150, fx !volume 60.');
    if(parsed.name==='loop'&&!['off','track','queue','autoplay'].includes(parsed.query))throw new Error('Brug loop off, track, queue eller autoplay.');
    const reply=payload=>message.reply(typeof payload==='string'?{content:payload,allowedMentions:{parse:[]}}:{...payload,flags:undefined,allowedMentions:{parse:[]}});
    const adapter={guild:message.guild,guildId:message.guild.id,member:message.member,user:message.author,channel:message.channel,channelId:message.channel.id,commandName:parsed.name,deferred:false,
      options:{getString:()=>parsed.query,getInteger:()=>Number(parsed.query)},reply,
      deferReply:async()=>{adapter.deferred=true;await message.channel.sendTyping();},editReply:reply};
    await onCommand(adapter);
  }catch(error){await message.reply({content:'⚠️ '+error.message,allowedMentions:{parse:[]}});}
  return true;
}
module.exports={choose,init,list,play,state,control,onCommand,onMessage,parseMessage};
