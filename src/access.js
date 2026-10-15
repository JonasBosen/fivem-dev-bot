const {PermissionFlagsBits}=require('discord.js');
const {settings}=require('./db');
async function isManager(guild,uid) {
  const member=await guild.members.fetch({user:uid,force:true}).catch(()=>null);
  if(!member) return false;
  if(member.permissions.has(PermissionFlagsBits.Administrator)||member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const config=await settings.get(guild.id);
  return Array.isArray(config.general.adminRoles)&&config.general.adminRoles.some(id=>member.roles.cache.has(id));
}
module.exports={isManager};
