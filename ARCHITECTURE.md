# TripOS — Architecture (updated 2026-07-10)

> The living source of truth for the *new* TripOS web platform. If a brief
> contradicts this file, this file wins. The original master-prompt doc
> predates this architecture and is stale on several points called out below.

## The two products (don't confuse them)

| | v19 GAS app (legacy, live) | Web platform (this repo, live) |
|---|---|---|
| What | Single-user budget+places app | Marketing site → becoming the real multi-user product |
| Stack | Google Apps Script `Code.gs` + Google Sheets | Static HTML/CSS/vanilla JS + Supabase |
| URL | `script.google.com/macros/s/AKfycbye…/exec` | https://trip-os-umber.vercel.app |
| Auth | None (owner's data, visible to all) | Supabase magic-link (passwordless email) |
| Status | Untouched since v19 | All active development |

**⚠️ Supersedes the master prompt:** the old "zero-auth by design" rule is
**reversed** — the product now has login and a per-user database. The
"everything in one Code.gs / always output the full file" rule applies **only**
to the legacy GAS app, not to this repo.

## Stack & deploy flow

- **No framework, no build step, no npm.** Plain HTML + CSS + ES-module vanilla JS.
  Supabase JS loads from the `esm.sh` CDN (CDN is fine here; the no-CDN rule was GAS-only).
- **Hosting:** Vercel project `trip-os`, `cleanUrls: true` (so `/bali/places` ≡ `bali/places.html`;
  note extensionless paths 404 on plain local servers — test locally with the `.html`).
- **Deploy = `git push`.** GitHub `guyjacklevy/TripOS` `main` → Vercel auto-deploys in ~30s.
- **Database/auth:** Supabase project `tripos` (id `hfyxtqqkljggcgzwyxxl`, eu-central-1, free tier).

## Data model (Supabase Postgres, all RLS-enabled)

Source of truth: [`supabase/schema.sql`](supabase/schema.sql) (+ later migrations applied via MCP).

**Per-user tables** (`auth.uid() = user_id` policies; trigger auto-creates a
profile on signup):
- `profiles` — one row per user
- `trips` — the check-in wizard's output (vibe / duration_days / budget_tier);
  **unique `(user_id, destination)`**, written by client `upsert` — one plan per
  user per destination, edits overwrite
- `places`, `expenses`, `checkins` — schema ready, not yet written to by any UI

**Shared content table:**
- `curated_places` — 52 verified places across Uluwatu (13) / Canggu (11) /
  Ubud (11) / Seminyak (9) / Islands (8). Public SELECT only; no client writes
  (seeded via Supabase MCP). Rich fields per place: `personas[]`, `why`,
  `best_time[]`, `best_days[]`, `timing_note`, `season_note`, `price_level` 1–4,
  `price_note` (IDR), `tip`, `book_ahead`, `lat/lng`, `maps_query`, `tags[]`,
  `verified`. This structure deliberately powers future personalization
  ("for you now" by time/day) and proximity features — don't flatten it.

## Frontend map

```
index.html               root — airport departures-board destination picker
bali/index.html          flight-journey landing (6 scroll stages, flight progress bar)
                         + check-in wizard ("mission briefing") → saves trip on login
bali/places.html         spatial places browser ("Google Earth night mode")
shared/tripos.css        entire design system (see below)
shared/tripos.js         scroll reveals, flight bar, count-up stats
shared/auth.js           magic-link auth, login modal, savePlan() upsert
shared/places.js         curated_places fetch + POI render + filters + altitude
shared/supabase-config.js  Supabase URL + anon key (publishable — safe to commit;
                           NOT the GAS PLACES_API_KEY, which never enters this repo)
```

## Design system (cosmic + spatial)

- Tokens in `:root` of `tripos.css`: `--bg #0a0a14`, `--teal #3dffd0`,
  `--purple #a78bfa`, `--am #ffb454`, `--cy #4cc9f0`, `--rd #ff6b6b`, glass cards,
  planet-orb category icons, `--mono` for "instrument" text.
- **Spatial layer (places page):** per-area terrain colors (`--area-*`),
  per-category accents (`--cat-*`, matched to planet orbs), altitude header with
  descent animation, ✦ terrain area cards, map-legend filters, POI cards with
  accent spine + staggered drop-in, `body[data-area]` backdrop tint, scan-line
  loading state. Per-element colors flow through inline `--ac`/`--cc` custom
  props + `color-mix()` — extend that pattern, don't hardcode.
- Sanur & Denpasar are pre-wired (colors, altitudes, meta) but render no cards
  until places are seeded for them.
- `prefers-reduced-motion` must stay respected by any new animation.
- Progressive enhancement rules: content never hidden without `html.js`;
  auth module no-ops gracefully if config is missing.

## Key conventions

- **Credibility is the #1 product value.** Curated content must be specific
  (who / why / when / price / tip) and grounded in real sources; `verified` flags
  honesty. Never pad the dataset with generic AI blurbs.
- **Plan & Places is the main product surface; budget is a secondary "pulse."**
- Client writes to user tables go through upsert-with-conflict-target patterns
  (see `savePlan()`); always log Supabase errors to console.
- Git pushes work non-interactively on this machine (PAT in macOS Keychain).

## Current state & open work

Done and live: flight-journey landing, check-in wizard → trip saved per user,
magic-link auth end-to-end, 52-place curated dataset, spatial places browser.

Open, in priority order:
1. **Per-user app**: replace the legacy GAS app as the post-login destination —
   Places/Plan home screen reading `curated_places` + the user's `trips`,
   budget pulse secondary. (The "Open TripOS" CTAs still point at the legacy GAS URL.)
2. Wizard → places connection: surface "your matching picks" from the saved trip.
3. Real-time "for you now" (best_time/best_days + geolocation vs lat/lng).
4. Dataset: seed Sanur + Denpasar (activates their terrain cards), add gyms,
   verify prices against live sources.
5. Confirm the custom domain (pointed and working; name not recorded here).
