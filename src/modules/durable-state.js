const {db}=require('../db');
const queues=new Map();
async function read(key,fallback={}){const r=await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get(key);return r?JSON.parse(r.data):structuredClone(fallback);}
async function write(key,change,fallback={}){for(let n=0;n<8;n++){const row=await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get(key),value=row?JSON.parse(row.data):structuredClone(fallback),next=await change(value);const result=row?await db.prepare('UPDATE settings SET data=? WHERE guild_id=? AND data=?').run(JSON.stringify(next),key,row.data):await db.prepare('INSERT INTO settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO NOTHING').run(key,JSON.stringify(next));if(result.changes)return next;}throw Error('Oplysningerne blev ændret samtidig. Prøv igen.');}
async function serial(key,fn){const previous=queues.get(key)||Promise.resolve();const current=previous.catch(()=>{}).then(fn);queues.set(key,current);try{return await current;}finally{if(queues.get(key)===current)queues.delete(key);}}
module.exports={read,write,serial};
