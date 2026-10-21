# Testpanelet

Et selvstændigt forsøgsområde efter **Min adgang**. Kun panel-ejeren kan administrere det. Deltagelse i Discord kræver valgte testerroller; administratorer og serverejeren kan også deltage. Alle moduler og livehandlinger er deaktiveret fra start.

## Moduler

| Forsøg | Implementeret |
| --- | --- |
| Afstemningsstudie | Native Discord-afstemninger, 2–10 svar, flere valg, 1–768 timers løbetid, afslutning fra loggen |
| Eventværksted | Native eksterne Discord-events med navn, beskrivelse, lokation og tidspunkt; annullering før start |
| Forumværksted | Nye forumopslag, valgte tags, langsom tilstand og arkivperiode; manuel arkivering |
| Starboard | Unikke stjernereaktioner, tærskel, aldersgrænse, fravalg af bots og egen stjerne; kun links, ingen kopiering af privat indhold |
| Selvvalgte testroller | Op til 20 rolleknapper, valgfri eksklusiv gruppe, rollehiearki og kontrol af farlige rettigheder |
| Ros / reputation | Vedvarende ros, begrundelse, cooldown pr. brugerpar og separat rangliste |
| Planlagte beskeder | Vedvarende enkeltstående job, annullering, tilstande for afsendelse og uafklarede fejl |
| Holdlaboratorium | Tilfældig fordeling af testere, balanceret antal deltagere pr. hold, egne holdnavne |
| Talekanal-kvalitet | Bitrate inden for serverens loft, brugergrænse og gendannelse hvis ingen efterfølgende ændringer er sket |

Fælles: søgning, forhåndsvisning før liveforsøg, særskilt log og JSON-eksport, testkanaler, modulaktivering, grænse for handlinger pr. time og cooldown. Idempotente handlings-ID'er forhindrer gentagelse af samme forsøg ved genindsendelse. Discord-beskeder bruger ikke automatiske pings.

## Sådan afprøves det

1. Ejeren åbner Testpanelet og vælger testkanaler og testerroller.
2. Gem først kanalerne. Vælg derefter modulernes målkanaler, kilder og testroller, og gem igen.
3. Aktivér kun de moduler, der skal afprøves. Konfigurationen er separat fra eksisterende moduler.
4. Åbn et forsøg, udfyld felterne og vælg **Forhåndsvis forsøg**.
5. Gennemse forhåndsvisningen, markér livefeltet og kør forsøget.
6. Afslut fra loggen, eller annullér planlagte beskeder i jobkøen.

Discord-events er synlige på serverens almindelige eventliste og er navngivet med 🧪. Afslutning af en rollemenu fjerner dens knapper; allerede tildelte testroller bevares. Starboard-opslag trækkes ikke tilbage, hvis stjerner bagefter fjernes. Der tælles op til 100 reaktioner. Påmindelser kontrolleres cirka hvert 15. sekund; de kan blive forsinkede ved nedetid. En afsendelse, der afbrydes efter start, bliver ikke blindt genforsøgt. Kontroller `sending` eller `check_required` i Discord før et nyt job oprettes.

En almindelig Discord-bot kan ikke skrue op eller ned for den personlige lydstyrke, som én bruger hører en anden med. Det skal gøres lokalt i Discord. Testpanelets lydforsøg ændrer kun den valgte kanals bitrate og brugergrænse.

## Teknik og verifikation

Data gemmes under `testlab:<guildId>` i den eksisterende private settings-tabel via de allerede godkendte RPC-forespørgsler. Der kræves ingen ny tabel, Supabase-migration, botkonto eller betalt integration. API-ruterne kræver både almindelig panel-login og ejeradgang. Roller med administrative rettigheder afvises, også når en eksisterende menu bruges.

`test/testlab.test.js` dækker modulernes standardlås, serveradskillelse, revisionskontrol, native afstemningspayload, samme handlings-ID, kanalafgrænsning, afsenderrettigheder, vedvarende job, fejltilstand, holdfordeling og gendannelse. Brugerfladen kontrolleres i en lokal prøve med fiktive kanaler; denne prøve sender ikke til Discord. De rigtige Discord-moduler kræver efterfølgende liveafprøvning i valgte testkanaler. Lokale tests er ikke en garanti for alle serverens Discord-rettigheder.

## Research, 21. oktober 2026

- [Carl-bot](https://carl.gg/about): starboard og selvvalgte roller. Tickets, moderation og velkomst fravalgt som eksisterende funktioner.
- [sesh](https://sesh.fyi/manual/): afstemninger og eventplanlægning.
- [YAGPDB](https://yagpdb.xyz/): modulære indstillinger og rollebegrænsning; generelle custom commands og moderation findes allerede.
- [Statbot](https://docs.statbot.net/): statistik og kanaloptællere undersøgt; ikke medtaget som dublet af eksisterende oversigter.
- [Discords Guild API](https://discord.com/developers/docs/resources/guild), [scheduled events](https://discord.com/developers/docs/resources/guild-scheduled-event) og den installerede discord.js-kildes poll-konvertering er brugt til implementeringen.

Dette er et konkret testlaboratorium med ni moduler, ikke en påstand om fuld funktionslighed med alle bots eller undersøgelse af hver bot på nettet.
