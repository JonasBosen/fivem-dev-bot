# Panelet på Vercel

Vercel kører kun **web-panelet** (`api/index.js`). Discord-botten med slash-kommandoer, musik, timere og livestream-tjek er en vedvarende proces og skal fortsat køre på en almindelig vært (fx Render med `npm start`). Panelet og botten deler samme Supabase-database.

## Environment Variables i Vercel (Project → Settings → Environment Variables)

| Navn | Bemærkning |
|---|---|
| `DISCORD_TOKEN` | Samme bot-token som botten bruger. Funktionen logger ind uden handlers, så den svarer ikke på kommandoer. |
| `DISCORD_CLIENT_ID` | Fra Discord Developer Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | Samme sted |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | eller `DATABASE_URL` til Supabase Session pooler |
| `BASE_URL` | `https://fivem-dev-bot.vercel.app` (uden skråstreg til sidst). Hvis den mangler, bruges Vercels produktionsadresse. |
| `SESSION_SECRET` | Valgfri lang tilfældig tekst. Hvis den mangler, udledes en fast værdi fra bot-tokenet. |
| `MAIN_GUILD_ID` | Valgfri; standard er Dream Network-serveren |

Efter ændring af variabler skal der laves en ny deployment.

## Discord Developer Portal

Tilføj `https://fivem-dev-bot.vercel.app/auth/callback` under OAuth2 → Redirects.

## Sådan virker det

- `vercel.json` sender alle adresser til `api/index.js`, som starter panelet første gang (database + Discord-forbindelse, typisk få sekunder) og genbruger det, mens instansen er varm.
- Login-sessioner gemmes i databasen (`src/web/session-store.js`, tabellen `settings` med nøgler `session:<hash>`), fordi serverless-instanser ikke deler hukommelse.
- Mangler en variabel eller fejler opstarten, svarer siden med `503` og en JSON med fejlkode og navne på manglende variabler (aldrig værdier).
- Musik og andre funktioner, der kræver botten som vedvarende proces, virker ikke fra Vercel.
- `.vercelignore` udelader den gamle bot i projektets rod, så dens `public/index.html` ikke skygger for panelet.
