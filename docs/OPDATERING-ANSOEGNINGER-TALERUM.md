# Ansøgninger, talerum og staff-kopi

## Ansøgninger
- Op til 200 formularer, med op til 100 spørgsmål pr. formular. Tekst, kort tekst, tal, ét svarvalg og flere svarvalg. Svarvalidering og obligatoriske/valgfrie spørgsmål.
- Formular i Discord med fem spørgsmål pr. side, private Discord-beskeder eller en webformular på /apply/SERVER-ID/FORMULAR-ID. Discord-login bekræfter ansøgeren; borgere behøver ikke staff-adgang eller panelets personlige kode for at ansøge.
- Hjemmesidens kladde gemmes efter indtastning. Discord gemmer efter hver indsendt side. Svar og formularens spørgsmål gemmes sammen som et øjebliksbillede, så senere formularændringer ikke omfortolker gamle svar.
- Individuelle kanaler for afventende, accepterede og afviste indsendelser. Konfigurerede roller til krav, udelukkelse, behandling, ping, tildeling og fjernelse. Ventetid, tidsfrist, kontoalder, stafftråd og automatisk afvisning ved udmeldelse.
- Brugerbeskeder på dansk, knaptekst, farve, emoji, billeder/GIF og bannerdesigner. Op til 25 formular-knapper i én Discord-besked.
- Søgning, status- og formularfilter, rækkefølge, sideinddeling, CSV og statistik baseret på seneste 200 indsendelser. Resten slettes ikke; denne visning/eksport henter op til 200.
- Leveringsfejl bevarer indsendelsen og vises med mulighed for nyt leveringsforsøg. Discord-beskeden viser et uddrag; alle svar vises i dashboardet.
- Valgfri Notion-kopi kræver NOTION_TOKEN på Render, datakilde-ID i formularen samt adgang til datakilden for integrationen. Den er slået fra som standard. Fejl bevares på indsendelsen; funktionen er testet med simuleret API, ikke brugerens Notion-konto.

## Midlertidige talerum
Vælg en eksisterende talekanal som skaberkanal, vælg mål-kategori, og aktivér modulet. Botten skal kunne administrere kanaler, flytte medlemmer, se kanaler og forbinde. Der bruges samme hovedbot og ingen ny token.

Ejerpanelet sendes til en valgt tekstkanal. Funktioner kan slås til/fra og omarrangeres: navn, deltagerantal, lås/åbn, skjul/vis, tillad/bloker, fjern deltager, overtag fraværende ejers rum, overdrag, region, slet tomt rum, venterum og kanalchat. Tema/baggrund kan tilpasses i Discord-designeren.

Kun registrerede midlertidige rum ryddes op. Rummet slettes, når sidste deltager forlader det; oprydning køres også efter genstart og periodisk. Et tilhørende venterum med deltagere holder rummet åbent. Skaberkanaler og øvrige eksisterende kanaler slettes ikke.

## Staff og adgang
Den oprindelige staff-grænseflade er kopieret til hovedprojektet: hjem, spillere, advarsler, bans, noter, staff-ansatte, staff-log, staff-online, team, backup og indstillinger. Den nye kopis ekstra staff-kodelåse er fjernet; serveren kontrollerer stadig det signerede hovedlogin og staff-roller. Det oprindelige selvstændige staff-panel bevarer sit login og sine låse.

Hovedsidens personlige kode er uændret. Udviklerpanelets separate kode 2221 er uændret. Kopien bruger foreløbig den eksisterende staff-API og dens database; en komplet overgang af staff-driften til fælles database er fortsat ikke aktiveret, fordi databaseforbindelsen skal tilføjes senere. Ingen gamle staff-data er slettet.

Nye ansøgningskladder, snapshots og midlertidige rums ejerskab gemmes i det eksisterende allbot.settings i projekt kdxxtdiydepuiecpdpha. Eksisterende ansøgninger bevares i allbot.applications. Ingen nye offentlige tabeller eller klientnøgler er tilføjet.
