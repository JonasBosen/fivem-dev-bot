const {test}=require('node:test');
const assert=require('node:assert/strict');
const form=require('../src/modules/report-form');
test('report wizard offers categories and importance before a modal with custom fields and image',async()=>{
  let response;
  await form.begin({user:{id:'citizen'},guildId:'guild',reply:async p=>response=p});
  assert.equal(response.components[0].toJSON().components[0].options.length,25);
  assert.equal(response.components[1].toJSON().components[0].options.length,4);
  for(const [category,priority]of [['mlo','critical'],['other','custom']]){
    const modal=form.modal(category,priority).toJSON();
    assert.ok(modal.components.length<=5);
    const upload=modal.components.find(c=>c.component?.custom_id==='image').component;
    assert.equal(upload.type,19);assert.equal(upload.required,false);
    if(category==='other')assert.equal(modal.components.find(c=>c.component?.custom_id==='custom_category').component.required,true);
    if(priority==='custom')assert.equal(modal.components.find(c=>c.component?.custom_id==='custom_priority').component.required,true);
  }
  assert.equal(form.importance('critical').priority,'critical');
  assert.equal(form.importance('custom','Det blokerer mit job').reportPriorityCustom,'Det blokerer mit job');
  assert.throws(()=>form.importance('custom',''),/Beskriv/);
});
