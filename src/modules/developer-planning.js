const {db}=require('../db');
const defaults={reportType:'bug',developers:[],reporterName:'',columnId:'',scheduledStart:'',scheduledEnd:'',timerStartedAt:0,position:0,archived:false,reportPriority:'',reportPriorityCustom:'',reportCategory:'',reportCategoryCustom:'',kind:'bug',priority:'normal',assignee:'',resource:'',environment:'test',deadline:'',estimateHours:0,spentHours:0,coordinates:'',reproduction:'',expected:'',actual:'',testPlan:'',release:'',commitUrl:''};
function validate(input={}) {
  const out={...defaults};
  for(const key of Object.keys(defaults))if(input[key]!==undefined)out[key]=input[key];
  for(const key of ['scheduledStart','scheduledEnd'])if(typeof out[key]!=='string'||(out[key]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(out[key])||!Number.isFinite(Date.parse(out[key])))))throw new Error('Vælg en gyldig kalenderdato og tid');
  if(!!out.scheduledStart!==!!out.scheduledEnd)throw new Error('Vælg både start og slut for aftalen');
  if(out.scheduledStart&&Date.parse(out.scheduledEnd)<=Date.parse(out.scheduledStart))throw new Error('Sluttid skal ligge efter starttid');
  if(typeof out.timerStartedAt!=='number'||!Number.isFinite(out.timerStartedAt)||out.timerStartedAt<0||out.timerStartedAt>Date.now()+60000)throw new Error('Ugyldig tidsregistrering');
  if(typeof out.position!=='number'||!Number.isFinite(out.position)||Math.abs(out.position)>1e15)throw new Error('Ugyldig placering');
  if(typeof out.archived!=='boolean')throw new Error('Ugyldigt arkivvalg');
  if(!['bug','feature','optimization','mapping','vehicle','ui','maintenance'].includes(out.kind))throw new Error('Ukendt opgavetype');
  if(!['bug','request'].includes(out.reportType))throw new Error('Ugyldig sagstype');
  if(!Array.isArray(out.developers)||out.developers.length>20||out.developers.some(d=>typeof d.id!=='string'||d.id.length>40||typeof d.name!=='string'||d.name.length>100))throw new Error('Vælg højst 20 udviklere');
  out.developers=out.developers.map(d=>({...d}));
  if(typeof out.reporterName!=='string'||out.reporterName.length>100)throw new Error('Ugyldigt borgernavn');
  if(typeof out.columnId!=='string'||out.columnId&&!/^[-a-z0-9_]{1,60}$/.test(out.columnId))throw new Error('Ugyldig kolonne');
  if(!['low','normal','high','critical'].includes(out.priority))throw new Error('Ukendt prioritet');
  if(!['test','live','local'].includes(out.environment))throw new Error('Ukendt servermiljø');
  for(const key of ['estimateHours','spentHours'])if(typeof out[key]!=='number'||!Number.isFinite(out[key])||out[key]<0||out[key]>10000)throw new Error('Timer skal være mellem 0 og 10000');
  for(const key of ['assignee','resource','deadline','coordinates','reproduction','expected','actual','testPlan','release','commitUrl'])if(typeof out[key]!=='string'||out[key].length>3000)throw new Error('Ugyldigt planlægningsfelt: '+key);
  if(out.reportPriority) require('./report-form').importance(out.reportPriority,out.reportPriorityCustom);
  if(out.reportCategory) require('./report-categories').normalize(out.reportCategory,out.reportCategoryCustom);
  if(out.deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(out.deadline))throw new Error('Deadline skal være en dato');
  if(out.commitUrl&&!/^https:\/\//i.test(out.commitUrl))throw new Error('Commit-link skal starte med https://');
  return out;
}
async function get(gid,id){const row=await db.prepare('SELECT data FROM dev_planning WHERE guild_id=? AND task_id=?').get(gid,id);return {...defaults,...(row?JSON.parse(row.data):{})};}
async function all(gid){return Object.fromEntries((await db.prepare('SELECT task_id,data FROM dev_planning WHERE guild_id=?').all(gid)).map(r=>[r.task_id,{...defaults,...JSON.parse(r.data)}]));}
async function save(gid,id,input){const data=validate(input);await db.prepare('INSERT INTO dev_planning (guild_id,task_id,data) VALUES (?,?,?) ON CONFLICT(guild_id,task_id) DO UPDATE SET data=excluded.data').run(gid,id,JSON.stringify(data));return data;}
module.exports={defaults,validate,get,all,save};
