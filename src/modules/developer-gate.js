const crypto=require('crypto');
const {db}=require('../db');
const audit=require('./site-audit');
const locks=new Map(),TTL=30*60_000;
const get=gid=>db.prepare('SELECT * FROM dev_gate WHERE guild_id=?').get(gid);
const valid=pin=>typeof pin==='string'&&/^\d{4}$/.test(pin);
const digest=(pin,salt)=>crypto.scryptSync(pin,salt,32).toString('hex');
function owner(guild,uid){return guild.ownerId===uid||(process.env.ADMIN_USER_IDS||'').split(',').map(s=>s.trim()).includes(uid);}
async function status(guild,session){const row=await get(guild.id);return {configured:!!row,unlocked:!!row&&session.devGate?.[guild.id]?.hash===row.hash&&session.devGate[guild.id].until>Date.now(),canSetup:!row&&owner(guild,session.user.id)};}
async function setup(guild,session,pin){
  if(!owner(guild,session.user.id))throw new Error('Kun serverejeren kan oprette koden');
  if(!valid(pin))throw new Error('Koden skal bestå af præcis fire cifre');
  const salt=crypto.randomBytes(16).toString('hex'),hash=digest(pin,salt);
  const result=await db.prepare('INSERT INTO dev_gate (guild_id,salt,hash) VALUES (?,?,?) ON CONFLICT(guild_id) DO NOTHING').run(guild.id,salt,hash);
  if(!result.changes)throw new Error('Der er allerede oprettet en kode');
  await audit.record(guild.id,session.user.id,'developer','access_code_created');
  session.devGate||={};session.devGate[guild.id]={hash,until:Date.now()+TTL};return {ok:true};
}
async function unlock(guild,session,pin,ip){
  if(typeof pin==='string')pin=pin.trim().replace(/^(\d{2})-(\d{2})$/,'$1$2');
  const lock=guild.id+':'+session.user.id,old=locks.get(lock)||Promise.resolve();
  const work=old.catch(()=>{}).then(async()=>{
    const row=await get(guild.id);if(!row)throw new Error('Serverejeren skal oprette en kode først');
    const subjects=['user:'+session.user.id];
    const attempts=[];
    for(const subject of subjects){const a=await db.prepare('SELECT * FROM dev_gate_attempts WHERE guild_id=? AND subject=?').get(guild.id,subject);if(a&&a.until>Date.now()&&a.failures>=5)throw new Error('For mange forkerte forsøg. Vent op til 15 minutter.');attempts.push(a);}
    if(!valid(pin)||!crypto.timingSafeEqual(Buffer.from(digest(pin,row.salt),'hex'),Buffer.from(row.hash,'hex'))){
      for(let n=0;n<subjects.length;n++){const a=attempts[n],active=a&&a.until>Date.now();await db.prepare('INSERT INTO dev_gate_attempts (guild_id,subject,failures,until) VALUES (?,?,?,?) ON CONFLICT(guild_id,subject) DO UPDATE SET failures=excluded.failures,until=excluded.until').run(guild.id,subjects[n],active?a.failures+1:1,active?a.until:Date.now()+15*60_000);}
      await audit.record(guild.id,session.user.id,'developer','access_code_rejected');throw new Error('Forkert kode');
    }
    await db.prepare('DELETE FROM dev_gate_attempts WHERE guild_id=? AND subject=?').run(guild.id,subjects[0]);
    session.devGate||={};session.devGate[guild.id]={hash:row.hash,until:Date.now()+TTL};
    await audit.record(guild.id,session.user.id,'developer','panel_unlocked');return {ok:true};
  });locks.set(lock,work);try{return await work;}finally{if(locks.get(lock)===work)locks.delete(lock);}
}
async function change(guild,session,pin){
  if(!owner(guild,session.user.id))throw new Error('Kun serverejeren kan ændre koden');
  if(!(await status(guild,session)).unlocked)throw new Error('Lås panelet op med den nuværende kode først');
  if(!valid(pin))throw new Error('Koden skal bestå af præcis fire cifre');
  const salt=crypto.randomBytes(16).toString('hex'),hash=digest(pin,salt);
  await db.prepare('UPDATE dev_gate SET salt=?,hash=? WHERE guild_id=?').run(salt,hash,guild.id);
  session.devGate[guild.id]={hash,until:Date.now()+TTL};await audit.record(guild.id,session.user.id,'developer','access_code_changed');return {ok:true};
}
module.exports={status,setup,unlock,change};
