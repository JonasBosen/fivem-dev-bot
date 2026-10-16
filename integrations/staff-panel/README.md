# Kopi af det oprindelige staff-panel

Grundlaget fra JonasBosen/staff-panel er gemt her som serverkode, API, databaseforbindelse og afhængigheder. Kopien indeholder ingen aktive tokens, adgangskoder eller .env-fil. Det oprindelige staff-panel er bevaret.

Den brugerflade, som vises i det nye panels Staff-panel-kategori, ligger i src/web/staff-public. Den åbnes gennem hovedpanelets login og har ingen separat Discord-loginformular. Brugerfladen er allerede integreret i hovedprojektet, mens eksisterende data og handlinger indtil videre leveres af den oprindelige staff-tjeneste gennem den beskyttede forbindelse i src/web/staff-proxy.js.

Filerne i denne mappe startes ikke automatisk. De er grundlaget for at flytte den resterende serverdel ind i hovedprojektet, når vi bygger videre. Der behøves ingen nye nøgler for at gemme eller arbejde videre med denne kopi.

Profiler, advarsler, bans, noter, staff-historik, team og team-billeder er desuden kopieret som et kontrolleret øjebliksbillede til staff_panel-skemaet i det fælles Supabase-projekt. Der kan være nyere ændringer i den aktive originaldatabase. Databaseforbindelse og endelig synkronisering håndteres separat senere. Ingen af originaldatabaserne er slettet eller nulstillet.

Kilde: staff-panel commit 155b33a. Se docs/STAFF-INTEGRATION.md i hovedprojektet for den nuværende forbindelse.
