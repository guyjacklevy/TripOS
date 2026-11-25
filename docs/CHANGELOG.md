# Changelog — what shipped, in plain language

*Newest first. Every ship adds an entry here; test steps live in the chat
where the ship was reported. "Round" numbers match the decision board.*

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
