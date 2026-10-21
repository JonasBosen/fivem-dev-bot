const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspect,problem}=require('../src/modules/music-health');
test('music health separates server mute, source buffering and transmitted audio without exposing voice credentials',()=>{
 const member={voice:{channelId:'vc',serverMute:true,channel:{name:'Musik 1',permissionsFor:()=>({has:()=>true})}}};
 const client={user:{id:'bot'},guilds:{cache:new Map([['guild',{members:{me:member}}]])}};
 const queue={node:{volume:50},dispatcher:{voiceConnection:{state:{status:'ready',token:'secret'}},audioPlayer:{state:{status:'playing'}},audioResource:{playbackDuration:5000}}};
 let value=inspect(client,'guild',queue);assert.equal(value.audioMilliseconds,5000);assert.match(problem(value),/server-muted/);assert.equal(JSON.stringify(value).includes('secret'),false);
 member.voice.serverMute=false;value=inspect(client,'guild',queue);assert.equal(problem(value),'');
 queue.dispatcher.audioPlayer.state.status='buffering';assert.match(problem(inspect(client,'guild',queue)),/musikkilden/);
 queue.dispatcher.audioPlayer.state.status='playing';queue.dispatcher.audioResource.playbackDuration=0;assert.match(problem(inspect(client,'guild',queue)),/lydframes/);
 assert.equal(inspect(undefined,'guild',null).connection,'disconnected');
});
