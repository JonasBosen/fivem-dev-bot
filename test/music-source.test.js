const {test}=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const {requireAudioStream}=require('../src/modules/music-source');
test('YouTube extraction cannot silently substitute an empty stream for a blocked source',()=>{
 for(const value of [undefined,null,'',{},false])assert.throws(()=>requireAudioStream(value),/YouTube leverede ingen lyd/);
 const stream=new PassThrough();assert.equal(requireAudioStream(stream),stream);stream.destroy();
 assert.equal(requireAudioStream('https://example.com/audio'),'https://example.com/audio');
});
