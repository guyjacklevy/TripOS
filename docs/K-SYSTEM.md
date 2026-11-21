# The K system — what it is and where to read it

*Last updated: 21 Nov 2026. "K" is the viral factor: how many new users
one user brings. K > 1 means the product grows by itself. This file
explains, in plain language, the machinery we built to measure it.*

## The one rule

**Never fake.** Every number is a real query result or it is absent. No
estimates, no extrapolation, no carrying last week forward. Counts started
19 Nov 2026 (when gift events began carrying their token) — anything
earlier is honestly uncountable.

## The funnel, step by step

Each step of the loop leaves one honest trace:

| Step | What happened | Where it's recorded |
|---|---|---|
| **SEND** | A gift link was created | a `trip_shares` row (kind "list", owned by the sender) |
| **OPENED** | Someone opened the gift page | event `share_visit` with the gift's token |
| **PLAYED** | They watched the ceremony to the end | event `gift_ceremony` (end = done/take) |
| **TOOK** | They tapped "take all" | event `share_save_tap` (distinct browsers per token) |
| **CLAIMED** | They signed up — the gift came with them | their profile carries `via_token` (which gift brought them) |
| **TURNED** | The relay moved them: first own place (beat 1), gift door lit (beat 2), invited to send (beat 3) | events `receiver_turn` with the beat number |
| **CHAIN** | They sent a gift of their own | their `share_created` event carries `origin` — the token of the gift that brought them |

**A chain is the whole point:** Guy → receiver → the receiver's receivers.
When chains appear, K is real.

## Privacy line (locked)

The sender hears **counts, never names**. The gift page is loginless,
events carry no identity, and the echo endpoint returns numbers only. We
count moments, we never say who.

## Where to read it

- **In the app (sender):** the gift door shows OPENED · PLAYED · TOOK for
  your own gifts.
- **Every Monday 09:00:** the automated K readout queries all of the
  above and writes a short report — verdict first, then the funnel
  all-time and last-7-days, then K (only when there are actual sends).
  Runs appear at: https://claude.ai/code/routines/trig_01WS2FAuZRSKaMU92N824Ah7
- **K itself:** receivers-who-became-senders ÷ senders. Until the first
  sends exist, the readout says "not yet measurable" instead of a number.
