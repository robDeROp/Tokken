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
