# Fælles Discord-bot

Én Node-proces kører Discord-botten, web-dashboardet og alle moduler. `npm start` starter `src/index.js`. Filerne i projektets rod fra den tidligere bot er bevaret som reference; de startes ikke.

Alle online-data skal ligge i Supabase-projekt **kdxxtdiydepuiecpdpha**. Tabellerne oprettes i skemaet `allbot`, inklusive fejlmeldinger, billeder, noter og tjeklister. Projektkontrol afviser en PostgreSQL-forbindelse til et andet Supabase-projekt. Browseren får aldrig databaseoplysninger. Lokal udvikling bruger SQLite.

## Kategorier

| Kategori | Implementeret grundlag | Kræver separat afprøvning/udvidelse |
|---|---|---|
| Ansøgninger | Formularer, review, acceptroller | Appys komplette premium-funktionsliste og eksisterende formularer er ikke importeret |
| Moderation og community | Advarsler, ban, timeout, automod, levels, velkomst, verificering, egne tekstkommandoer | Alle MEE6-plugins og premium-funktioner er ikke genskabt |
| Tickets | Kategorier, spørgsmål, private kanaler, claim, lukning, transcript | Eksisterende Ticket Tool-paneler og historik er ikke importeret |
| Streams | Twitch-livebeskeder og nye YouTube-videoer | Twitch-nøgler kræves; Kick, live-roller, kalender og alle Streamcord Pro-funktioner mangler |
| Musik | Afspilning, kø, pause, skip, shuffle, gentagelse, volumen | Live lyd er ikke afprøvet; YouTube-extractor er ikke inkluderet; én bot kan være i én talekanal pr. server ad gangen |
| Udvikler | Discord-fejlmelding med billede, fire statusser, privat statusbesked, /fejlstatus, web-tavle, noter, tjeklister, konfliktkontrol, gentag Discord-synkronisering | Manuel liveprøve med Discord-login og udviklerrolle kræves |

Noter og tjeklister sendes ikke til borgeren. Ved lukkede private beskeder bruges `/fejlstatus id:`. Billedet gemmes i databasen til dashboardet; billedpreviewet i Discord anvender Discords oprindelige URL, som kan udløbe. Statusbeskeden forbliver redigerbar. Tavlen viser de senest opdaterede 500 sager og genindlæses med knappen Opdatér tavlen.

## Opsætning på den eksisterende Render-tjeneste

1. Bevar `SUPABASE_URL=https://kdxxtdiydepuiecpdpha.supabase.co` og den eksisterende `SUPABASE_SERVICE_KEY` på Render. Anvend `supabase-allbot.sql` én gang. Adapteren kan kun udføre godkendte SQL-skabeloner; RPC er lukket for anonyme og almindelige loginbrugere. Alternativt kan `DATABASE_URL` pege på projektets Session pooler med TLS-verifikation.
2. Bevar bot-tokenet og klientoplysningerne. Både `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` og de tidligere `CLIENT_ID`/`CLIENT_SECRET` accepteres.
3. Sæt en lang `SESSION_SECRET` og `BASE_URL` til den ene valgte hjemmeside. OAuth2 Redirect i Discord: `<BASE_URL>/auth/callback`.
4. Byg med `npm ci`, start med `npm start`. Kun én instans må bruge det samme Discord-token. Gratis Render kan gå i dvale; det er ikke en garanti for botdrift døgnet rundt. Der er ikke oprettet nye betalte tjenester.
5. Ved direkte PostgreSQL-forbindelse oprettes `allbot`-skemaet automatisk. Ved Supabase API skal migrationen anvendes før start. Ingen eksisterende tabeller slettes. Det nye skema skal ikke eksponeres via Supabases offentlige Data API.
6. Skal tidligere udvikleropgaver flyttes fra `public.bot_state`, så sæt `GUILD_ID=928657151260516382` og kør `npm run db:import-legacy`. Gentagen kørsel giver ikke dubletter. Det gamle snapshot bevares. Gamle panelknapper genbruges ikke; send et nyt panel fra dashboardet. Historiske botbeskeder flyttes ikke.
7. Administrator logger ind og vælger Udvikler & fejlmeldinger → aktivér modulet, vælg udviklerroller, gem og send panelet. Udviklere får kun adgang til udviklerkategorien. Administratorer får adgang til alle kategorier.

Før gamle bots udfases: afprøv ansøgning, ticket og transcript, moderation, musik i en rigtig talekanal, Twitch-besked og et komplet fejlforløb med billede. Test også adgang uden rolle, efter fjernet rolle, samt genstart og bevarede data. De fem botters premium-udgaver er inspirationskilder; fuld funktionslighed er ikke verificeret.

## Verifikation

Når SQL ændres: kør `npm run db:migration`, gennemse migrationen og anvend den før deployment.

`npm test` kontrollerer PostgreSQL-skema og SQL, datalagring, serveradskillelse, statusskift, tjeklister, samtidige ændringer, rollefjernelse, intern noteafskærmning, SQL-injektion, RPC-rettigheder og Discord-synkroniseringsfejl. Live Discord, Supabase og web-login kræver de rigtige tilslutninger.
