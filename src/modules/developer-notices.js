const state=require('./durable-state');
const key=(gid,id)=>`developer-notices:${gid}:${id}`;
async function send(guild,task,kind,channel,payload){
 return state.serial(key(guild.id,task.id),async()=>{
  const {db}=require('../db');
  const replies=kind==='message'?await db.prepare("SELECT task_id,MAX(id) AS latest FROM dev_comments WHERE guild_id=? AND author_type='citizen' GROUP BY task_id").all(guild.id):[];
  const through=Number(replies.find(r=>Number(r.task_id)===Number(task.id))?.latest||0);
  const message=await channel.send(payload);
  await state.write(key(guild.id,task.id),v=>({messages:[...(v.messages||[]),{channelId:channel.id,messageId:message.id,kind,through}]}));
 });
}
async function clear(guild,id,kind,through=0){
 return state.serial(key(guild.id,id),async()=>{
  const saved=await state.read(key(guild.id,id)),removed=new Set();
  for(const notice of saved.messages||[]){
   if(notice.kind!==kind||(kind==='message'&&notice.through>through))continue;
   try{
    const channel=await guild.channels.fetch(notice.channelId);
    const message=await channel.messages.fetch(notice.messageId);
    if(message.author.id!==guild.client.user.id)continue;
    await message.delete();removed.add(notice.messageId);
   }catch(error){if([10003,10008].includes(Number(error.code)))removed.add(notice.messageId);else console.warn('[developer-notice-cleanup]',error.code||error.name);}
  }
  if(removed.size)await state.write(key(guild.id,id),v=>({messages:(v.messages||[]).filter(n=>!removed.has(n.messageId))}));
 });
}
module.exports={send,clear};
