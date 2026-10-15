const {test}=require('node:test'),assert=require('node:assert/strict');
test('Twitch login retries one transient connection failure before checking live status',async()=>{
  const original=global.fetch;process.env.TWITCH_CLIENT_ID='test';process.env.TWITCH_CLIENT_SECRET='test';let auth=0,streams=0;
  try{
    global.fetch=async url=>{if(String(url).includes('oauth2/token')){auth++;if(auth===1)throw Object.assign(new Error('timeout'),{name:'TimeoutError'});return Response.json({access_token:'test',expires_in:3600});}streams++;return Response.json({data:[]});};
    assert.equal(await require('../src/modules/stream-platforms').live('twitch','tester'),null);assert.equal(auth,2);assert.equal(streams,1);
  }finally{global.fetch=original;delete process.env.TWITCH_CLIENT_ID;delete process.env.TWITCH_CLIENT_SECRET;}
});
