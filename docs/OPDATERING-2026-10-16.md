# Opdatering 16. oktober 2026

- Separate røde tællere for ulæste udviklertickets og ønsker. En sag markeres læst for den enkelte udvikler, når sagen åbnes. Markeringerne gemmes i databasen.
- Highlights vises i Discords galleri med originale billed- og GIF-filer. Discord bestemmer visningsstørrelsen.
- Borgere med den valgte rolle kan indsende 1–5 billeder fra knappen under highlights. Hver fil må højst være 6 MB. Der er et minuts pause mellem indsendelser. Sletning er kun i administrationspanelet.
- Låsning og pause afviser også en formular, der allerede var åbnet. Nye indsendelser beskyttes mod overskrivning af en gammel administrationsvisning.
- Fødselsdagsoversigten viser aktuelt Discord-navn, profilbillede, ID og den registrerede dato.
- Design Discord-panelet findes ved udviklerindgangen, tickets, ansøgninger, velkomst, verificering, fødselsdage, præmielodtrækninger, streambeskeder og highlights. Billeder og GIF sendes originale; bannertilstand bygger et statisk billede med egne farver, baggrund og tekst. Gem, og send panelet igen for at anvende det på en ny besked. Highlights opdateres i den eksisterende besked.
- Staff-panelets brugerflade ligger i den fælles kategori uden ekstra loginformular. Databaseskiftet afventer forbindelsen til det fælles Supabase-projekt. Se STAFF-INTEGRATION.md.
- Kortvarig deling af indstillingsopslag og færre opstartskald reducerer gentagne opslag. Knapper giver øjeblikkelig ventefeedback. Discord-roller kontrolleres fortsat på serveren. Hostingplanen er ikke ændret.
