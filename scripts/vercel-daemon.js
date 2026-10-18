require('dotenv').config({quiet:true});
const http=require('node:http'),crypto=require('node:crypto');
const {initDb}=require('../src/db'),state=require('../src/modules/durable-state'),bridge=require('../src/modules/hosting-bridge');
const owner=crypto.randomUUID(),leaseKey='hosting-bot-leader',wait=ms=>new Promise(r=>setTimeout(r,ms));
let stopping=false,lastCleanup=0;
process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
async function lease(){return state.write(leaseKey,v=>{if(v.owner&&v.owner!==owner&&v.until>Date.now())throw Error('LEADER_BUSY');return {owner,until:Date.now()+30000};});}
function execute(input){return new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port:Number(process.env.PORT)||3000,path:input.path,method:input.method,headers:input.headers,timeout:55000},response=>{const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>bridge.MAX_BODY){response.destroy(Error('RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('base64')}));});request.on('timeout',()=>request.destroy(Error('REQUEST_TIMEOUT')));request.on('error',reject);request.end(Buffer.from(input.body,'base64'));});}
async function main(){
 if(!process.env.DISCORD_TOKEN||!process.env.SESSION_SECRET||!process.env.HOST_BRIDGE_SECRET||!process.env.BASE_URL)throw Error('HOSTING_ENV_MISSING');
 await initDb();
 while(!stopping){try{await lease();break;}catch(error){if(error.message!=='LEADER_BUSY')throw error;await wait(3000);}}
 if(stopping)return;
 process.env.HOST_DAEMON='1';require('../src/index');
 const renew=setInterval(()=>lease().catch(()=>{stopping=true;process.kill(process.pid,'SIGTERM');}),10000);renew.unref();
 const pending=new Set();
 while(!stopping){
  try{
   if(pending.size<8){for(const job of await bridge.claim()){const task=(async()=>{try{await bridge.complete(job.id,await execute(job.input));}catch{await bridge.complete(job.id,{status:503,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({error:'Forbindelsen blev afbrudt. Kontrollér resultatet før du prøver igen.'})).toString('base64')}).catch(()=>{});}})();pending.add(task);task.finally(()=>pending.delete(task));}}
   if(Date.now()-lastCleanup>60000){lastCleanup=Date.now();await bridge.cleanup();}
  }catch(error){console.warn('[hosting-worker]',error.code||error.name);}
  await wait(1000);
 }
 clearInterval(renew);
}
main().catch(error=>{console.error('[hosting-start]',error.code||error.message);process.exit(1);});
