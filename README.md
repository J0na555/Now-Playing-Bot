# Telegram Now Playing Bot

Pins a message in your Telegram channel that shows what you're listening to  -
album art, song, artist  -  and updates it in place every minute. No new
messages, no clutter, just one message that keeps changing.

Built on top of `spotify-github-profile.kittinanx.com` so you don't need your own
Spotify Developer app (which now requires Premium under Spotify's 2026 Developer
Mode rules)  -  you're reusing the same authorization you already granted for your
GitHub README widget.

**v2 adds YouTube.** A tiny Chrome extension watches what you're watching and the
bot swaps the pinned card between **Spotify** and **YouTube** automatically:
actively playing Spotify wins, an unpaused video watched in the last ~3 minutes
wins when Spotify is paused or idle, and a stale/closed tab falls back to your
last-played Spotify card. More on that below.

## One-time setup

### 1. Post and pin the initial message

Before this bot can *edit* a message, one has to exist. In your Telegram channel:

1. Make sure your bot is added as an **admin** with "Post Messages" and "Pin
   Messages" permissions.
2. Send any photo to the channel via the bot (you can do this with a quick manual
   `sendPhoto` call, or just forward any image through the bot once).
3. Pin that message in the channel.
4. Get its `message_id`  -  the easiest way is to open
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser right after
   posting it, and look for `"message_id": <number>` in the JSON response.

### 2. Get your chat_id

- Public channel: just use `@yourchannelname` as `TELEGRAM_CHAT_ID`  -  no need to
  look up the numeric id.
