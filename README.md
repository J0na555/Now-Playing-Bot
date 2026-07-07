# Telegram Now Playing Bot

Pins a message in your Telegram channel that shows your current (or last played)
Spotify track — album art, song, artist — and updates it in place every couple
minutes. No new messages, no clutter, just one message that keeps changing.

Built on top of `spotify-github-profile.kittinanx.com` so you don't need your own
Spotify Developer app (which now requires Premium under Spotify's 2026 Developer
Mode rules) — you're reusing the same authorization you already granted for your
GitHub README widget.

## One-time setup

### 1. Post and pin the initial message

Before this bot can *edit* a message, one has to exist. In your Telegram channel:

1. Make sure your bot is added as an **admin** with "Post Messages" and "Pin
   Messages" permissions.
2. Send any photo to the channel via the bot (you can do this with a quick manual
   `sendPhoto` call, or just forward any image through the bot once).
3. Pin that message in the channel.
4. Get its `message_id` — the easiest way is to open
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser right after
   posting it, and look for `"message_id": <number>` in the JSON response.

### 2. Get your chat_id

- Public channel: just use `@yourchannelname` as `TELEGRAM_CHAT_ID` — no need to
  look up the numeric id.
- Private channel: forward a message from the channel to
  [@userinfobot](https://t.me/userinfobot) or check the same `getUpdates` response
  above — it'll show up as a negative number like `-100xxxxxxxxxx`.

### 3. Set environment variables in Vercel

Copy `.env.example` to `.env` locally for reference, then add the same variables
under your Vercel project's **Settings → Environment Variables**:

- `SPOTIFY_UID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_MESSAGE_ID`
- `CRON_SECRET` (optional but recommended — make up any random string)

### 4. Deploy

```bash
npm install -g vercel   # if you don't already have it
vercel                  # follow the prompts, link/create the project
vercel --prod
```

Note your deployed production URL — you'll need it for the scheduler below.

### 5. Set up the scheduler (IMPORTANT — read this)

**Vercel's free Hobby plan only allows built-in Cron Jobs to run once per day.**
A 2-minute refresh needs Vercel Pro ($20/mo) if you use their native cron feature.

Since `/api/poll` is just a normal HTTP endpoint, you can skip Vercel's built-in
cron entirely and use a free external scheduler instead — same result, no
upgrade needed:

1. Go to [cron-job.org](https://cron-job.org) (free) and create an account.
2. Create a new cron job:
   - **URL:** `https://your-project.vercel.app/api/poll`
   - **Schedule:** every 2 minutes
   - **Request method:** GET
   - **Headers:** if you set `CRON_SECRET`, add a header:
     `Authorization: Bearer <your CRON_SECRET value>`
3. Save and enable it.

That's it — cron-job.org will hit your endpoint every 2 minutes, your function
fetches the latest track, parses it, and edits your pinned message.

## How it works

```
Spotify (your account)
  → kittinanx.com/api/view?uid=...&theme=spotify-embed  (returns SVG)
    → /api/poll.ts fetches + parses that SVG
      → lib/svg-parser.ts extracts song, artist, status text, and the
        inline base64 album art
      → lib/telegram.ts uploads the art + caption via Telegram's
        editMessageMedia (multipart, since the image is raw bytes, not a URL)
        → your pinned message updates in place
```

## Files

- `api/poll.ts` — the endpoint your scheduler hits. Glues everything together.
- `lib/svg-parser.ts` — extracts song/artist/image from kittinan's SVG response.
- `lib/telegram.ts` — wraps Telegram's `editMessageMedia` multipart upload.
- `vercel.json` — sets a 10s max duration for the function. No cron block (see
  Step 5 above for why).

## Known limitations (by design)

- **No clickable track link.** Confirmed unavailable in kittinan's hosted SVG
  themes (`default` has a broken unfilled link placeholder; `spotify-embed` has
  no link at all). Song name renders as plain bold text.
- **Depends on a third party staying up.** This entire pipeline relies on
  `kittinanx.com` continuing to run and stay within Spotify's grandfathered
  Developer Mode terms. If his service goes down or changes its markup, this
  breaks. Not something you control — worth checking on occasionally.
- **SVG structure could change.** If kittinan updates his themes, the regex in
  `svg-parser.ts` may need adjusting. Nothing fancy — just look at the new markup
  and update the field selectors.

## Troubleshooting

- **"message is not modified" errors:** harmless — happens when the same
  track/caption is sent twice in a row (e.g. you polled while a song hadn't
  changed yet). Already handled silently in `lib/telegram.ts`.
- **401 from your own endpoint:** check that your scheduler's Authorization
  header matches `CRON_SECRET` exactly, including the `Bearer ` prefix.
- **Parse errors:** kittinan's markup may have changed — curl the SVG URL
  directly and compare against the regex in `lib/svg-parser.ts`.
