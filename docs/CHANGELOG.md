# Changelog — what shipped, in plain language

*Newest first. Every ship adds an entry here; test steps live in the chat
where the ship was reported. "Round" numbers match the decision board.*

## 27 Nov 2026 — Round 19: the same company everywhere
The rest of the testers' list, with minimal mods (the trip world keeps
its cosmic look — it now speaks the same language). The classic sign-in
gate says "Your places — and the trip tools around them" instead of
"Bali, decoded — personally", and carries a quiet "‹ back to your
shelf" escape to daylight. On the public Bali browser: un-saving a
place now says so ("Removed — off your list" — it was silent, reading
as a dead tap), the floating save bar no longer wraps at phone width
("⚑ N saved"), and a brief older than 60 days no longer greets a
visitor with "Matched to your brief" (the page falls back to the honest
"matching switches on after your brief" line; a fresh brief still
matches). The landing's category demo now carries the real collection's
real numbers: ALL 50 with FOOD 21 · NIGHTLIFE 16 · CAFE 3 · EXPLORE 3 ·
SURF 3 · BEACH 2 · GYM 1 · DAY CLUB 1 — they finally add up, with real
tap-rows for the two categories that were missing — and the WhatsApp
demo says "✓ been to 49 of 50". The Bali page's share-preview title
matches its own daylight promise.

