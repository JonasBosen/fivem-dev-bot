# Panelet på Vercel

Alt kører på Vercel, uden Render, og deler samme Supabase-database:

- **Webpanelet** er en Vercel Function (`api/index.js`) i Frankfurt (`fra1`, samme region som databasen).
- **Discord-botten** (knapper, slash-kommandoer, timere, livestream-tjek, musik) kører som Vercel Daemon (`scripts/vercel-daemon.js` + `Dockerfile`) i Frankfurt. En lederlås i databasen sikrer, at kun én botproces er aktiv. Daemons er en beta; Hobby har 10 aktive CPU-timer pr. måned.

## Environment Variables i Vercel (Project → Settings → Environment Variables)

| Navn | Bemærkning |
|---|---|
| `DISCORD_TOKEN` | Samme bot-token som botten bruger. Funktionen logger ind uden handlers, så den svarer ikke på kommandoer. |
| `DISCORD_CLIENT_ID` | Fra Discord Developer Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | Samme sted |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | eller `DATABASE_URL` til Supabase Session pooler |
| `BASE_URL` | `https://fivem-dev-bot.vercel.app` (uden skråstreg til sidst). Hvis den mangler, eller stadig peger på en `onrender.com`-adresse, bruges Vercels produktionsadresse automatisk. |
| `SESSION_SECRET` | Valgfri lang tilfældig tekst. Hvis den mangler, udledes en fast værdi fra bot-tokenet. |
| `MAIN_GUILD_ID` | Valgfri; standard er Dream Network-serveren |

Efter ændring af variabler skal der laves en ny deployment.

## Discord Developer Portal

Tilføj `https://fivem-dev-bot.vercel.app/auth/callback` under OAuth2 → Redirects.

## Sådan virker det

- `vercel.json` sender alle adresser til `api/index.js`, som starter panelet første gang (database + Discord-forbindelse, typisk få sekunder) og genbruger det, mens instansen er varm.
- Login-sessioner gemmes i databasen (`src/web/session-store.js`, tabellen `settings` med nøgler `session:<hash>`), fordi serverless-instanser ikke deler hukommelse.
- Mangler en variabel eller fejler opstarten, svarer siden med `503` og en JSON med fejlkode og navne på manglende variabler (aldrig værdier).
- Funktioner, der kræver en vedvarende proces (musik, knapper, timere), håndteres af daemonen, ikke af funktionen.
- `.vercelignore` udelader den gamle bot i projektets rod, så dens `public/index.html` ikke skygger for panelet.
