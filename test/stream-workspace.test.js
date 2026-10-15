const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';delete process.env.DATABASE_URL;
const {initDb,db,settings}=require('../src/db');
const stream=require('../src/modules/stream-platforms'),audit=require('../src/modules/site-audit');
test('stream accounts require current role and live alerts survive restart state with precise pings and cleanup',async()=>{
  await initDb();
  try{
    const uid='928743353770709093';let hasRole=true,sent=[],deleted=[],failDelete=false;
    const guild={id:'guild-a',members:{fetch:async()=>({roles:{cache:{has:()=>hasRole}}})},channels:{fetch:async id=>({id,isTextBased:()=>true,send:async payload=>{sent.push(payload);return {id:'msg-'+sent.length};},messages:{delete:async id=>{if(failDelete)throw new Error('offline');deleted.push(id);}}})}};
    const cfg=(await settings.get(guild.id)).stream;cfg.platforms.twitch={enabled:true,channel:'928657151260516382',streamerRole:uid,pingRole:'928690126211666000',deleteWhenOffline:true,message:'{name}: {title} {url}'};
    await settings.setModule(guild.id,'stream',cfg);
    await stream.link(guild,'twitch',uid,'Tester',uid);
    const source={id:'live1',name:'Streamer',title:'@everyone live',url:'https://twitch.tv/tester'};
    await Promise.all([stream.transition(guild,'twitch',uid,source),stream.transition(guild,'twitch',uid,source)]);
    assert.equal(sent.length,1);assert.deepEqual(sent[0].allowedMentions,{parse:[],roles:['928690126211666000']});
    failDelete=true;await assert.rejects(stream.transition(guild,'twitch',uid,null),/kunne ikke slettes/);
    assert.ok(await db.prepare('SELECT value FROM stream_state WHERE guild_id=? AND key=?').get(guild.id,'account:twitch:'+uid));
    failDelete=false;await stream.transition(guild,'twitch',uid,null);assert.deepEqual(deleted,['msg-1']);
    await stream.transition(guild,'twitch',uid,source);assert.equal(sent.length,2);
    hasRole=false;await stream.check({guilds:{cache:new Map([[guild.id,guild]])}});assert.equal(deleted.length,2);
    await assert.rejects(stream.link(guild,'twitch',uid,'other',uid),/mangler/);
    const history=(await audit.page(guild.id,'stream')).events;
    assert.equal(history.filter(e=>e.action!=='stream_check').length,5);
    assert.ok(history.some(e=>e.action==='stream_check'&&e.details.state==='role_missing'));
    assert.equal((await audit.page('other','stream')).events.length,0);
  }finally{await db.close();}
});
test('stream API outages are errors rather than offline status; configuration rejects invalid inputs',async()=>{
  const fetchBefore=global.fetch;
  process.env.TWITCH_CLIENT_ID='test';process.env.TWITCH_CLIENT_SECRET='test';
  try{
    global.fetch=async url=>String(url).includes('/oauth2/token')?Response.json({access_token:'test',expires_in:3600}):Response.json({error:'rate limited'},{status:429});
    await assert.rejects(stream.live('twitch','tester'),/429/);
    assert.throws(()=>stream.normalize('twitch','https://malicious.example'),/Brug/);
    assert.throws(()=>stream.validateConfig({platforms:{}}),/Ugyldige/);
  }finally{global.fetch=fetchBefore;delete process.env.TWITCH_CLIENT_ID;delete process.env.TWITCH_CLIENT_SECRET;}
});
test('site audit removes credentials and keeps persistent separate module logs',async()=>{
  await initDb();try{
    await audit.record('g','owner','music','settings_changed',{token:'private',nested:{clientSecret:'secret'},title:'Music',data:'base64'});
    const row=(await audit.page('g','music')).events[0];assert.equal(row.user_id,'owner');assert.equal(row.details.token,'[skjult]');assert.equal(row.details.nested.clientSecret,'[skjult]');assert.equal(row.details.title,'Music');
    assert.equal((await audit.page('g','stream')).events.length,0);
  }finally{await db.close();}
});

test('missing API credentials are persisted and visible; ping permissions are diagnosed before test delivery',async()=>{
  await initDb();try{
    const uid='928743353770709093',channelId='928657151260516382',roleId='929240136296845363',pingId='986064085101715486';
    let canPing=false;
    const guild={id:'diagnosis',roles:{cache:new Map([[roleId,{}],[pingId,{mentionable:false}]])},members:{me:{id:'bot'},fetch:async()=>({roles:{cache:{has:()=>true}}})},channels:{fetch:async()=>({id:channelId,isTextBased:()=>true,permissionsFor:()=>({has:permission=>permission!==require('discord.js').PermissionFlagsBits.MentionEveryone||canPing})})}};
    const cfg=(await settings.get(guild.id)).stream;cfg.platforms.twitch={...cfg.platforms.twitch,enabled:true,channel:channelId,streamerRole:roleId,pingRole:pingId};await settings.setModule(guild.id,'stream',cfg);
    await stream.link(guild,'twitch',uid,'tester',uid);
    const result=await stream.checkNow(guild,'twitch');assert.equal(result.credentialsReady,false);assert.equal(result.accounts[0].lastCheck.state,'not_connected');assert.equal(result.deliveryReady,false);assert.ok(result.issues.some(x=>x.includes('TWITCH_CLIENT_ID')));assert.ok(result.issues.some(x=>x.includes('PING-rollen')));
    await assert.rejects(stream.testDelivery(guild,'twitch',uid,true),/PING/);
    canPing=true;assert.equal((await stream.inspect(guild,'twitch')).deliveryReady,true);
    const broken={...cfg,platforms:structuredClone(cfg.platforms)};broken.platforms.twitch.message='{Lokke} {https://twitch.tv/tester}';assert.throws(()=>stream.validateConfig(broken),/krøllede/);
  }finally{await db.close();}
});
