const {db,settings}=require('../db');
const {fill}=require('../util');
const {PermissionFlagsBits:P}=require('discord.js');
const audit=require('./site-audit');
const platforms=['twitch','youtube','kick','tiktok'];
const locks=new Map(),tokens=new Map(),discoveries=new Map();
let running=false;
const diagnosticKey=a=>'diagnostic:'+a.platform+':'+a.user_id;
async function remember(guild,account,state,message){
  const key=diagnosticKey(account),old=await getState(guild.id,key);
  const value={state,message,checkedAt:Date.now()};await setState(guild.id,key,value);
  if(!old||old.state!==state||old.message!==message)await audit.record(guild.id,account.user_id,'stream','stream_check',{platform:account.platform,handle:account.handle,...value});
  return value;
}
async function inspect(guild,p){
  if(!platforms.includes(p))throw new Error('Ukendt platform');
  const cfg=(await settings.get(guild.id)).stream.platforms[p],issues=[];
  if(!cfg.enabled)issues.push('Platformen er slået fra.');
  if(!cfg.streamerRole||!guild.roles.cache.has(cfg.streamerRole))issues.push('Vælg en eksisterende streamerrolle.');
  if(!integrationStatus()[p])issues.push(p==='tiktok'?'TikTok bruger manuel start og slut.':'Automatik mangler '+({twitch:'TWITCH_CLIENT_ID og TWITCH_CLIENT_SECRET',youtube:'YOUTUBE_API_KEY',kick:'KICK_CLIENT_ID og KICK_CLIENT_SECRET'}[p])+' på Render.');
  let deliveryReady=true;
  const channel=cfg.channel?await guild.channels.fetch(cfg.channel).catch(()=>null):null;
  const me=guild.members.me||await guild.members.fetchMe();
  const permissions=channel?.permissionsFor(me);
  if(!channel?.isTextBased()||!permissions?.has(P.ViewChannel)||!permissions.has(P.SendMessages)){issues.push('Botten mangler adgang til at se og sende i notifikationskanalen.');deliveryReady=false;}
  if(cfg.pingRole){const role=guild.roles.cache.get(cfg.pingRole);if(!role){issues.push('PING-rollen findes ikke.');deliveryReady=false;}else if(!role.mentionable&&!permissions?.has(P.MentionEveryone)){issues.push('PING-rollen skal kunne nævnes, eller botten skal have tilladelsen Nævn @everyone, @here og alle roller i kanalen.');deliveryReady=false;}}
  const rows=[];
  for(const a of (await accounts(guild.id)).filter(a=>a.platform===p)){
    let memberEligible=false,memberError='';try{memberEligible=await eligible(guild,p,a.user_id);}catch{memberError='Discord-medlemskab kunne ikke kontrolleres.';}
    rows.push({...a,eligible:memberEligible,error:memberError||(!memberEligible?'Brugeren mangler den valgte streamerrolle.':''),lastCheck:await getState(guild.id,diagnosticKey(a)),active:await getState(guild.id,'account:'+p+':'+a.user_id)});
  }
  if(!rows.length)issues.push('Tilknyt mindst én Discord-person og streamkonto.');
  return {platform:p,credentialsReady:integrationStatus()[p],deliveryReady,issues,accounts:rows};
}
async function checkAccount(guild,account,force=false){
  const p=account.platform,cfg=(await settings.get(guild.id)).stream.platforms[p];
  try{
    if(!cfg.enabled){await transition(guild,p,account.user_id,null,true);return remember(guild,account,'disabled','Platformen er slået fra.');}
    if(!await eligible(guild,p,account.user_id)){await transition(guild,p,account.user_id,null,true);return remember(guild,account,'role_missing','Discord-brugeren mangler streamerrollen.');}
    if(!integrationStatus()[p])return remember(guild,account,'not_connected',p==='tiktok'?'Manuel start/slut kræves for TikTok.':'Platformens API-oplysninger mangler på Render.');
    if(force&&p==='youtube')discoveries.delete(account.handle);
    const previous=await getState(guild.id,'account:'+p+':'+account.user_id),source=await live(p,account.handle,previous);
    await transition(guild,p,account.user_id,source);
    return remember(guild,account,source?'live':'offline',source?'Live-status bekræftet. Streambeskeden er registreret i kanalen.':'Platformen melder, at kanalen er offline.');
  }catch(e){console.warn('[stream]',p,e.message);return remember(guild,account,'error',e.message);}
}
async function checkNow(guild,p){
  if(!platforms.includes(p))throw new Error('Ukendt platform');
  for(const a of (await accounts(guild.id)).filter(a=>a.platform===p))await checkAccount(guild,a,true);
  return inspect(guild,p);
}
async function testDelivery(guild,p,uid,ping=false){
  const diagnosis=await inspect(guild,p);if(!diagnosis.deliveryReady)throw new Error(diagnosis.issues.join(' '));
  const cfg=(await settings.get(guild.id)).stream.platforms[p],channel=await guild.channels.fetch(cfg.channel);
  const message=await channel.send({content:(ping&&cfg.pingRole?'<@&'+cfg.pingRole+'> ':'')+'🧪 Test af '+p+'-notifikationer. Dette er en testbesked, ikke en livestream.',allowedMentions:{parse:[],roles:ping&&cfg.pingRole?[cfg.pingRole]:[]}});
  await audit.record(guild.id,uid,'stream','test_notification',{platform:p,ping,messageId:message.id});
  return {ok:true,messageId:message.id};
}
const getState=async(g,k)=>{const row=await db.prepare('SELECT value FROM stream_state WHERE guild_id=? AND key=?').get(g,k);if(!row)return null;try{return JSON.parse(row.value);}catch{return null;}};
const setState=async(g,k,v)=>v==null?db.prepare('DELETE FROM stream_state WHERE guild_id=? AND key=?').run(g,k):db.prepare('INSERT INTO stream_state (guild_id,key,value) VALUES (?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value').run(g,k,JSON.stringify(v));
function integrationStatus(){return {twitch:!!(process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_CLIENT_SECRET),youtube:!!process.env.YOUTUBE_API_KEY,kick:!!(process.env.KICK_CLIENT_ID&&process.env.KICK_CLIENT_SECRET),tiktok:false};}
function validateConfig(input){
  if(!input||typeof input!=='object'||!input.platforms)throw new Error('Platformindstillinger mangler');
  const out={...input,platforms:{}};
  for(const p of platforms){
    const x=input.platforms[p];if(!x||typeof x.enabled!=='boolean'||typeof x.deleteWhenOffline!=='boolean')throw new Error('Ugyldige indstillinger for '+p);
    for(const key of ['channel','streamerRole','pingRole'])if(typeof x[key]!=='string'||(x[key]&&!/^\d{17,20}$/.test(x[key])))throw new Error('Ugyldigt kanal-/rolle-ID');
    if(typeof x.message!=='string'||!x.message.trim()||x.message.length>1400)throw new Error('Beskeden skal være 1–1400 tegn');
    if([...x.message.matchAll(/\{([^{}]+)\}/g)].some(m=>!['name','title','game','url'].includes(m[1])))throw new Error('Brug kun {name}, {title}, {game} og {url}. Skriv egne navne og links uden krøllede parenteser.');
    if(x.enabled&&(!x.channel||!x.streamerRole))throw new Error('Vælg kanal og streamerrolle før du aktiverer '+p);
    out.platforms[p]={enabled:x.enabled,channel:x.channel,streamerRole:x.streamerRole,pingRole:x.pingRole,deleteWhenOffline:x.deleteWhenOffline,message:x.message};
  }
  return out;
}
function normalize(p,handle){
  if(!platforms.includes(p))throw new Error('Ukendt platform');
  if(typeof handle!=='string')throw new Error('Skriv kanalens navn eller ID');
  const value=handle.trim().replace(/^@/,'');
  if(p==='youtube'?!/^UC[A-Za-z0-9_-]{22}$/.test(value):!/^[A-Za-z0-9_.-]{1,50}$/.test(value))throw new Error(p==='youtube'?'Brug YouTubes UC-kanal-ID':'Brug kanalens brugernavn, uden link');
  return p==='youtube'?value:value.toLowerCase();
}
const accounts=gid=>db.prepare('SELECT * FROM stream_accounts WHERE guild_id=? ORDER BY platform,user_id').all(gid);
async function eligible(guild,p,uid){
  const cfg=(await settings.get(guild.id)).stream.platforms[p];
  const member=await guild.members.fetch({user:uid,force:true});
  return !!cfg.streamerRole&&member.roles.cache.has(cfg.streamerRole);
}
async function link(guild,p,uid,handle,actor){
  handle=normalize(p,handle);
  if(typeof uid!=='string'||!/^\d{17,20}$/.test(uid))throw new Error('Vælg en Discord-bruger');
  if(!await eligible(guild,p,uid))throw new Error('Brugeren mangler platformens streamerrolle');
  const duplicate=await db.prepare('SELECT user_id FROM stream_accounts WHERE guild_id=? AND platform=? AND handle=?').get(guild.id,p,handle);
  if(duplicate&&duplicate.user_id!==uid)throw new Error('Kanalen er allerede knyttet til en anden Discord-bruger');
  await transition(guild,p,uid,null,true);
  await db.prepare('INSERT INTO stream_accounts (guild_id,platform,user_id,handle) VALUES (?,?,?,?) ON CONFLICT(guild_id,platform,user_id) DO UPDATE SET handle=excluded.handle').run(guild.id,p,uid,handle);
  await audit.record(guild.id,actor,'stream','account_linked',{platform:p,userId:uid,handle});
  return accounts(guild.id);
}
async function unlink(guild,p,uid,actor){
  if(!platforms.includes(p))throw new Error('Ukendt platform');
  await transition(guild,p,uid,null,true);
  await db.prepare('DELETE FROM stream_accounts WHERE guild_id=? AND platform=? AND user_id=?').run(guild.id,p,uid);
  await audit.record(guild.id,actor,'stream','account_removed',{platform:p,userId:uid});return accounts(guild.id);
}
async function json(url,options={}){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Platformen svarede HTTP '+r.status);
  return r.json();
}
async function appToken(p){
  const old=tokens.get(p);if(old&&old.until>Date.now())return old.token;
  const upper=p.toUpperCase();
  const body=new URLSearchParams({client_id:process.env[upper+'_CLIENT_ID'],client_secret:process.env[upper+'_CLIENT_SECRET'],grant_type:'client_credentials'});
  const j=await json(p==='twitch'?'https://id.twitch.tv/oauth2/token':'https://id.kick.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!j.access_token)throw new Error('Platformens login blev afvist');
  tokens.set(p,{token:j.access_token,until:Date.now()+(j.expires_in-60)*1000});return j.access_token;
}
async function live(p,handle,previous){
  if(p==='twitch'){
    const j=await json('https://api.twitch.tv/helix/streams?user_login='+encodeURIComponent(handle),{headers:{'Client-ID':process.env.TWITCH_CLIENT_ID,Authorization:'Bearer '+await appToken(p)}});
    if(!Array.isArray(j.data))throw new Error('Ugyldigt Twitch-svar');const s=j.data[0];return s?{id:s.id,name:s.user_name,title:s.title,game:s.game_name,url:'https://twitch.tv/'+handle}:null;
  }
  if(p==='kick'){
    const j=await json('https://api.kick.com/public/v1/channels?slug='+encodeURIComponent(handle),{headers:{Authorization:'Bearer '+await appToken(p)}});
    if(!Array.isArray(j.data)||!j.data[0])throw new Error('Kick-kanalen kunne ikke findes');
    const c=j.data[0];if(typeof c.stream?.is_live!=='boolean')throw new Error('Ugyldig Kick-status');
    return c.stream.is_live?{id:c.stream.start_time||handle,name:c.slug||handle,title:c.stream_title||'Live',url:'https://kick.com/'+handle}:null;
  }
  if(p==='youtube'){
    let id=previous?.sourceId;
    if(!id||id.startsWith('manual-')){
      const cached=discoveries.get(handle);if(cached&&cached.until>Date.now())return cached.value;
      const qs=new URLSearchParams({part:'snippet',channelId:handle,eventType:'live',type:'video',maxResults:'1',key:process.env.YOUTUBE_API_KEY});
      const j=await json('https://www.googleapis.com/youtube/v3/search?'+qs);
      if(!Array.isArray(j.items))throw new Error('Ugyldigt YouTube-svar');
      const item=j.items[0],value=item?{id:item.id.videoId,name:item.snippet.channelTitle,title:item.snippet.title,url:'https://youtube.com/watch?v='+item.id.videoId}:null;
      discoveries.set(handle,{until:Date.now()+30*60_000,value});return value;
    }
    const qs=new URLSearchParams({part:'snippet,liveStreamingDetails',id,key:process.env.YOUTUBE_API_KEY});
    const j=await json('https://www.googleapis.com/youtube/v3/videos?'+qs);if(!Array.isArray(j.items))throw new Error('Ugyldigt YouTube-svar');
    const item=j.items[0];if(!item)throw new Error('YouTube-videoen kunne ikke kontrolleres');
    if(item.liveStreamingDetails?.actualEndTime||item.snippet.liveBroadcastContent==='none'){discoveries.delete(handle);return null;}
    if(item.snippet.liveBroadcastContent!=='live')throw new Error('Streamens status er endnu ikke bekræftet');
    return {id,name:item.snippet.channelTitle,title:item.snippet.title,url:'https://youtube.com/watch?v='+id};
  }
  throw new Error('Brug manuel start/slut for denne platform');
}
async function transition(guild,p,uid,source,forceDelete=false){
  const key='account:'+p+':'+uid,lock=guild.id+key;
  const previousLock=locks.get(lock)||Promise.resolve();
  const work=previousLock.catch(()=>{}).then(async()=>{
    const cfg=(await settings.get(guild.id)).stream.platforms[p],previous=await getState(guild.id,key);
    if(previous&&(!source||previous.sourceId!==source.id||previous.channelId!==cfg.channel)){
      if(cfg.deleteWhenOffline||forceDelete){
        try{const ch=await guild.channels.fetch(previous.channelId);if(!ch)throw new Error('Notifikationskanalen mangler');await ch.messages.delete(previous.messageId);}
        catch(e){if(![10008,10003].includes(e.code))throw new Error('Streambeskeden kunne ikke slettes. Kontrollér bottens rettigheder.');}
      }
      await setState(guild.id,key,null);await audit.record(guild.id,uid,'stream','stream_ended',{platform:p,messageId:previous.messageId});
    }
    if(source&&(!previous||previous.sourceId!==source.id||previous.channelId!==cfg.channel)){
      const channel=await guild.channels.fetch(cfg.channel);if(!channel?.isTextBased())throw new Error('Vælg en tekstkanal');
      const message=await channel.send({content:(cfg.pingRole?'<@&'+cfg.pingRole+'> ':'')+fill(cfg.message,source).slice(0,1850),allowedMentions:{parse:[],roles:cfg.pingRole?[cfg.pingRole]:[]}});
      await setState(guild.id,key,{messageId:message.id,channelId:channel.id,sourceId:source.id});
      await audit.record(guild.id,uid,'stream','stream_started',{platform:p,...source,messageId:message.id});
    }
  });locks.set(lock,work);try{return await work;}finally{if(locks.get(lock)===work)locks.delete(lock);}
}
async function check(client){
  if(running)return;running=true;
  try{for(const guild of client.guilds.cache.values())for(const account of await accounts(guild.id)){
    await checkAccount(guild,account);
  }}finally{running=false;}
}
async function onCommand(i){
  const action=i.options.getSubcommand(),p=i.options.getString('platform');await i.deferReply({flags:64});
  if(action==='tilmeld'){await link(i.guild,p,i.user.id,i.options.getString('kanal'),i.user.id);return i.editReply('Din kanal er tilknyttet. Streamerrollen kontrolleres løbende.');}
  const cfg=(await settings.get(i.guildId)).stream.platforms[p];
  if(!cfg.enabled||!await eligible(i.guild,p,i.user.id))throw new Error('Platformen er deaktiveret, eller du mangler streamerrollen');
  const account=(await accounts(i.guildId)).find(a=>a.platform===p&&a.user_id===i.user.id);if(!account)throw new Error('Tilmeld din kanal først med /stream tilmeld');
  const url={twitch:'https://twitch.tv/',kick:'https://kick.com/',youtube:'https://youtube.com/channel/',tiktok:'https://tiktok.com/@'}[p]+account.handle+(p==='tiktok'?'/live':'');
  await transition(i.guild,p,i.user.id,action==='live'?{id:'manual-'+i.user.id,name:i.member.displayName,title:i.options.getString('titel')||'Live',url}:null);
  return i.editReply(action==='live'?'Streambeskeden er sendt. Brug /stream slut, når du er færdig.':'Streamen er afsluttet; oprydningsindstillingen er anvendt.');
}
function startPolling(client){const run=()=>check(client).catch(e=>console.warn('[stream]',e.message));setTimeout(run,10_000);setInterval(run,120_000);}
module.exports={startPolling,check,transition,live,accounts,link,unlink,onCommand,validateConfig,normalize,integrationStatus,inspect,checkNow,testDelivery};
