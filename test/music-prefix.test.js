const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseMessage}=require('../src/modules/music-fleet');
test('music text commands preserve links and names and leave unrelated messages alone',()=>{
  assert.deepEqual(parseMessage('!play https://youtu.be/abc?t=3'),{name:'play',query:'https://youtu.be/abc?t=3'});
  assert.deepEqual(parseMessage('!PLAY Artist Song name'),{name:'play',query:'Artist Song name'});
  assert.deepEqual(parseMessage('!next'),{name:'next',query:''});
  assert.deepEqual(parseMessage('di!stop','di!'),{name:'stop',query:''});
  assert.equal(parseMessage('hello !play'),null);assert.equal(parseMessage('!rules'),null);
  assert.equal(typeof require('discord-player-youtubei').YoutubeExtractor,'function');
});
