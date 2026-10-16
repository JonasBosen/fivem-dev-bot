# Staff-panelet på den fælles side

Staff-panel ligger i venstremenuen. Brugerfladen er kopieret fra JonasBosen/staff-panel og serveres fra dette projekt. Den indbyggede version har ingen separat Discord-loginformular. Den eksisterende staff-tjeneste leverer foreløbig data og handlinger gennem en beskyttet forbindelse. Den gamle hjemmeside kan fortsat bruges.

Adgang kræver hovedpanelets Discord-login, personlig kode og administratoradgang. Staff-tjenesten kontrollerer også den eksisterende staff-rolle. Udviklerrollen alene giver ikke automatisk staff-adgang. Udviklerpanelets egen kode og rollekrav er uændrede.

Forbindelsen underskriver bruger, server, HTTP-metode, adresse og indhold med en kortlivet Ed25519-signatur. Hovedpanelets sessionscookie sendes ikke videre. Kun staff-panelets egne cookies bruges til dets eksisterende redigeringslåse.

## Fælles database: klargjort, ikke aktiveret

Aktiv staff-database: xqjkjogfcpvimpqopfes. Fælles projekt: kdxxtdiydepuiecpdpha. Et backendbeskyttet staff_panel-skema i det fælles projekt indeholder en kontrolleret kopi af de 12 tabeller. Profiler, advarsler, bans, historik, team og team-billeder er bevaret. Kontrollen var identisk ved kopieringen. Nye ændringer i den aktive database kræver en sidste synkronisering før skiftet.

På staff-panelets Render-tjeneste er STAFF_DATABASE_URL klargjort. Indsæt det fælles projekts PostgreSQL Session pooler-forbindelse her. Den indeholder databaseadgangskoden og må ikke deles i chatten eller Git.

Behold STAFF_USE_SHARED_DATABASE=false, indtil den sidste synkronisering og kontrol er gennemført. Falsk bruger den hidtidige DATABASE_URL. Sand bruger STAFF_DATABASE_URL og staff_panel-skemaet. Manglende forbindelse medfører en fejl frem for en tom erstatningsdatabase.

Før aktivering: stop midlertidigt skrivninger i den gamle database, bevar den tidligere kontrolkopi som et separat snapshot, synkronisér samtlige tabeller inklusive billeder, kontrollér antal og kontrolsummer, og sæt alle sekvenser til næste ledige ID. Aktiver derefter fælles forbindelse og kontroller status, eksisterende profiler samt redigering. Originaldatabasen skal bevares til tilbagerulning. Den må ikke slettes som led i skiftet.
