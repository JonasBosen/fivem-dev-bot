const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.DB_FILE=':memory:';delete process.env.DATABASE_URL;
const {db,settings,initDb}=require('../src/db'),developer=require('../src/modules/developer');
test('private message reply button opens modal and persists the citizens reply; other users cannot reply',async()=>{
  await initDb();try{
    const guild={id:'guild-a',client:{},members:{fetch:async()=>({permissions:{has:()=>false},roles:{cache:{has:()=>false}}})}};
    await settings.setModule(guild.id,'developer',{enabled:true});
    const task=await developer.create(guild,'citizen',{title:'Fejl',description:'Bilen forsvandt'});
    const client={guilds:{cache:new Map([[guild.id,guild]])}};let modal,rejected,saved;
    await developer.onDirectReply({customId:`dev:reply:${guild.id}:${task.id}`,user:{id:'citizen'},showModal:async m=>modal=m},client);
    assert.match(modal.data.custom_id,/replysubmit/);
    await developer.onDirectReply({customId:modal.data.custom_id,user:{id:'citizen'},isModalSubmit:()=>true,deferReply:async()=>{},fields:{getTextInputValue:()=> 'Det sker ved garagen'},editReply:async text=>saved=text},client);
    assert.match(saved,/gemt/);assert.equal((await developer.get(guild.id,task.id)).comments[0].body,'Det sker ved garagen');
    await developer.onDirectReply({customId:`dev:reply:${guild.id}:${task.id}`,user:{id:'other'},reply:async payload=>rejected=payload},client);
    assert.match(rejected.content,/mangler adgang/);
  }finally{await db.close();}
});
