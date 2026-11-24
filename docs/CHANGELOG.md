# Changelog — what shipped, in plain language

*Newest first. Every ship adds an entry here; test steps live in the chat
where the ship was reported. "Round" numbers match the decision board.*

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
