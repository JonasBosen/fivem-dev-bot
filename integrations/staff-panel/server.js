require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");
const { Pool } = require("pg");
const { PEOPLE_OVERVIEW_SQL, installPlayerReadIndexes, installPlayerReadApi } = require("./player-read-api");
const { logOAuthFailure, createOAuthCooldown, sendRateLimitPage } = require("./discord-oauth-errors");
const oauthCooldown = createOAuthCooldown();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const app = express();
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!process.env.SESSION_SECRET) { console.error("FEJL: SESSION_SECRET mangler."); process.exit(1); }
if (!DATABASE_URL) { console.error("FEJL: DATABASE_URL mangler."); process.exit(1); }
const db = new Pool(require('./db-options').databaseOptions(5));
async function initDb() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS people (id SERIAL PRIMARY KEY, discord_id TEXT NOT NULL UNIQUE, discord_name TEXT NOT NULL, fivem_name TEXT DEFAULT '', license TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL, created_by TEXT NOT NULL);
    ALTER TABLE people ADD COLUMN IF NOT EXISTS discord_avatar TEXT DEFAULT '';
    CREATE TABLE IF NOT EXISTS warnings (id SERIAL PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE, reason TEXT NOT NULL, notes TEXT DEFAULT '', by_discord_id TEXT NOT NULL, by_name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bans (id SERIAL PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE, reason TEXT NOT NULL, until TEXT DEFAULT '', revoked INTEGER DEFAULT 0, by_discord_id TEXT NOT NULL, by_name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id SERIAL PRIMARY KEY, action TEXT NOT NULL, person_id INTEGER, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, details TEXT DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_presence (discord_id TEXT PRIMARY KEY, name TEXT NOT NULL, last_seen TIMESTAMPTZ NOT NULL);
  `);
  await installPlayerReadIndexes(db);
  console.log("PostgreSQL/Supabase database klar.");
}
const now = () => new Date().toISOString();
const appUser = req => req.session && req.session.user;
app.use(express.json({ limit: "1mb" }));
app.use(cookieSession({ name: "staff_session", keys: [process.env.SESSION_SECRET], httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }));
function requireLogin(req, res, next) { if (!appUser(req)) return res.status(401).json({ error: "LOGIN_REQUIRED" }); next(); }
async function hasStaffRole(discordId) {
  if (!guildId) return false;
  try {
    const guild = await discord.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordId);
    const allowedRoleNames = ["Ejer","Ledelse","Administrator [Manager]","Administrator","Supporter","Prøve Supporter","Staff"];
    const allowedRoleIds=new Set(['928689821902331965','928690126211666000','928690738429050880','928691427129561158','928691575431774249','928691655102578769']);
    return member.roles.cache.some(role => allowedRoleIds.has(role.id)||allowedRoleNames.includes(role.name));
  } catch (e) { console.error("Kunne ikke kontrollere staff-roller:", e.message); return false; }
}
require('./allbot-integration').install(app,{hasStaffRole,touchPresence});
app.get('/integrations/allbot/status',(req,res)=>res.set('Cache-Control','no-store').json({enabled:true,sharedDatabaseConfigured:!!process.env.STAFF_DATABASE_URL,databaseMode:process.env.STAFF_USE_SHARED_DATABASE==='true'?'shared':'legacy'}));
app.get("/auth/discord", (req,res) => { if(oauthCooldown.remaining())return sendRateLimitPage(res,oauthCooldown.remaining()); const p = new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID||"",response_type:"code",redirect_uri:process.env.DISCORD_REDIRECT_URI||"",scope:"identify"}); res.redirect("https://discord.com/oauth2/authorize?"+p.toString()); });
app.get("/auth/discord/callback", async (req,res) => { try { if(oauthCooldown.remaining())return sendRateLimitPage(res,oauthCooldown.remaining()); const code=req.query.code; if(!code)return res.status(400).send("Mangler Discord login-kode."); const body=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID||"",client_secret:process.env.DISCORD_CLIENT_SECRET||"",grant_type:"authorization_code",code,redirect_uri:process.env.DISCORD_REDIRECT_URI||""}); const tokenResp=await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}); const token=await tokenResp.json().catch(()=>({})); if(!tokenResp.ok||!token.access_token){logOAuthFailure(tokenResp,token);if(tokenResp.status===429){oauthCooldown.register(tokenResp,token);return sendRateLimitPage(res,oauthCooldown.remaining());}return res.status(401).send("Discord login fejlede. Kontroller Client ID, Secret og Redirect URI.");} const userResp=await fetch("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${token.access_token}`}}); const u=await userResp.json(); if(!u.id)return res.status(401).send("Kunne ikke hente Discord-bruger."); if(!(await hasStaffRole(u.id))){req.session=null;return res.status(403).send("Du har ikke en staff-rolle og har derfor ikke adgang til panelet.");} req.session.user={id:u.id,name:u.global_name||u.username,avatar:u.avatar||""}; await touchPresence(req.session.user); res.redirect("/"); } catch(e){console.error(e);res.status(500).send("Der opstod en fejl under Discord login.");} });
app.post("/auth/logout",async(req,res)=>{if(appUser(req))await removePresence(appUser(req).id);req.session=null;res.json({ok:true});});
app.get("/api/me",async(req,res)=>{if(!appUser(req))return res.json({loggedIn:false});const allowed=await hasStaffRole(appUser(req).id);if(!allowed){req.session=null;return res.json({loggedIn:false});}await touchPresence(req.session.user);let roles=[];try{const guild=await discord.guilds.fetch(guildId);const member=await guild.members.fetch(appUser(req).id);roles=member.roles.cache.filter(role=>role.id!==guild.id).sort((a,b)=>b.position-a.position).map(role=>({id:role.id,name:role.name,color:role.hexColor||"#99aab5",position:role.position}));}catch(e){console.error("Kunne ikke hente brugerroller:",e.message);}res.json({loggedIn:true,user:{...appUser(req),roles}});});
async function touchPresence(u){ if(!u)return; try{await db.query("INSERT INTO staff_presence(discord_id,name,last_seen) VALUES($1,$2,NOW()) ON CONFLICT(discord_id) DO UPDATE SET name=EXCLUDED.name,last_seen=NOW()",[u.id,u.name]);}catch(e){console.error("Presence fejl:",e.message);} }
async function removePresence(id){try{await db.query("DELETE FROM staff_presence WHERE discord_id=$1",[id]);}catch(e){}}
app.get("/api/staff-online",requireLogin,async(req,res)=>{try{await touchPresence(appUser(req));const r=await db.query("SELECT discord_id,name,last_seen FROM staff_presence WHERE last_seen > NOW() - INTERVAL '2 minutes' ORDER BY name ASC");res.json(r.rows);}catch(e){console.error("Kunne ikke hente online staff:",e.message);res.status(500).json({error:"Kunne ikke hente online staff."});}});
async function discordAvatar(discordId) {
  try {
    if (!discord || !discord.isReady() || !guildId) return "";
    const guild = await discord.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordId);
    return member.user.displayAvatarURL({ extension: "png", size: 256 }) || "";
  } catch (e) {
    return "";
  }
}
async function addAvatars(rows) {
  return Promise.all(rows.map(async p => {
    if (p.discord_avatar) return p;
    const avatar = await discordAvatar(p.discord_id);
    if (avatar) {
      p.discord_avatar = avatar;
      db.query("UPDATE people SET discord_avatar=$1 WHERE id=$2", [avatar, p.id]).catch(() => {});
    }
    return p;
  }));
}
async function discordRoles(discordId) {
  try {
    if (!discord || !discord.isReady() || !guildId) return [];
    const guild = await discord.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordId);
    return member.roles.cache
      .filter(role => role.id !== guild.id)
      .sort((a,b) => b.position - a.position)
      .map(role => ({ id: role.id, name: role.name, color: role.hexColor || "#99aab5", position: role.position }));
  } catch (e) {
    console.error("Kunne ikke hente Discord-roller:", e.message);
    return [];
  }
}
async function assignableDiscordRoles() {
  if (!discord || !discord.isReady() || !guildId) return [];
  const guild = await discord.guilds.fetch(guildId);
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return [];
  return guild.roles.cache
    .filter(role => role.id !== guild.id && !role.managed && role.position < me.roles.highest.position)
    .sort((a,b) => b.position - a.position)
    .map(role => ({ id: role.id, name: role.name, color: role.hexColor || "#99aab5", position: role.position }));
}
app.get("/api/discord-roles/assignable",requireLogin,async(req,res)=>{
  try{res.json({roles:await assignableDiscordRoles()});}
  catch(e){console.error("Kunne ikke hente roller der kan administreres:",e.message);res.status(500).json({error:"Kunne ikke hente Discord-roller."});}
});
app.get("/api/people/:id/discord-roles",requireLogin,async(req,res)=>{
  try{
    const personResult=await db.query("SELECT discord_id FROM people WHERE id=$1",[req.params.id]);
    const p=personResult.rows[0];
    if(!p)return res.sendStatus(404);
    res.json({roles:await discordRoles(p.discord_id)});
  }catch(e){console.error("Kunne ikke hente Discord-roller:",e.message);res.status(500).json({error:"Kunne ikke hente Discord-roller."});}
});
app.post("/api/people/:id/discord-roles",requireLogin,async(req,res)=>{
  try{
    const action=req.body?.action;
    const roleId=String(req.body?.roleId||"");
    if(!["add","remove"].includes(action)||!roleId)return res.status(400).json({error:"Ugyldig rolleændring."});
    const personResult=await db.query("SELECT * FROM people WHERE id=$1",[req.params.id]);
    const p=personResult.rows[0];
    if(!p)return res.sendStatus(404);
    if(!discord.isReady()||!guildId)return res.status(503).json({error:"Discord-botten er ikke klar."});
    const guild=await discord.guilds.fetch(guildId);
    const target=await guild.members.fetch(p.discord_id);
    const role=guild.roles.cache.get(roleId)||await guild.roles.fetch(roleId);
    const me=await guild.members.fetchMe();
    if(!role)return res.status(404).json({error:"Rollen findes ikke."});
    if(role.id===guild.id||role.managed)return res.status(400).json({error:"Denne rolle kan ikke administreres."});
    if(!me.permissions.has(PermissionsBitField.Flags.ManageRoles))return res.status(403).json({error:"Botten mangler Manage Roles."});
    if(role.position>=me.roles.highest.position)return res.status(403).json({error:"Botten kan ikke administrere en rolle over eller på samme niveau som sin højeste rolle."});
    if(action==="add"){
      if(target.roles.cache.has(role.id))return res.json({ok:true,message:"Personen har allerede denne rolle."});
      await target.roles.add(role,`Dream Network Staff Panel: ${appUser(req).name}`);
      await audit("DISCORD_ROLLE_TILFØJET",p.id,appUser(req),`${role.name} (${role.id})`);
      return res.json({ok:true,message:`Rollen ${role.name} blev tilføjet.`});
    }
    if(!target.roles.cache.has(role.id))return res.json({ok:true,message:"Personen har ikke denne rolle."});
    await target.roles.remove(role,`Dream Network Staff Panel: ${appUser(req).name}`);
    await audit("DISCORD_ROLLE_FJERNET",p.id,appUser(req),`${role.name} (${role.id})`);
    res.json({ok:true,message:`Rollen ${role.name} blev fjernet.`});
  }catch(e){console.error("Kunne ikke ændre Discord-rolle:",e.message);res.status(500).json({error:"Kunne ikke ændre Discord-rollen."});}
});
installPlayerReadApi(app, db, requireLogin);
app.get("/api/people",requireLogin,async(req,res)=>{try{const result=await db.query(PEOPLE_OVERVIEW_SQL);res.json(await addAvatars(result.rows));}catch(e){console.error("Kunne ikke hente personer:",e.message);res.status(500).json({error:"Kunne ikke hente personer."});}});
app.get("/api/people/:id",requireLogin,async(req,res)=>{try{const personResult=await db.query("SELECT * FROM people WHERE id=$1",[req.params.id]);const p=personResult.rows[0];if(!p)return res.sendStatus(404);const [warnings,bans]=await Promise.all([db.query("SELECT * FROM warnings WHERE person_id=$1 ORDER BY created_at DESC",[p.id]),db.query("SELECT * FROM bans WHERE person_id=$1 ORDER BY created_at DESC",[p.id])]);p.warnings=warnings.rows;p.bans=bans.rows;(await addAvatars([p]))[0];res.json(p);}catch(e){console.error("Kunne ikke hente person:",e.message);res.status(500).json({error:"Kunne ikke hente personen."});}});
app.post("/api/people",requireLogin,async(req,res)=>{const u=appUser(req),b=req.body||{};if(!b.discordName||!b.discordId)return res.status(400).json({error:"Discord navn og ID kræves."});try{const avatar=await discordAvatar(b.discordId);const result=await db.query(`INSERT INTO people(discord_id,discord_name,fivem_name,license,notes,discord_avatar,created_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[b.discordId,b.discordName,b.fivemName||"",b.license||"",b.notes||"",avatar,now(),u.name]);await audit("OPRET_PERSON",result.rows[0].id,u,`${b.discordName} (${b.discordId})`);res.json({id:result.rows[0].id});}catch(e){if(e.code==="23505")return res.status(409).json({error:"Denne Discord ID findes allerede."});console.error("Kunne ikke oprette person:",e.message);res.status(500).json({error:"Kunne ikke oprette personen."});}});
app.put("/api/people/:id",requireLogin,async(req,res)=>{const b=req.body||{};try{const personResult=await db.query("SELECT * FROM people WHERE id=$1",[req.params.id]);const p=personResult.rows[0];if(!p)return res.sendStatus(404);await db.query("UPDATE people SET discord_name=$1,fivem_name=$2,license=$3,notes=$4 WHERE id=$5",[b.discordName??p.discord_name,b.fivemName??p.fivem_name,b.license??p.license,b.notes??p.notes,p.id]);await audit("REDIGER_PERSON",p.id,appUser(req),"Opdateret profil");res.json({ok:true});}catch(e){console.error("Kunne ikke redigere person:",e.message);res.status(500).json({error:"Kunne ikke redigere personen."});}});
app.delete("/api/people/:id",requireLogin,async(req,res)=>{const client=await db.connect();try{const personResult=await client.query("SELECT * FROM people WHERE id=$1",[req.params.id]);const p=personResult.rows[0];if(!p){client.release();return res.sendStatus(404);}await client.query("BEGIN");await client.query("DELETE FROM warnings WHERE person_id=$1",[p.id]);await client.query("DELETE FROM bans WHERE person_id=$1",[p.id]);await client.query("DELETE FROM audit WHERE person_id=$1",[p.id]);await client.query("DELETE FROM people WHERE id=$1",[p.id]);await client.query("COMMIT");res.json({ok:true});}catch(e){await client.query("ROLLBACK").catch(()=>{});console.error("Kunne ikke slette person:",e.message);res.status(500).json({error:"Kunne ikke slette personen."});}finally{client.release();}});
app.post("/api/people/:id/warnings",requireLogin,async(req,res)=>{const u=appUser(req),b=req.body||{};try{const personResult=await db.query("SELECT * FROM people WHERE id=$1",[req.params.id]);const p=personResult.rows[0];if(!p)return res.sendStatus(404);if(!b.reason)return res.status(400).json({error:"Grund kræves."});const result=await db.query(`INSERT INTO warnings(person_id,reason,notes,by_discord_id,by_name,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[p.id,b.reason,b.notes||"",u.id,u.name,now()]);await audit("ADVARSEL",p.id,u,b.reason);res.json({id:result.rows[0].id});}catch(e){console.error("Kunne ikke give advarsel:",e.message);res.status(500).json({error:"Kunne ikke gemme advarslen."});}});
app.post("/api/people/:id/bans",requireLogin,async(req,res)=>{const u=appUser(req),b=req.body||{};try{const personResult=await db.query("SELECT * FROM people WHERE id=$1",[req.params.id]);const p=personResult.rows[0];if(!p)return res.sendStatus(404);if(!b.reason)return res.status(400).json({error:"Grund kræves."});const until=b.until||"";const result=await db.query(`INSERT INTO bans(person_id,reason,until,revoked,by_discord_id,by_name,created_at) VALUES($1,$2,$3,0,$4,$5,$6) RETURNING id`,[p.id,b.reason,until,u.id,u.name,now()]);await audit("BAN",p.id,u,b.reason);res.json({id:result.rows[0].id});}catch(e){console.error("Kunne ikke give ban:",e.message);res.status(500).json({error:"Kunne ikke gemme bannet."});}});
app.post("/api/bans/:id/revoke",requireLogin,async(req,res)=>{try{const banResult=await db.query("SELECT * FROM bans WHERE id=$1",[req.params.id]);const b=banResult.rows[0];if(!b)return res.sendStatus(404);await db.query("UPDATE bans SET revoked=1 WHERE id=$1",[b.id]);await audit("OPHÆV_BAN",b.person_id,appUser(req),`Ban #${b.id} ophævet`);res.json({ok:true});}catch(e){console.error("Kunne ikke ophæve ban:",e.message);res.status(500).json({error:"Kunne ikke ophæve bannet."});}});
app.get("/api/audit",requireLogin,async(req,res)=>{try{const result=await db.query("SELECT * FROM audit ORDER BY created_at DESC LIMIT 200");res.json(result.rows);}catch(e){console.error("Kunne ikke hente staff-log:",e.message);res.status(500).json({error:"Kunne ikke hente staff-loggen."});}});
app.get("/api/backup",requireLogin,async(req,res)=>{try{const [people,warnings,bans,auditRows]=await Promise.all([db.query("SELECT * FROM people"),db.query("SELECT * FROM warnings"),db.query("SELECT * FROM bans"),db.query("SELECT * FROM audit")]);res.setHeader("Content-Disposition","attachment; filename=staff-backup.json");res.json({version:3,exportedAt:now(),people:people.rows,warnings:warnings.rows,bans:bans.rows,audit:auditRows.rows});}catch(e){console.error("Kunne ikke lave backup:",e.message);res.status(500).json({error:"Kunne ikke lave backup."});}});
async function audit(action,personId,u,details){await db.query("INSERT INTO audit(action,person_id,actor_id,actor_name,details,created_at) VALUES($1,$2,$3,$4,$5,$6)",[action,personId,u.id,u.name,details||"",now()]);}
const discord=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
const guildId=process.env.GUILD_ID;
const staffRoleId=process.env.STAFF_ROLE_ID;
const adminRoleId=process.env.ADMIN_ROLE_ID;
app.locals.discord=discord;
app.locals.guildId=guildId;

async function syncAllDiscordMembers() {
  if (!guildId || !discord.isReady()) return;
  try {
    const guild = await discord.guilds.fetch(guildId);
    const members = await guild.members.fetch();
    let added = 0;
    let updated = 0;
    for (const member of members.values()) {
      if (member.user.bot) continue;
      const avatar = member.user.displayAvatarURL({ extension: "png", size: 256 }) || "";
      const result = await db.query(`
        INSERT INTO people(discord_id,discord_name,discord_avatar,created_at,created_by,notes)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(discord_id) DO UPDATE SET
          discord_name=EXCLUDED.discord_name,
          discord_avatar=CASE WHEN EXCLUDED.discord_avatar<>'' THEN EXCLUDED.discord_avatar ELSE people.discord_avatar END
        RETURNING (xmax = 0) AS inserted
      `,[member.id,member.user.globalName||member.user.username,avatar,now(),"Discord bot","Automatisk synkroniseret fra Discord."]);
      if (result.rows[0]?.inserted) added++;
      else updated++;
    }
    console.log(`DISCORD SYNC FÆRDIG: ${added} nye, ${updated} eksisterende medlemmer synkroniseret.`);
  } catch (e) {
    console.error("Kunne ikke synkronisere Discord-medlemmer:", e.message);
  }
}

discord.once("ready",async()=>{
  console.log(`Discord bot online som ${discord.user.tag}`);
  await syncAllDiscordMembers();
});

discord.on("guildMemberAdd",async member=>{
  try{
    if (member.user.bot) return;
    const avatar=member.user.displayAvatarURL({extension:"png",size:256})||"";
    await db.query(`INSERT INTO people(discord_id,discord_name,discord_avatar,created_at,created_by,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(discord_id) DO UPDATE SET discord_name=EXCLUDED.discord_name,discord_avatar=CASE WHEN EXCLUDED.discord_avatar<>'' THEN EXCLUDED.discord_avatar ELSE people.discord_avatar END`,[member.id,member.user.globalName||member.user.username,avatar,now(),"Discord bot","Automatisk registreret ved Discord join."]);
    console.log(`NYT MEDLEM REGISTRERET: ${member.user.tag} (${member.id})`);
  }catch(e){console.error("Kunne ikke gemme nyt medlem:",e.message);}
});

if(!process.env.DISCORD_TOKEN)console.error("ADVARSEL: DISCORD_TOKEN mangler.");else discord.login(process.env.DISCORD_TOKEN).catch(e=>console.error("Discord login fejlede:",e.message));
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
initDb().then(()=>app.listen(PORT,()=>console.log(`Staff panel kører på port ${PORT}`))).catch(e=>{console.error("Kunne ikke starte databasen:",e);process.exit(1);});
