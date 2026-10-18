# Vercel: bot og webpanel

Projekt: `lokkes-fivem-dev/fivem-dev-bot`, produktionsadresse `https://fivem-dev-bot.vercel.app`.

Den eksisterende Supabase-database bevares. Ingen kopiering eller sletning af sager og borgere er nødvendig.

## Drift

- Hjemmesidens offentlige filer kopieres fra `src/web/public` til `dist` og leveres fra Vercel CDN.
- `api/bridge.js` sender dynamiske HTTP-kald gennem en privat, krypteret og kortlivet databasekø.
- Én Vercel Daemon i Frankfurt kører den eksisterende bot og Express-app. Daemons kan ikke modtage indgående HTTP-trafik direkte; derfor bruges køen.
- Den oprindelige Express-app kontrollerer stadig Discord-login, aktuelle roller, personlig kode, udviklerkode og Origin.
- AES-GCM beskytter cookies, indhold og sessions i transporttabellerne. `HOST_BRIDGE_SECRET` skal være ens for funktionen og daemonen og må ikke sendes til browseren.
- Jobs kan kun afhentes én gang. Afbrudte handlinger genafspilles ikke automatisk; kontrollér resultatet i Discord før manuel gentagelse.
- Login gemmes i et delt krypteret sessionslager. Den centrale bot får en tidsbegrænset lederlås før opstart, så overlappende deployments ikke normalt starter to aktive botprocesser.
- Transportdata udløber og ryddes løbende. Tabellerne `allbot.host_requests` og `allbot.host_sessions` er private med RLS og er kun tilgængelige gennem serverens service-role-forbindelse.

## Konfiguration

Projektets Root Directory skal være tom/roden, Framework `Other`, build `node scripts/build-vercel.js`, output `dist`, Node 24.x og Fluid Compute aktiv.

Kopiér de eksisterende servervariabler fra Render til Vercel Production. Især:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID` og `DISCORD_CLIENT_SECRET` (aliaserne `CLIENT_ID` og `CLIENT_SECRET` understøttes også)
- `SESSION_SECRET` (bevar værdien)
- `SUPABASE_URL` og `SUPABASE_SERVICE_KEY` eller den eksisterende godkendte `DATABASE_URL`
- `AI_CONFIG_ENCRYPTION_KEY`, hvis den eksisterer; ellers skal den oprindelige Supabase-service-key/SESSION_SECRET bevares, så den gemte AI-nøgle fortsat kan dekrypteres
- øvrige rolle-, guild-, musik- og stream-indstillinger, der allerede findes i Render

Vercel-specifikt:

- `BASE_URL=https://fivem-dev-bot.vercel.app`
- `HOST_BRIDGE_SECRET`: tilfældig hemmelig værdi på mindst 32 tegn
- `HOST_DAEMON=1`

Kopiér ikke Render-specifikke `RENDER_*`-værdier eller en gammel `BASE_URL`.

Tilføj `https://fivem-dev-bot.vercel.app/auth/callback` under Discord Developer Portal → OAuth2 → Redirects. Bevar eventuelt den gamle callback under overgangen.

Supabase-migrationen `private_vercel_transport_sessions` er additiv. `npm run db:migration` indeholder de nye tabeller og godkendte SQL-skabeloner.

## Deploy og kontrol

1. Kontrollér mål med `vercel project inspect --non-interactive`.
2. Kør `npm test`.
3. Deploy preview og kontrollér statiske filer med `vercel curl` uden at deaktivere beskyttelse.
4. Kontrollér at alle nødvendige Production-variabler er sat, før produktion aktiveres.
5. Deploy produktion; kontrollér `/ready`, databaseforbindelse, én Discord-botproces og et gennemført login.
6. Stop den gamle bot før parallel drift. Render-workspacet er allerede suspenderet i denne migration.

Vercel Daemons er en beta. Hobby har en månedlig kvote på 10 aktive CPU-timer for daemons, og bliver kvoten opbrugt, stopper de indtil næste måned. Det er ikke en garanti for ubegrænset gratis 24/7-drift. Lydbehandling kan bruge betydeligt mere CPU end almindelige Discord-kommandoer.

Vercel Functions har også payloadgrænser. Transporten accepterer højst 3 MB rå data pr. request/svar. Store eksisterende filer kan kræve en separat download-/uploadløsning.

AI-billedgenerering er fjernet. Tekst-AI kræver fortsat OpenAI API-saldo; selve panelet kan bruges med manuelt skrevet tekst.
