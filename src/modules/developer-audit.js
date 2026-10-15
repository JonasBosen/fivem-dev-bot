const {db}=require('../db');
async function record(gid,id,uid,action,details) {
  await db.prepare('INSERT INTO dev_audit (guild_id,task_id,user_id,action,details,created_at) VALUES (?,?,?,?,?,?)').run(gid,id,uid,action,JSON.stringify(details||{}),Date.now());
}
async function list(gid) {return (await db.prepare('SELECT * FROM dev_audit WHERE guild_id=? ORDER BY id DESC LIMIT 300').all(gid)).map(r=>({...r,details:JSON.parse(r.details)}));}
module.exports={record,list};
