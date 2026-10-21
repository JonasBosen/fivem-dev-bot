const {ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');
const {settings}=require('../db'),{embed,isAdmin,hasAnyRole}=require('../util');
function payload(){
 const row=items=>new ActionRowBuilder().addComponents(items.map(([id,label,style])=>new ButtonBuilder().setCustomId('musicpanel:'+id).setLabel(label).setStyle(style||ButtonStyle.Secondary)));
 return {embeds:[embed('🎵 Musik','Gå ind i en talekanal, og tryk Afspil/link eller Tilføj sang. Indsæt et YouTube-, Spotify- eller SoundCloud-link, eller skriv et sangnavn.\n\nKnapperne styrer musikken i din egen talekanal. Hvis en lydkilde afviser afspilning, får du en fejlbesked.')],components:[row([['play','▶ Afspil / link',ButtonStyle.Success],['add','➕ Tilføj sang',ButtonStyle.Primary],['pause','⏸ Pause'],['resume','▶ Fortsæt']]),row([['skip','⏭ Næste sang'],['stop','⏹ Stop',ButtonStyle.Danger],['queue','🎶 Se kø']])],allowedMentions:{parse:[]}};
}
async function send(guild,channelId){const channel=await require('./panel-diagnostics').destination(guild,channelId);const message=await channel.send(payload());return {messageId:message.id,channelId:channel.id};}
async function interact(i,fleet=require('./music-fleet')){
 const cfg=(await settings.get(i.guildId)).music;
 if(!cfg.enabled)return i.reply({content:'Musik er slået fra.',flags:MessageFlags.Ephemeral});
 const member=await i.guild.members.fetch(i.user.id);
 if(cfg.djRole&&!isAdmin(member)&&!hasAnyRole(member,[cfg.djRole]))return i.reply({content:'Du skal have DJ-rollen for at styre musikken.',flags:MessageFlags.Ephemeral});
 const voice=member.voice.channel;
 if(!voice)return i.reply({content:'Gå ind i den talekanal, hvor du vil høre musik, først.',flags:MessageFlags.Ephemeral});
 const action=i.customId.split(':')[1];
 if(['play','add'].includes(action))return i.showModal(new ModalBuilder().setCustomId('musicpanel:submit').setTitle('Afspil eller tilføj musik').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('song').setLabel('YouTube-, Spotify-, SoundCloud-link / navn').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000))));
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
  if(action==='submit'){
   const query=i.fields.getTextInputValue('song').trim();if(!query)throw Error('Indsæt et link eller et sangnavn.');
   const result=await fleet.play(i.guildId,voice.id,query,i.channelId,i.user);
   return i.editReply({content:'🎵 Tilføjet: '+result.track.title+' · '+result.bot,allowedMentions:{parse:[]}});
  }
  const bot=fleet.list(i.guildId).find(b=>b.ready&&b.channelId===voice.id);
  if(!bot)throw Error('Der er ingen musikbot i din talekanal. Tryk Afspil/link først.');
  if(action==='queue'){
   const state=fleet.state(i.guildId,bot.id);
   return i.editReply({content:state.playing?('🎵 '+state.current.title+'\n'+(state.queue.slice(0,10).map((t,n)=>(n+1)+'. '+t.title).join('\n')||'Køen er tom.')):'Der spilles ikke noget i din talekanal.',allowedMentions:{parse:[]}});
  }
  if(!['pause','resume','skip','stop'].includes(action))throw Error('Ukendt musikknap.');
  await fleet.control(i.guildId,bot.id,action);return i.editReply('✅ '+({pause:'Musikken er sat på pause.',resume:'Musikken fortsætter.',skip:'Springer til næste sang.',stop:'Musikken er stoppet.'})[action]);
 }catch(error){return i.editReply({content:'⚠️ '+error.message.slice(0,1800),allowedMentions:{parse:[]}});}
}
module.exports={payload,send,interact};
