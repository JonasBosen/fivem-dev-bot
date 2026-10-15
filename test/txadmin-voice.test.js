const {test}=require('node:test'),assert=require('node:assert/strict');process.env.DB_FILE=':memory:';
const {initDb,db,settings}=require('../src/db'),tx=require('../src/modules/txadmin'),{ChannelType}=require('discord.js');
test('FiveM voice counter shows actual players, separates missing contact, throttles renames across reloads and preserves text configuration',async()=>{await initDb();try{
 const now=Date.now(),changes=[],voice={type:ChannelType.GuildVoice,name:'Serverstatus',setName:async name=>{voice.name=name;changes.push(name);}},guild={id:'voice',channels:{fetch:async()=>voice}};
 const setState=async patch=>{const cfg=(await settings.get(guild.id)).txadmin;await settings.setModule(guild.id,'txadmin',{...cfg,state:{...cfg.state,...patch}});};
 await settings.setModule(guild.id,'txadmin',{enabled:true,sourceMode:'bridge',channel:'text-channel',voiceChannel:'voice-channel',state:{lastSeen:now,phase:'online',players:12,maxPlayers:48}});
 await tx.updateVoice(guild,now);assert.equal(voice.name,'🟢 Online · 12/48 spillere');await tx.updateVoice(guild,now+1000);assert.equal(changes.length,1);
 await setState({players:13});await tx.updateVoice(guild,now+30000);assert.equal(changes.length,1);await setState({lastSeen:now+360001});await tx.updateVoice(guild,now+360001);assert.equal(voice.name,'🟢 Online · 13/48 spillere');
 await tx.updateVoice(guild,now+460000);assert.equal(changes.length,2);await tx.updateVoice(guild,now+611000);assert.equal(voice.name,'🔴 Offline / ingen kontakt');assert.equal((await settings.get(guild.id)).txadmin.channel,'text-channel');
 await setState({lastSeen:now+620000,phase:'shutting_down'});await tx.updateVoice(guild,now+620000);assert.equal(changes.length,3);assert.equal(tx.voiceName((await settings.get(guild.id)).txadmin,now+620000),'🔴 Genstarter / offline');assert.equal(tx.voiceName({state:null}),'⚪ Afventer FiveM-server');
 const cfg=(await settings.get(guild.id)).txadmin;await settings.setModule(guild.id,'txadmin',{...cfg,voiceChannel:''});await tx.updateVoice(guild,now+2000000);assert.equal(changes.length,3);
 }finally{await db.close();}});
test('voice counter rejects text channels and stores permission or Discord failures without losing telemetry',async()=>{await initDb();try{
 const guild={id:'voice-errors',channels:{fetch:async()=>({type:ChannelType.GuildText})}};await settings.setModule(guild.id,'txadmin',{enabled:true,voiceChannel:'wrong',state:{lastSeen:Date.now(),players:3,maxPlayers:10}});await assert.rejects(tx.updateVoice(guild),/talekanal/);const cfg=(await settings.get(guild.id)).txadmin;assert.match(cfg.voiceState.error,/Kunne ikke/);assert.equal(cfg.state.players,3);
 }finally{await db.close();}});
