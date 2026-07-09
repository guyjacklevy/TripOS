# TripOS — landing pages

Static marketing site for [TripOS](https://script.google.com/macros/s/AKfycbyexYOb-iVfy7En78sBXDcmRUH5LJJwb_BDRjJ2gHjbxuzY2u8BjzhbO9nBmA_KCaMr/exec), the budget + places app for slowmads. One folder per destination, no build step.

## Structure

```
index.html          root hub — destination picker
bali/index.html     tripos.app/bali landing page
shared/tripos.css   design system (cosmic dark theme, matches the app)
shared/tripos.js    scroll-reveal animation
vercel.json         clean URLs config
```

## Adding a destination

Copy `bali/` to a new folder (e.g. `chiangmai/`), rewrite the destination-specific copy (hero, pain block, "Built for …" list, area chips), and add a card for it on the root `index.html`.

## Deploying

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — framework preset: **Other**, no build command, output dir: root.
3. Add the `tripos.app` domain in Vercel → Project → Settings → Domains and point DNS at Vercel.

Every push to `main` auto-deploys.

## Local preview

```
python3 -m http.server 8080
```

Then open http://localhost:8080/bali/.
