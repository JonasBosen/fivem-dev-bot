const {test}=require('node:test');
const assert=require('node:assert/strict');
const developer=require('../src/modules/developer');
test('report button opens modal with optional file upload beside the text fields',async()=>{
  let payload;
  await developer.onInteraction({customId:'dev:report',isButton:()=>true,showModal:async modal=>{payload=modal.toJSON();}});
  assert.equal(payload.custom_id,'dev:submit');
  assert.equal(payload.components.length,3);
  const upload=payload.components.find(c=>c.component?.custom_id==='image');
  assert.ok(upload);
  assert.equal(upload.component.type,19);
  assert.equal(upload.component.required,false);
  assert.equal(upload.component.max_values,1);
  assert.deepEqual(payload.components.slice(0,2).map(c=>c.component.custom_id),['title','description']);
});
