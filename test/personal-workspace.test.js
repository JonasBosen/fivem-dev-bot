const {test}=require('node:test'),assert=require('node:assert/strict');process.env.DB_FILE=':memory:';
const {initDb,db,settings}=require('../src/db'),workspace=require('../src/modules/personal-workspace');
test('database layouts survive restart, remain personal, merge concurrent edits and retain previous versions after explicit reset',async()=>{await initDb();try{
 await workspace.update('g','alice','bug',{lanes:{todo:{x:420,y:620,width:330,height:600}},locked:true});
 await Promise.all([workspace.update('g','alice','bug',{lanes:{doing:{x:800,y:100}}}),workspace.update('g','alice','bug',{lanes:{todo:{width:410}}})]);
 const saved=await workspace.read('g','alice','bug');assert.equal(saved.state.lanes.todo.y,620);assert.equal(saved.state.lanes.todo.width,410);assert.equal(saved.state.lanes.doing.x,800);assert.equal(saved.state.locked,true);
 assert.deepEqual((await workspace.read('g','bob','bug')).state.lanes,{});assert.deepEqual((await workspace.read('other','alice','bug')).state.lanes,{});assert.deepEqual((await workspace.read('g','alice','request')).state.lanes,{});
 await workspace.update('g','alice','ui',{tabs:{'section:g-stream':'twitch'}});assert.equal((await workspace.read('g','alice','ui')).state.tabs['section:g-stream'],'twitch');
 await workspace.update('g','alice','bug',{reset:true});assert.deepEqual((await workspace.read('g','alice','bug')).state.lanes,{});const history=await db.prepare('SELECT data FROM settings WHERE guild_id = ?').get('personal-workspace:g:alice:bug:history:'+saved.revision);assert.deepEqual(JSON.parse(history.data).state,saved.state);
 await assert.rejects(workspace.update('g','alice','bug',{lanes:{todo:{x:-10}}}),/Ugyldig/);await assert.rejects(workspace.update('g','alice','other',{}),/arbejdsområde/);
 }finally{await db.close();}});
test('simultaneous module saves preserve each other and database reinitialization does not reset tasks, themes or preferences',async()=>{await initDb();try{
 await Promise.all([settings.setModule('g','general',{prefix:'!!',adminRoles:['owner']}),settings.setModule('g','welcome',{title:'Min velkomst',message:'Hej borger'})]);const cfg=await settings.get('g');assert.equal(cfg.general.prefix,'!!');assert.equal(cfg.welcome.title,'Min velkomst');
 await db.prepare('INSERT INTO dev_tasks (guild_id,user_id,title,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('g','citizen','Bevar mig','En vigtig sag','todo',1,1);await workspace.update('g','alice','request',{lanes:{custom:{x:200,y:400}}});await initDb();assert.equal((await workspace.read('g','alice','request')).state.lanes.custom.y,400);assert.equal((await settings.get('g')).welcome.title,'Min velkomst');const tasks=await db.prepare('SELECT * FROM dev_tasks WHERE guild_id=? ORDER BY updated_at DESC LIMIT 200').all('g');assert.equal(tasks.length,1);assert.equal(tasks[0].title,'Bevar mig');
 }finally{await db.close();}});
