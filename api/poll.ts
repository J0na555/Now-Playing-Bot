// The only thing that edits the pinned Telegram message. Hit by an external
// scheduler (beat: 1 minute). Decides between a Spotify card and a YouTube card:
// Spotify is active when the widget says "Now playing" and the progress time is
// moving; YouTube is active when the extension pushed state recently and the
// video is not paused. Spotify wins while actively playing.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseNowPlayingSvg, type NowPlayingData } from "../lib/svg-parser";
import { editMessageMedia } from "../lib/telegram";
import {
  getSpotifyProgress,
  getYouTubeState,
  setSpotifyProgress,
  type YouTubeState,
} from "../lib/redis";
import { isSpotifyActive, spotifyCaption, youtubeCaption } from "../lib/cards";

const YT_FRESHNESS_MS = Number(process.env.YT_FRESHNESS_MS) || 180000;

const SPOTIFY_AUTH_ERROR_TEXT = "Invalid Spotify access_token or refresh_token";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Telegram env is required up front; SPOTIFY_UID is not (a YouTube-only
  // deployment is valid — the Spotify branch just fails and falls back).
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_MESSAGE_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !TELEGRAM_MESSAGE_ID) {
    return res.status(500).json({ error: "Missing required environment variables" });
  }

  try {
    const svgUrl = `https://spotify-github-profile.kittinanx.com/api/view?uid=${
      process.env.SPOTIFY_UID ?? ""
    }&theme=spotify-embed`;

    // Spotify fetch/parse and YouTube state read run in parallel; one failing
    // never kills the other.
    let spotifyAuthFailure = false;
    const [spotifyResult, ytResult] = await Promise.allSettled([
      (async () => {
        const response = await fetch(svgUrl);
        if (!response.ok) {
          throw new Error(`kittinanx.com returned ${response.status}`);
        }
        const svgText = await response.text();
        if (svgText.includes(SPOTIFY_AUTH_ERROR_TEXT)) {
          spotifyAuthFailure = true;
        }
        return parseNowPlayingSvg(svgText);
      })(),
      getYouTubeState(),
    ]);

    // ----- Spotify branch -----
    let nowPlaying: NowPlayingData | null = null;
    let spotifyActive = false;

    if (spotifyResult.status === "fulfilled") {
      nowPlaying = spotifyResult.value;

      let lastProgress: string | null = null;
      try {
        lastProgress = await getSpotifyProgress();
      } catch (err) {
        console.warn("poll.ts: failed to read last spotify progress:", err);
      }

      spotifyActive = isSpotifyActive(
        nowPlaying.statusText,
        lastProgress,
        nowPlaying.progressTime
      );

      try {
        await setSpotifyProgress(nowPlaying.progressTime ?? "");
      } catch (err) {
        console.warn("poll.ts: failed to persist spotify progress:", err);
      }
    } else {
      console.error("poll.ts: Spotify branch failed:", spotifyResult.reason);
      if (spotifyAuthFailure) {
        console.error(
          "poll.ts: the Spotify widget returned an invalid-token message. Re-authorize " +
            "on spotify-github-profile.kittinanx.com; the bot keeps serving the YouTube " +
            "card and Spotify last-played state until then."
        );
      }
    }

    const spotifySuccess = spotifyResult.status === "fulfilled";

    // ----- YouTube branch -----
    let ytState: YouTubeState | null = null;
    if (ytResult.status === "fulfilled" && ytResult.value) {
      ytState = ytResult.value;
    } else {
      console.warn(
        "poll.ts: YouTube state unavailable:",
        ytResult.status === "rejected" ? ytResult.reason : "no state stored"
      );
    }

    const now = Date.now();
    const ytActive = !!ytState && !ytState.paused && now - ytState.receivedAt <= YT_FRESHNESS_MS;
    const ageMs = ytState ? now - ytState.receivedAt : null;

    const spotifyInfo = {
      active: spotifyActive,
      song: nowPlaying?.song ?? null,
      artist: nowPlaying?.artist ?? null,
    };
    const youtubeInfo = { active: ytActive, ageMs };

    const respondOk = (card: "spotify" | "youtube") =>
      res.status(200).json({
        ok: true,
        card,
        spotify: spotifyInfo,
        youtube: youtubeInfo,
      });

    const editPinnedMessage = (
      imageBuffer: Buffer,
      imageMimeType: string,
      caption: string
    ) =>
      editMessageMedia({
        botToken: TELEGRAM_BOT_TOKEN,
        chatId: TELEGRAM_CHAT_ID,
        messageId: Number(TELEGRAM_MESSAGE_ID),
        imageBuffer,
        imageMimeType,
        caption,
      });

    const buildSpotifyCard = () => {
      const np = nowPlaying as NowPlayingData;
      return {
        imageBuffer: np.imageBuffer,
        imageMimeType: np.imageMimeType,
        caption: spotifyCaption({
          song: np.song,
          artist: np.artist,
          statusText: np.statusText,
          spotifyUid: process.env.SPOTIFY_UID ?? "",
        }),
      };
    };

    // ----- Card decision (exact priority) -----
    // 1. Spotify actively playing.
    if (spotifyActive && nowPlaying) {
      const card = buildSpotifyCard();
      await editPinnedMessage(card.imageBuffer, card.imageMimeType, card.caption);
      return respondOk("spotify");
    }

    // 2. YouTube fresh and unpaused.
    if (ytActive && ytState) {
      let thumbBuffer: Buffer;
      try {
        const thumb = await fetch(
          `https://img.youtube.com/vi/${ytState.videoId}/hqdefault.jpg`
        );
        if (!thumb.ok) {
          throw new Error(`YouTube thumbnail returned ${thumb.status}`);
        }
        thumbBuffer = Buffer.from(await thumb.arrayBuffer());
      } catch (err) {
        console.warn("poll.ts: YouTube thumbnail fetch failed:", err);
        if (spotifySuccess && nowPlaying) {
          const card = buildSpotifyCard();
          await editPinnedMessage(card.imageBuffer, card.imageMimeType, card.caption);
          return respondOk("spotify");
        }
        return res
          .status(500)
          .json({ error: "YouTube thumbnail failed and no Spotify card is available" });
      }

      await editPinnedMessage(
        thumbBuffer,
        "image/jpeg",
        youtubeCaption({
          videoId: ytState.videoId,
          title: ytState.title,
          channel: ytState.channel,
        })
      );

      // Two-tier Spotify failure: the message shows something true (YouTube) but
      // the endpoint still reports failure so the uptime monitor stays honest.
      if (!spotifySuccess) {
        return res.status(500).json({
          error: "Spotify widget failed; message updated with the YouTube card",
          card: "youtube",
        });
      }
      return respondOk("youtube");
    }

    // 3. Spotify last played (parse succeeded, not active right now).
    if (spotifySuccess && nowPlaying) {
      const card = buildSpotifyCard();
      await editPinnedMessage(card.imageBuffer, card.imageMimeType, card.caption);
      return respondOk("spotify");
    }

    // Nothing displayable.
    return res
      .status(500)
      .json({ error: "No card available: Spotify widget failed and YouTube is stale or absent" });
  } catch (err) {
    console.error("poll.ts failed:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}