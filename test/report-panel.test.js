const {test}=require('node:test'),assert=require('node:assert/strict');
const {ButtonStyle}=require('discord.js'),panel=require('../src/modules/report-panel');
test('public report panel has category buttons and distinct low, medium and critical priority actions within Discord limits',()=>{
  const data=panel.panel(),rows=data.components.map(r=>r.toJSON());assert.ok(rows.length<=5);assert.ok(rows.every(r=>r.components.length<=5));
  const buttons=rows.flatMap(r=>r.components);assert.ok(buttons.some(b=>b.custom_id==='dev:category:mlo'));assert.ok(buttons.some(b=>b.custom_id==='dev:category:vehicle'));
  assert.equal(buttons.find(b=>b.custom_id==='dev:level:choose:low').style,ButtonStyle.Success);
  assert.equal(buttons.find(b=>b.custom_id==='dev:level:choose:critical').style,ButtonStyle.Danger);
  assert.match(buttons.find(b=>b.custom_id==='dev:level:choose:high').label,/🟠/);
  assert.equal(new Set(buttons.map(b=>b.custom_id)).size,buttons.length);
});
test('category then priority opens the correct image-capable report form without another continue step',async()=>{
  let response,modal;
  await panel.interact({customId:'dev:category:mlo',reply:async p=>response=p});
  assert.match(response.content,/MLO/);assert.equal(response.components[0].toJSON().components.length,4);
  await panel.interact({customId:'dev:level:mlo:critical',showModal:async p=>modal=p.toJSON()});
  assert.equal(modal.custom_id,'dev:submit:mlo:critical');assert.ok(modal.components.some(c=>c.component?.custom_id==='image'));
  await assert.rejects(panel.interact({customId:'dev:level:fake:critical',showModal:async()=>{}}),/kategori/);
});
test('priority first preserves its value when choosing a category and supports custom category and priority',async()=>{
  let response,modal;
  await panel.interact({customId:'dev:level:choose:high',reply:async p=>response=p});
  const menu=response.components[0].toJSON().components[0];assert.equal(menu.custom_id,'dev:categoryselect:high');assert.equal(menu.options.length,25);
  await panel.interact({customId:menu.custom_id,values:['vehicle'],showModal:async p=>modal=p.toJSON()});assert.equal(modal.custom_id,'dev:submit:vehicle:high');
  await panel.interact({customId:'dev:level:other:custom',showModal:async p=>modal=p.toJSON()});assert.equal(modal.components.length,5);assert.ok(modal.components.some(c=>c.component?.custom_id==='custom_category'));
});
