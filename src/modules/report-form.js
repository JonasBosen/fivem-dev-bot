const crypto=require('crypto');
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,LabelBuilder,TextInputBuilder,TextInputStyle,FileUploadBuilder,MessageFlags}=require('discord.js');
const {categories}=require('./report-categories');
const sessions=new Map();
const priorities=[{label:'Lav',value:'low'},{label:'Vigtig',value:'high'},{label:'Kritisk',value:'critical'},{label:'Egen vurdering — skriv selv',value:'custom'}];
function importance(id,custom=''){
  if(!priorities.some(p=>p.value===id))throw new Error('Vælg vigtighed');
  if(typeof custom!=='string'||custom.length>100)throw new Error('Egen vigtighed må højst være 100 tegn');
  if(id==='custom'&&!custom.trim())throw new Error('Beskriv din egen vurdering af vigtigheden');
  return {priority:id==='custom'?'normal':id,reportPriority:id,reportPriorityCustom:id==='custom'?custom.trim():''};
}
function modal(category,priority,reportType='bug',flowToken=''){
  const result=new ModalBuilder().setCustomId(`dev:submit:${category}:${priority}${reportType==='request'?':request':''}${flowToken?':flow:'+flowToken:''}`).setTitle(reportType==='request'?'Indsend et ønske til serveren':'Indmeld en sag');
  for(const [id,label,max,style]of [['title','Kort titel',200,TextInputStyle.Short],['description','Beskriv sagen og hvordan den genskabes',4000,TextInputStyle.Paragraph]])result.addLabelComponents(new LabelBuilder().setLabel(reportType==='request'&&id==='description'?'Beskriv ønsket og hvad det vil bidrage med':label).setTextInputComponent(new TextInputBuilder().setCustomId(id).setMaxLength(max).setStyle(style).setRequired(true)));
  result.addLabelComponents(new LabelBuilder().setLabel('Vedhæft billede (valgfrit)').setDescription('PNG, JPG, GIF eller WebP · højst 6 MB').setFileUploadComponent(new FileUploadBuilder().setCustomId('image').setMinValues(0).setMaxValues(1).setRequired(false)));
  if(category==='other')result.addLabelComponents(new LabelBuilder().setLabel('Din egen kategori').setTextInputComponent(new TextInputBuilder().setCustomId('custom_category').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)));
  if(priority==='custom')result.addLabelComponents(new LabelBuilder().setLabel('Hvor vigtig mener du, at sagen er?').setTextInputComponent(new TextInputBuilder().setCustomId('custom_priority').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)));
  return result;
}
async function begin(i){
  for(const [id,s]of sessions)if(s.until<Date.now())sessions.delete(id);
  if(sessions.size>=1000)throw new Error('Prøv igen om lidt');
  const id=crypto.randomBytes(8).toString('hex');sessions.set(id,{user:i.user.id,guild:i.guildId,until:Date.now()+15*60000,category:'',priority:''});
  return i.reply({content:'**1 · Vælg kategori og vigtighed**\nTryk derefter Fortsæt. I næste trin beskriver du sagen og vedhæfter et billede. Ved Andet/Egen vurdering får du felter til din egen tekst.',flags:MessageFlags.Ephemeral,components:[
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dev:pickcategory:'+id).setPlaceholder('Hvad handler sagen om?').addOptions(categories.map(c=>({label:c.label,value:c.id})))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dev:pickpriority:'+id).setPlaceholder('Hvor vigtig er sagen?').addOptions(priorities)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dev:continue:'+id).setLabel('Fortsæt til beskrivelse og billede').setStyle(ButtonStyle.Primary))]});
}
async function interact(i){
  const [,action,id]=i.customId.split(':');const session=sessions.get(id);
  if(!session||session.until<Date.now()||session.user!==i.user.id||session.guild!==i.guildId)return i.reply({content:'Valget er udløbet. Tryk Meld en fejl igen.',flags:MessageFlags.Ephemeral});
  if(action==='pickcategory'){if(!categories.some(c=>c.id===i.values[0]))throw new Error('Ukendt kategori');session.category=i.values[0];return i.deferUpdate();}
  if(action==='pickpriority'){if(!priorities.some(p=>p.value===i.values[0]))throw new Error('Ukendt vigtighed');session.priority=i.values[0];return i.deferUpdate();}
  if(!session.category||!session.priority)return i.reply({content:'Vælg både kategori og vigtighed først.',flags:MessageFlags.Ephemeral});
  return i.showModal(modal(session.category,session.priority));
}
module.exports={importance,modal,begin,interact,priorities};