## 27 Nov 2026 — Round 18: the daylight threshold
Both testers' biggest coherence break — every "Sign in" door teleported
the anonymous keeper into the old cosmic world — is closed. Sign-in now
happens inside the daylight shelf, as a bottom sheet like save and
gift: "Keep your places forever" with Continue-with-Google and a
6-digit email code (same auth contract as the classic screen; the
email code signs you in without ever leaving the page). On success the
shelf re-boots signed and everything kept in this browser comes along.
The anonymous passport is now fully daylight: only the sign-in door
shows (the three classic-world trip doors appear once you're signed
in). The landing's "Log in" opens the shelf with the sheet on top
(/app/#signin) — a signed visitor is simply home. The classic sign-in
screen still exists at /app/trip for the trip world itself; no
anonymous path leads through it any more.

## 26 Nov 2026 — Round 17.10: the anonymous testers' round
Two anonymous evaluator agents walked the live product cold (one as a
receiver opening a friend's link, one as a stranger from a post),
tapped everything, and filed full reports. Their converging top
finding — "I kept 50 places and the app never lets me see them" — is
fixed: the anonymous shelf's week lane and Your-places card now open
the full in-browser list, grouped by area with the giver's name on
every gifted place. The YOU tab is native for everyone: anonymous
visitors get a daylight passport with a framed "Sign in — keep them
forever" door instead of a cold jump into the old cosmic wall. Gift
page: every place sheet has "⌖ Open in Maps"; a kept place's button
becomes a door to the shelf (never a dead status); "Keep all" ends
with "✓ Kept — open your shelf"; the photo story rests after one full
lap and crossfades faster (the caption can no longer sit on the
previous photo). Landing: the hero's link pill is now REAL (it opens
Maya's actual gift page, hero renamed to Maya — one real demo thread),
"Log in" leads to the sign-in door, the import CTA lands at the
import's home and says sign-in comes first, demo copy points at the
chips, chips press visibly. Plus: Escape closes sheets, the FAB no
longer covers the last card, minutes read "5MIN AGO", verified ticks
say VERIFIED, and the sign-in card names the link that comes with it.
Known debt the testers confirmed, left for the next rounds: the old
cosmic surfaces behind the doors (/app/trip, /bali/*) are a second
visual world, and anonymous global search stays honestly sign-in-gated.

## 26 Nov 2026 — Round 17.9: the hardening pass
A full fresh-eyes code review of the day's build (10 findings, 6
important), all fixed: the old app's composer now ignores category and
persona link rows (it could have copied the wrong token as the whole
collection's gift); the current card's echo pill follows the current
collection's own main link, not simply the newest one; /g pages no
longer list category links as duplicate collections (profile v7);
collection slugs are URL-safe (multi-word destinations and the
"More places" group open correctly); cancelling the phone's share
sheet no longer downloads the story card; "Nothing saved yet" hides
after the first save; the claim keeps buffer entries whose insert
failed instead of losing them; the links sheet learns a fresh mint
immediately; the "More places" card gifts the unscoped subject; and
the header pill got its proper ⌲ glyph back.

## 26 Nov 2026 — Round 17.8: per-category share links
"Food only" is now its own sendable link. trip_shares grew a category
column; the gift endpoint (shared-trip v17) ships only that
category's places (honoring multi-category tags), and the gift page
titles it honestly — "Guy saved you their Bali food." The composer
grew category chips ("everything · food · 12 · nightlife · 9…"), each
category holding its own standing link with its own note, scope, and
echo; the links sheet names them ("Your Bali — food only"). Existing
links are untouched (NULL = whole collection). Also fixed: a story
with no own photos no longer claims "camera roll."

## 26 Nov 2026 — Round 17.7: story cards (S3)
The composer grew "▣ Story card for one place": pick a place from the
collection (photo-first, been-first), and the app draws a 1080×1920
card in the daylight brand — the place's real photo (Google,
display-time, credited on the card; category art as the honest
floor), the mark as a chip ("✓ BEEN — A REAL VISIT"), the name, the
Prevoya wordmark, and the black "⚑ GET THE PLACE — LINK IN BIO" pill.
⤴ Share hands the PNG to the phone's share sheet (story-ready);
"copy a caption" writes a post caption carrying the collection's real
link. The influencer's content machine now feeds the loop from
inside the app — before the landing ever claims it.

## 26 Nov 2026 — Round 17.6: the trip door is contextual
The TRIP tab and the "On a trip now" surfaces appear only around an
actual trip — from a week before arrival ("Bali in 5 days — PREP ·
PACKING · THE ROUTE") through two days after it ends ("On your Bali
trip — TODAY · ROUTE · CONCIERGE", as a banner on the shelf). The
rest of the year the shelf carries no planner chrome at all; the trip
tools stay reachable through the passport's doors. The experts' line:
a standing door to a two-weeks-a-year tool is dead weight the other
fifty.

## 26 Nov 2026 — Round 17.5: YOU is the passport
The YOU tab opens natively on the shelf: the ring avatar, your first
name, places · collections (deliberately NO opened/kept scoreboard —
both expert reviews warned the echo must never read as a public
score), your one link with COPY, a door to your public page, and the
planner-era You surfaces (camera-roll import, trip tools, passport &
packing) as doors into /app/trip/. Sign out lives here. Signed users
get the native passport; anonymous taps still reach the sign-in gate.

## 26 Nov 2026 — Round 17.4: covers open their collections
Tapping a collection cover (or the current card — it grew an OPEN ›
cue) opens the collection in place, in daylight: cover strip, counts,
its own Gift door, and every place grouped by area with its mark
(✓ been · ♥ worth it · ⚑ saved), folded at five per area. Hash-routed
(#c/<destination>) so the phone's back button returns to the shelf,
and a save made while a collection is open keeps the view. The old
app's planner surfaces stay where 17.1 put them.

## 26 Nov 2026 — Round 17.3: saving lives on the shelf
The ⚑ Save a place button opens a sheet instead of leaving home: type
a name, our curated pool answers first (works signed-out — saves
buffer in the browser), and for the signed-in the live Google door
fetches anywhere on earth and mints the curated row, same ladder as
the save catcher. A save answers instantly ("On your list ✓") and the
shelf re-boots quietly, so the new place sits on top of This week —
home visibly changes with every save, which was the retention
expert's whole point.

## 26 Nov 2026 — Round 17.2: the composer lives on the shelf
The send loop no longer leaves home: "Gift it" and "Make a gift link"
open the composer as a shelf sheet — collection chips (when you have
more than one), keepers/everything with live counts, the personal
note, the photos consent, the exact message preview, copy = mint (or
update the standing link, same one-link-per-collection contract as
before), and revoke. Quiet categories still never count; share_created
still carries origin for generation-2 K. The anonymous shelf hides the
gift button (it can't mint links).

## 26 Nov 2026 — Round 17.1: the app opens on the shelf
The app's home is now the daylight shelf — the "expert cut" (D) two
blind product reviews prescribed and Guy approved. /app/ renders: the
This-week lane (your latest saves, so home changes with every save),
the ask row ("someone asked for recs?" → your links with live echo
counts and COPY), the current collection with its gift door and echo,
the older collections as photo covers, the + New collection tile, and
received gifts in givers' gold lanes. Anonymous visitors (receivers
who just kept a gift) see their buffered places and a "Keep them
safe" sign-in door; signing in claims the buffer with provenance
intact, same as before. The planner moved — intact, untouched — one
door away to /app/trip/ (TRIP and YOU tabs, the Save FAB, the
composer all lead there). New RLS policy: a user can read their own
public_profiles row (their /g link on the shelf header). The PWA
manifest went daylight and destination-neutral.

## 26 Nov 2026 — Round 16.1: short chapters, and every place is a door
Guy's phone notes on the daylight gift. (1) A chapter opens at 3 places
with "Show N more in <area>" — 50 places no longer mean one long
scroll to the next area. (2) Every place row is tappable (chevron cue):
a tap means interest, so it opens a bottom sheet with the place, the
sender's mark spelled out ("✓ Maya's been — a real visit, stamped"),
and three doors — save this one place (same anonymous buffer, with
via-token provenance and a share_save_tap n:1 echo), keep the whole
collection, or start your own. Also killed a 56px padding leak from
the old stylesheet that doubled the chapter gaps.

## 26 Nov 2026 — Round 16: the gift opens in daylight
The receiver's share page (kind=list) leaves the cosmic world and joins
the daylight landing — Guy's composite of the three /x/16 examples:
A's header ("<Name> saved you their Bali") with the sender's
handwritten note, C's tappable photo story (own photos lead, real
place photos top up, every photo credited), and B's "What's inside"
contents card with the list divided by area and a sticky "Keep all N —
free" bar. The old 4-beat ceremony retired — the story IS the opening.
Everything underneath is unchanged: the anonymous save buffer, the
tripos_via provenance seed, share_visit / share_save_tap, lazy Google
photo resolution, the revoked state (now daylight). The old passport
share (kind=trip) keeps its cosmic world on the same page. Legacy
mixed-destination links title honestly ("saved you 51 places").

## 25 Nov 2026 — Round 15.8b: the demo path is persona-clean end to end
Round 15.8 left one seam: tapping into Maya's Bali collection from
/g/maya opened the original share page, which still greeted as Guy.
Fixed without touching the real gift: trip_shares grew a nullable
profile_slug (→ public_profiles). A share tagged to a persona greets as
that profile's display_name (shared-trip v16) and /g/<slug> lists
exactly its tagged shares, falling back to the old user-wide listing
for untagged profiles like /g/guy (profile v6). Maya got her own
Bali-scoped token over the same real data — her gift page now says
"A GIFT FROM MAYA", 50 places (the Bali scope drops the one Tel Aviv
cafe), and the landing shelf row was corrected 51→50 to match. The
real link sent to real people is byte-for-byte unchanged, and the
premiere rail still counts only that real link.

## 25 Nov 2026 — Round 15.8: personas instead of Guy, the passport shelf, the busy rail
New standing rule from Guy: the landing never refers to Guy by name —
real data can back the demos, but the people shown are varied ICP
personas. Hero gift is now from Noa, §1's sender is Tom (friend Dana),
§2 is Ben asking Ella, the premiere plays Daniel's Bali. The social
passport becomes Maya — and /g/maya is a REAL page (new public_profiles
row; the profile function now titles collections by the profile's own
display name, v5). Her card grew into the shelf Guy described:
Bali (the real 51/49 collection, AUG '26) + Lisbon, Tokyo and Tel Aviv
rows with letter-tile covers and trip dates — collections accumulating
through time, arriving one by one. The premiere rail got his exact
choreography: a third counter on WENT · WORTH IT, and a scripted window
where almost every beat one station pops +1 (opens cluster, keeps
follow, worth-its trail, ~13s), then the numbers roll back to the live
base and loop. The base stays real (live counts of the real link, still
re-fetched every 45s); the caption no longer claims the pops are live.

## 25 Nov 2026 — Round 15.7: one spacing rhythm for the whole landing
Guy's phone note: margins between sections, text and components aren't
equivalent — the page reads unorganized. Audit found the cause: sections
had 58px above their content and 0px below it (content crashed into the
next band's border), and component gaps used ten one-off values (10–28px).
Fixed with one documented scale — 12 tight · 16 caption · 24 component ·
56 section, symmetric: `.sec` now pads 56px top AND bottom, every
component-level margin (demo, chips, carousel label, passport card,
ceremony line, gallery, return row, door, btn2) normalized to 24, intros
and captions keep 12/16, the honest band sits evenly between the shelf
section and the footer, and the footer hangs 56 under it. Measured in
the pane: every section boundary now reads identically. No content,
motion or behavior changed.

## 25 Nov 2026 — Round 15.6: one language, the carousel promoted, a restless rail
Guy's next pass: the ask-vignette chat gets the same sender avatars as
the comparison (one brand language in every conversation). The
real-saves carousel moves up under the before/after, replacing the
static Saltwood card — and gets the context it was missing: real price
levels from curated_places and a real "⟶ MAPS" link per card (built
from each place's Google place id); the MAPS chip pins to the card
bottom; clone-track links leave the tab order. The old bottom section
slims to the Bali-shelf door. The premiere rail now replays its
count-up every ~5.5 seconds — numbers roll station by station to the
real live values (which grew again to 15 opens on their own), so it's
in constant motion without inventing a single count. The camera roll
closes its loop: "⚑ YOUR BALI — THE COLLECTION" pill under the found
rows receives each approved place — thumbnail pop + a floating +1 at
every ✓ tap.

## 25 Nov 2026 — Round 15.5: Guy's section notes, same day
From his phone pass on 15.4: **§1** every chat bubble gets its sender's
avatar circle (G/D, like any group chat), the verdict titles are bigger,
and the copy is save-language — "WITH PREVOYA — SAVED", "omg you just
saved my trip 😭🙌". **Premiere rail**: "PLAYED THE FILM" removed (not
a KPI), one line always, and OPENED / KEPT are now genuinely LIVE —
the page fetches the real counts of the real link (profile function's
new public ?echo mode over the events table; already 14 opens, grown
from 13 on its own) and re-checks every 45s, so a real open ticks the
number up on screen with a pulse. No invented growth — the caption
says exactly what it is: "Live from the link above." **Camera roll**:
found rows now carry ✕ / ✓ approve buttons; the animation taps the ✓
and the row flips from "FOUND · STAMPED — YOURS?" to "⚑ SAVED TO YOUR
BALI" — the approval step made visible. **Bug**: prevoya.app/g/guy
showed "nothing here yet" — the page only read ?u= while the rewrite
carries the slug in the path; fixed to read the path too.

## 25 Nov 2026 — Round 15.4: the five picks shipped, and the passport page is real
Guy's picks off the six-note storyboard, all live:
**1A** — the before/after reads as a verdict: TODAY gray and washed with
✗, WITH PREVOYA in full color with ✓ and its photo card kept. **2A** —
the category chips are real buttons on one always-single scrolling
line: tap FOOD / NIGHTLIFE / CAFE and two real places from the real
gift swap in (every one honestly "✓ been"); the paragraph is gone.
**3A** — the social passport exists before the landing claims it:
**prevoya.app/g/guy** is a live public page (new `public_profiles`
table, new `profile` edge function that reuses shared-trip's own
payload so counts always match, vercel rewrite `/g/:slug`) showing
"Guy's places — 51 · ✓ been to 49"; the landing section is now "Your
social passport — One link. Everyone." and links to the real page.
**4A** — the premiere is the ceremony itself: dark stage, "Guy's Bali ·
a gift · 51 places", four real photos crossfading ~2s apart with their
names. **5A** — the camera-roll stage is the gallery: photo grid
(+53), ticks landing one by one, a scanning line with "READING THE GPS
IN YOUR PICKS…", then green-framed found rows that rotate between the
places. Steps play one by one; arrivals are clearer page-wide.

## 24 Nov 2026 — Phone repairs: the premiere gets room, the dock wakes up
From Guy's phone test: the fanned film frames were piling onto the
live-link line and the rail (the stage had a fixed height shorter than
its frames — now it sizes by ratio, 8/5), and the photo-dock loop looked
static on arrival (a 12s cycle that started at page load — it now starts
only when the section scrolls into view and runs a 7s cycle with shorter
holds, so the scatter→dock plays within a second of getting there).
His bigger note — motion everywhere, text almost nowhere — went to the
decision board as Round 15.3 with three live animated options, per the
storyboard-first methodology.

## 24 Nov 2026 — Round 15.2 S1: "You already keep highlights."
Guy picked **S1** off the social storyboard (where the ICP actually lives).
A slim centered band now sits between Collections and The Send: three
story-highlight circles in the IG gradient ring (BALI · FOOD · VIEWS),
the line "HIGHLIGHTS ARE SCREENSHOTS ↓ COLLECTIONS ARE PLACES", and the
collection card with the real numbers — "Your Bali — 51 places, ✓ been
to 49 · one link in bio". S2's creator pain is folded into the closing
line ("every 'where was this?' DM is answered by the same link, forever").
Band tints re-alternated so every section keeps its own ground (The Send
→ green, camera roll → paper, carousel → green). The third highlight is
VIEWS, not SUNSETS — no sunset photo exists in our real asset set and we
don't fake one. **S3** (story-ready 9:16 place cards) goes on the product
board as a Round 16+ feature, not a landing claim. LinkedIn stays a
distribution channel, not a page element.

## 24 Nov 2026 — Round 15.1: the sections, rebuilt to Guy's picks
From the storyboard: **1A** — the save section is now the chat comparison
("maps.app.goo.gl/… / which one is this??" against the Prevoya preview card
and "booked for January"), with the context card beneath. **2A** — the
collections section opens on the question the ICP actually gets ("where
should we EAT? any gyms?") answered one minute later with the real proof
line "✓ been to 49 of 51" and real category chips (FOOD 22 · NIGHTLIFE 16
· CAFE 3 · SURF 3 · BEACH 2 · GYM 1). **3A+B** — "It opens like a
premiere": fanned film frames of the ceremony, the live link line, and the
journey rail SENT → 13 OPENED → 3 PLAYED THE FILM → 4 KEPT → ✓ WENT ·
♥ WORTH IT with counting numbers; "counts, never who" removed. **4A+B** —
"Pick the photos. We find the places.": scattered photos continuously dock
onto their found-place rows (Bingin Beach, Ulu Fishmarket — FOUND ·
STAMPED), each photo landing with a green highlight frame on the place it
belongs to. Craft pass shipped with it: one section rhythm
(clamp 64–96px top), normalized inner margins, dead CSS removed.

## 24 Nov 2026 — The landing comes alive (Guy: "give it a life")
Below the fold, motion and flow: every section's elements now arrive as a
small choreography when it enters the screen (kicker, headline, demo pieces
in sequence; the save card's flag pops last) — with a catch-up guard so a
fast scroll can never leave a section blank. The echo's real counts (13 ·
3 · 4) count up when seen. Alternating soft green-paper bands separate the
sections. And the "Going to Bali" block became the testimonial moment Guy
asked for: "Real places, really saved" — a slow drifting carousel of ten
real saved places from the shelf, each with its real photo (display-time,
server-cached), its review-sourced line, and its area — Tanah Lot and
Warung Sunny beside La Shuk and Buti & Co. from Dizengoff, ⚑ KEPT. It
pauses on hover, off-screen, and on hidden tabs; reduced-motion gets a
still, scrollable row. The Bali shelf CTA now closes that section.

## 24 Nov 2026 — The landing shows, not tells (Guy's phone notes)
Guy phone-proved the new landing but ruled the below-fold read "like a photo
album app" — the magic ease, the context, and the social loop weren't
demonstrated. Four real-element demos now carry them, all honest: **the
save** — a shared Maps link visibly becomes a full place card (Saltwood
Bingin with its real category, area, price range, review-sourced
one-liner, tags, and Maps button) flagged "saved to Your Bali"; **the
collections** — real cards (Your Bali 51 places · 8 areas with its live
link line; Your Tel Aviv just started); **the echo** — the sender's view
with the real counts (13 opened · 3 played · 4 kept) and a friend's
return: "Amok Sunset · from your gift, two weeks later · ✓ been ♥ worth
it"; **the import** — three photos visibly becoming found, stamped
places above the steps. Counts-never-who stays stated under the echo.

## 24 Nov 2026 — Round 15 SHIPPED: the new landing — postcard daylight
Guy ruled: B wins. prevoya.app's front page is now the daylight world built
around the scroll-story hero: scattered real discoveries gather into YOUR
BALI, condense into one link, open as the gift, and the page settles on
"Never lose a place you discover" with the ink CTA. Below the fold, the
page the audit asked for: collections-like-highlights (replacing the
"In research" destinations board), the camera-roll import in three plain
steps, the Bali shelf as a strength ("no account needed"), and the honesty
strip (free · no password · save first). Gone for good: the flight board,
the boarding-pass section, and "FOR SLOWMADS". The old auth modal left the
landing — Log in and Open app both go to the app, which owns sign-in.
Land analytics kept. Flick test 4/4, console clean, reduced-motion and
no-JS get the settled page. Next: Round 16 — app shell, gift page, and
shelf follow into the daylight world, examples first.

## 24 Nov 2026 — Round 15-D·B: the scroll story in daylight
Guy loved the scroll story and called for it in direction B's world. Live at
prevoya.app/x/15db/ — same four beats and the same engine, reskinned as
postcard daylight: sand-paper canvas, ink text, sea-green accent, the photos
as white-bordered prints, the chat bubble in daylight green, the CTA in ink.
Both skins now stand side by side (/x/15d/ night, /x/15db/ daylight) so the
visual-world call is made on the same moving story. Flick test passed 4/4.

## 24 Nov 2026 — Round 15-D: the scroll story, a working demo
Live at prevoya.app/x/15d/ (unlinked, noindex). After studying the
"$10K websites" technique (scroll-scrubbed hero video), we adapted it for a
phone-first product: no AI video — the story is real photos and plain DOM
animation, so phones get the full effect (the original technique serves
phones a static image). Four beats scrubbed by scroll, forward and backward:
scattered discoveries (camera roll, screenshots, a Maps star, the 2 AM group
chat) gather into YOUR BALI, condense into one glowing link, and the link
opens as the gift — then the page settles on "Never lose a place you
discover" and the CTA. Passed the flick test (every beat fully readable even
at aggressive 360px double-flicks), rests when idle, reduced-motion and
no-JS get the settled page directly. A decision artifact for Round 15, not
yet the landing.

## 24 Nov 2026 — Audit repairs (track A): five fixes from the anonymous visit
An anonymous zero-context visitor walked the site (report on record) and the
five broken behaviors they hit are fixed. **The tour reveals on time** —
sections start appearing before they enter the screen and settle in 0.4s,
instead of staying near-black at normal scroll speed. **The gift shows real
photos everywhere** — every row's real Google photo now loads in the
background right after the page opens (the visitor saw the same stock satay
on a dozen restaurants); photos swap in only once loaded, never a blank or
broken box, and the server now caches photo links for ~a day so a widely
opened gift doesn't re-bill Google per viewer (cold 2.1s → cached 0.24s).
**The ceremony text is readable** — darker shade, faster cross-fade, text
shadow. **The copy stopped overpromising** — "answer 3 questions" became
"answer a few questions" everywhere (the concierge actually asks five).
**A mixed gift stops claiming one destination** — Guy's legacy link carried
a Tel Aviv cafe inside "Guy's Bali"; an unscoped link spanning destinations
is now titled "Guy's places" (contents unchanged — a sent link never changes
under its receiver; per-destination links keep their names).
During the server deploy the gift endpoint returned 401 for ~10 minutes
(a deploy default flipped its public flag); caught and restored.

## 22 Nov 2026 — Signed in always means inside the app
The last of the old chat-first boot is gone: an empty account used to be
redirected to the planning chat on every open (Guy hit it refreshing the
reset test user). Now every signed-in account lands in the app — empty,
gifted, or full. The empty home is a complete first surface (the poem, the
camera-roll door, the shelf), and planning stays a door on Today.

## 22 Nov 2026 — Round 14c: the camera roll is already a collection
A brand-new account's empty home now carries a second door: "just back
from a trip? your camera roll is already a collection." With few stamps,
photos find their places instead of matching stamps: they cluster by where
they were taken, known places match free, and uncovered spots get one live
lookup each (capped at 20 per import). You rule every row — change it,
leave it out, nothing imports silently. One pass builds places, stamps
(dated to the photos) and photos; the gift door lights immediately. A
trip's worth of collecting now takes about three minutes, anywhere.

## 22 Nov 2026 — Round 14b: collections like highlights
From the second destination on, your places read as collections — YOUR
BALI, YOUR TEL AVIV — each a card with real counts and its own gift
status; tap in for the familiar area view scoped to that destination, with
its own gift door. Every collection carries its own standing link (a Bali
gift never drags your Tel Aviv along), and each link's echo shows on its
own card. One-destination travelers see exactly the app as before; links
already sent keep their meaning forever. Received gifts stay their givers'
gold lanes.

## 22 Nov 2026 — Adding a found place now keeps it, and says where
Guy added a Tel Aviv coffee shop from the shelf's Google search and had no
idea where it went. It had landed in the shelf's catalog — added, but not
his. Now the ＋ Add tap saves it to your collection in the same gesture
(the same promise as the paste box), the button answers "⚑ saved to your
places", a line says where it lives ("under Tel Aviv-Yafo"), the shelf
scrolls to the new card already flagged, and the collection shows it
immediately.

## 22 Nov 2026 — Search types smoothly
Guy's phone caught the shelf search freezing on every keystroke. Two
causes, both fixed: filtering while typing re-triggered an entry animation
across every visible card (hundreds of forced layouts per pause — now
typing never animates, and taps animate only the first screenful), and the
first character ran a full-shelf render in the same instant as the
keystroke (now it waits for the typing pause). Measured after: the worst
stall while typing is a single ~44 ms blip.

## 21 Nov 2026 — Round 14a: global, the collection layer
Guy's ruling made real: nothing in the collection layer assumes Bali.
Search carries your words verbatim anywhere on earth; an added place gets
its real destination (a Lisbon cafe files under "lisboa", area Lisboa; Bali
stays Bali with its area model). Gifts ship places from any destination
and name themselves from their own contents. The app's home calls itself
"Your Bali" / "Your Lisboa" / "Your places" by what you actually keep —
title, tab, composer, message, all derived. Brand residue swept ("Prevoya
Concierge" off the landing and the pass). The planner remains a Bali
product for now — that's content (and Round 14b), not architecture.

## 21 Nov 2026 — The weekly K readout, automated
A cloud routine runs every Monday 09:00 (Israel) and reports the funnel —
sends, opens, plays, takes, sign-ups, relay beats, chains — from real
queries only (it says "no data" rather than estimating). Results:
https://claude.ai/code/routines/trig_01WS2FAuZRSKaMU92N824Ah7

## 20 Nov 2026 — Round 13: the relay
Three one-time moments turn a receiver into a sender: **"Yours begins"**
(their first own place), the **lineage line** on their gift door ("began as
Guy's gift — now yours to pass on"), and **"Three keepers — that's a
gift"** (an invitation to send, once, at 3 vouched-for places). No meters
or progress bars — every moment rises once and fades.
Structural change underneath: a gift now belongs to a **user**, not a trip
— someone who never planned a trip can still send one. Also fixed: places
received but not yet made your own can no longer ride in your own gift.

## 20 Nov 2026 — Round 12.5: the receiver's door
A gift receiver signing up used to be thrown into the trip-planning chat
(unskippable, double sign-in) before seeing their gift. Now an account
with places but no trip lands directly on its collection — the giver's
lane open, a banner naming the giver — and planning is an invitation on
Today, never a wall.

## 20 Nov 2026 — Round 12: the received collection
Taken gift places stopped posing as the receiver's own. They live in a
gold lane — "FROM GUY · 46 · a gift" — until ⚑ makes a place truly
theirs. "✕ let this list go" releases the lane (two taps). Received
places never enter the receiver's own gift — no second-hand gifting.

## 19 Nov 2026 — Round 11: the sender's echo
A gift no longer lands in silence: the gift door shows OPENED · PLAYED ·
TOOK — real counts or nothing, never who (the gift page stays anonymous).
Also the global rule took effect: nothing new hard-codes Bali; copy
derives from the trip's destination.

## 19 Nov 2026 — Round 10: the photo import
One pass over the camera roll: pick up to 60 trip photos, EXIF GPS + time
match them to stamped places (auto within 250 m, suggestions beyond),
every row can be changed or left out, uploads run in the background.
A trip's photos become a photo-backed collection in ~2 minutes.

## 19 Nov 2026 — Instant photos
Adding a photo signals instantly: the image appears at once (optimistic),
uploads in the background, and failures say so and roll back. (The iOS
iCloud download wait before our code runs is Apple's, and is said so.)

## 19 Nov 2026 — Real place photos on the gift
Gift pages show each place's real Google photo (resolved at view time with
author credit, never stored) — the sender's own photo always outranks it.

## 18 Nov 2026 — Round 9: the lived collection
"Been there" joined "saved" as collection membership: Your Bali = saved ∪
stamped, with ✓ been marks, area groups, honest counts. The gift grew two
scopes: **keepers** (photos · worth-its · saves — the vouched-for core,
the default) or **everything**. Links already sent never change meaning.

## 16–17 Nov 2026 — Rounds 6–8
**Round 6:** the app opens on Your Bali — the collection is the front
door, every open. **Round 7:** global unlock designed and parked until the
first real gift chains move (Guy's ruling). **Round 8:** the receiver
ceremony — the gift opens as a short film of the sender's places, then
the list, then "start your own collection". (The sender export film —
sharing the ceremony as a video — waits for Guy's call.)

## 8–9 Nov 2026 — The pivot's first two weeks
**Week 1:** the save mechanic — save from the shelf without an account
(buffered, claimed at signup), the paste-anything catcher at /app/save.
**Week 2:** the front-door flip — saves lead the product; landing copy
moved from "AI trip planner" to "save and share places you discover".
