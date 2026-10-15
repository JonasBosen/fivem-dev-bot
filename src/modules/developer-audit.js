const {db}=require('../db');
async function record(gid,id,uid,action,details) {
  await db.prepare('INSERT INTO dev_audit (guild_id,task_id,user_id,action,details,created_at) VALUES (?,?,?,?,?,?)').run(gid,id,uid,action,JSON.stringify(details||{}),Date.now());
}
async function list(gid) {return (await db.prepare('SELECT * FROM dev_audit WHERE guild_id=? ORDER BY id DESC LIMIT 300').all(gid)).map(r=>({...r,details:JSON.parse(r.details)}));}
async function page(gid,before) {
  const cursor=before===undefined?Number.MAX_SAFE_INTEGER:Number(before);
  if(!Number.isSafeInteger(cursor)||cursor<1)throw new Error('Ugyldig logmarkør');
  const rows=await db.prepare('SELECT * FROM dev_audit WHERE guild_id=? AND id<? ORDER BY id DESC LIMIT 100').all(gid,cursor);
  return {events:rows.map(r=>({...r,details:JSON.parse(r.details)})),next:rows.length===100?rows[rows.length-1].id:null};
}
module.exports={record,list,page};
