/* ─── TripOS · Supabase config ───────────────────────────────
 * Paste your two values from Supabase → Project Settings → API.
 *
 * SAFE TO COMMIT: the anon key is a PUBLISHABLE key, meant for the
 * browser and protected by Row Level Security. It is NOT a secret —
 * and it is NOT the PLACES_API_KEY (that stays in GAS Script
 * Properties and never appears in this repo).
 *
 * Until both values are filled in, the site runs in "no-auth" mode:
 * every button still works, it just doesn't save anything yet.
 * ──────────────────────────────────────────────────────────── */
window.TRIPOS_SUPABASE = {
  url: 'https://hfyxtqqkljggcgzwyxxl.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmeXh0cXFrbGpnZ2Nnend5eHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NzMyNDgsImV4cCI6MjA5OTE0OTI0OH0.qyHmkDIGG0mL6DOfgUDn7z42dwDH4O7Nmt3IXQMB87I'
};
