const {test}=require('node:test'),assert=require('node:assert/strict');
const {ButtonStyle}=require('discord.js'),panel=require('../src/modules/report-panel');
test('report panel renders only configured buttons with safe mention handling',()=>{
 const cfg={text:'Mit panel',buttons:[{label:'Min MLO-knap',emoji:'🏠',color:'green',category:'mlo'},{label:'Kritisk',emoji:'🔴',color:'red',category:'choose',reportType:'request'}]};
 const data=panel.panel(cfg),buttons=data.components.flatMap(r=>r.toJSON().components);assert.equal(buttons.length,2);assert.equal(buttons[0].label,'Min MLO-knap');assert.equal(buttons[0].style,ButtonStyle.Success);assert.equal(buttons[1].style,ButtonStyle.Danger);assert.deepEqual(data.allowedMentions,{parse:[]});assert.equal(panel.panel({text:'Uden knapper',buttons:[]}).components.length,0);
 const validate=require('../src/modules/report-panel-config').validate;assert.throws(()=>validate({...cfg,buttons:[{...cfg.buttons[0],color:'orange'}]}));assert.throws(()=>validate({...cfg,buttons:Array(26).fill(cfg.buttons[0])}));assert.throws(()=>validate({...cfg,buttons:[{...cfg.buttons[0],emoji:'not an emoji'}]}));
});
test('category then priority opens the correct image-capable report form without another continue step',async()=>{
  let response,modal;
  await panel.interact({customId:'dev:category:mlo',guildId:'g',user:{id:'u'},webhook:{deleteMessage:async()=>{}},reply:async p=>response=p});
  assert.match(response.content,/MLO/);assert.equal(response.components[0].toJSON().components.length,4);
  await panel.interact({customId:'dev:level:mlo:critical',showModal:async p=>modal=p.toJSON()});
  assert.equal(modal.custom_id,'dev:submit:mlo:critical');assert.ok(modal.components.some(c=>c.component?.custom_id==='image'));
  await assert.rejects(panel.interact({customId:'dev:level:fake:critical',showModal:async()=>{}}),/kategori/);
});
test('priority first preserves its value when choosing a category and supports custom category and priority',async()=>{
  let response,modal;
  await panel.interact({customId:'dev:level:choose:high',guildId:'g',user:{id:'u'},webhook:{deleteMessage:async()=>{}},reply:async p=>response=p,update:async p=>response=p});
 const menu=response.components[0].toJSON().components[0];assert.equal(menu.custom_id,'dev:categoryselect:high:bug');assert.equal(menu.options.length,25);
  await panel.interact({customId:menu.custom_id,values:['vehicle'],update:async p=>response=p,showModal:async p=>modal=p.toJSON()});assert.equal(modal.custom_id,'dev:submit:vehicle:high');
  await panel.interact({customId:'dev:level:other:custom',showModal:async p=>modal=p.toJSON()});assert.equal(modal.components.length,5);assert.ok(modal.components.some(c=>c.component?.custom_id==='custom_category'));
});
test('request buttons keep their type through category and priority choices',async()=>{
 let response,modal;
 await panel.interact({customId:'dev:base:request',guildId:'g',user:{id:'u'},webhook:{deleteMessage:async()=>{}},reply:async p=>response=p});
 assert.match(response.content,/ønske/i);assert.equal(response.components[0].toJSON().components[0].custom_id,'dev:categoryselect:choose:request');
 await panel.interact({customId:'dev:categoryselect:choose:request',values:['vehicle'],update:async p=>response=p});
 assert.equal(response.components[0].toJSON().components[0].custom_id,'dev:level:vehicle:low:request');
 await panel.interact({customId:'dev:level:vehicle:critical:request',showModal:async m=>modal=m.toJSON()});assert.equal(modal.custom_id,'dev:submit:vehicle:critical:request');
});
test('panel cooldown token survives category and priority selection to the form',async()=>{
 let response,modal;
 await panel.interact({customId:'dev:base:bug',developerPanelCooldownToken:'0123456789abcdef',guildId:'g',user:{id:'u'},webhook:{deleteMessage:async()=>{}},reply:async p=>response=p});
 const menu=response.components[0].toJSON().components[0];assert.equal(menu.custom_id,'dev:categoryselect:choose:bug:0123456789abcdef');
 await panel.interact({customId:menu.custom_id,values:['vehicle'],update:async p=>response=p});
 const priority=response.components[0].toJSON().components[0];assert.equal(priority.custom_id,'dev:level:vehicle:low:bug:0123456789abcdef');
 await panel.interact({customId:priority.custom_id,showModal:async p=>modal=p.toJSON()});assert.equal(modal.custom_id,'dev:submit:vehicle:low:flow:0123456789abcdef');
});
