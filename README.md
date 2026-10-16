# AllBot – ét dashboard, én Discord-bot

Se [UNIFIED.md](UNIFIED.md) for moduler, fælles Supabase-projekt, opsætning, migration og kendte begrænsninger.

Start: `npm ci` efterfulgt af `npm start`. Test: `npm test`.

### Changelog i udviklerpanelet

Fanen **Changelog** og knappen **Udgiv som changelog** på en sag opretter fælles udkast. Korte stikord kan omskrives til en dansk offentlig besked med emojis. Udvikleren gennemser og redigerer teksten, vælger en tekst-/announcementkanal og trykker **Send til Discord**. Der sendes almindelig tekst, højst 2000 tegn, uden embeds, filer eller automatisk ping. Sager lukkes eller offentliggøres aldrig automatisk.

Sæt **OPENAI_API_KEY** i Render-serviceindstillingerne. Nøglen må ikke indgå i Git eller i frontend. **OPENAI_CHANGELOG_MODEL** er valgfri og har standarden **gpt-6-luna**. AI-kald bruger Responses API med store:false og højst 1500 outputtokens. Kun den valgte titel, type, servernavn og de indtastede stikord indgår; noter, borgersamtaler og bruger-ID'er hentes ikke automatisk. Uden nøgle virker manuel redigering og afsendelse stadig, mens AI-knappen viser, at konfiguration mangler.

Udkast, revisioner og udgivelsesstatus ligger i den eksisterende fælles database. Ældre revisioner afvises. Efter en uafklaret Discord-fejl blokeres gensendelse; **Kontrollér afsendelse** kan genfinde beskeden via nonce. Udgivelser og AI-genereringer registreres i udviklerloggen. Adgangen kræver både personlig login, aktuel udviklerrolle og den eksisterende udviklerkode.
