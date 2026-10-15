const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
test('existing birthday and slideshow references become independent copies with unchanged bytes and ordering; migration is repeatable',async()=>{
 const pg=new PGlite();try{
 await pg.exec('CREATE SCHEMA allbot; CREATE TABLE allbot.settings(guild_id TEXT PRIMARY KEY,data TEXT); CREATE TABLE allbot.panel_media(id TEXT PRIMARY KEY,guild_id TEXT,user_id TEXT,name TEXT,mime TEXT,content TEXT,created_at BIGINT);');
 const config={birthdays:{mediaId:'original'},slideshow:{slides:[{mediaId:'original',caption:'Første'},{imageUrl:'https://example.com/a.png',caption:'Anden'}]}};
 await pg.query('INSERT INTO allbot.settings VALUES ($1,$2)',['g',JSON.stringify(config)]);
 await pg.query('INSERT INTO allbot.panel_media VALUES ($1,$2,$3,$4,$5,$6,$7)',['original','g','user','gif.gif','image/gif','UNCHANGED_GIF_BYTES',123]);
 const migration=fs.readFileSync(path.join(__dirname,'../scripts/migrations/separate-panel-media.sql'),'utf8');
 await pg.exec(migration);await pg.exec(migration);
 const rows=(await pg.query('SELECT * FROM allbot.panel_media ORDER BY scope')).rows;assert.equal(rows.length,3);assert.ok(rows.every(r=>r.content==='UNCHANGED_GIF_BYTES'));
 const saved=JSON.parse((await pg.query('SELECT data FROM allbot.settings')).rows[0].data);
 assert.equal(saved.birthdays.mediaId,'original-birthdays');assert.equal(saved.slideshow.slides[0].mediaId,'original-slideshow');assert.equal(saved.slideshow.slides[1].caption,'Anden');
 assert.equal(rows.find(r=>r.id===saved.birthdays.mediaId).scope,'birthdays');assert.equal(rows.find(r=>r.id===saved.slideshow.slides[0].mediaId).scope,'slideshow');
 }finally{await pg.close();}
});
