# Tokken

Het kaartspel met knikkers uit Dilbeek, als website om online met vrienden te spelen.

## Hoe het in elkaar zit

- **Website**: Next.js (React + TypeScript). Pagina's in `app/`, onderdelen in `components/`.
- **Spelregels**: `lib/engine.ts`, zonder imports. De website én de server gebruiken exact hetzelfde bestand.
- **Server**: Supabase Edge Function `supabase/functions/game/` (project `tokken`, Frankfurt).
  Elke zet gaat via de server, die controleert of de zet mag. Niemand kan andermans kaarten zien:
  de handen staan in de tabel `game_secrets`, die enkel de server kan lezen.
- **Live**: de tabel `games` (publieke spelstand) wordt via Supabase Realtime naar iedereen gestuurd.
- **Database**: `supabase/migrations/0001_init.sql`.

## Lokaal draaien

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # spelregel-tests + 100 computerspellen
```

Oefenen tegen de computer (`/oefenen`) werkt volledig in de browser, zonder server.

## Spelregels aanpassen

1. Pas `lib/engine.ts` aan.
2. `npm test`
3. `npm run sync-engine` (kopieert de engine naar de server-functie)
4. Server opnieuw uitrollen: `npx supabase functions deploy game --project-ref qxafpwxnwcumljwzweyt --no-verify-jwt`

## Online zetten (Vercel)

```bash
npx vercel --prod
```

De Supabase-adressen staan als standaard in `lib/supabase.ts` (publieke sleutels, geen geheimen). Een ander project gebruiken kan via `.env.local` (zie `.env.example`).

## Google-login aanzetten

1. Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* (Web).
   Authorized redirect URI: `https://qxafpwxnwcumljwzweyt.supabase.co/auth/v1/callback`
2. Supabase dashboard → Authentication → Sign In / Providers → Google: plak Client ID en Secret.
3. Supabase → Authentication → URL Configuration: zet *Site URL* op je Vercel-adres en voeg het toe bij *Redirect URLs*.
4. Daarna verplichten dat je aangemeld bent om een kamer te maken:
   ```sql
   update app_config set value = 'true' where key = 'require_login_to_create';
   ```
   Meedoen met een code blijft zonder login.

## Update: bediening, chat en scoreboard

- Een kaart aanklikken is een lokale selectie. Klik opnieuw om te annuleren of kies een andere kaart; pas bij het verplaatsen van een knikker wordt de zet verstuurd.
- Acties geven de nieuwe publieke stand en alleen de eigen hand onmiddellijk terug. Versiecontrole voorkomt dubbele zetten; Realtime blijft de andere spelers bijwerken.
- Computerzetten in de oefenmodus worden in een Web Worker berekend.
- Het bord heeft zoom (100–170%), meer ruimte rond de baan en duidelijkere cijfers. De actieve beurt staat op het bord; chat en verloop scrollen binnen hun eigen venster van oud naar nieuw. Wie terugleest wordt niet automatisch naar beneden getrokken.
- Het optionele geluid is een korte, zachte synthese van een knikker op hout. Standaard staat het uit.
- Alleen schuiven binnen het huisje (17–20) verplicht niet tot spelen; een zet vanaf het parcours naar het huisje telt wel. Alles afgooien levert alleen een stokje op wanneer je deze hele ronde nog geen kaart hebt gespeeld.
- Het scoreboard telt uitgespeelde online spellen per weergavenaam, zonder computers. Gelijke namen worden samengenomen; voor een klassement per account is later een vaste spelersidentiteit nodig.

### Deze update online beschikbaar maken

1. Voer `supabase/migrations/0002_chat_scoreboard.sql` uit op de bestaande database (via de normale migratieworkflow of de Supabase SQL-editor).
2. `npm run sync-engine` en rol de `game` Edge Function opnieuw uit (commando hierboven).
3. Bouw en publiceer de website. De bestaande database en de Edge Function moeten samen met de nieuwe frontend worden bijgewerkt.

De database bewaart resultaten ook bij een revanche. Reeds uitgespeelde spellen die nog als `finished` in `games` staan worden bij de migratie overgenomen; oudere overschreven partijen kunnen niet worden teruggehaald. Chatberichten zijn net als de huidige spelstanden publiek leesbaar en uitsluitend via de server te schrijven.

### Latere uitbreiding naar zes spelers

De huidige variant blijft vier spelers in twee ploegen. Zes spelers vraagt een aparte bord- en regelvariant: geometrie, kleuren, teams, beurtvolgorde, kaarten delen, lobby, servervalidatie en tests bevatten nu aannames voor vier spelers. Voeg dat als één samenhangende variant toe, nadat de ploegindeling en het aantal vakjes vastliggen.
