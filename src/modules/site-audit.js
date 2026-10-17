const {db}=require('../db');
const modules=['developer','overview','tickets','applications','music','moderation','welcome','verification','levels','giveaways','stream','custom','appearance','logs','general'];
function clean(value,depth=0){
  if(depth>5)return '[afkortet]';
  if(Array.isArray(value))return value.slice(0,100).map(v=>clean(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,100).map(([k,v])=>[k,/^pin$|code|hash|salt|token|secret|api.?key|encrypted|password|^data$|content|cookie/i.test(k)?'[skjult]':clean(v,depth+1)]));
  return typeof value==='string'?value.slice(0,2000):value;
}
async function record(gid,uid,module,action,details={}){
  if(module!=='developer')return;
  await db.prepare('INSERT INTO site_audit (guild_id,user_id,module,action,details,created_at) VALUES (?,?,?,?,?,?)').run(gid,uid,modules.includes(module)?module:'general',action.slice(0,100),JSON.stringify(clean(details)),Date.now());
}
async function page(gid,module,before){
  if(!modules.includes(module))throw new Error('Ukendt logkategori');
  const cursor=before===undefined?Number.MAX_SAFE_INTEGER:Number(before);
  if(!Number.isSafeInteger(cursor)||cursor<1)throw new Error('Ugyldig logmarkør');
  const rows=await db.prepare('SELECT * FROM site_audit WHERE guild_id=? AND module=? AND id<CAST(? AS BIGINT) ORDER BY id DESC LIMIT 100').all(gid,module,cursor);
  return {events:rows.map(r=>({...r,details:JSON.parse(r.details)})),next:rows.length===100?rows.at(-1).id:null};
}
module.exports={record,page,modules,clean};
