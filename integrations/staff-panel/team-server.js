require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const { installStaffApi } = require("./staff-api");
const { installAdminWarningApi } = require("./admin-warning-api");
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const TEAM_EDIT_CODE = String(process.env.TEAM_EDIT_CODE || "4827");
const STAFF_EDIT_CODE = String(process.env.STAFF_EDIT_CODE || "4444");
if (!DATABASE_URL) { console.error("FEJL: DATABASE_URL mangler."); process.exit(1); }
const db = new Pool(require('./db-options').databaseOptions(3));
const originalListen = express.application.listen;
let installed = false;
async function installTeam(app) {
  if (installed) return;
  installed = true;
  await installAdminWarningApi(app, db);
  await db.query(`CREATE TABLE IF NOT EXISTS team_members (slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 7), role TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '');`);
  await db.query(`ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_slot_check`);
  await db.query(`ALTER TABLE team_members ADD CONSTRAINT team_members_slot_check CHECK (slot BETWEEN 1 AND 7)`);
  const defaults=[[1,"Ejer","Ejer 1"],[2,"Ejer","Ejer 2"],[3,"Ejer","Ejer 3"],[4,"Ledelse","Ledelse 1"],[5,"Ledelse","Ledelse 2"],[6,"Ledelse","Ledelse 3"],[7,"Grafiker","Grafiker"]];
  for(const [slot,role,name] of defaults) await db.query(`INSERT INTO team_members(slot,role,name,image) VALUES($1,$2,$3,'') ON CONFLICT(slot) DO NOTHING`,[slot,role,name]);
  const requireLogin=(req,res,next)=>{if(!req.session||!req.session.user)return res.status(401).json({error:"LOGIN_REQUIRED"});next();};
  app.get("/api/team/edit-status",requireLogin,(req,res)=>res.json({unlocked:req.session.teamEditUnlocked===true}));
  app.post("/api/team/unlock",requireLogin,(req,res)=>{const code=String(req.body?.code??"").trim();if(!/^\d{4}$/.test(code)||code!==TEAM_EDIT_CODE){req.session.teamEditUnlocked=false;return res.status(403).json({error:"Forkert Team-kode."});}req.session.teamEditUnlocked=true;res.json({ok:true,unlocked:true});});
  app.post("/api/team/lock",requireLogin,(req,res)=>{req.session.teamEditUnlocked=false;res.json({ok:true,unlocked:false});});
  app.get("/api/team",requireLogin,async(req,res)=>{try{res.json((await db.query("SELECT slot,role,name,image FROM team_members ORDER BY slot ASC")).rows);}catch(e){console.error(e.message);res.status(500).json({error:"Kunne ikke hente Teamet."});}});
  app.put("/api/team/:slot",requireLogin,async(req,res)=>{if(req.session.teamEditUnlocked!==true)return res.status(403).json({error:"Teamet er låst. Indtast den 4-cifrede kode først."});const slot=Number(req.params.slot),name=String(req.body?.name??"").trim(),image=String(req.body?.image??"");if(!Number.isInteger(slot)||slot<1||slot>7)return res.status(400).json({error:"Ugyldig Team-plads."});if(name.length>120)return res.status(400).json({error:"Navnet er for langt."});if(image.length>900000)return res.status(400).json({error:"Billedet er for stort."});try{const r=await db.query("UPDATE team_members SET name=$1,image=$2 WHERE slot=$3 RETURNING slot,role,name,image",[name,image,slot]);if(!r.rows[0])return res.status(404).json({error:"Team-pladsen findes ikke."});res.json(r.rows[0]);}catch(e){res.status(500).json({error:"Kunne ikke gemme Teamet."});}});
  app.get("/api/staff-management/edit-status",requireLogin,(req,res)=>res.json({unlocked:req.session.staffEditUnlocked===true}));
  app.post("/api/staff-management/unlock",requireLogin,(req,res)=>{const code=String(req.body?.code??"").trim();if(!/^\d{4}$/.test(code)||code!==STAFF_EDIT_CODE){req.session.staffEditUnlocked=false;return res.status(403).json({error:"Forkert staff-kode."});}req.session.staffEditUnlocked=true;res.json({ok:true,unlocked:true});});
  app.post("/api/staff-management/lock",requireLogin,(req,res)=>{req.session.staffEditUnlocked=false;res.json({ok:true,unlocked:false});});
  app.use((req,res,next)=>{const change=/^\/api\/staff-management\/(hire|fire|warnings(?:\/[^/]+)?)$/.test(req.path)||/^\/api\/people\/\d+\/warnings\/\d+$/.test(req.path);if((req.method==="POST"||req.method==="DELETE")&&change&&(!req.session||req.session.staffEditUnlocked!==true))return res.status(403).json({error:"Ændringen er låst. Indtast den 4-cifrede kode først."});next();});
  app.delete("/api/people/:personId/warnings/:warningId",requireLogin,async(req,res)=>{try{const personId=Number(req.params.personId),warningId=Number(req.params.warningId);if(!Number.isInteger(personId)||!Number.isInteger(warningId))return res.status(400).json({error:"Ugyldig advarsel."});const w=await db.query("SELECT * FROM warnings WHERE id=$1 AND person_id=$2",[warningId,personId]);if(!w.rows[0])return res.status(404).json({error:"Advarslen findes ikke."});await db.query("DELETE FROM warnings WHERE id=$1 AND person_id=$2",[warningId,personId]);const u=req.session.user;await db.query("INSERT INTO audit(action,person_id,actor_id,actor_name,details,created_at) VALUES($1,$2,$3,$4,$5,NOW())",["SLET_ADVARSEL",personId,u.id,u.name,`Advarsel #${warningId} slettet: ${w.rows[0].reason}`]);res.json({ok:true});}catch(e){console.error("Kunne ikke slette advarsel:",e.message);res.status(500).json({error:"Kunne ikke slette advarslen."});}});
  try{await installStaffApi(app);console.log("Staff API klar.");}catch(e){console.error("Staff API kunne ikke starte:",e.message);}
  app.get("/api/activity-all",requireLogin,async(req,res)=>{try{const q=await db.query(`SELECT id::text AS id,action,actor_name,details,created_at FROM audit UNION ALL SELECT ('staff-'||id::text) AS id,action,actor_name,reason AS details,created_at FROM staff_history_v2 ORDER BY created_at DESC`);res.json(q.rows);}catch(e){console.error("Aktivitetsfeed fejl:",e.message);res.status(500).json({error:"Kunne ikke hente aktivitet."});}});
}
express.application.listen=function(...args){const app=this;installTeam(app).then(()=>originalListen.apply(app,args)).catch(err=>{console.error("Kunne ikke starte Teamet:",err);process.exit(1);});return app;};
require("./server.js");
