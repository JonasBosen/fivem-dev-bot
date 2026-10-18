const crypto=require('crypto');
const {db,settings}=require('../db');
const state=require('./durable-state');

const key=(guildId,userId)=>`developer-panel-cooldown:${guildId}:${userId}`;
const minutesFor=async guildId=>Math.max(0,Math.min(10080,Number((await settings.get(guildId)).developer.reportCooldownMinutes??1)));

async function reserve(guildId,userId,now=Date.now()){
 const minutes=await minutesFor(guildId);
 if(!minutes)return {allowed:true,token:null,retryAfterMs:0};
 return state.serial(key(guildId,userId),async()=>{
  const recent=await db.prepare('SELECT created_at FROM dev_tasks WHERE guild_id=? AND user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1').get(guildId,userId,now-minutes*60000);
  const token=crypto.randomBytes(8).toString('hex');let result={allowed:false,token:null,retryAfterMs:0};
  await state.write(key(guildId,userId),current=>{
   const remaining=(Number(current.lastClickAt||0)+minutes*60000)-now;
   if(remaining>0){result={allowed:false,token:null,retryAfterMs:remaining};return current;}
   if(recent){result={allowed:false,token:null,retryAfterMs:Math.max(1000,Number(recent.created_at)+minutes*60000-now)};return current;}
   result={allowed:true,token,retryAfterMs:0};
   return {...current,lastClickAt:now,token,tokenExpiresAt:now+30*60000};
  },{});
  return result;
 });
}

async function consume(guildId,userId,token){
 if(!token||!/^[a-f0-9]{16}$/.test(token))return false;
 return state.serial(key(guildId,userId),async()=>{
  let matched=false;
  await state.write(key(guildId,userId),current=>{
   matched=current.token===token&&Number(current.tokenExpiresAt)>Date.now();
   return matched?{...current,token:'',tokenExpiresAt:0}:current;
  },{});
  return matched;
 });
}

async function checkInteraction(i){
 const result=await reserve(i.guildId||i.guild?.id,i.user.id);
 if(!result.allowed){const seconds=Math.max(1,Math.ceil(result.retryAfterMs/1000));const wait=seconds>=60?`${Math.ceil(seconds/60)} minut${Math.ceil(seconds/60)===1?'':'ter'}`:`${seconds} sekund${seconds===1?'':'er'}`;await i.reply({content:`Vent ${wait}, før du bruger en knap i udviklerpanelet igen. Ventetiden gælder alle panelknapper samlet.`,flags:64});return false;}
 i.developerPanelCooldownToken=result.token;
 return true;
}

module.exports={reserve,consume,checkInteraction};
