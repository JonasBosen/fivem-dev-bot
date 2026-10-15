# Udviklerarbejdsplads og streamcenter

Udviklerpanelet kræver Discord-login, udvikler-/administratoradgang og en fælles firecifret kode. Administratorrollen omgår ikke koden. Første kode oprettes af Discord-serverejeren (eller en eksplicit ADMIN_USER_IDS-ejer) i panelet. Kun ejeren kan skifte koden, og panelet skal først låses op med den eksisterende kode. Koder gemmes med saltet scrypt-hash. Adgang udløber efter 30 minutter og kan låses manuelt. Forkerte forsøg begrænses per bruger, IP og server i databasen. En glemt kode kræver en kontrolleret nulstilling af hashposten via databaseadministratoren; der findes ingen offentlig nulstillingsrute.

Sager flyttes mellem Ikke taget, I gang, Afsluttet og Afvist ved træk og slip. Rækkefølge og arkivering gemmes i Supabase. Statusknapper fungerer også uden mus. Noter, tjeklister, billeder, kommentarer og planlægning følger sagen. Tidligere "done" vises som "closed". Borgeren svarer via knappen Svar på sagen i bottens DM eller /fejlsvar. Panelet kontrollerer nye svar hvert 7. sekund uden at overskrive lokale kladder.

Indstillinger for siden gemmer fælles farver, HTTPS-baggrundsbillede, navn, hjørner og tæthed. Den fælles Logs-side er fjernet. Kun udviklerområdet registrerer nye websitelogs og bevarer sin sagslog. Tidligere historiske databaseposter fra andre moduler er bevaret, men deres visning er fjernet. Streamforbindelsens aktuelle kontrolstatus gemmes fortsat til fejlsøgning. Udviklerændringer gemmer bruger-ID, tid og indhold uden hemmelige felter eller billeddata. Sagsloggen bevarer de fulde ændringer, også efter sletning. Der er ingen automatisk udløbsdato for logs. Udviklerlogs og billeder kræver også adgangskoden.

## Musik

Brug /play eller !play efterfulgt af et navn, YouTube-link eller Spotify-link. Nye numre tilføjes køen. /next eller !next springer videre, /stop eller !stop rydder køen og afbryder forbindelsen. /volume 0–150 ændrer fælles lydstyrke. Individuel lydstyrke ændres i Discord ved at højreklikke på botten i talekanalen. Præfikset følger serverens generelle indstilling (standard !). Message Content Intent skal være slået til for tekstkommandoer.

YouTube bruger discord-player-youtubei med simple-ytdl-core. Spotify bruges til metadata/sangmatch og får lyd fra en anden understøttet kilde; den streamer ikke Spotifys beskyttede lyd direkte. Spotify-metadata kan kræve DP_SPOTIFY_CLIENT_ID og DP_SPOTIFY_CLIENT_SECRET. Regioner, private links, platformændringer og hostingblokering kan påvirke kilder. Musik skal afprøves i en rigtig Discord-talekanal efter deployment.

## Streamplatforme

Hver af Twitch, YouTube, Kick og TikTok har egen fane med kanal, streamerrolle, PING-rolle, besked og oprydning. Gem rollen, giv den til personen og knyt personens Discord-ID til platformkontoen én gang. Alternativt kan personen bruge /stream tilmeld. Rollen alene afslører ikke personens konto på eksterne platforme. Fjernes rollen, stoppes notifikationer og en aktiv besked ryddes op. Kun den valgte PING-rolle kan pinges, selv hvis streamens titel indeholder @everyone.

Automatisk status kræver følgende Render Environment-felter:

- Twitch: TWITCH_CLIENT_ID og TWITCH_CLIENT_SECRET.
- Kick: KICK_CLIENT_ID og KICK_CLIENT_SECRET.
- YouTube: YOUTUBE_API_KEY med YouTube Data API aktiveret. Nye streams findes hvert 30. minut (100 kvoteenheder per søgning; ca. 4.800 per kanal/døgn). Aktive streams kontrolleres hvert 2. minut. Flere kanaler kan kræve større kvote eller en senere WebSub-integration.
- TikTok: manuel start/slut, ingen automatisk offentlig live-integration er tilsluttet. Brug /stream live og /stream slut. Der slettes derfor først ved /stream slut eller når rollen fjernes.

/stream live og /stream slut er tilgængelige for alle fire platforme. Den aktuelle rolle kontrolleres på serveren. Twitch og Kick kontrolleres hvert 2. minut. Ved bekræftet slut slettes den gemte Discord-besked, hvis oprydning er aktiveret. HTTP-fejl behandles som ukendt status, så beskeder ikke slettes på grund af en platformfejl. Besked-ID og kanal gemmes i databasen og overlever genstart. Manglende slettilladelser bevarer posten og forsøges igen. Tidligere flade Twitch-/YouTube-lister er bevaret i indstillingerne, men skal knyttes til Discord-personer i det nye panel før de bruger den nye arbejdsgang.

## Verifikation

npm test kontrollerer blandt andet rolle- og kodekontrol, låsning, sagsisolering, Discord-svarknap, streamoprydning, ping-afgrænsning og SQL-kompatibilitet. Lokal Edge-kontrol afprøver kodeformular, træk og slip, arkivering, streamfaner, design og logfaner. Eksterne livestreams og reel lyd er afhængige af brugerens platformkonti og er ikke dækket af disse lokale prøver.

Borgerpanelet har kategoriknapper og prioriteringsknapper. Kategori → prioritet → beskrivelse/billede åbner formularen uden et ekstra Fortsæt-trin. Alle kategorier og egen tekst kan stadig vælges. Prioritet kan også vælges først. Lav er grøn, kritisk rød; mellem bruger en orange markør, da Discord ikke har en orange knapstil. Prioritetsfarven vises separat fra sagens behandlingsstatus i udviklerpanelet. Eksisterende panelbeskeder i registrerede fejlmeldingskanaler forsøges opdateret ved genstart.
