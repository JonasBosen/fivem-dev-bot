const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
fs.cpSync(path.join(root,'src/web/public'),out,{recursive:true});
console.log('Webpanelets offentlige filer er klar til Vercel.');
