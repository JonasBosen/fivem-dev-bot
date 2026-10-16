const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const PREFIX='/staff-panel',UPSTREAM='https://staff-panel-bi8z.onrender.com';
function signer(issuer){const keys=crypto.generateKeyPairSync('ed25519'),jwk=keys.publicKey.export({format:'jwk'}),kid=crypto.createHash('sha256').update(JSON.stringify(jwk)).digest('hex').slice(0,24);return {publicKey:{...jwk,kid},sign(user,gid,method,path,body=''){const payload=Buffer.from(JSON.stringify({iss:issuer,aud:UPSTREAM,kid,uid:user.id,name:user.username||user.id,avatar:user.avatar||'',gid,method,path,body:crypto.createHash('sha256').update(body).digest('hex'),exp:Math.floor(Date.now()/1000)+30})).toString('base64url');return payload+'.'+crypto.sign(null,Buffer.from(payload),keys.privateKey).toString('base64url');}};}
function rewrite(text){return text.replace(/(["'\`])\/(?=(?:api|auth|assets)\/|[a-zA-Z0-9_-]+\.(?:js|css|png|jpe?g|webp|svg|ico|gif)(?:[?"'\`]))/g,'$1'+PREFIX+'/').replace(/url\(\/(?!\/)/g,'url('+PREFIX+'/');}
function cookieHeader(value){return String(value||'').split(';').map(s=>s.trim()).filter(s=>/^staff_session(?:\.sig)?=/.test(s)).join('; ');}
function install(app,{auth,base,fetcher=fetch,upstream=UPSTREAM}){const signing=signer(base);app.get('/.well-known/staff-panel-key.json',(req,res)=>res.set('Cache-Control','no-store').json(signing.publicKey));
 app.use(PREFIX,auth,async(req,res)=>{if(!req.panelIdentity?.manager)return res.status(403).send('Din Discord har ikke adgang til staff-panelet.');try{
 if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method))return res.sendStatus(405);
 if(!['GET','HEAD'].includes(req.method)&&req.get('origin')!==base)return res.status(403).json({error:'Åbn staff-panelet fra den fælles side'});
 const route=req.url||'/';if(!route.startsWith('/')||route.startsWith('//')||route.includes('\\'))return res.sendStatus(400);
 if(route.startsWith('/auth/discord'))return res.redirect(PREFIX+'/');
 const localName=route.split('?')[0]==='/'?'index.html':route.split('?')[0].slice(1);if(req.method==='GET'&&/^(?:assets\/)?[a-zA-Z0-9_.-]+$/.test(localName)){const file=path.join(__dirname,'staff-public',localName);if(fs.existsSync(file)&&fs.statSync(file).isFile()){const content=fs.readFileSync(file),text=/\.(?:html|js|css)$/.test(localName);return res.set('Cache-Control','private, no-store').set('X-Frame-Options','SAMEORIGIN').type(path.extname(localName)).send(text?rewrite(content.toString()):content);}}
 const url=new URL(route,upstream);if(url.origin!==new URL(upstream).origin)return res.sendStatus(400);
 const body=['GET','HEAD'].includes(req.method)?'':JSON.stringify(req.body||{}),headers={'x-allbot-identity':signing.sign(req.session.user,req.guild.id,req.method,route,body),'accept':req.get('accept')||'*/*'};
 const cookie=cookieHeader(req.get('cookie'));if(cookie)headers.cookie=cookie;if(body)headers['content-type']='application/json';
 const result=await fetcher(url,{method:req.method,headers,...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(45000)});
 for(const cookie of result.headers.getSetCookie()){if(!/^staff_session(?:\.sig)?=/.test(cookie))continue;res.append('Set-Cookie',cookie.replace(/;\s*Domain=[^;]+/ig,'').replace(/;\s*Path=[^;]+/ig,'')+'; Path='+PREFIX+'; SameSite=Lax');}
 res.set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').set('X-Frame-Options','SAMEORIGIN');
 const location=result.headers.get('location');if(location){const redirect=new URL(location,upstream);if(redirect.origin!==new URL(upstream).origin)return res.status(502).send('Staff-panelets login kunne ikke forbindes.');return res.redirect(result.status,PREFIX+redirect.pathname+redirect.search);}
 if(!result.ok&&route.startsWith('/api/me'))console.warn('[staff-panel] Login-kontrol svarede HTTP '+result.status);
 const type=result.headers.get('content-type')||'application/octet-stream';res.status(result.status).type(type);const disposition=result.headers.get('content-disposition');if(disposition)res.set('Content-Disposition',disposition);
 if(req.method==='HEAD')return res.end();if(/(?:text\/html|javascript|text\/css)/i.test(type))return res.send(rewrite(await result.text()));res.send(Buffer.from(await result.arrayBuffer()));
 }catch(e){console.warn('[staff-panel]',e.name);res.status(502).send('Staff-panelet svarer ikke lige nu. Prøv igen om lidt.');}});
}
module.exports={install,signer,rewrite,cookieHeader};
