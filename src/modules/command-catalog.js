const cache=new Map(),pending=new Map();
function normalize(c,scope){return {id:c.id,name:c.nameLocalizations?.da||c.name,description:c.descriptionLocalizations?.da||c.description||'',type:c.type,scope,options:c.options||[],defaultPermissions:c.defaultMemberPermissions?.bitfield?.toString()||null};}
async function load(guild){
 const cached=cache.get(guild.id);if(cached&&Date.now()-cached.checkedAt<25000)return cached;
 if(pending.has(guild.id))return pending.get(guild.id);
 const request=(async()=>{const [local,global]=await Promise.all([guild.commands.fetch(),guild.client.application.commands.fetch()]);const commands=[...local.values()].map(c=>normalize(c,'server'));const localNames=new Set(commands.map(c=>c.type+':'+c.name));commands.push(...[...global.values()].map(c=>normalize(c,'global')).filter(c=>!localNames.has(c.type+':'+c.name)));commands.sort((a,b)=>a.name.localeCompare(b.name,'da'));const result={checkedAt:Date.now(),commands};cache.set(guild.id,result);return result;})();
 pending.set(guild.id,request);try{return await request;}finally{pending.delete(guild.id);}
}
module.exports={load};
