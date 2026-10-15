-- Separate existing references without changing the original GIF/image bytes.
ALTER TABLE allbot.panel_media ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'shared';
CREATE INDEX IF NOT EXISTS panel_media_scope ON allbot.panel_media(guild_id,scope,created_at);
INSERT INTO allbot.panel_media(id,guild_id,user_id,name,mime,content,created_at,scope)
SELECT m.id||'-birthdays',m.guild_id,m.user_id,m.name,m.mime,m.content,m.created_at,'birthdays'
FROM allbot.panel_media m JOIN allbot.settings s ON s.guild_id=m.guild_id
WHERE m.scope='shared' AND s.data::jsonb #>> '{birthdays,mediaId}'=m.id
ON CONFLICT(id) DO NOTHING;
UPDATE allbot.settings s SET data=jsonb_set(s.data::jsonb,'{birthdays,mediaId}',to_jsonb(m.id||'-birthdays'))::text
FROM allbot.panel_media m WHERE m.guild_id=s.guild_id AND m.scope='shared' AND s.data::jsonb #>> '{birthdays,mediaId}'=m.id;
INSERT INTO allbot.panel_media(id,guild_id,user_id,name,mime,content,created_at,scope)
SELECT DISTINCT m.id||'-slideshow',m.guild_id,m.user_id,m.name,m.mime,m.content,m.created_at,'slideshow'
FROM allbot.settings s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.data::jsonb #> '{slideshow,slides}','[]'::jsonb)) slide
JOIN allbot.panel_media m ON m.guild_id=s.guild_id AND m.id=slide->>'mediaId'
WHERE m.scope='shared' ON CONFLICT(id) DO NOTHING;
UPDATE allbot.settings s SET data=jsonb_set(s.data::jsonb,'{slideshow,slides}',(
 SELECT COALESCE(jsonb_agg(CASE WHEN m.id IS NOT NULL THEN jsonb_set(slide,'{mediaId}',to_jsonb(m.id||'-slideshow')) ELSE slide END ORDER BY ord),'[]'::jsonb)
 FROM jsonb_array_elements(s.data::jsonb #> '{slideshow,slides}') WITH ORDINALITY AS a(slide,ord)
 LEFT JOIN allbot.panel_media m ON m.guild_id=s.guild_id AND m.id=slide->>'mediaId' AND m.scope='shared'
))::text WHERE jsonb_typeof(s.data::jsonb #> '{slideshow,slides}')='array';
