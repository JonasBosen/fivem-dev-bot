const {db}=require('../db');
function decodeImage(input) {
  if(typeof input?.name!=='string'||!input.name.trim()||input.name.length>180) throw new Error('Ugyldigt filnavn');
  if(typeof input.data!=='string'||input.data.length>9*1024*1024) throw new Error('Billedet må højst fylde 6 MB');
  const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.data);
  if(!match) throw new Error('Brug PNG, JPG, GIF eller WebP');
  const data=Buffer.from(match[2],'base64');
  if(!data.length||data.length>6*1024*1024) throw new Error('Billedet må højst fylde 6 MB');
  const mime=match[1];
  const valid=mime==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?data[0]===255&&data[1]===216&&data[2]===255:mime==='image/gif'?['GIF87a','GIF89a'].includes(data.subarray(0,6).toString()):data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP';
  if(!valid) throw new Error('Filen er ikke et gyldigt billede af den valgte type');
  return {name:input.name.trim(),mime,content:data.toString('base64')};
}
async function list(gid,id) {return db.prepare('SELECT id,name,mime,created_at,user_id FROM dev_files WHERE guild_id=? AND task_id=? ORDER BY id').all(gid,id);}
async function upload(gid,id,uid,input) {
  if(!await db.prepare('SELECT id FROM dev_tasks WHERE guild_id=? AND id=?').get(gid,id)) throw new Error('Sagen findes ikke');
  const image=decodeImage(input);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM dev_files WHERE guild_id=? AND task_id=?').get(gid,id);
  if(Number(count.n)>=30) throw new Error('Der kan højst være 30 billeder på en sag');
  await db.prepare('INSERT INTO dev_files (guild_id,task_id,user_id,name,mime,content,created_at) VALUES (?,?,?,?,?,?,?)').run(gid,id,uid,image.name,image.mime,image.content,Date.now());
  return list(gid,id);
}
module.exports={decodeImage,list,upload};
