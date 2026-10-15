const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { POSTGRES_SCHEMA } = require('../src/schema');
const { postgresSql } = require('../src/db');
const { keyFor } = require('../src/supabase-adapter');
const literal = text => "'" + text.replace(/'/g,"''") + "'";
const queries = new Set();
function scan(node) {
  if (!node || typeof node !== 'object') return;
  if(node.type==='CallExpression' && node.callee.type==='MemberExpression' && node.callee.object.name==='db' && node.callee.property.name==='prepare' && typeof node.arguments[0]?.value==='string') queries.add(node.arguments[0].value);
  for(const value of Object.values(node)) if(Array.isArray(value)) value.forEach(scan);else if(value&&typeof value==='object') scan(value);
}
for(const file of [path.join(__dirname,'../src/db.js'),path.join(__dirname,'../src/web/server.js'),...fs.readdirSync(path.join(__dirname,'../src/modules')).filter(f=>f.endsWith('.js')).map(f=>path.join(__dirname,'../src/modules',f)),path.join(__dirname,'import-legacy.js')]) scan(acorn.parse(fs.readFileSync(file,'utf8'),{ecmaVersion:'latest'}));
const rpc = `
CREATE TABLE IF NOT EXISTS allbot.query_templates (key TEXT PRIMARY KEY, statement TEXT NOT NULL, parameters INTEGER NOT NULL);
REVOKE ALL ON SCHEMA allbot FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA allbot FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.allbot_execute(query_key TEXT, params JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, allbot AS $function$
DECLARE template allbot.query_templates%ROWTYPE; statement TEXT; result JSONB; idx INTEGER; pieces TEXT[];
BEGIN
  SELECT * INTO template FROM allbot.query_templates WHERE key=query_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown query'; END IF;
  IF jsonb_typeof(params) IS DISTINCT FROM 'array' OR jsonb_array_length(params)<>template.parameters THEN RAISE EXCEPTION 'Invalid parameters'; END IF;
  pieces := regexp_split_to_array(template.statement, E'\\\\$[0-9]+');
  statement := pieces[1];
  IF template.parameters>0 THEN
    FOR idx IN 1..template.parameters LOOP
      statement := statement || quote_nullable(params->>(idx-1)) || pieces[idx+1];
    END LOOP;
  END IF;
  IF statement !~* '^SELECT' THEN statement := statement || ' RETURNING *'; END IF;
  EXECUTE 'WITH result AS ('||statement||') SELECT coalesce(jsonb_agg(to_jsonb(result)),''[]''::jsonb) FROM result' INTO result;
  RETURN jsonb_build_object('rows',result,'rowCount',jsonb_array_length(result));
END;
$function$;
REVOKE ALL ON FUNCTION public.allbot_execute(TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA allbot TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA allbot TO service_role;
REVOKE INSERT, UPDATE, DELETE ON allbot.query_templates FROM service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA allbot TO service_role;
GRANT EXECUTE ON FUNCTION public.allbot_execute(TEXT,JSONB) TO service_role;
`;
// Only these reviewed application statements are callable; clients cannot submit SQL.
const inserts = [...queries].map(sql=>`INSERT INTO allbot.query_templates (key,statement,parameters) VALUES (${literal(keyFor(sql))},${literal(postgresSql(sql))},${(sql.match(/\?/g)||[]).length}) ON CONFLICT(key) DO UPDATE SET statement=excluded.statement,parameters=excluded.parameters;`).join('\n');
fs.writeFileSync(path.join(__dirname,'../supabase-allbot.sql'),POSTGRES_SCHEMA+'\n'+fs.readFileSync(path.join(__dirname,'migrations/separate-panel-media.sql'),'utf8')+'\n'+rpc+'\n'+inserts+'\nALTER TABLE allbot.panel_users ENABLE ROW LEVEL SECURITY;\nALTER TABLE allbot.panel_invites ENABLE ROW LEVEL SECURITY;\nALTER TABLE allbot.panel_media ENABLE ROW LEVEL SECURITY;\nALTER TABLE allbot.dev_presence ENABLE ROW LEVEL SECURITY;\nALTER TABLE allbot.dev_registry ENABLE ROW LEVEL SECURITY;\n');
console.log(`Migration generated with ${queries.size} approved statements.`);
