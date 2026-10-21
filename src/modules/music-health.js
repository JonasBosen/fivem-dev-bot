const {PermissionFlagsBits:P}=require('discord.js');
function inspect(client,guildId,queue){
 const member=client?.guilds.cache.get(guildId)?.members.me,voice=member?.voice,channel=voice?.channel,permissions=channel?.permissionsFor(member),dispatcher=queue?.dispatcher;
 return {botId:client?.user?.id,channelId:voice?.channelId||null,channel:channel?.name||null,serverMuted:!!voice?.serverMute,selfMuted:!!voice?.selfMute,suppressed:!!voice?.suppress,canSpeak:permissions?permissions.has(P.Speak):null,canConnect:permissions?permissions.has(P.Connect):null,connection:dispatcher?.voiceConnection?.state?.status||'disconnected',audio:dispatcher?.audioPlayer?.state?.status||'idle',audioMilliseconds:Number(dispatcher?.audioResource?.playbackDuration||0),volume:queue?.node?.volume??null};
}
function problem(health){
 if(health.serverMuted)return 'Musikbotten er server-muted. Fjern server-mute i Discord.';
 if(health.suppressed)return 'Musikbotten må ikke tale i denne scenekanal. Brug en almindelig talekanal eller giv den taleret.';
 if(health.canSpeak===false)return 'Musikbotten mangler rettigheden Tal i talekanalen.';
 if(health.selfMuted)return 'Musikbottens mikrofon er slået fra.';
 if(health.volume===0)return 'Musikafspillerens lydstyrke er 0. Brug !volume 60.';
 if(health.audio==='playing'&&health.audioMilliseconds===0)return 'Afspilleren er startet, men har endnu ikke sendt lydframes.';
 if(health.audio==='buffering')return 'Afspilleren venter på lyd fra musikkilden.';
 return '';
}
module.exports={inspect,problem};
