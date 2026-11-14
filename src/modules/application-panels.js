const {settings}=require('../db');
const state=require('./durable-state'),media=require('./panel-media');
const key=gid=>'application-panels:'+gid;
function initial(cfg,channels=[]){
  const allow=cfg.forms.filter(f=>/allow(?:ed)?\s*list/i.test(f.name));
  const common=cfg.forms.filter(f=>!allow.includes(f));
  const panels=[{id:'general',name:'Øvrige ansøgninger',panelTitle:cfg.panelTitle,panelText:cfg.panelText,color:cfg.color,footer:cfg.footer,mediaId:cfg.mediaId||'',imageUrl:cfg.imageUrl||'',forms:common.map(f=>f.id),channel:channels.find(c=>/ansøgninger/i.test(c.name))?.id||''}];
  for(const form of allow)panels.push({id:'allowlist-'+form.id,name:form.name,panelTitle:'Skriftlig Allowlist',panelText:'Ansøg om allowlist til Dream Network. Tryk på knappen nedenfor for at starte din skriftlige ansøgning.',color:cfg.color,footer:'',mediaId:'',imageUrl:'',forms:[form.id],channel:channels.find(c=>/skriftlig.*ansøgning/i.test(c.name))?.id||''});
  return panels;
}
async function list(guild){const cfg=(await settings.get(guild.id)).applications;return state.read(key(guild.id),initial(cfg,[...guild.channels.cache.values()].filter(c=>[0,5].includes(c.type))));}
function validate(input,cfg){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ugyldigt ansøgningspanel');
  const panel=Object.fromEntries(['id','name','panelTitle','panelText','color','footer','mediaId','imageUrl','channel','forms'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
  if(typeof panel.id!=='string'||!/^[-a-z0-9_]{1,80}$/i.test(panel.id))throw Error('Ugyldigt panel-ID');
  for(const [k,max]of [['name',100],['panelTitle',256],['panelText',4000]])if(typeof panel[k]!=='string'||!panel[k].trim()||panel[k].length>max)throw Error('Skriv en gyldig titel og beskrivelse');
  if(typeof panel.channel!=='string'||panel.channel&&!/^\d{17,20}$/.test(panel.channel))throw Error('Vælg en kanal');
  if(!Array.isArray(panel.forms)||!panel.forms.length||panel.forms.length>25||new Set(panel.forms).size!==panel.forms.length||panel.forms.some(id=>!cfg.forms.some(f=>f.id===id)))throw Error('Vælg 1–25 eksisterende formularer');
  media.validate(panel);return panel;
}
async function save(guild,input){const cfg=(await settings.get(guild.id)).applications,panel=validate(input,cfg);if(panel.mediaId&&!await media.get(guild.id,panel.mediaId,'shared'))throw Error('Billedet findes ikke i serverens mediebibliotek');await state.serial(key(guild.id),async()=>{const panels=await list(guild);const index=panels.findIndex(p=>p.id===panel.id);if(index<0){if(panels.length>=30)throw Error('Højst 30 paneler');panels.push(panel);}else panels[index]=panel;await state.write(key(guild.id),()=>panels);});return panel;}
async function send(guild,id){return state.serial(key(guild.id)+':send',async()=>{
  const panel=(await list(guild)).find(p=>p.id===id);if(!panel)throw Error('Panelet findes ikke');
  const channel=await require('./panel-diagnostics').destination(guild,panel.channel);
  // Adopt the latest panel from this bot in the selected channel. Editing it
  // removes stale buttons without deleting messages or touching Appy's panels.
  const ch=channel?.messages?channel:await guild.channels.fetch(panel.channel);
  const messages=await ch.messages.fetch({limit:100});
  const existing=[...messages.values()].filter(m=>m.author.id===guild.client.user.id&&m.components?.some(row=>row.components?.some(c=>(c.customId||'').startsWith('app:start:')))).sort((a,b)=>a.id===b.id?0:BigInt(a.id)>BigInt(b.id)?-1:1)[0];
  const msg=await require('./applications').sendPanel(guild,panel.channel,panel.forms,{config:panel,existing});
  return {channel:msg.channelId||panel.channel,messageId:msg.id,updated:!!existing};
});}
module.exports={initial,list,validate,save,send};
