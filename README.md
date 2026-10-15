# FiveM Dev-bot (Discord + hjemmeside)

Huskeliste/afkrydsningsliste og ticketsystem til udvikling af en FiveM-server. Botten udvikler ikke selv noget – den holder styr på opgaverne.

## Funktioner

- **Udviklingspanel i Discord** (`/panel`): knapper til *Ikke startet*, *I gang*, *Færdig* og *Afvist*. Åbn en opgave og tryk **Opgave taget**, **Opgave færdig**, **Slip opgave**, **Afvis** eller **Genåbn**. Panelet opdaterer tallene automatisk.
- **Udviklingspanel på hjemmeside**: tavle med fire kolonner, søgning, ny opgave, opgavedetaljer med log og de samme knapper. Opdaterer sig selv hvert 10. sekund. Login sker med Discord, og kun folk med udviklerrollen (eller administrator) kommer ind. Discord og hjemmesiden bruger de samme data og samme log.
- **Ticketsystem** (`/ticketpanel`): borgere trykker "Meld en fejl" og udfylder en formular. Fejlen lander automatisk under *Ikke startet*, og et kort med knapper dukker op i udviklernes review-kanal. Udviklerne vurderer, om den skal tages eller afvises (med begrundelse).
- **Log**: hver handling (også fra hjemmesiden) skrives i log-kanalen: hvem der tog sagen, hvem der færdigmeldte den, hvad sagen handler om og hvad der er gjort.
- `/opgave id:<nr>`: vis en opgave med de seneste logposter.
- Borgere kan kun sende tickets. Alt andet kræver udviklerrollen.
- 60 sekunders cooldown pr. bruger på tickets mod spam.

## Opsætning

1. Opret en bot på https://discord.com/developers/applications → Bot → kopiér token. Invitér den med scopes `bot` og `applications.commands` og rettighederne *Send Messages*, *Embed Links*, *View Channel*.
2. Installér Node.js 18.17+ og kør:
   ```
   npm install
   copy .env.example .env      (Linux/Mac: cp .env.example .env)
   ```
3. Udfyld `.env` (token, client-ID, server-ID, udviklerrolle, log-kanal, review-kanal). Slå *Developer Mode* til i Discord for at kunne kopiere ID'er.
4. Start: `npm start`
5. I din udviklerkanal: `/panel`. I borgernes kanal: `/ticketpanel`.

## Hjemmesiden

Hjemmesiden er en del af selve botten (ingen separat opsætning af database eller frontend).

1. I Developer Portal → **OAuth2**: kopiér *Client Secret* til `CLIENT_SECRET`, og tilføj `BASE_URL` + `/auth/callback` under *Redirects* (fx `http://localhost:3000/auth/callback`).
2. Sæt `BASE_URL` (hjemmesidens adresse) og `SESSION_SECRET` (lang tilfældig tekst) i `.env`.
3. Start botten og åbn `BASE_URL` i browseren. Mangler de tre værdier, starter botten bare uden hjemmeside.

### Gratis hosting

Siden og botten skal køre i den samme Node-proces, der er tændt hele tiden – ellers går botten offline. En ren statisk gratis hjemmeside (fx GitHub Pages) kan derfor ikke bruges alene, fordi den ikke kan gemme opgaverne eller tale med Discord. Brug en gratis Node-vært (eller en gammel pc/Raspberry Pi derhjemme), og vær opmærksom på:

- Gratis planer sover ofte ved inaktivitet. Så er botten også offline, indtil siden vækkes. `/health` kan bruges til en ping-tjeneste.
- Filer på gratis planer slettes ofte ved genstart. Tag backup af `data/db.json`, eller brug en vært med vedvarende disk.
- Tjek vilkårene hos den vært, du vælger – de ændrer sig ofte.

Kør med HTTPS i produktion (de fleste værter giver det automatisk). Kun brugere med udviklerrollen får adgang, og rollen tjekkes igen løbende.

## Supabase + Render

1. Supabase: opret et projekt, åbn *SQL Editor*, og kør indholdet af `supabase.sql`.
2. Kopiér *Project URL* og `service_role`-nøglen (Project Settings → API) til `SUPABASE_URL` og `SUPABASE_SERVICE_KEY`. Nøglen er hemmelig: læg den kun som miljøvariabel på Render, aldrig på GitHub.
3. Læg koden på GitHub (uden `.env` og `data/`), og opret en Render *Web Service* fra repoet: Build `npm install`, Start `npm start`.
4. Tilføj alle variabler fra `.env.example` under *Environment* på Render. `BASE_URL` er tjenestens `https://…onrender.com`-adresse, og `BASE_URL/auth/callback` skal tilføjes som Redirect i Discord Developer Portal.

Uden Supabase-variabler gemmes data i `data/db.json` – tag backup af den fil (på Render forsvinder den ved genstart).
