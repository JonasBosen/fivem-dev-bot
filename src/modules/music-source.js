function requireAudioStream(stream){
 if(typeof stream==='string'&&stream.trim()||stream&&typeof stream.pipe==='function'&&typeof stream.on==='function')return stream;
 throw Error('YouTube leverede ingen lyd. YouTube kan blokere afspilning fra hostingserveren med et krav om login/botkontrol. Prøv et SoundCloud-link; Discord-token og lydstyrke løser ikke denne fejl.');
}
module.exports={requireAudioStream};
