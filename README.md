# Bastila's Custom Words

A Twitch-chat word-unscramble game for streams (inspired by the mechanics of Words On Stream, with its own name and look).
Static site: **no server, no database, nothing for the streamer to install.** It runs inside an OBS Browser Source and reads Twitch chat straight from the browser.

> Status: **v0.1 playable.** Core game, dashboard, commands, bans, custom words, config-in-link all work and are tested (`npm test`, plus a headless-browser check of both pages). The word list is currently a small hand-written *starter* list; build the full one (below) before going live.

## How it fits together

| File | Purpose |
|---|---|
| `index.html` + `js/overlay.js` + `css/game.css` | The game overlay (OBS Browser Source) |
| `dashboard.html` + `js/dashboard.js` + `css/dashboard.css` | Settings page. Produces the OBS link |
| `js/core.js` | All game logic (pure JS, tested in Node): scoring, levels, padlocks, stars, commands, config encoding |
| `js/twitch.js` | Twitch chat client (IRC over WebSocket) + optional Streamer.bot WebSocket client |
| `data/starter-words.txt`, `scripts/build-words.mjs` -> `data/words.js` | Word lists |
| `tests/test.mjs` | 20 logic tests |

**Settings live in the link.** The dashboard saves to the browser's localStorage *and* bakes everything into `index.html#c=...` (base64 JSON). OBS's browser source has its own storage, so the streamer pastes the generated link into OBS. To change a setting: change it in the dashboard, copy the new link, update the OBS source URL. Settings can be re-loaded by pasting an old link into "Load settings from a link".

## Game rules (defaults)

* Normal round = **2 minutes**. Scrabble letter values (BARRIER = 9).
* Chat types words made from the tiles. First person to send a word gets the points.
* Goal = 40% of all available points (slider). Stars beyond the goal: 1 / 2 (34% of remaining) / 3 (67%) / 5 (everything) advance 1 / 2 / 3 / 5 levels. Fail = retry the same level (or reset to level 1).
* Letters grow with level; higher levels pick scrambled words worth more Scrabble points.
* **Hidden letters** (shown as `?`, revealed halfway) start at level 5. Toggle + sliders.
* **Shuffle**: tiles jump around every N seconds. Toggle + speed slider.
* **Padlocks**: 1 hit per person per time section (length + hits adjustable, can be turned off).
* **No fake letters** (requested; intentionally not implemented, no setting for it).
* Autopilot: next round starts by itself after the result screen.

## Commands

All start **unchecked**. Each can be enabled with a custom name (`!` is added automatically) and limited to "Streamer only" or "Mods" (mods + broadcaster): start, restart, continue, autopilot, skip, endround, ban, unban. `!ban name` / `!unban name` affect the player ban list for the current session; the saved list is edited in the dashboard. Banned players are silently ignored. Because commands are off by default, `autoStartOnLoad` is on by default so the game plays without any commands.

## Setup

### 1. Host it (GitHub Pages, free)
Everything is static. Push this folder to a GitHub repo, then Settings -> Pages -> deploy from the `main` branch root. Your URL will be `https://<user>.github.io/<repo>/`. (Vercel/Cloudflare Pages work too; Vercel's free Hobby plan is non-commercial only.)

### 2. Register a Twitch app (once, ~5 min, free)
https://dev.twitch.tv/console -> Register Your Application.
* OAuth Redirect URL: exactly the URL shown on the dashboard under "Connect Twitch" (e.g. `https://<user>.github.io/<repo>/dashboard.html`)
* Category: Chat Bot / Game Integration; Client Type: **Public**.
* Copy the **Client ID** (it is public, fine to share) and paste it into the dashboard. The streamer then just presses **Authorize with Twitch**; login, user id and token fill in automatically (all blurred until clicked). You can hand her a link with your Client ID pre-filled by sending her an OBS link, or let her paste the Client ID once.

### 3. OBS
Browser Source -> paste the link from dashboard section 10. Size ~1100x420. Reading chat needs no token (anonymous read-only). The token is only used for chat posting.

### 4. Optional: chat posting
* **Post as the authorized account** (`chat.mode = twitch`): uses her token (scope `chat:edit`). The OBS link then contains her token. Treat it like a password.
* **Through Streamer.bot**: in Streamer.bot start Servers/Clients -> WebSocket Server (default `ws://127.0.0.1:8080/`), and create an action named `BCW Chat Message` (name is configurable) with a *Twitch -> Send Message* sub-action whose text is `%message%`. The overlay calls `DoAction` with `args.message`. Works only when OBS and Streamer.bot run on the same PC, and Streamer.bot WebSocket authentication must be off (or this client extended with the auth handshake: TODO).

### 5. Full word list (do this on a machine with internet)
```
npm i -D oxford_3000 an-array-of-english-words leo-profanity obscenity
npm run build:words:full
npm test
```
How it stays clean without writing any offensive words in the repo: words come only from school/learner vocabulary plus plain inflections of it (a big dictionary is used only to check spelling); `leo-profanity` and `obscenity` then run at build time as a second net. Skim `data/words.js` once before going live. The streamer's blurred ban list is the last guard. (The build environment this was authored in had no access to npm/GitHub downloads, so the full build has not been run yet.)

## Handoff notes (for whoever continues, human or AI)

**Done:** everything above. Verified: 20 Node tests; headless Chromium loaded both pages with zero console errors; settings -> link -> overlay round trip; bans/custom words persisted.

**Not verified / TODO, roughly by priority**
1. Run `build:words:full` and eyeball the result; check list size gives >=6 answers per level (the generator throws otherwise).
2. Real Twitch test: register the app, authorize, confirm anonymous chat read and mod badge detection with a live channel. The anonymous `justinfan` login still works but is undocumented by Twitch; fallback is to read with her token (`chat.mode` currently only uses the token when posting is on. Consider always using it when available).
3. Defaults I could not confirm from the real game: padlock section length (15s), hidden-letter start level (5), shuffle interval, result screen length. Round length (2 min) and Scrabble values are from the requirements.
4. "Skipping letters / tile skipping speed" was interpreted as the shuffle/jump animation (confirmed with the user).
5. Streamer.bot auth handshake; a ready-made Streamer.bot import string (not generated).
6. Visual polish (user said looks come later), sound effects, a "found words" list on the result screen, leaderboard across rounds, `!commands` listing.
7. Twitch implicit tokens can expire; dashboard checks on load and prompts to re-authorize. The overlay shows "token rejected" in its status line.

**Gotchas:** ES modules need http(s) (not `file://`). For local dev: `python3 -m http.server` then open `http://localhost:8000/dashboard.html`. Add `&demo=1` to an overlay link for fake chat. Don't name the game after Onrizon's product or reuse its art/word lists.
