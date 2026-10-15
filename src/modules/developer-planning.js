const {db}=require('../db');
const defaults={kind:'bug',priority:'normal',assignee:'',resource:'',environment:'test',deadline:'',estimateHours:0,spentHours:0,coordinates:'',reproduction:'',expected:'',actual:'',testPlan:'',release:'',commitUrl:''};
function validate(input={}) {
  const out={...defaults};
  for(const key of Object.keys(defaults))if(input[key]!==undefined)out[key]=input[key];
  if(!['bug','feature','optimization','mapping','vehicle','ui','maintenance'].includes(out.kind))throw new Error('Ukendt opgavetype');
  if(!['low','normal','high','critical'].includes(out.priority))throw new Error('Ukendt prioritet');
  if(!['test','live','local'].includes(out.environment))throw new Error('Ukendt servermiljø');
  for(const key of ['estimateHours','spentHours'])if(typeof out[key]!=='number'||!Number.isFinite(out[key])||out[key]<0||out[key]>10000)throw new Error('Timer skal være mellem 0 og 10000');
  for(const key of ['assignee','resource','deadline','coordinates','reproduction','expected','actual','testPlan','release','commitUrl'])if(typeof out[key]!=='string'||out[key].length>3000)throw new Error('Ugyldigt planlægningsfelt: '+key);
  if(out.deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(out.deadline))throw new Error('Deadline skal være en dato');
  if(out.commitUrl&&!/^https:\/\//i.test(out.commitUrl))throw new Error('Commit-link skal starte med https://');
  return out;
}
async function get(gid,id){const row=await db.prepare('SELECT data FROM dev_planning WHERE guild_id=? AND task_id=?').get(gid,id);return {...defaults,...(row?JSON.parse(row.data):{})};}
async function all(gid){return Object.fromEntries((await db.prepare('SELECT task_id,data FROM dev_planning WHERE guild_id=?').all(gid)).map(r=>[r.task_id,{...defaults,...JSON.parse(r.data)}]));}
async function save(gid,id,input){const data=validate(input);await db.prepare('INSERT INTO dev_planning (guild_id,task_id,data) VALUES (?,?,?) ON CONFLICT(guild_id,task_id) DO UPDATE SET data=excluded.data').run(gid,id,JSON.stringify(data));return data;}
module.exports={defaults,validate,get,all,save};