- Private channel: forward a message from the channel to
  [@userinfobot](https://t.me/userinfobot) or check the same `getUpdates` response
  above  -  it'll show up as a negative number like `-100xxxxxxxxxx`.

### 3. Set environment variables in Vercel

Copy `.env.example` to `.env` locally for reference, then add the same variables
under your Vercel project's **Settings → Environment Variables**:

| Variable | Required | Notes |
| --- | --- | --- |
| `SPOTIFY_UID` | yes | From spotify-github-profile.kittinanx.com |
| `TELEGRAM_BOT_TOKEN` | yes | From @BotFather |
| `TELEGRAM_CHAT_ID` | yes | `@yourchannelname` or `-100xxxxxxxxxx` |
| `TELEGRAM_MESSAGE_ID` | yes | The pinned message id |
| `CRON_SECRET` | optional | Random string; protects `/api/poll` from strangers |
| `UPSTASH_REDIS_REST_URL` | yes (v2) | URL of your Upstash Redis REST database |
| `UPSTASH_REDIS_REST_TOKEN` | yes (v2) | REST token from the same Upstash database |
| `PUSH_SECRET` | yes (v2) | Random string, shared with the extension; keep it SEPARATE from `CRON_SECRET` |
| `YT_FRESHNESS_MS` | optional | YouTube staleness window in ms, default `180000`. See note below |

`YT_FRESHNESS_MS` must exceed **2× the scheduler beat** (see step 5). With the
1-minute beat, `180000` = 3 missed polls before the YouTube card falls back.

### 4. Install the Chrome extension (v2)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder in this repo.
3. Edit `extension/config.js` first  -  it's the single place you configure:
   - `PUSH_URL` = your deployed Vercel endpoint, e.g.
     `https://your-project.vercel.app/api/push`
   - `PUSH_SECRET` = any random string, must match `PUSH_SECRET` in Vercel above.
4. Reload the extension after editing `config.js`.

The extension has no service worker and no backend  -  it's just a content script
on YouTube pages that watches the page every 2s and POSTs
`{ videoId, title, channel, paused }` to `/api/push` when something changes (plus
a 60s heartbeat so long videos keep refreshing the server-side timestamp).
Pushes are failures-tolerant by design: the bot treats stale state as "not
watching" and falls back to Spotify.

### 5. Deploy

```bash
npm install -g vercel   # if you don't already have it
vercel                  # follow the prompts, link/create the project
vercel --prod
```

Note your deployed production URL  -  you'll need it for the scheduler below.

### 6. Set up the scheduler (IMPORTANT  -  read this)

**Vercel's free Hobby plan only allows built-in Cron Jobs to run once per day.**
Frequent polling needs Vercel Pro ($20/mo) if you use their native cron feature.

Since `/api/poll` is just a normal HTTP endpoint, you can skip Vercel's built-in
cron entirely and use a free external scheduler instead  -  same result, no
upgrade needed:

1. Go to [UptimeRobot](https://uptimerobot.com) (free) and create an account.
2. Add a new HTTP monitor:
   - **URL:** `https://your-project.vercel.app/api/poll`
   - **Interval:** every 1 minute  -  the beat. Keep it at 1 minute; the YouTube
     card depends on it (the freshness window `YT_FRESHNESS_MS` is relative to
     this beat, so shrinking the window below ~2 minutes starves the YouTube card).
   - **Timeout:** 45 seconds
   - **Headers (optional):** if you set `CRON_SECRET`, add `Authorization: Bearer YOUR_CRON_SECRET`
3. Save and enable it.

That's it  -  UptimeRobot will hit your endpoint every minute, your function
fetches the latest track, parses it, and edits your pinned message. The 200
response keeps your monitor green; any failure triggers an alert.

### 7. (Optional) Health endpoint

The project also includes `/api/health`  -  a lightweight endpoint that returns
`{ ok: true }` instantly with no external calls. You can set up a separate
UptimeRobot monitor on this URL to track uptime independently of the Spotify
and Telegram APIs.

## How it works

```
SPOTIFY CARD                         YOUTUBE CARD
                                     Chrome extension (extension/content.js)
Spotify (your account)                 watches the YouTube tab every 2s
  → kittinanx.com/api/view             → POSTs { videoId, title, channel, paused }
      (returns SVG)                      to /api/push (Bearer PUSH_SECRET)
  → /api/poll.ts fetches that SVG     → api/push.ts validates + stores it
  → lib/svg-parser.ts extracts           in Upstash (np:yt:state, 60-min TTL)
      song, artist, status text,         with a 60s heartbeat so long videos
      progress time, album art            stay fresh
  → progress-diff inference:           → /api/poll.ts reads it back
      "Now playing" + moving time?        fresh + unpaused? → YouTube card
      → active; frozen → paused           (thumbnail from img.youtube.com)

          one 1-minute beat hits /api/poll, which picks exactly one card
          → lib/telegram.ts uploads the art + caption via Telegram's
            editMessageMedia (multipart, HTML captions)
            → your pinned message updates in place
```

## Response fields (debugging aid)

`/api/poll` returns `{ ok, card, spotify, youtube }` so you can see what the
scheduler sees:

```json
{
  "ok": true,
  "card": "youtube",
  "spotify": { "active": false, "song": "Suzume", "artist": "RADWIMPS" },
  "youtube": { "active": true, "ageMs": 15000 }
}
```

- `card`: which card the message currently shows, `"spotify"` or `"youtube"`.
- `spotify.active`: whether Spotify is *actively playing* (moving progress), not
  just what's shown.
- `youtube.ageMs`: milliseconds since the extension last POSTed. If it creeps
  toward `180000` while you're watching, the extension isn't pushing (see
  troubleshooting) or the heartbeat isn't running.

Curl it yourself with your monitor's auth header whenever the message looks wrong.

## Files

- `api/poll.ts`  -  the endpoint your scheduler hits. Glues everything together
  and decides the card (Spotify active → YouTube fresh → Spotify last played).
- `api/push.ts`  -  v2. Receives YouTube state from the extension (CORS-locked
  to youtube.com, Bearer `PUSH_SECRET`).
- `api/health.ts`  -  lightweight health check for uptime monitoring.
- `lib/svg-parser.ts`  -  extracts song/artist/image/progress from kittinan's SVG.
- `lib/cards.ts`  -  v2. Telegram HTML captions and the activity helpers
  (`isSpotifyActive`, `spotifyCaption`, `youtubeCaption`).
- `lib/redis.ts`  -  v2. Upstash client and state keys (`np:yt:state`,
  `np:spotify:progress`).
- `lib/telegram.ts`  -  wraps Telegram's `editMessageMedia` multipart upload.
- `extension/`  -  v2. The Chrome MV3 extension (never deployed; excluded from
  Vercel via `.vercelignore` so `config.js` with `PUSH_SECRET` stays private).
- `vercel.json`  -  sets a 10s max duration for the function. No cron block (see
  step 6 above for why).

## Known limitations (by design)

- **No clickable Spotify track link.** Confirmed unavailable in kittinan's hosted
  SVG themes (`default` has a broken unfilled link placeholder; `spotify-embed`
  has no link at all). Song name renders as plain bold text. (YouTube videos DO
  get a link via `https://youtu.be/<videoId>`.)
- **Depends on a third party staying up.** This entire pipeline relies on
  `kittinanx.com` continuing to run and stay within Spotify's grandfathered
  Developer Mode terms. If his service goes down or changes its markup, this
  breaks. Not something you control  -  worth checking on occasionally.
- **SVG structure could change.** If kittinan updates his themes, the regex in
  `svg-parser.ts` may need adjusting. Nothing fancy  -  just look at the new markup
  and update the field selectors.
- **No real Spotify pause signal.** Pausing is *inferred* from the progress time
  freezing between polls. If audio is paused exactly at the same timestamp, it
  takes ~2 polls for the YouTube card to take over.

## Troubleshooting

- **"message is not modified" errors:** harmless  -  happens when the same
  track/caption is sent twice in a row (e.g. you polled while a song hadn't
  changed yet). Already handled silently in `lib/telegram.ts`.
- **401 from your own endpoint:** check that your scheduler's Authorization
  header matches `CRON_SECRET` exactly, including the `Bearer ` prefix.
- **Parse errors:** kittinan's markup may have changed  -  curl the SVG URL
  directly and compare against the regex in `lib/svg-parser.ts`.
- **The YouTube card stopped appearing while I'm watching:** the selectors in
  `extension/content.js` (constants block at the top) have drifted. YouTube's DOM
  changes; update the selectors the same way you'd update the SVG regexes, then
  reload the extension. `youtube.ageMs` in the poll response tells you whether
  the extension is pushing at all.
- **Two YouTube tabs open:** last write wins  -  whichever tab pushed most
  recently is what the bot shows. Closed tabs are fine; their state just goes
  stale and the card falls back.
- **Browser closed, card still stuck on YouTube:** by design it flips back once
  the state is older than `YT_FRESHNESS_MS` (~3 minutes default at the 1-minute
  beat), because the extension can't push from a closed browser.
- **Paused Spotify flips to YouTube after ~2 polls:** by design  -  the bot
  detects pause by the Spotify progress bar freezing. It needs two observations
  (~2 minutes) to see that the time isn't moving, then the YouTube card takes
  over if you're fresh there.