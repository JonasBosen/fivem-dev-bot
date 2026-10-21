const crypto=require('node:crypto');
const {PermissionFlagsBits:P,ChannelType,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle}=require('discord.js');
const state=require('./durable-state');
const IDS=/^\d{17,20}$/;
const SOURCES=[
 {name:'Carl-bot',url:'https://carl.gg/about',ideas:'Starboard og selvvalgte roller. Tickets, moderation og velkomst er allerede i de øvrige paneler.'},
 {name:'sesh',url:'https://sesh.fyi/manual/',ideas:'Afstemninger og planlagte Discord-events.'},
 {name:'YAGPDB',url:'https://yagpdb.xyz/',ideas:'Modulære regler og rolleafgrænsning. Egne tekstkommandoer og automod findes allerede.'},
 {name:'Statbot',url:'https://docs.statbot.net/',ideas:'Undersøgt som inspiration til statistik og kanaloptællere. Ikke bygget som en dublet af eksisterende oversigter.'},
 {name:'Discord API',url:'https://discord.com/developers/docs/resources/guild',ideas:'Den officielle API bestemmer mulighederne. En bot kan ikke ændre andre brugeres lokale lydstyrke.'}
];
const CATALOG=[
 {id:'polls',name:'Afstemningsstudie',icon:'🗳️',group:'Fællesskab',description:'Discords egne afstemninger med op til 10 svar, flere valg og løbetid.',permission:'SendPolls'},
 {id:'events',name:'Eventværksted',icon:'📅',group:'Fællesskab',description:'Planlagte Discord-events med start, slut, beskrivelse og ekstern lokation.',permission:'ManageEvents'},
 {id:'forums',name:'Forumværksted',icon:'🧵',group:'Fællesskab',description:'Opret forumopslag med tags, langsom tilstand og automatisk arkivering.',permission:'SendMessages'},
 {id:'starboard',name:'Starboard',icon:'⭐',group:'Fællesskab',description:'Fremhæv stjernemarkerede beskeder i en særskilt testkanal.',permission:'SendMessages'},
 {id:'roles',name:'Selvvalgte testroller',icon:'🎭',group:'Medlemmer',description:'Knapmenu til harmløse testroller med valgfri eksklusiv rollegruppe.',permission:'ManageRoles'},
 {id:'reputation',name:'Ros og reputation',icon:'🤝',group:'Medlemmer',description:'Giv en anden tester ros med cooldown og en særskilt rangliste. Ingen XP eller automatiske roller.',permission:'SendMessages'},
 {id:'reminders',name:'Planlagte beskeder',icon:'⏰',group:'Automatik',description:'Enkeltstående påmindelser med vedvarende kø og status ved genstart.',permission:'SendMessages'},
 {id:'teams',name:'Holdlaboratorium',icon:'⚖️',group:'Medlemmer',description:'Tilfældig og størrelsesbalanceret holdfordeling uden at flytte medlemmer.',permission:'SendMessages'},
 {id:'voice',name:'Talekanal-kvalitet',icon:'🎙️',group:'Lyd',description:'Afprøv bitrate og brugergrænse på en testtalekanal. Ingen styring af folks lokale lydstyrke.',permission:'ManageChannels'}
];
const defaults=()=>({revision:0,enabled:false,actionCooldownSeconds:5,maxActionsPerHour:30,testChannels:[],testerRoles:[],features:Object.fromEntries(CATALOG.map(m=>[m.id,{enabled:false}])),starboard:{channel:'',sources:[],threshold:3,excludeSelf:true,includeBots:false,maxAgeHours:72},roleMenu:{roles:[],exclusive:false},reputation:{cooldownHours:24,channel:''},history:[],jobs:[],panels:[],stars:{},kudos:{scores:{},last:{}}});
const key=gid=>'testlab:'+gid;
const load=async gid=>{const value=await state.read(key(gid),{}),base=defaults();return {...base,...value,features:{...base.features,...value.features},starboard:{...base.starboard,...value.starboard},roleMenu:{...base.roleMenu,...value.roleMenu},reputation:{...base.reputation,...value.reputation},kudos:{...base.kudos,...value.kudos}};};
async function edit(gid,fn){return state.serial(key(gid),async()=>{const current=await load(gid),next=await fn(current);if(next)await state.write(key(gid),()=>next);return next||current;});}
function text(value,name,max=100){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(name+' er påkrævet (højst '+max+' tegn)');return value.trim();}
function integer(value,name,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Error(name+' skal være '+min+'–'+max);return n;}
function ids(value,max=25){if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!IDS.test(v)))throw Error('Vælg gyldige Discord-ID’er');return [...new Set(value)];}
function feature(cfg,id){if(!cfg.enabled||!cfg.features[id]?.enabled)throw Error('Aktivér Testpanelet og dette modul først');}
function log(cfg,uid,module,action,details={}){cfg.history=[{id:crypto.randomUUID(),at:Date.now(),uid,module,action,...details},...cfg.history].slice(0,300);}
async function member(guild,uid){const result=await guild.members.fetch({user:uid,force:true});if(!result)throw Error('Medlemmet findes ikke');return result;}
async function tester(guild,uid,cfg){const m=await member(guild,uid);if(m.user.bot)throw Error('Bots kan ikke være testdeltagere');if(guild.ownerId===uid||m.permissions.has(P.Administrator))return m;if(!cfg.testerRoles.some(id=>m.roles.cache.has(id)))throw Error('Du mangler en testerrolle');return m;}
async function channel(guild,cfg,id,types=[ChannelType.GuildText,ChannelType.GuildAnnouncement]){if(!cfg.testChannels.includes(id))throw Error('Kanalen er ikke valgt som testkanal');const ch=await guild.channels.fetch(id);if(!ch||!types.includes(ch.type))throw Error('Vælg den rigtige kanaltype');return ch;}
async function permission(guild,ch,uid,bits){const bot=await guild.members.fetchMe(),actor=await member(guild,uid);if(!bot.permissions.has(bits)&&(!ch||!ch.permissionsFor(bot)?.has(bits)))throw Error('Botten mangler Discord-rettigheden: '+bits.toString());if(uid!==guild.ownerId&&!actor.permissions.has(bits)&&(!ch||!ch.permissionsFor(actor)?.has(bits)))throw Error('Du mangler den nødvendige Discord-rettighed');if(ch&&!ch.permissionsFor(bot)?.has([P.ViewChannel,P.SendMessages])&&ch.type!==ChannelType.GuildVoice)throw Error('Botten mangler adgang til testkanalen');}
const dangerous=P.Administrator|P.ManageGuild|P.ManageRoles|P.ManageChannels|P.ManageWebhooks|P.ManageMessages|P.ManageEvents|P.ManageThreads|P.ViewAuditLog|P.BanMembers|P.KickMembers|P.ModerateMembers|P.MentionEveryone|P.MuteMembers|P.DeafenMembers|P.MoveMembers;
async function safeRole(guild,id){const r=await guild.roles.fetch(id),bot=await guild.members.fetchMe();if(!r||id===guild.id||r.managed||r.permissions.any(dangerous)||r.position>=bot.roles.highest.position)throw Error('Testroller skal være uden administrative rettigheder og under bottens rolle');return r;}
async function configure(guild,uid,input){
 return edit(guild.id,async cfg=>{
  if(Number(input.revision)!==cfg.revision)throw Error('Indstillingerne er ændret. Genindlæs Testpanelet.');
  if(typeof input.enabled!=='boolean')throw Error('Ugyldig aktivering');
  const testChannels=ids(input.testChannels),testerRoles=ids(input.testerRoles);
  for(const id of testChannels)if(!await guild.channels.fetch(id))throw Error('Testkanalen findes ikke');
  for(const id of testerRoles)if(!await guild.roles.fetch(id)||id===guild.id)throw Error('Vælg en gyldig testerrolle');
  const features={};for(const m of CATALOG)features[m.id]={enabled:!!input.features?.[m.id]?.enabled};
  const starboard={channel:String(input.starboard?.channel||''),sources:ids(input.starboard?.sources||[]),threshold:integer(input.starboard?.threshold??3,'Stjernetærskel',2,50),excludeSelf:input.starboard?.excludeSelf!==false,includeBots:!!input.starboard?.includeBots,maxAgeHours:integer(input.starboard?.maxAgeHours??72,'Beskedalder i timer',1,720)};
  if(starboard.channel&&!testChannels.includes(starboard.channel)||starboard.sources.some(id=>!testChannels.includes(id)))throw Error('Starboard skal bruge testkanaler');
  if(starboard.sources.includes(starboard.channel))throw Error('Starboard kan ikke bruge sig selv som kilde');
  const roleMenu={roles:ids(input.roleMenu?.roles||[],20),exclusive:!!input.roleMenu?.exclusive};for(const id of roleMenu.roles)await safeRole(guild,id);
  const reputation={cooldownHours:integer(input.reputation?.cooldownHours??24,'Ros-cooldown i timer',1,168),channel:String(input.reputation?.channel||'')};if(reputation.channel&&!testChannels.includes(reputation.channel))throw Error('Ros skal bruge en testkanal');
  const next={...cfg,enabled:input.enabled,actionCooldownSeconds:integer(input.actionCooldownSeconds??5,'Ventetid mellem liveforsøg',0,300),maxActionsPerHour:integer(input.maxActionsPerHour??30,'Liveforsøg pr. time',1,100),testChannels,testerRoles,features,starboard,roleMenu,reputation,revision:cfg.revision+1};log(next,uid,'control','settings_saved');return next;
 });
}
function normalize(id,input){
 const out={};
 if(id!=='events'&&id!=='reputation')out.channelId=text(input.channelId,'Kanal',20);
 if(id==='polls'){out.question=text(input.question,'Spørgsmål',300);out.answers=(Array.isArray(input.answers)?input.answers:[]).map(a=>text(a,'Svar',55));if(out.answers.length<2||out.answers.length>10||new Set(out.answers).size!==out.answers.length)throw Error('Skriv 2–10 forskellige svar');out.duration=integer(input.duration,'Timer',1,768);out.multi=!!input.multi;}
 else if(id==='events'){out.name=text(input.name,'Navn',96);out.description=text(input.description,'Beskrivelse',1000);out.location=text(input.location,'Lokation',100);out.start=Number(input.start);out.end=Number(input.end);if(!Number.isSafeInteger(out.start)||!Number.isSafeInteger(out.end)||out.start<Date.now()+60000||out.end<=out.start||out.end-out.start>7*86400000)throw Error('Vælg fremtidig start og slut (højst syv døgn)');}
 else if(id==='forums'){out.name=text(input.name,'Titel',96);out.content=text(input.content,'Indhold',1800);out.tags=ids(input.tags||[],5);out.slowmode=integer(input.slowmode||0,'Langsom tilstand i sekunder',0,21600);out.archive=integer(input.archive||1440,'Arkivering',60,10080);if(![60,1440,4320,10080].includes(out.archive))throw Error('Vælg en understøttet arkivperiode');}
 else if(id==='roles'||id==='reputation'){out.title=text(input.title||'Testpanelet','Titel',100);if(id==='reputation')out.channelId=text(input.channelId,'Kanal',20);}
 else if(id==='reminders'){out.content=text(input.content,'Påmindelse',1800);out.at=Number(input.at);if(!Number.isSafeInteger(out.at)||out.at<Date.now()+60000||out.at>Date.now()+90*86400000)throw Error('Vælg tidspunkt fra ét minut til 90 dage frem');}
 else if(id==='teams'){out.members=ids(input.members,100);if(out.members.length<2)throw Error('Vælg mindst to deltagere');out.count=integer(input.count,'Hold',2,Math.min(20,out.members.length));out.names=Array.isArray(input.names)?input.names.slice(0,out.count).map(n=>text(n,'Holdnavn',30)):[];}
 else if(id==='voice'){out.bitrate=integer(input.bitrate,'Bitrate i kbps',8,384);out.limit=integer(input.limit,'Brugergrænse',0,99);}
 else throw Error('Modulet bruger automatisk reaktioner, ikke denne handling');
 return out;
}
function divide(members,count,random=crypto.randomInt){const shuffled=[...members];for(let i=shuffled.length-1;i>0;i--){const j=random(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return Array.from({length:count},(_,i)=>shuffled.filter((_,n)=>n%count===i));}
async function preview(guild,uid,id,input){const cfg=await load(guild.id);if(!CATALOG.some(m=>m.id===id))throw Error('Ukendt forsøg');const value=normalize(id,input);if(id!=='events')await channel(guild,cfg,value.channelId,id==='forums'?[ChannelType.GuildForum]:id==='voice'?[ChannelType.GuildVoice]:undefined);return {module:id,value,mode:'preview',note:'Forhåndsvisning – der er ikke ændret noget på Discord.'};}
async function execute(guild,uid,id,input,requestId){
 if(!/^[a-f0-9-]{36}$/i.test(requestId||''))throw Error('Ugyldigt handlings-ID');
 const value=normalize(id,input),catalog=CATALOG.find(m=>m.id===id);if(!catalog)throw Error('Ukendt forsøg');
 return state.serial('testlab-action:'+guild.id,async()=>{
  const cfg=await load(guild.id);feature(cfg,id);
  const prior=cfg.history.find(h=>h.requestId===requestId);if(prior){if(prior.status==='done')return prior.result;throw Error('Handlingen er allerede forsøgt. Kontrollér loggen og Discord før et nyt forsøg.');}
  const recent=cfg.history.filter(h=>h.action==='execute'&&h.at>Date.now()-3600000);if(recent.length>=cfg.maxActionsPerHour)throw Error('Timegrænsen for liveforsøg er nået');if(recent.some(h=>h.module===id&&h.at>Date.now()-cfg.actionCooldownSeconds*1000))throw Error('Vent lidt mellem forsøg i samme modul');
  const ch=id==='events'?null:await channel(guild,cfg,value.channelId,id==='forums'?[ChannelType.GuildForum]:id==='voice'?[ChannelType.GuildVoice]:undefined);
  await permission(guild,ch,uid,P[catalog.permission]);
  await edit(guild.id,current=>{feature(current,id);log(current,uid,id,'execute',{requestId,status:'running'});return current;});
  try{
   let result;
   const nonce=BigInt('0x'+crypto.randomBytes(8).toString('hex')).toString();
   if(id==='polls'){const m=await ch.send({content:'🧪 Testpanelet · Afstemning',poll:{question:{text:value.question},answers:value.answers.map(text=>({text})),duration:value.duration,allowMultiselect:value.multi},allowedMentions:{parse:[]},nonce,enforceNonce:true});result={id:m.id,url:m.url,channelId:ch.id,type:id};}
   else if(id==='events'){const event=await guild.scheduledEvents.create({name:'🧪 '+value.name,description:value.description,scheduledStartTime:new Date(value.start),scheduledEndTime:new Date(value.end),privacyLevel:2,entityType:3,entityMetadata:{location:value.location},reason:'Testpanelet · '+uid});result={id:event.id,url:event.url,type:id};}
   else if(id==='forums'){if(value.tags.some(t=>!ch.availableTags.some(tag=>tag.id===t)))throw Error('Et forumtag findes ikke');const thread=await ch.threads.create({name:'🧪 '+value.name,message:{content:value.content,allowedMentions:{parse:[]}},appliedTags:value.tags,autoArchiveDuration:value.archive,rateLimitPerUser:value.slowmode,reason:'Testpanelet · '+uid});result={id:thread.id,url:thread.url,type:id,channelId:ch.id};}
   else if(id==='roles'){if(!cfg.roleMenu.roles.length)throw Error('Vælg testroller i kontrolpanelet først');const components=[];for(let n=0;n<cfg.roleMenu.roles.length;n+=5){const row=new ActionRowBuilder();for(const rid of cfg.roleMenu.roles.slice(n,n+5)){const role=await safeRole(guild,rid);row.addComponents(new ButtonBuilder().setCustomId('lab:role:'+rid).setLabel(role.name.slice(0,80)).setStyle(ButtonStyle.Secondary));}components.push(row);}const m=await ch.send({content:'🧪 '+value.title+'\nVælg eller fjern din testrolle. '+(cfg.roleMenu.exclusive?'Kun én rolle fra denne menu ad gangen.':''),components,allowedMentions:{parse:[]},nonce,enforceNonce:true});result={id:m.id,url:m.url,channelId:ch.id,type:id};}
   else if(id==='reputation'){const m=await ch.send({content:'🧪 '+value.title+'\nGiv en anden tester ros for hjælpsomhed. Ingen penge, XP eller roller.',components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lab:kudos:open').setLabel('Giv en tester ros').setEmoji('🤝').setStyle(ButtonStyle.Success))],allowedMentions:{parse:[]},nonce,enforceNonce:true});result={id:m.id,url:m.url,channelId:ch.id,type:id};}
   else if(id==='reminders'){const job={id:crypto.randomUUID(),channelId:ch.id,content:value.content,at:value.at,status:'scheduled',uid};await edit(guild.id,current=>{if(current.jobs.filter(j=>j.status==='scheduled').length>=100)throw Error('Højst 100 planlagte testbeskeder');current.jobs.push(job);return current;});result={id:job.id,type:id,at:job.at};}
   else if(id==='teams'){for(const target of value.members)await tester(guild,target,cfg);const teams=divide(value.members,value.count);const content='🧪 Holdfordeling\n'+teams.map((team,n)=>'**'+(value.names[n]||'Hold '+(n+1))+'**\n'+team.map(id=>'<@'+id+'>').join(', ')).join('\n\n');if(content.length>1950)throw Error('For mange deltagere til én Discord-besked. Brug færre deltagere.');const m=await ch.send({content,allowedMentions:{parse:[]},nonce,enforceNonce:true});result={id:m.id,url:m.url,type:id,channelId:ch.id,teams};}
   else if(id==='voice'){const cap=Math.floor((guild.maximumBitrate||96000)/1000);if(value.bitrate>cap)throw Error('Serveren understøtter højst '+cap+' kbps');const before={bitrate:ch.bitrate,userLimit:ch.userLimit};await ch.edit({bitrate:value.bitrate*1000,userLimit:value.limit,reason:'Testpanelet · '+uid});result={id:ch.id,type:id,before,after:{bitrate:value.bitrate*1000,userLimit:value.limit}};}
   await edit(guild.id,current=>{const entry=current.history.find(h=>h.requestId===requestId);if(entry){entry.status='done';entry.result=result;}if(['roles','reputation'].includes(id))current.panels=[...current.panels,{...result}].slice(-100);return current;});
   return result;
  }catch(error){await edit(guild.id,current=>{const entry=current.history.find(h=>h.requestId===requestId);if(entry){entry.status='check_required';entry.error=String(error.code||error.message).slice(0,200);}return current;});throw error;}
 });
}
async function cancelJob(guild,uid,id){return edit(guild.id,cfg=>{const job=cfg.jobs.find(j=>j.id===id);if(!job||job.status!=='scheduled')throw Error('Beskeden kan ikke annulleres');job.status='canceled';log(cfg,uid,'reminders','canceled',{target:id});return cfg;});}
async function finish(guild,uid,id){
 return state.serial('testlab-action:'+guild.id,async()=>{
  const cfg=await load(guild.id),entry=cfg.history.find(h=>h.status==='done'&&h.result?.id===id&&!h.closedAt);if(!entry)throw Error('Forsøget findes ikke eller er allerede afsluttet');const result=entry.result;
  if(result.type==='events'){await permission(guild,null,uid,P.ManageEvents);const event=await guild.scheduledEvents.fetch(id);if(event.status!==1)throw Error('Kun endnu ikke startede testevents kan annulleres');await event.setStatus(4);}
  else if(result.type==='forums'){const forum=await channel(guild,cfg,result.channelId,[ChannelType.GuildForum]);await permission(guild,forum,uid,P.ManageThreads);const thread=await forum.threads.fetch(id);await thread.setArchived(true,'Testpanelet · afsluttet');}
  else if(['polls','roles','reputation','teams'].includes(result.type)){const ch=await channel(guild,cfg,result.channelId);await permission(guild,ch,uid,P.SendMessages);const message=await ch.messages.fetch(id);if(message.author.id!==guild.client.user.id)throw Error('Dette er ikke bottens testbesked');if(result.type==='polls')await message.poll.end();else await message.edit({components:[],content:'🧪 Testpanelet · Forsøget er afsluttet.'});}
  else if(result.type==='voice'){const ch=await channel(guild,cfg,id,[ChannelType.GuildVoice]);await permission(guild,ch,uid,P.ManageChannels);if(ch.bitrate!==result.after.bitrate||ch.userLimit!==result.after.userLimit)throw Error('Kanalen er ændret siden testen. Gendan den manuelt for at bevare nyere ændringer.');await ch.edit({...result.before,reason:'Testpanelet · gendan'});}
  else throw Error('Dette forsøg afsluttes fra joblisten');
  await edit(guild.id,value=>{const item=value.history.find(h=>h.id===entry.id);if(item)item.closedAt=Date.now();value.panels=value.panels.filter(p=>p.id!==id);log(value,uid,result.type,'closed',{target:id});return value;});return {closed:true};
 });
}
async function interact(i){
 const cfg=await load(i.guild.id),parts=i.customId.split(':'),id=parts[1]==='role'?'roles':'reputation';feature(cfg,id);await tester(i.guild,i.user.id,cfg);
 if(!cfg.testChannels.includes(i.channelId))throw Error('Dette er ikke længere en testkanal');
 if(!cfg.panels.some(p=>p.id===i.message?.id&&p.type===id)&&!i.isModalSubmit())throw Error('Dette testpanel er ikke registreret');
 if(id==='reputation'&&parts[2]==='open'){const modal=new ModalBuilder().setCustomId('lab:kudos:save').setTitle('Giv en tester ros');modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user').setLabel('Testerens Discord-bruger-ID').setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Hvad var hjælpsomt?').setStyle(TextInputStyle.Paragraph).setMaxLength(300)));return i.showModal(modal);}
 await i.deferReply({flags:MessageFlags.Ephemeral});
 if(id==='roles'){
  const rid=parts[2];if(!cfg.roleMenu.roles.includes(rid))throw Error('Rollen er ikke længere tilladt');let adding;
  await state.serial('testlab-role:'+i.guild.id+':'+i.user.id,async()=>{const fresh=await load(i.guild.id);feature(fresh,'roles');if(!fresh.roleMenu.roles.includes(rid))throw Error('Rollen er ikke længere tilladt');await safeRole(i.guild,rid);const m=await member(i.guild,i.user.id);adding=!m.roles.cache.has(rid);if(adding){if(fresh.roleMenu.exclusive)for(const other of fresh.roleMenu.roles.filter(r=>r!==rid&&m.roles.cache.has(r))){await safeRole(i.guild,other);await m.roles.remove(other,'Testpanelet · selvvalg');}await m.roles.add(rid,'Testpanelet · selvvalg');}else await m.roles.remove(rid,'Testpanelet · selvvalg');});
  await edit(i.guild.id,current=>{log(current,i.user.id,'roles',adding?'role_added':'role_removed',{target:rid});return current;});return i.editReply(adding?'Testrollen er tilføjet.':'Testrollen er fjernet.');
 }
 const target=i.fields.getTextInputValue('user').trim(),reason=text(i.fields.getTextInputValue('reason'),'Begrundelse',300);if(!IDS.test(target)||target===i.user.id)throw Error('Vælg en anden tester');await tester(i.guild,target,cfg);
 await edit(i.guild.id,current=>{feature(current,'reputation');const pair=i.user.id+':'+target,now=Date.now();if(now-Number(current.kudos.last[pair]||0)<current.reputation.cooldownHours*3600000)throw Error('Du har allerede rost denne tester. Vent til cooldown er slut.');current.kudos.last[pair]=now;current.kudos.scores[target]=Number(current.kudos.scores[target]||0)+1;log(current,i.user.id,'reputation','kudos',{target,reason});return current;});return i.editReply('Din ros er gemt. Tak!');
}
async function reaction(reaction,user){
 if(user.bot||reaction.emoji.name!=='⭐')return;if(reaction.partial)await reaction.fetch();const message=reaction.message.partial?await reaction.message.fetch():reaction.message,guild=message.guild;if(!guild)return;
 const cfg=await load(guild.id);if(!cfg.enabled||!cfg.features.starboard.enabled||!cfg.starboard.sources.includes(message.channelId)||!cfg.starboard.channel||message.channelId===cfg.starboard.channel)return;
 if(!cfg.starboard.includeBots&&message.author.bot||Date.now()-message.createdTimestamp>cfg.starboard.maxAgeHours*3600000)return;
 await state.serial('lab-star:'+guild.id+':'+message.id,async()=>{
  const latest=await load(guild.id);if(latest.stars[message.id])return;
  const users=await reaction.users.fetch({limit:100});const count=[...users.values()].filter(u=>!u.bot&&(!latest.starboard.excludeSelf||u.id!==message.author.id)).length;if(count<latest.starboard.threshold)return;
  const source=await channel(guild,latest,message.channelId),bot=await guild.members.fetchMe(),dest=await channel(guild,latest,latest.starboard.channel);if(!source.permissionsFor(bot)?.has([P.ViewChannel,P.ReadMessageHistory]))return;
  // Never copy private message content into a potentially wider audience.
  const posted=await dest.send({content:`⭐ Testpanelet · ${count} stjerner\n${message.url}\nÅbn originalen for at læse beskeden.`,flags:MessageFlags.SuppressEmbeds,allowedMentions:{parse:[]},nonce:message.id,enforceNonce:true});
  await edit(guild.id,current=>{current.stars[message.id]={id:posted.id,channelId:dest.id,sourceChannel:message.channelId};log(current,'system','starboard','highlighted',{source:message.id});return current;});
 });
}
async function tick(guild,now=Date.now()){
 const cfg=await load(guild.id);if(!cfg.enabled||!cfg.features.reminders.enabled)return;
 for(const job of cfg.jobs.filter(j=>j.status==='scheduled'&&j.at<=now))await state.serial('lab-job:'+guild.id+':'+job.id,async()=>{
  let current=await load(guild.id),entry=current.jobs.find(j=>j.id===job.id);if(entry?.status!=='scheduled')return;
  const ch=await channel(guild,current,job.channelId);
  await edit(guild.id,value=>{const row=value.jobs.find(j=>j.id===job.id);if(row.status!=='scheduled')throw Error('Jobbet er ændret');row.status='sending';return value;});
  try{const message=await ch.send({content:'🧪 Testpåmindelse\n'+job.content,allowedMentions:{parse:[]},nonce:BigInt('0x'+job.id.replace(/-/g,'').slice(0,16)).toString(),enforceNonce:true});await edit(guild.id,value=>{Object.assign(value.jobs.find(j=>j.id===job.id),{status:'sent',messageId:message.id,sentAt:now});log(value,job.uid,'reminders','sent',{target:job.id});return value;});}
  catch(error){await edit(guild.id,value=>{Object.assign(value.jobs.find(j=>j.id===job.id),{status:'check_required',error:String(error.code||error.message).slice(0,200)});return value;});}
 });
}
let timer,running=false;function start(client){if(timer)return;const run=async()=>{if(running)return;running=true;try{for(const guild of client.guilds.cache.values())await tick(guild).catch(e=>console.warn('[testpanel]',e.code||e.name));}finally{running=false;}};timer=setInterval(run,15000);timer.unref();run();}
async function snapshot(guild){const cfg=await load(guild.id),bot=await guild.members.fetchMe();return {config:cfg,catalog:CATALOG,sources:SOURCES,checkedAt:Date.now(),botReady:guild.client.isReady(),channels:[...guild.channels.cache.values()].filter(c=>[0,2,5,15].includes(c.type)).map(c=>({id:c.id,name:c.name,type:c.type,tags:c.availableTags||[],bitrate:c.bitrate,userLimit:c.userLimit})),permissions:Object.fromEntries(CATALOG.map(m=>[m.id,bot.permissions.has(P[m.permission])])),maxBitrate:Math.floor((guild.maximumBitrate||96000)/1000)};}
module.exports={defaults,load,configure,normalize,divide,preview,execute,cancelJob,finish,interact,reaction,tick,start,snapshot,safeRole};
