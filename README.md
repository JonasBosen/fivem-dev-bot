# AllBot – ét dashboard, én Discord-bot

Se [UNIFIED.md](UNIFIED.md) for moduler, fælles Supabase-projekt, opsætning, migration og kendte begrænsninger.

Start: `npm ci` efterfulgt af `npm start`. Test: `npm test`.

### Changelog i udviklerpanelet

Fanen **Changelog** og knappen **Udgiv som changelog** på en sag opretter fælles udkast. Korte stikord kan omskrives til en dansk offentlig besked med emojis. Udvikleren gennemser og redigerer teksten, vælger en tekst-/announcementkanal og trykker **Udgiv på Discord**. Der sendes almindelig tekst, højst 2000 tegn, samt de AI-billeder udvikleren har valgt. Der bruges ikke embeds eller automatisk ping. Sager lukkes eller offentliggøres aldrig automatisk.

Sæt **OPENAI_API_KEY** i Render-serviceindstillingerne. Nøglen må ikke indgå i Git eller i frontend. **OPENAI_CHANGELOG_MODEL** er valgfri og har standarden **gpt-6-luna**. AI-kald bruger Responses API med store:false og højst 1500 outputtokens. Kun den valgte titel, type, servernavn og de indtastede stikord indgår; noter, borgersamtaler og bruger-ID'er hentes ikke automatisk. Uden nøgle virker manuel redigering og afsendelse stadig, og AI-knappen viser en vedvarende fejl med hjælp til konfiguration i stedet for blot at være grå og utilgængelig. **Test AI-forbindelsen** kontrollerer adgangen til tekst- og billedmodeller uden at generere eller udgive noget.

Udkast, revisioner og udgivelsesstatus ligger i den eksisterende fælles database. Ældre revisioner afvises. Efter en uafklaret Discord-fejl blokeres gensendelse; **Kontrollér afsendelse** kan genfinde beskeden via nonce. Udgivelser og AI-genereringer registreres i udviklerloggen. Adgangen kræver både personlig login, aktuel udviklerrolle og den eksisterende udviklerkode.

Valgfrie AI-billeder oprettes med **Lav et AI-billede** og gemmes i det fælles, private mediebibliotek med samme udvikleradgang som udkastet. Der kan være højst fire billeder pr. udkast og seks AI-billeder pr. udvikler pr. time. **OPENAI_CHANGELOG_IMAGE_MODEL** har standarden **gpt-image-2.5-flare**; JPEG i landskabsformat og lav kvalitet begrænser ventetid og filstørrelse. Billedgenerering kan tage op til 90 sekunder og bruger separat API-forbrug. Vælg eller fravælg billederne før udgivelse. Discord-kanalen skal også tillade vedhæftninger.
