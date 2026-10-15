const {settings,db}=require('../db');
const locks=new Map();
function isUnread(task,config,uid){return Number(task.latestCitizenReply||0)>Number(config.conversationReads?.[uid]?.[task.id]||0);}
async function mark(guild,uid,id,through){
 if(!Number.isSafeInteger(through)||through<0)throw new Error('Ugyldig beskedmarkør');
 const task=await require('./developer').get(guild.id,id);if(!task)throw new Error('Sagen findes ikke');
 const replies=await db.prepare("SELECT task_id,MAX(id) AS latest FROM dev_comments WHERE guild_id=? AND author_type='citizen' GROUP BY task_id").all(guild.id);
 const latest=Number(replies.find(r=>Number(r.task_id)===id)?.latest||0);
 if(through>latest)throw new Error('Beskeden findes ikke på sagen');
 const previous=locks.get(guild.id)||Promise.resolve();
 const request=previous.catch(()=>{}).then(async()=>{const cfg=(await settings.get(guild.id)).developer;const reads=cfg.conversationReads||{},user={...(reads[uid]||{})};user[id]=Math.max(Number(user[id]||0),through);await settings.setModule(guild.id,'developer',{...cfg,conversationReads:{...reads,[uid]:user}});return {readThrough:user[id]};});
 locks.set(guild.id,request);try{return await request;}finally{if(locks.get(guild.id)===request)locks.delete(guild.id);}
}
module.exports={isUnread,mark};
