const {initDb}=require('../src/db');
const bridge=require('../src/modules/hosting-bridge');
let initializing;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async(req,res)=>{
 let id;
 res.setHeader('Cache-Control','private, no-store');
 try{
  initializing||=initDb().catch(error=>{initializing=null;throw error;});await initializing;
  const url=new URL(req.url,'https://localhost'),route=req.query?.__bridge_path||url.searchParams.get('__bridge_path');
  url.searchParams.delete('__bridge_path');
  const path=route?'/'+String(route).replace(/^\//,''):url.pathname;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==process.env.BASE_URL)return res.status(403).json({error:'Ugyldig oprindelse'});
  const chunks=[];let length=0;
  if(req.body!==undefined){const body=typeof req.body==='string'?req.body:JSON.stringify(req.body);length=Buffer.byteLength(body);chunks.push(Buffer.from(body));}
  else for await(const chunk of req){length+=chunk.length;if(length>bridge.MAX_BODY)break;chunks.push(Buffer.from(chunk));}
  if(length>bridge.MAX_BODY)return res.status(413).json({error:'Filen er for stor. Brug højst 3 MB.'});
  const headers={};for(const name of ['cookie','content-type','origin','accept','user-agent'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
  headers['x-forwarded-for']=req.headers['x-real-ip']||req.socket.remoteAddress||'';
  headers['x-forwarded-proto']='https';
  id=await bridge.enqueue({method:req.method,path:path+url.search,headers,body:Buffer.concat(chunks).toString('base64')});
  const end=Date.now()+55000;let answer;
  while(Date.now()<end&&!res.destroyed){answer=await bridge.result(id);if(answer)break;await wait(600);}
  if(!answer)return res.status(503).json({error:'Botprocessen svarede ikke i tide. Kontrollér om handlingen blev gennemført, før du prøver igen.'});
  for(const name of ['content-type','content-disposition','location','set-cookie','x-content-type-options'])if(answer.headers[name])res.setHeader(name,answer.headers[name]);
  res.statusCode=answer.status;res.end(req.method==='HEAD'?undefined:Buffer.from(answer.body,'base64'));
 }catch(error){console.warn('[hosting-http]',error.code||error.name);if(!res.headersSent)res.status(503).json({error:'Webpanelets forbindelse er ikke klar. Kontrollér serveropsætningen.'});}
 finally{if(id)await bridge.discard(id).catch(()=>{});}
};
module.exports.config={api:{bodyParser:false}};
